/**
 * PlatformAdapter — the contract between the UI layer and a platform shell
 * (DESIGN.md §2). Core defines the interface only; implementations live in
 * the shells: Electron (typed IPC through a context-isolated preload) and
 * the browser (File System Access API with download fallback). The UI layer
 * depends on this interface and never on a platform API directly.
 *
 * Conventions:
 * - Every method is async, including ones a given platform could answer
 *   synchronously.
 * - User cancellation is a value (`null` / empty array), never an exception.
 * - Failures throw PlatformIOError; adapters wrap their platform's native
 *   errors so the UI never sees fs/DOM error shapes.
 */

/** Stable reference to a platform file/resource. */
export interface FileRef {
  /**
   * Opaque stable identifier. Desktop adapters use absolute filesystem
   * paths; web adapters use adapter-scoped ids. Session files persist this
   * value (QuadratV1.imagePath), so its stability across restarts is
   * platform-dependent — see PlatformCapabilities.persistentFileIds and
   * PlatformAdapter.relinkImage.
   */
  id: string;
  /** Human-readable file name for display (tabs, QA table, dialogs). */
  name: string;
}

/** A text file the user chose and the platform read. */
export interface OpenedTextFile {
  ref: FileRef;
  text: string;
}

export interface PlatformCapabilities {
  /**
   * true when FileRef ids survive app restarts (real filesystem paths).
   * When false, sessions loaded in a fresh run may need relinkImage.
   */
  persistentFileIds: boolean;
  /**
   * true when saveSession can silently overwrite a previously chosen
   * target. When false (e.g. browser download fallback) the UI must always
   * save via saveSessionAs.
   */
  canOverwrite: boolean;
}

/** Typed wrapper for platform I/O failures (STYLE_GUIDE §1: typed errors). */
export class PlatformIOError extends Error {
  override readonly name = 'PlatformIOError';
}

export interface PlatformAdapter {
  readonly capabilities: PlatformCapabilities;

  // ---- sessions -----------------------------------------------------------

  /** Prompt for a session file and read it. null = user cancelled. */
  openSession(): Promise<OpenedTextFile | null>;

  /** Prompt for a destination and write. null = user cancelled. */
  saveSessionAs(text: string, suggestedName: string): Promise<FileRef | null>;

  /**
   * Overwrite a known session target without prompting. Only valid when
   * capabilities.canOverwrite; adapters that cannot overwrite must throw
   * PlatformIOError rather than silently saving elsewhere.
   */
  saveSession(ref: FileRef, text: string): Promise<void>;

  // ---- species definitions ------------------------------------------------

  /** Prompt for a species/buttons CSV and read it. null = user cancelled. */
  openSpeciesCsv(): Promise<OpenedTextFile | null>;

  // ---- survey images --------------------------------------------------------

  /** Prompt for one or more survey images. Empty array = user cancelled. */
  pickImages(): Promise<FileRef[]>;

  /**
   * Resolve an image to a URL the renderer can display (file://, blob: or
   * data:). The URL stays valid until the adapter is disposed of with the
   * shell; throws PlatformIOError when the resource cannot be resolved.
   */
  loadImage(ref: FileRef): Promise<string>;

  /**
   * Ask the user to locate an image whose stored id no longer resolves
   * (session re-link flow, e.g. moved files or non-persistent web ids).
   * null = user declined; the quadrat then renders without its image but
   * keeps all tagging data.
   */
  relinkImage(missing: FileRef): Promise<FileRef | null>;

  // ---- CSV export -----------------------------------------------------------

  /** Prompt for a destination and write the export. null = user cancelled. */
  exportCsv(text: string, suggestedName: string): Promise<FileRef | null>;

  // ---- app settings ---------------------------------------------------------

  /**
   * The stored JSON-serializable settings document, or null when none
   * exists. Callers validate the shape (zod) — the adapter only stores it.
   */
  loadSettings(): Promise<unknown>;

  saveSettings(value: unknown): Promise<void>;
}
