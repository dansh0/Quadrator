/**
 * The species editor's grid model: draft rows, spreadsheet-style cell
 * movement, clipboard paste, and the save-time diff against the saved list.
 * Pure and DOM-free (like canvas.ts) so the rules are tested directly; the
 * component only wires them to inputs and focus.
 */
import {
  SPECIES_CSV_COLUMNS,
  SpeciesEntry,
  SpeciesField,
  validateSpecies,
} from '@quadrator/core';

export interface GridColumn {
  field: SpeciesField;
  label: string;
}

/** Display order matches the CSV, so pasting from a list's CSV just works. */
export const GRID_COLUMNS: readonly GridColumn[] = [
  { field: 'code', label: 'Code' },
  { field: 'species', label: 'Species' },
  { field: 'group1', label: 'Group 1' },
  { field: 'group2', label: 'Group 2' },
  { field: 'color', label: 'Colour' },
  { field: 'colorSelected', label: 'Selected colour' },
  { field: 'hotkey', label: 'Hotkey' },
];

/**
 * One editable row. `id` is stable for the life of the dialog (Vue keys,
 * error lookup); `originalCode` is the code the row had in the saved list,
 * null for rows added in this edit — it is how a rename is told apart from
 * a delete-and-add.
 */
export interface DraftRow extends SpeciesEntry {
  id: number;
  originalCode: string | null;
}

let nextRowId = 1;

export function blankRow(): DraftRow {
  return {
    id: nextRowId++,
    originalCode: null,
    code: '',
    species: '',
    group1: '',
    group2: '',
    color: '',
    colorSelected: '',
    hotkey: '',
  };
}

/** Rows for the saved list (`original` true) or for an imported one. */
export function toDraft(entries: readonly SpeciesEntry[], original = true): DraftRow[] {
  return entries.map((e) => ({ ...blankRow(), ...e, originalCode: original ? e.code : null }));
}

function isBlank(row: SpeciesEntry): boolean {
  return SPECIES_CSV_COLUMNS.every((c) => row[c] === '');
}

/**
 * Darker shade of a hex colour for the selected state, when a row leaves
 * "Selected colour" empty. Non-hex colours (names) get no default.
 */
export function autoSelectedColor(color: string): string {
  const m = /^#([0-9a-f]{6})$/i.exec(color) ?? /^#([0-9a-f]{3})$/i.exec(color);
  if (m === null) return '';
  const hex = m[1]!.length === 3 ? [...m[1]!].map((c) => c + c).join('') : m[1]!;
  const dark = [0, 2, 4].map((i) =>
    Math.round(parseInt(hex.slice(i, i + 2), 16) * 0.8)
      .toString(16)
      .padStart(2, '0')
  );
  return `#${dark.join('')}`;
}

/**
 * The list a draft saves as: fully blank rows dropped (a spreadsheet's
 * trailing empty row is not an error), selected colours defaulted.
 */
export function fromDraft(rows: readonly DraftRow[]): SpeciesEntry[] {
  return rows
    .filter((r) => !isBlank(r))
    .map((r) => ({
      code: r.code,
      species: r.species,
      group1: r.group1,
      group2: r.group2,
      color: r.color,
      colorSelected: r.colorSelected === '' ? autoSelectedColor(r.color) : r.colorSelected,
      hotkey: r.hotkey,
    }));
}

/** Validation messages keyed `${rowId}:${field}` — the cells to mark. */
export function validateDraft(rows: readonly DraftRow[]): Map<string, string> {
  const kept = rows.filter((r) => !isBlank(r));
  const errors = new Map<string, string>();
  for (const issue of validateSpecies(fromDraft(rows))) {
    const key = `${kept[issue.row]!.id}:${issue.field}`;
    if (!errors.has(key)) errors.set(key, issue.message);
  }
  return errors;
}

// ---- column suggestions ----------------------------------------------------------

/** Columns that suggest values already used in the same column. */
export const SUGGESTING_FIELDS = ['group1', 'group2', 'color', 'colorSelected'] as const;
export type SuggestingField = (typeof SUGGESTING_FIELDS)[number];

export const isColorField = (field: string): field is 'color' | 'colorSelected' =>
  field === 'color' || field === 'colorSelected';

/**
 * A cell value as a suggestion: trimmed, and for colours lowercased, so
 * "Animal " and "Animal", or "#9C27B0" and "#9c27b0", are one choice.
 */
export function asOption(field: SuggestingField, value: string): string {
  const v = value.trim();
  return isColorField(field) ? v.toLowerCase() : v;
}

/**
 * Every distinct non-blank value of `field` in `rows` — a column's dropdown
 * choices. Groups are sorted by name; colours keep the order they first
 * appear in the list, which follows how species are grouped (sorting hex
 * codes would scatter them meaninglessly).
 */
export function columnOptions(rows: readonly DraftRow[], field: SuggestingField): string[] {
  const seen = new Set<string>();
  for (const r of rows) {
    const v = asOption(field, r[field]);
    if (v !== '') seen.add(v);
  }
  const values = [...seen];
  return isColorField(field) ? values : values.sort((a, b) => a.localeCompare(b));
}

