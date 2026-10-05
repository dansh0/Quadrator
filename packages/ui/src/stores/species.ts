/**
 * Species-button definitions and hotkey preference. The species list is
 * persisted by CONTENT (CSV text) in the settings document, not by file
 * path — moved files can't silently empty the button set, and the same
 * mechanism works in the browser. The CSV is also the sharing format, so
 * every change the app makes is written back as CSV (serializeSpeciesCsv).
 */
import {
  HotkeyError,
  PlatformAdapter,
  SpeciesEntry,
  assertValidSpecies,
  hotkeyProblem,
  parseSpeciesCsv,
  resolveHotkeys,
  serializeSpeciesCsv,
} from '@quadrator/core';
import { defineStore } from 'pinia';
import { parseUiSettings } from '../settings.ts';

export interface SpeciesState {
  entries: SpeciesEntry[];
  hotkeysEnabled: boolean;
  /** CSV of the current button set (what gets persisted). */
  csvText: string | null;
}

/** What assignHotkey changed, for the UI to report (and undo). */
export interface HotkeyChange {
  code: string;
  key: string | null;
  /** Another species that held `key` and now has `code`'s old key (or none). */
  swappedWith: { code: string; key: string | null } | null;
  /**
   * Any other species whose key changed as a side effect: clearing an
   * explicit key returns that species to the automatic layout, which can
   * move the automatic keys after it.
   */
  moved: string[];
}

export const useSpeciesStore = defineStore('species', {
  state: (): SpeciesState => ({
    entries: [],
    hotkeysEnabled: true,
    csvText: null,
  }),

  getters: {
    codes: (s) => s.entries.map((e) => e.code),
    /**
     * code → key. Entries are validated on every way in, so this cannot
     * throw in practice; an empty map is the safe answer if it ever did.
     */
    hotkeys: (s): Map<string, string> => {
      try {
        return resolveHotkeys(s.entries);
      } catch {
        return new Map();
      }
    },
    hotkeyFor() {
      return (code: string): string | null => this.hotkeys.get(code) ?? null;
    },
    codeForKey() {
      return (key: string): string | null => {
        for (const [code, k] of this.hotkeys) if (k === key) return code;
        return null;
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
        // degrades to "no buttons loaded", never a crash. A list that
        // predates a validation rule (e.g. duplicate codes) still loads —
        // the species editor shows the problems and won't save until fixed.
        try {
          const entries = parseSpeciesCsv(settings.speciesCsvText);
          resolveHotkeys(entries); // a key clash would make tagging ambiguous
          this.entries = entries;
          this.csvText = settings.speciesCsvText;
        } catch {
          this.entries = [];
          this.csvText = null;
        }
      }
    },

    /**
     * Load a button set from a user-chosen CSV. Parse and validation
     * failures (CsvParseError, SpeciesValidationError) propagate and leave
     * the current set untouched. False = cancelled. The file's own text is
     * persisted unchanged.
     */
    async loadFromFile(platform: PlatformAdapter): Promise<boolean> {
      const file = await platform.openSpeciesCsv();
      if (file === null) return false;
      const entries = parseSpeciesCsv(file.text);
      assertValidSpecies(entries); // throws before any state change
      this.entries = entries;
      this.csvText = file.text;
      await this.persist(platform);
      return true;
    },

    /** Replace the whole list (species editor Save, hotkey undo). Validates first. */
    async replaceEntries(platform: PlatformAdapter, entries: readonly SpeciesEntry[]): Promise<void> {
      assertValidSpecies(entries);
      this.entries = entries.map((e) => ({ ...e }));
      this.csvText = serializeSpeciesCsv(this.entries);
      await this.persist(platform);
    },

    /**
     * Give `code` the tagging key `key`, or with null drop its explicit key
     * (it then takes the next free default). If another species holds `key`
     * — explicitly or by default — the two swap: it gets `code`'s old key,
     * so a rebinding never silently leaves someone keyless while a key was
     * there to give. Throws HotkeyError for a key that can't be assigned.
     */
    async assignHotkey(
      platform: PlatformAdapter,
      code: string,
      key: string | null
    ): Promise<HotkeyChange> {
      const target = this.entries.find((e) => e.code === code);
      if (target === undefined) throw new HotkeyError(`no species with code '${code}'`);

      const before = new Map(this.hotkeys);
      let holder: string | null = null;
      if (key === null) {
        target.hotkey = '';
      } else {
        const problem = hotkeyProblem(key);
        if (problem !== null) throw new HotkeyError(problem);
        const previous = this.hotkeyFor(code);
        holder = this.codeForKey(key);
        if (holder === code) {
          holder = null;
        } else if (holder !== null) {
          const other = this.entries.find((e) => e.code === holder)!;
          other.hotkey = previous ?? '';
        }
        target.hotkey = key;
      }

      this.csvText = serializeSpeciesCsv(this.entries);
      await this.persist(platform);
      const after = this.hotkeys;
      return {
        code,
        key: after.get(code) ?? null,
        swappedWith: holder === null ? null : { code: holder, key: after.get(holder) ?? null },
        moved: this.codes.filter(
          (c) => c !== code && c !== holder && before.get(c) !== after.get(c)
        ),
      };
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
