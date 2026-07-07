/**
 * Renderer-side wrapper for the desktop preload bridge. The bridge is
 * PlatformAdapter-shaped, but errors crossing the IPC boundary arrive as
 * bare Error clones — this wrapper restores the adapter contract by
 * normalizing them into PlatformIOError.
 */
import {
  FileRef,
  OpenedTextFile,
  PlatformAdapter,
  PlatformCapabilities,
  PlatformIOError,
} from '@quadrator/core';

declare global {
  interface Window {
    /** Exposed by apps/desktop preload via contextBridge. */
    quadrator?: PlatformAdapter;
  }
}

/** The desktop bridge, when running inside the Electron shell. */
export function electronBridge(): PlatformAdapter | null {
  return typeof window !== 'undefined' ? (window.quadrator ?? null) : null;
}

async function wrap<T>(what: string, call: () => Promise<T>): Promise<T> {
  try {
    return await call();
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    throw new PlatformIOError(`${what} failed: ${detail}`, { cause: e });
  }
}

export class ElectronPlatformAdapter implements PlatformAdapter {
  readonly capabilities: PlatformCapabilities;

  constructor(private readonly bridge: PlatformAdapter) {
    this.capabilities = bridge.capabilities;
  }

  openSession(): Promise<OpenedTextFile | null> {
    return wrap('open session', () => this.bridge.openSession());
  }

  saveSessionAs(text: string, suggestedName: string): Promise<FileRef | null> {
    return wrap('save session', () => this.bridge.saveSessionAs(text, suggestedName));
  }

  saveSession(ref: FileRef, text: string): Promise<void> {
    return wrap(`save session to ${ref.name}`, () => this.bridge.saveSession(ref, text));
  }

  openSpeciesCsv(): Promise<OpenedTextFile | null> {
    return wrap('open species CSV', () => this.bridge.openSpeciesCsv());
  }

  pickImages(): Promise<FileRef[]> {
    return wrap('pick images', () => this.bridge.pickImages());
  }

  loadImage(ref: FileRef): Promise<string> {
    return wrap(`load image ${ref.name}`, () => this.bridge.loadImage(ref));
  }

  relinkImage(missing: FileRef): Promise<FileRef | null> {
    return wrap(`relink image ${missing.name}`, () => this.bridge.relinkImage(missing));
  }

  exportCsv(text: string, suggestedName: string): Promise<FileRef | null> {
    return wrap('export CSV', () => this.bridge.exportCsv(text, suggestedName));
  }

  loadSettings(): Promise<unknown> {
    return wrap('load settings', () => this.bridge.loadSettings());
  }

  saveSettings(value: unknown): Promise<void> {
    return wrap('save settings', () => this.bridge.saveSettings(value));
  }
}
