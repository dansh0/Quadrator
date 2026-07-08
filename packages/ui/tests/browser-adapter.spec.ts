// @vitest-environment happy-dom
import { PlatformIOError } from '@quadrator/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { FileDialog } from '../src/platform/browser.ts';
import { BrowserPlatformAdapter } from '../src/platform/browser.ts';

/** Scriptable fallback dialog: each call shifts the next queued file list. */
function queuedDialog(queue: File[][]): FileDialog {
  return () => Promise.resolve(queue.shift() ?? []);
}

function textFile(name: string, text: string, type = 'text/plain'): File {
  return new File([text], name, { type });
}

/** Minimal in-memory Storage. */
function memoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (k) => map.get(k) ?? null,
    key: (i) => [...map.keys()][i] ?? null,
    removeItem: (k) => void map.delete(k),
    setItem: (k, v) => void map.set(k, v),
  };
}

/** File System Access mode: fake pickers installed on window. */
function fakeFsHandles(files: File[]): unknown[] {
  return files.map((file) => ({
    getFile: () => Promise.resolve(file),
    createWritable: () => {
      const chunks: string[] = [];
      return Promise.resolve({
        write: (d: string) => {
          chunks.push(d);
          return Promise.resolve();
        },
        close: () => {
          written.set(file.name, chunks.join(''));
          return Promise.resolve();
        },
      });
    },
  }));
}
const written = new Map<string, string>();

function abortError(): DOMException {
  return new DOMException('user cancelled', 'AbortError');
}

afterEach(() => {
  written.clear();
  vi.unstubAllGlobals();
});

describe('BrowserPlatformAdapter (fallback mode: input + download)', () => {
  it('declares non-persistent ids and no overwrite', () => {
    const adapter = new BrowserPlatformAdapter({ disableFsAccess: true, storage: memoryStorage() });
    expect(adapter.capabilities).toEqual({ persistentFileIds: false, canOverwrite: false });
  });

  it('opens a session from a picked file; empty pick = cancel = null', async () => {
    const adapter = new BrowserPlatformAdapter({
      disableFsAccess: true,
      storage: memoryStorage(),
      fileDialog: queuedDialog([[textFile('reef.json', '{"schemaVersion":1}')], []]),
    });
    const opened = await adapter.openSession();
    expect(opened?.ref.name).toBe('reef.json');
    expect(opened?.text).toBe('{"schemaVersion":1}');
    expect(await adapter.openSession()).toBeNull();
  });

  it('pickImages registers refs with adapter-scoped ids; loadImage returns a stable object URL', async () => {
    const adapter = new BrowserPlatformAdapter({
      disableFsAccess: true,
      storage: memoryStorage(),
      fileDialog: queuedDialog([[textFile('a.png', 'x'), textFile('b.png', 'y')]]),
    });
    const refs = await adapter.pickImages();
    expect(refs.map((r) => r.name)).toEqual(['a.png', 'b.png']);
    expect(new Set(refs.map((r) => r.id)).size).toBe(2);

    const url = await adapter.loadImage(refs[0]!);
    expect(url).toMatch(/^blob:/);
    expect(await adapter.loadImage(refs[0]!)).toBe(url); // cached
  });

  it('loadImage on an id from a previous browser session throws PlatformIOError (relink flow)', async () => {
    const adapter = new BrowserPlatformAdapter({ disableFsAccess: true, storage: memoryStorage() });
    await expect(adapter.loadImage({ id: 'web:99', name: 'lost.png' })).rejects.toBeInstanceOf(
      PlatformIOError
    );
  });

  it('relinkImage returns a fresh ref, or null when the user declines', async () => {
    const adapter = new BrowserPlatformAdapter({
      disableFsAccess: true,
      storage: memoryStorage(),
      fileDialog: queuedDialog([[textFile('found.png', 'x')], []]),
    });
    const found = await adapter.relinkImage({ id: 'web:1', name: 'lost.png' });
    expect(found?.name).toBe('found.png');
    expect(await adapter.relinkImage({ id: 'web:1', name: 'lost.png' })).toBeNull();
  });

  it('saveSessionAs downloads and always succeeds; saveSession refuses to overwrite', async () => {
    const downloads: Array<{ name: string; text: string; mime: string }> = [];
    const adapter = new BrowserPlatformAdapter({
      disableFsAccess: true,
      storage: memoryStorage(),
      downloader: (name, text, mime) => downloads.push({ name, text, mime }),
    });
    const ref = await adapter.saveSessionAs('{"schemaVersion":1}', 'session.json');
    expect(ref?.name).toBe('session.json');
    expect(downloads).toEqual([
      { name: 'session.json', text: '{"schemaVersion":1}', mime: 'application/json' },
    ]);
    await expect(adapter.saveSession(ref!, 'x')).rejects.toBeInstanceOf(PlatformIOError);

    const csv = await adapter.exportCsv('a,b\n', 'quadrat-data.csv');
    expect(csv?.name).toBe('quadrat-data.csv');
    expect(downloads[1]?.mime).toBe('text/csv');
  });

  it('settings round-trip through storage; absent = null', async () => {
    const storage = memoryStorage();
    const adapter = new BrowserPlatformAdapter({ disableFsAccess: true, storage });
    expect(await adapter.loadSettings()).toBeNull();
    await adapter.saveSettings({ hotkeysEnabled: false, lastSessionText: 's' });
    expect(await adapter.loadSettings()).toEqual({ hotkeysEnabled: false, lastSessionText: 's' });
    // survives a "reload" (new adapter over the same storage)
    const again = new BrowserPlatformAdapter({ disableFsAccess: true, storage });
    expect(await again.loadSettings()).toEqual({ hotkeysEnabled: false, lastSessionText: 's' });
  });
});

