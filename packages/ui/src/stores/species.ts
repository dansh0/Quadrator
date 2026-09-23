/**
 * Species-button definitions and hotkey preference. The species list is
 * persisted by CONTENT (the CSV text) in the settings document, not by file
 * path — moved files can't silently empty the button set, and the same
 * mechanism works in the browser.
 */
import { PlatformAdapter, SpeciesEntry, parseSpeciesCsv } from '@quadrator/core';
import { defineStore } from 'pinia';
import { parseUiSettings } from '../settings.ts';

/** Keyboard order mirrors the legacy layout (left-hand rows, then right). */
export const HOTKEYS: readonly string[] = [
  'q', 'w', 'e', 'r', 'a', 's', 'd', 'f', 'z', 'x', 'c', 'v',
  'u', 'i', 'o', 'p', 'j', 'k', 'l', ';', 'm', ',', '.', '/',
];

export interface SpeciesState {
  entries: SpeciesEntry[];
  hotkeysEnabled: boolean;
  /** Raw CSV of the loaded button set (what gets persisted). */
  csvText: string | null;
}

export const useSpeciesStore = defineStore('species', {
  state: (): SpeciesState => ({
    entries: [],
    hotkeysEnabled: true,
    csvText: null,
  }),

  getters: {
    codes: (s) => s.entries.map((e) => e.code),
    hotkeyFor() {
      return (code: string): string | null => {
        const i = this.codes.indexOf(code);
        return i >= 0 ? (HOTKEYS[i] ?? null) : null;
      };
    },
    codeForKey() {
      return (key: string): string | null => {
        const i = HOTKEYS.indexOf(key);
        return i >= 0 ? (this.codes[i] ?? null) : null;
      };
    },
  },

  actions: {
    /** Restore the persisted button set + hotkey preference at startup. */
    async init(platform: PlatformAdapter): Promise<void> {
      const settings = parseUiSettings(await platform.loadSettings());
      this.hotkeysEnabled = settings.hotkeysEnabled;
      if (settings.speciesCsvText !== null) {
        // Trust-but-verify our own persisted copy; a corrupt document
        // degrades to "no buttons loaded", never a crash.
        try {
          this.entries = parseSpeciesCsv(settings.speciesCsvText);
          this.csvText = settings.speciesCsvText;
        } catch {
          this.entries = [];
          this.csvText = null;
        }
      }
    },

    /**
     * Load a button set from a user-chosen CSV. Parse failures propagate
     * (CsvParseError) and leave the current set untouched. False = cancelled.
     */
    async loadFromFile(platform: PlatformAdapter): Promise<boolean> {
      const file = await platform.openSpeciesCsv();
      if (file === null) return false;
      this.entries = parseSpeciesCsv(file.text); // throws before any state change
      this.csvText = file.text;
      await this.persist(platform);
      return true;
    },

    async setHotkeysEnabled(platform: PlatformAdapter, enabled: boolean): Promise<void> {
      this.hotkeysEnabled = enabled;
      await this.persist(platform);
    },

    async persist(platform: PlatformAdapter): Promise<void> {
      const current = parseUiSettings(await platform.loadSettings());
      await platform.saveSettings({
        ...current,
        hotkeysEnabled: this.hotkeysEnabled,
        speciesCsvText: this.csvText,
      });
    },
  },
});
