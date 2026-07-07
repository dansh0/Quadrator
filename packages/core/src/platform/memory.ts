/**
 * InMemoryPlatformAdapter — scriptable PlatformAdapter for tests (and the
 * future web demo mode). Dialog responses are FIFO queues: tests enqueue
 * what the "user" picks; an empty queue means the user cancelled. Writes
 * are recorded so tests can assert on exactly what would have hit disk.
 *
 * Lives in core because it is pure data structures — no I/O, no platform
 * APIs — and every UI package needs it for component tests.
 */
import {
  FileRef,
  OpenedTextFile,
  PlatformAdapter,
  PlatformCapabilities,
  PlatformIOError,
} from './adapter.ts';

export class InMemoryPlatformAdapter implements PlatformAdapter {
  readonly capabilities: PlatformCapabilities;

  // scripted dialog responses (FIFO; empty = cancel)
  private readonly sessionOpens: OpenedTextFile[] = [];
  private readonly speciesOpens: OpenedTextFile[] = [];
  private readonly imagePicks: FileRef[][] = [];
  private readonly relinkResponses: Array<FileRef | null> = [];
  private saveTargets: FileRef[] = [];

  // resolvable images: id → displayable URL
  private readonly images = new Map<string, string>();

  // recorded writes
  readonly savedSessions: Array<{ ref: FileRef; text: string }> = [];
  readonly exportedCsvs: Array<{ ref: FileRef; text: string }> = [];
  private settings: unknown = null;

  constructor(capabilities?: Partial<PlatformCapabilities>) {
    this.capabilities = {
      persistentFileIds: true,
      canOverwrite: true,
      ...capabilities,
    };
  }

  // ---- test scripting -------------------------------------------------------

  queueSessionOpen(text: string, ref: FileRef = { id: '/session.json', name: 'session.json' }): void {
    this.sessionOpens.push({ ref, text });
  }

  queueSpeciesOpen(text: string, ref: FileRef = { id: '/buttons.csv', name: 'buttons.csv' }): void {
    this.speciesOpens.push({ ref, text });
  }

  /** Enqueue one pickImages() answer; also registers the images as loadable. */
  queueImagePick(refs: FileRef[], urlFor: (ref: FileRef) => string = (r) => `memory://${r.id}`): void {
    this.imagePicks.push(refs);
    for (const ref of refs) this.images.set(ref.id, urlFor(ref));
  }

  queueRelink(response: FileRef | null): void {
    this.relinkResponses.push(response);
  }

  /** Enqueue the destination the "user" chooses in the next save/export dialog. */
  queueSaveTarget(ref: FileRef): void {
    this.saveTargets.push(ref);
  }

  /** Register an image as resolvable without going through pickImages. */
  addImage(ref: FileRef, url = `memory://${ref.id}`): void {
    this.images.set(ref.id, url);
  }

  // ---- PlatformAdapter ------------------------------------------------------

  async openSession(): Promise<OpenedTextFile | null> {
    return this.sessionOpens.shift() ?? null;
  }

  async saveSessionAs(text: string, suggestedName: string): Promise<FileRef | null> {
    const ref = this.saveTargets.shift() ?? null;
    if (ref === null) return null;
    void suggestedName;
    this.savedSessions.push({ ref, text });
    return ref;
  }

  async saveSession(ref: FileRef, text: string): Promise<void> {
    if (!this.capabilities.canOverwrite) {
      throw new PlatformIOError('this adapter cannot overwrite; use saveSessionAs');
    }
    this.savedSessions.push({ ref, text });
  }

  async openSpeciesCsv(): Promise<OpenedTextFile | null> {
    return this.speciesOpens.shift() ?? null;
  }

  async pickImages(): Promise<FileRef[]> {
    return this.imagePicks.shift() ?? [];
  }

  async loadImage(ref: FileRef): Promise<string> {
    const url = this.images.get(ref.id);
    if (url === undefined) {
      throw new PlatformIOError(`image not found: ${ref.id}`);
    }
    return url;
  }

  async relinkImage(missing: FileRef): Promise<FileRef | null> {
    void missing;
    const ref = this.relinkResponses.shift() ?? null;
    if (ref) this.images.set(ref.id, `memory://${ref.id}`);
    return ref;
  }

  async exportCsv(text: string, suggestedName: string): Promise<FileRef | null> {
    const ref = this.saveTargets.shift() ?? null;
    if (ref === null) return null;
    void suggestedName;
    this.exportedCsvs.push({ ref, text });
    return ref;
  }

  async loadSettings(): Promise<unknown> {
    return this.settings;
  }

  async saveSettings(value: unknown): Promise<void> {
    this.settings = value;
  }
}