describe('BrowserPlatformAdapter (File System Access mode)', () => {
  it('detects pickers, opens via handle, saves + overwrites in place', async () => {
    vi.stubGlobal('showOpenFilePicker', () =>
      Promise.resolve(fakeFsHandles([textFile('reef.json', '{"schemaVersion":1}')]))
    );
    vi.stubGlobal('showSaveFilePicker', () =>
      Promise.resolve(fakeFsHandles([textFile('out.json', '')])[0])
    );
    const adapter = new BrowserPlatformAdapter({ storage: memoryStorage() });
    expect(adapter.capabilities).toEqual({ persistentFileIds: false, canOverwrite: true });

    expect((await adapter.openSession())?.text).toBe('{"schemaVersion":1}');

    const ref = await adapter.saveSessionAs('first', 'out.json');
    expect(ref?.name).toBe('out.json');
    expect(written.get('out.json')).toBe('first');

    await adapter.saveSession(ref!, 'second'); // silent overwrite via the kept handle
    expect(written.get('out.json')).toBe('second');
  });

  it('maps picker AbortError to cancellation values', async () => {
    vi.stubGlobal('showOpenFilePicker', () => Promise.reject(abortError()));
    vi.stubGlobal('showSaveFilePicker', () => Promise.reject(abortError()));
    const adapter = new BrowserPlatformAdapter({ storage: memoryStorage() });

    expect(await adapter.openSession()).toBeNull();
    expect(await adapter.openSpeciesCsv()).toBeNull();
    expect(await adapter.pickImages()).toEqual([]);
    expect(await adapter.relinkImage({ id: 'web:1', name: 'x.png' })).toBeNull();
    expect(await adapter.saveSessionAs('t', 's.json')).toBeNull();
    expect(await adapter.exportCsv('t', 'e.csv')).toBeNull();
  });

  it('wraps non-cancel picker failures in PlatformIOError', async () => {
    vi.stubGlobal('showOpenFilePicker', () => Promise.reject(new Error('boom')));
    vi.stubGlobal('showSaveFilePicker', () => Promise.reject(new Error('boom')));
    const adapter = new BrowserPlatformAdapter({ storage: memoryStorage() });

    await expect(adapter.openSession()).rejects.toBeInstanceOf(PlatformIOError);
    await expect(adapter.pickImages()).rejects.toThrow('pick images failed: boom');
  });
});
