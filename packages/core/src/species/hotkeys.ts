/**
 * Species hotkeys and list validation.
 *
 * A species either names its key explicitly (`SpeciesEntry.hotkey`) or takes
 * the next free key from DEFAULT_HOTKEYS in list order. With no explicit keys
 * at all this reproduces the legacy positional layout exactly, so existing
 * lists and muscle memory are untouched.
 */
import { SpeciesEntry } from '../model/types.ts';

/** Keyboard order mirrors the legacy layout (left-hand rows, then right). */
export const DEFAULT_HOTKEYS: readonly string[] = [
  'q', 'w', 'e', 'r', 'a', 's', 'd', 'f', 'z', 'x', 'c', 'v',
  'u', 'i', 'o', 'p', 'j', 'k', 'l', ';', 'm', ',', '.', '/',
];

/**
 * Every key a species may use: what an unshifted US keyboard types with one
 * press. Tagging ignores Shift (and other modifiers), so a key that needs
 * Shift — '!', ':', capitals — could be assigned but never pressed. Space,
 * Enter, Backspace and the arrows are taken by sample navigation.
 */
export const ASSIGNABLE_HOTKEYS: ReadonlySet<string> = new Set([
  ...'abcdefghijklmnopqrstuvwxyz0123456789',
  ...'`-=[]\\;\',./',
]);

/** Why `key` cannot be a species hotkey, or null when it can. */
export function hotkeyProblem(key: string): string | null {
  if (ASSIGNABLE_HOTKEYS.has(key)) return null;
  if (key.length === 1 && ASSIGNABLE_HOTKEYS.has(key.toLowerCase())) {
    return `'${key}' must be lowercase`;
  }
  return `'${key}' can't be a hotkey: use a letter, digit, or one of \` - = [ ] \\ ; ' , . /`;
}

export class HotkeyError extends Error {
  override readonly name = 'HotkeyError';
}

/**
 * Resolve every species' tagging key: code → key. Explicit keys first, then
 * the rest in list order take the next DEFAULT_HOTKEYS key nobody holds.
 * Species left over when the pool runs out get no key. A repeated code
 * resolves once (its first row), since tags are stored by code.
 *
 * Throws HotkeyError for an unassignable or duplicated explicit key — a
 * clash must never quietly decide which species a keypress tags.
 */
export function resolveHotkeys(entries: readonly SpeciesEntry[]): Map<string, string> {
  const issues = validateSpecies(entries).filter((i) => i.field === 'hotkey');
  if (issues.length > 0) {
    throw new HotkeyError(issues.map(formatIssue).join('; '));
  }

  const byCode = new Map<string, string>();
  const taken = new Set<string>();
  for (const e of entries) {
    if (e.hotkey !== '' && !byCode.has(e.code)) {
      byCode.set(e.code, e.hotkey);
      taken.add(e.hotkey);
    }
  }
  const pool = DEFAULT_HOTKEYS.filter((k) => !taken.has(k));
  for (const e of entries) {
    if (byCode.has(e.code)) continue;
    const key = pool.shift();
    if (key === undefined) break;
    byCode.set(e.code, key);
  }
  return byCode;
}

export type SpeciesField = keyof SpeciesEntry;

/** One problem with a species list; `row` is the 0-based entry index. */
export interface SpeciesIssue {
  row: number;
  field: SpeciesField;
  message: string;
}

/** "Row 3, hotkey: …" — 1-based, as a person counts rows. */
export function formatIssue(issue: SpeciesIssue): string {
  return `row ${issue.row + 1}, ${issue.field}: ${issue.message}`;
}

/** Hex (#rgb, #rgba, #rrggbb, #rrggbbaa) or a plain colour/theme name. */
const COLOR = /^(#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})|[a-z]+(-[a-z0-9]+)*)$/i;

/**
 * Every rule a species list must meet before it is used for tagging. Codes
 * are what samples store, so they must be present, unique (case-sensitive,
 * as tags are) and free of edge whitespace that no one can see on a button.
 * Colours may be blank (the theme default).
 */
export function validateSpecies(entries: readonly SpeciesEntry[]): SpeciesIssue[] {
  const issues: SpeciesIssue[] = [];
  const codeRows = new Map<string, number>();
  const keyRows = new Map<string, number>();

  entries.forEach((e, row) => {
    if (e.code === '') {
      issues.push({ row, field: 'code', message: 'required' });
    } else if (e.code.trim() !== e.code) {
      issues.push({ row, field: 'code', message: 'remove spaces at the start or end' });
    } else if (codeRows.has(e.code)) {
      issues.push({
        row,
        field: 'code',
        message: `'${e.code}' is already used on row ${codeRows.get(e.code)! + 1}`,
      });
    } else {
      codeRows.set(e.code, row);
    }

    if (e.species.trim() === '') {
      issues.push({ row, field: 'species', message: 'required' });
    }

    for (const field of ['color', 'colorSelected'] as const) {
      if (e[field] !== '' && !COLOR.test(e[field])) {
        issues.push({ row, field, message: `'${e[field]}' is not a colour (use e.g. #4caf50)` });
      }
    }

    if (e.hotkey !== '') {
      const problem = hotkeyProblem(e.hotkey);
      if (problem !== null) {
        issues.push({ row, field: 'hotkey', message: problem });
      } else if (keyRows.has(e.hotkey)) {
        issues.push({
          row,
          field: 'hotkey',
          message: `'${e.hotkey}' is already used on row ${keyRows.get(e.hotkey)! + 1}`,
        });
      } else {
        keyRows.set(e.hotkey, row);
      }
    }
  });
  return issues;
}

/** Thrown when a species list fails validateSpecies; carries every issue. */
export class SpeciesValidationError extends Error {
  override readonly name = 'SpeciesValidationError';
  constructor(readonly issues: readonly SpeciesIssue[]) {
    const shown = issues.slice(0, 3).map(formatIssue).join('; ');
    const more = issues.length > 3 ? ` (and ${issues.length - 3} more)` : '';
    super(`Species list has problems: ${shown}${more}`);
  }
}

/** Throw SpeciesValidationError unless `entries` is a usable list. */
export function assertValidSpecies(entries: readonly SpeciesEntry[]): void {
  const issues = validateSpecies(entries);
  if (issues.length > 0) throw new SpeciesValidationError(issues);
}
