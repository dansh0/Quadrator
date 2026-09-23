/**
 * Browser implementation of PlatformAdapter (DESIGN.md §2, Phase 3).
 *
 * Two operating modes, decided per capability at runtime:
 * - File System Access API (Chromium): real open/save pickers,
 *   `canOverwrite: true` — Save can rewrite the picked session file.
 * - Fallback (Firefox/Safari): `<input type=file>` for opening and a
 *   download for saving, `canOverwrite: false` — the UI then always saves
 *   via saveSessionAs, and a download cannot be cancelled detectably, so
 *   save/export always "succeed".
 *
 * FileRef ids are adapter-scoped (`web:<n>`) and die with the page —
 * `persistentFileIds: false` — so sessions reopened in a fresh tab recover
 * their images through the UI's existing relinkImage flow.
 *
 * Settings (including the crash-recovery autosave snapshot) persist to
 * localStorage. That caps the snapshot at the storage quota (~5 MB) —
 * far above any real session document.
 *
 * Conventions per the adapter contract: cancellation is a value
 * (null / empty array; picker AbortError ⇒ cancelled), every other DOM
 * failure is wrapped in PlatformIOError.
 */
import {
  FileRef,
  OpenedTextFile,
  PlatformAdapter,
  PlatformCapabilities,
  PlatformIOError,
} from '@quadrator/core';

// --------------------------------------------------------------------------
// Minimal File System Access API surface (WICG; absent from lib.dom).

interface FsFileHandle {
  getFile(): Promise<File>;
  createWritable(): Promise<{
    write(data: string): Promise<void>;
    close(): Promise<void>;
  }>;
}

interface PickerType {
  description: string;
  accept: Record<string, string[]>;
}

interface FsWindow {
  showOpenFilePicker?(options: {
    types: PickerType[];
    multiple?: boolean;
  }): Promise<FsFileHandle[]>;
  showSaveFilePicker?(options: {
    suggestedName: string;
    types: PickerType[];
  }): Promise<FsFileHandle>;
}

const SESSION_TYPE: PickerType = {
  description: 'Quadrator session',
  accept: { 'application/json': ['.json'] },
};
const CSV_TYPE: PickerType = { description: 'CSV', accept: { 'text/csv': ['.csv'] } };
const IMAGE_TYPE: PickerType = {
  description: 'Images',
  accept: {
    'image/*': ['.png', '.jpg', '.jpeg', '.bmp', '.gif', '.tif', '.tiff', '.webp'],
  },
};

const SETTINGS_KEY = 'quadrator.settings';

/** True for the DOMException the pickers throw when the user cancels. */
function isCancel(e: unknown): boolean {
  return e instanceof DOMException && e.name === 'AbortError';
}

function ioError(what: string, e: unknown): PlatformIOError {
  const detail = e instanceof Error ? e.message : String(e);
  return new PlatformIOError(`${what} failed: ${detail}`, { cause: e });
}

/**
 * Fallback file-open dialog: a transient `<input type=file>`. Injectable so
 * unit tests (and only tests) can script the chosen files; the browser wires
 * real user interaction through the same signature.
 */
export type FileDialog = (accept: string, multiple: boolean) => Promise<File[]>;

function domFileDialog(accept: string, multiple: boolean): Promise<File[]> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.multiple = multiple;
    input.style.display = 'none';
    input.addEventListener('change', () => {
      resolve(input.files ? [...input.files] : []);
      input.remove();
    });
    // `cancel` fires on modern browsers when the dialog is dismissed.
    input.addEventListener('cancel', () => {
      resolve([]);
      input.remove();
    });
    document.body.appendChild(input);
    input.click();
  });
}

/** Fallback save: trigger a download. Injectable for unit tests. */
export type Downloader = (name: string, text: string, mime: string) => void;

function domDownload(name: string, text: string, mime: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: mime }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoking synchronously can cancel the download before the browser
  // starts it; give it a comfortable head start (the blob is in memory).
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

interface Entry {
  name: string;
  /** Present in File System Access mode; enables overwrite + re-reads. */
  handle?: FsFileHandle;
  /** Present when the entry came from a fallback input. */
  file?: File;
  /** Lazily created object URL for images. */
  url?: string;
}

export class BrowserPlatformAdapter implements PlatformAdapter {
  readonly capabilities: PlatformCapabilities;

  private readonly fsWindow: FsWindow;
  private readonly openDialog: FileDialog;
  private readonly download: Downloader;
  private readonly storage: Storage;
  private readonly entries = new Map<string, Entry>();
  private nextId = 1;

  constructor(options?: {
    /** Test hooks; production callers pass nothing. */
    fileDialog?: FileDialog;
    downloader?: Downloader;
    storage?: Storage;
    /** Force the input/download fallback even when pickers exist. */
    disableFsAccess?: boolean;
  }) {
    this.fsWindow = window as FsWindow;
    this.openDialog = options?.fileDialog ?? domFileDialog;
    this.download = options?.downloader ?? domDownload;
    this.storage = options?.storage ?? window.localStorage;
    const fsAccess =
      options?.disableFsAccess !== true &&
      typeof this.fsWindow.showOpenFilePicker === 'function' &&
      typeof this.fsWindow.showSaveFilePicker === 'function';
    this.capabilities = { persistentFileIds: false, canOverwrite: fsAccess };
  }

  private register(entry: Entry): FileRef {
    const id = `web:${this.nextId++}`;
    this.entries.set(id, entry);
    return { id, name: entry.name };
  }

