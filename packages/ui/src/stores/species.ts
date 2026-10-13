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
  formatIssue,
  hotkeyProblem,
  parseSpeciesCsv,
  resolveHotkeys,
  serializeSpeciesCsv,
  validateSpecies,
} from '@quadrator/core';
import { defineStore } from 'pinia';
import { parseUiSettings } from '../settings.ts';

export interface SpeciesState {
  entries: SpeciesEntry[];
  hotkeysEnabled: boolean;
  /** CSV of the current button set (what gets persisted). */
  csvText: string | null;
  /** Why the saved list didn't load as stored (shown on the Species tab). */
  loadWarning: string | null;
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
    loadWarning: null,
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
      if (settings.speciesCsvText === null) return;
      // Trust-but-verify our own persisted copy, but never quietly lose it:
      // an unreadable copy stays in csvText (so the next persist writes it
      // back) until the user loads or creates a list in its place.
      this.csvText = settings.speciesCsvText;
      let entries: SpeciesEntry[];
      try {
        entries = parseSpeciesCsv(settings.speciesCsvText);
      } catch (e) {
        this.entries = [];
        const why = e instanceof Error ? e.message : String(e);
        this.loadWarning = `The saved species list couldn't be read (${why}). Load a CSV or create a list to replace it.`;
        return;
      }
      // A list that predates a validation rule (e.g. duplicate codes) still
      // loads — the species editor shows the problems and won't save until
      // fixed. A key clash would make tagging ambiguous, so those keys are
      // cleared (the species fall back to automatic keys) and the user told.
      const clashes = validateSpecies(entries).filter((i) => i.field === 'hotkey');
      if (clashes.length > 0) {
        for (const issue of clashes) entries[issue.row]!.hotkey = '';
        this.csvText = serializeSpeciesCsv(entries);
        this.loadWarning = `Some saved hotkeys couldn't be used and were cleared: ${clashes.map(formatIssue).join('; ')}`;
      }
      this.entries = entries;
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
      await this.commitList(platform, entries, file.text);
      return true;
    },

    /** Replace the whole list (species editor Save). Validates first. */
    async replaceEntries(platform: PlatformAdapter, entries: readonly SpeciesEntry[]): Promise<void> {
      assertValidSpecies(entries);
      await this.commitList(platform, entries);
    },

    /**
     * Put back a list this store held before (hotkey Undo). Only hotkeys are
     * re-checked: the snapshot may break a rule init() lets through (e.g.
     * duplicate codes), and refusing it would leave the rebind un-undoable.
     */
    async restoreEntries(platform: PlatformAdapter, entries: readonly SpeciesEntry[]): Promise<void> {
      resolveHotkeys(entries);
      await this.commitList(platform, entries);
    },

    /** Make `entries` the list and persist it; on a failed save, nothing changes. */
    async commitList(
      platform: PlatformAdapter,
      entries: readonly SpeciesEntry[],
      csvText = serializeSpeciesCsv(entries)
    ): Promise<void> {
      const next = entries.map((e) => ({ ...e }));
      // Save first, change after: state never shows a list that failed to save.
      await this.persist(platform, csvText);
      this.entries = next;
      this.csvText = csvText;
      this.loadWarning = null;
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
      // Work on a copy: the list changes only once the save succeeds.
      const next = this.entries.map((e) => ({ ...e }));
      const target = next.find((e) => e.code === code);
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
          // the row that holds the key (a repeated code may hold it on a later row)
          const other =
            next.find((e) => e.code === holder && e.hotkey === key) ??
            next.find((e) => e.code === holder)!;
          other.hotkey = previous ?? '';
        }
        target.hotkey = key;
      }

      resolveHotkeys(next); // never save a list whose keys clash (HotkeyError)
      await this.commitList(platform, next);
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

    /** Save the preference and `csvText` (default: the current list). */
    async persist(platform: PlatformAdapter, csvText?: string | null): Promise<void> {
      const current = parseUiSettings(await platform.loadSettings());
      await platform.saveSettings({
        ...current,
        hotkeysEnabled: this.hotkeysEnabled,
        speciesCsvText: csvText === undefined ? this.csvText : csvText,
      });
    },
  },
});
