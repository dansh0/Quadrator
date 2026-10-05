/**
 * Species list → CSV text, the inverse of parseSpeciesCsv. The CSV is both
 * the sharing format and what the app persists, so one parser and one
 * serializer cover every path a list takes.
 */
import { csvEscape } from '../export/csv.ts';
import { SpeciesEntry } from '../model/types.ts';

/** Column order of every CSV the app writes (hotkey last: older files lack it). */
export const SPECIES_CSV_COLUMNS = [
  'code',
  'species',
  'group1',
  'group2',
  'color',
  'colorSelected',
  'hotkey',
] as const satisfies readonly (keyof SpeciesEntry)[];

/**
 * Header plus one row per entry, LF line endings, trailing newline. Fields
 * with commas, quotes or line breaks are quoted. Round-trips through
 * parseSpeciesCsv for any entry with a non-empty species (rows without one
 * are skipped on parse — validateSpecies rejects them before they get here).
 */
export function serializeSpeciesCsv(entries: readonly SpeciesEntry[]): string {
  const lines = [SPECIES_CSV_COLUMNS.join(',')];
  for (const e of entries) {
    lines.push(SPECIES_CSV_COLUMNS.map((c) => csvEscape(e[c])).join(','));
  }
  return lines.join('\n') + '\n';
}