  // ---- open (session / species CSV) ---------------------------------------

  private async openTextFile(
    what: string,
    type: PickerType,
    accept: string
  ): Promise<OpenedTextFile | null> {
    try {
      let entry: Entry | null = null;
      if (this.capabilities.canOverwrite) {
        const handles = await this.fsWindow.showOpenFilePicker!({ types: [type] });
        const handle = handles[0];
        if (handle === undefined) return null;
        entry = { name: (await handle.getFile()).name, handle };
      } else {
        const file = (await this.openDialog(accept, false))[0];
        if (file === undefined) return null;
        entry = { name: file.name, file };
      }
      const file = entry.handle ? await entry.handle.getFile() : entry.file!;
      return { ref: this.register(entry), text: await file.text() };
    } catch (e) {
      if (isCancel(e)) return null;
      throw ioError(what, e);
    }
  }

  openSession(): Promise<OpenedTextFile | null> {
    return this.openTextFile('open session', SESSION_TYPE, '.json,application/json');
  }

  openSpeciesCsv(): Promise<OpenedTextFile | null> {
    return this.openTextFile('open species CSV', CSV_TYPE, '.csv,text/csv');
  }

  // ---- save (session / CSV export) ----------------------------------------

  private async saveTextFile(
    what: string,
    suggestedName: string,
    type: PickerType,
    mime: string,
    text: string
  ): Promise<FileRef | null> {
    if (!this.capabilities.canOverwrite) {
      // Download fallback: no cancel signal exists, so this always succeeds.
      try {
        this.download(suggestedName, text, mime);
      } catch (e) {
        throw ioError(what, e);
      }
      return this.register({ name: suggestedName });
    }
    try {
      const handle = await this.fsWindow.showSaveFilePicker!({
        suggestedName,
        types: [type],
      });
      const w = await handle.createWritable();
      await w.write(text);
      await w.close();
      return this.register({ name: (await handle.getFile()).name, handle });
    } catch (e) {
      if (isCancel(e)) return null;
      throw ioError(what, e);
    }
  }

  saveSessionAs(text: string, suggestedName: string): Promise<FileRef | null> {
    return this.saveTextFile('save session', suggestedName, SESSION_TYPE, 'application/json', text);
  }

  async saveSession(ref: FileRef, text: string): Promise<void> {
    const handle = this.entries.get(ref.id)?.handle;
    if (!this.capabilities.canOverwrite || handle === undefined) {
      throw new PlatformIOError(`cannot overwrite ${ref.name} — no writable target`);
    }
    try {
      const w = await handle.createWritable();
      await w.write(text);
      await w.close();
    } catch (e) {
      throw ioError(`save session to ${ref.name}`, e);
    }
  }

  exportCsv(text: string, suggestedName: string): Promise<FileRef | null> {
    return this.saveTextFile('export CSV', suggestedName, CSV_TYPE, 'text/csv', text);
  }

  // ---- images ---------------------------------------------------------------

  async pickImages(): Promise<FileRef[]> {
    try {
      if (this.capabilities.canOverwrite) {
        const handles = await this.fsWindow.showOpenFilePicker!({
          types: [IMAGE_TYPE],
          multiple: true,
        });
        const refs: FileRef[] = [];
        for (const handle of handles) {
          refs.push(this.register({ name: (await handle.getFile()).name, handle }));
        }
        return refs;
      }
      const files = await this.openDialog('image/*', true);
      return files.map((file) => this.register({ name: file.name, file }));
    } catch (e) {
      if (isCancel(e)) return [];
      throw ioError('pick images', e);
    }
  }

  async loadImage(ref: FileRef): Promise<string> {
    const entry = this.entries.get(ref.id);
    if (entry === undefined) {
      // Stored ids (session imagePath) never resolve in a fresh tab; the UI
      // recovers through relinkImage.
      throw new PlatformIOError(`image not available in this browser session: ${ref.name}`);
    }
    if (entry.url === undefined) {
      try {
        const file = entry.handle ? await entry.handle.getFile() : entry.file!;
        entry.url = URL.createObjectURL(file);
      } catch (e) {
        throw ioError(`load image ${ref.name}`, e);
      }
    }
    return entry.url;
  }

  async relinkImage(missing: FileRef): Promise<FileRef | null> {
    try {
      if (this.capabilities.canOverwrite) {
        const handles = await this.fsWindow.showOpenFilePicker!({ types: [IMAGE_TYPE] });
        const handle = handles[0];
        if (handle === undefined) return null;
        return this.register({ name: (await handle.getFile()).name, handle });
      }
      const file = (await this.openDialog('image/*', false))[0];
      return file === undefined ? null : this.register({ name: file.name, file });
    } catch (e) {
      if (isCancel(e)) return null;
      throw ioError(`relink image ${missing.name}`, e);
    }
  }

  // ---- settings --------------------------------------------------------------

  async loadSettings(): Promise<unknown> {
    try {
      const raw = this.storage.getItem(SETTINGS_KEY);
      return raw === null ? null : (JSON.parse(raw) as unknown);
    } catch (e) {
      throw ioError('load settings', e);
    }
  }

  async saveSettings(value: unknown): Promise<void> {
    try {
      this.storage.setItem(SETTINGS_KEY, JSON.stringify(value));
    } catch (e) {
      throw ioError('save settings', e);
    }
  }
}
