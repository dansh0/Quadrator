/**
 * CSV results export — port of Quadrat.toCSV / Quadrat._csvEscape (with the
 * Phase 0 fixes: proper field escaping and UNKNOWN CODE fallback for codes
 * missing from the current species list). Pure string-building; file writing
 * stays in the platform shells.
 */
import { SpeciesEntry } from '../model/types.ts';

export const CSV_HEADER =
  'Quadrat Title,Image Path,ID Date,Species Code,Species,Group Name,Species Count,Species Coverage %';

/**
 * Quote a value for CSV output (commas, quotes, or newlines in species/group
 * names or file paths would otherwise shift every following column).
 */
export function csvEscape(value: unknown): string {
  const str = String(value === undefined || value === null ? '' : value);
  if (/[",\n\r]/.test(str)) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

export interface QuadratCsvInput {
  name: string;
  imagePath: string;
  /** Total sample count — the denominator for coverage %. */
  numOfSamples: number;
  samples: ReadonlyArray<{ codes: readonly string[] }>;
}

/**
 * One CSV row per distinct tagged code, in first-tagged order:
 * name, imagePath, date, code, species, "group1 - group2", count, coverage %.
 * Codes missing from `species` export as species 'UNKNOWN CODE', group ''.
 * Untagged quadrats produce no rows. `now` defaults to the current time and
 * is rendered with Date.toString() (legacy format).
 */
export function quadratCsvRows(
  q: QuadratCsvInput,
  species: readonly SpeciesEntry[],
  now: Date = new Date()
): string[] {
  const dateString = now.toString();

  const tally = new Map<string, { count: number; species: string; group: string }>();
  for (const sample of q.samples) {
    for (const code of sample.codes) {
      const existing = tally.get(code);
      if (existing) {
        existing.count += 1;
      } else {
        const entry = species.find((s) => s.code === code);
        tally.set(
          code,
          entry
            ? { count: 1, species: entry.species, group: `${entry.group1} - ${entry.group2}` }
            : { count: 1, species: 'UNKNOWN CODE', group: '' }
        );
      }
    }
  }

  const rows: string[] = [];
  for (const [code, t] of tally) {
    const coverage = (t.count / q.numOfSamples) * 100;
    rows.push(
      [q.name, q.imagePath, dateString, code, t.species, t.group, t.count, coverage]
        .map(csvEscape)
        .join(',')
    );
  }
  return rows;
}