/**
 * The choices to show: everything when the list was opened by click or
 * Alt+Down (`typed` null), otherwise the options containing what was typed,
 * case-insensitively. Unlike a native <datalist>, a filled cell opened by
 * click still offers every other value in the column.
 */
export function filterOptions(options: readonly string[], typed: string | null): string[] {
  const needle = typed?.trim().toLowerCase() ?? '';
  if (needle === '') return [...options];
  return options.filter((o) => o.toLowerCase().includes(needle));
}

// ---- cell movement ---------------------------------------------------------------

export interface CellPos {
  row: number;
  col: number;
}

export type Move = 'up' | 'down' | 'left' | 'right';

/** The neighbouring cell, or null at the grid's edge (no wrapping). */
export function moveCell(at: CellPos, move: Move, rowCount: number): CellPos | null {
  const colCount = GRID_COLUMNS.length;
  const next = {
    up: { row: at.row - 1, col: at.col },
    down: { row: at.row + 1, col: at.col },
    left: { row: at.row, col: at.col - 1 },
    right: { row: at.row, col: at.col + 1 },
  }[move];
  if (next.row < 0 || next.row >= rowCount || next.col < 0 || next.col >= colCount) return null;
  return next;
}

/** Move row `from` to index `to` (drag reorder, Move up/down). */
export function moveRow<T>(rows: readonly T[], from: number, to: number): T[] {
  const out = [...rows];
  if (from < 0 || from >= out.length || to < 0 || to >= out.length) return out;
  const [row] = out.splice(from, 1);
  out.splice(to, 0, row!);
  return out;
}

// ---- clipboard -------------------------------------------------------------------

/**
 * Tab-separated clipboard text (what spreadsheets copy) → cells. Handles
 * CRLF/LF/CR, a trailing line break, and spreadsheet quoting: a cell that
 * starts with a quote may hold tabs, line breaks and doubled quotes.
 */
export function parseClipboardGrid(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let i = 0;
  const endRow = () => {
    row.push(cell);
    rows.push(row);
    row = [];
    cell = '';
  };
  while (i < text.length) {
    const c = text[i]!;
    if (c === '"' && cell === '') {
      // quoted cell: read to the closing quote
      i++;
      while (i < text.length) {
        if (text[i] === '"') {
          if (text[i + 1] === '"') {
            cell += '"';
            i += 2;
            continue;
          }
          i++;
          break;
        }
        cell += text[i++];
      }
      continue;
    }
    if (c === '\t') {
      row.push(cell);
      cell = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      endRow();
    } else {
      cell += c;
    }
    i++;
  }
  if (cell !== '' || row.length > 0) endRow();
  return rows;
}

/** A paste that spans cells (vs. text typed into one cell). */
export function isMultiCellPaste(text: string): boolean {
  return /[\t\n\r]/.test(text.replace(/(\r\n|\n|\r)$/, ''));
}

/**
 * Write a pasted block into the grid starting at `at`, adding rows as
 * needed; cells past the last column are dropped. A header row (first cell
 * "code", pasted into the first column) is skipped, so a whole CSV-shaped
 * sheet can be pasted as is. Hotkeys are normalized like the CSV parser.
 */
export function applyPaste(rows: readonly DraftRow[], at: CellPos, cells: string[][]): DraftRow[] {
  const out = rows.map((r) => ({ ...r }));
  const body =
    at.col === 0 && cells[0]?.[0]?.trim().toLowerCase() === 'code' ? cells.slice(1) : cells;
  body.forEach((values, r) => {
    const rowIndex = at.row + r;
    while (out.length <= rowIndex) out.push(blankRow());
    values.forEach((value, c) => {
      const column = GRID_COLUMNS[at.col + c];
      if (column === undefined) return;
      out[rowIndex]![column.field] =
        column.field === 'hotkey' ? value.trim().toLowerCase() : value;
    });
  });
  return out;
}

// ---- import + save ---------------------------------------------------------------

/**
 * Merge an imported list into the draft by code: rows with a matching code
 * take the imported values (keeping their identity, so it is not a
 * rename), new codes are appended.
 */
export function mergeByCode(rows: readonly DraftRow[], incoming: readonly SpeciesEntry[]): DraftRow[] {
  const out = rows.map((r) => ({ ...r }));
  for (const e of incoming) {
    const match = out.find((r) => r.code === e.code);
    if (match !== undefined) Object.assign(match, e);
    else out.push({ ...blankRow(), ...e });
  }
  return out;
}

export interface CodeChanges {
  /** old code → new code, for saved rows whose code was edited. */
  renames: Map<string, string>;
  /** Saved codes that no longer appear anywhere in the draft. */
  deleted: string[];
}

/** How saving `rows` would change the codes of the `saved` list. */
export function diffCodes(saved: readonly SpeciesEntry[], rows: readonly DraftRow[]): CodeChanges {
  const kept = rows.filter((r) => !isBlank(r));
  const renames = new Map<string, string>();
  for (const r of kept) {
    if (r.originalCode !== null && r.code !== '' && r.code !== r.originalCode) {
      renames.set(r.originalCode, r.code);
    }
  }
  const present = new Set(kept.map((r) => r.code));
  const deleted = saved
    .map((e) => e.code)
    .filter((c) => !renames.has(c) && !present.has(c));
  return { renames, deleted };
}
