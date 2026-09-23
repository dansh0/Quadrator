/**
 * Species/buttons CSV parsing — replaces the csv-parser npm dependency
 * (which needs Node streams and can't run in a browser). RFC 4180-ish:
 * quoted fields, doubled quotes inside quotes, CR/LF/CRLF line endings,
 * UTF-8 BOM stripped. Behavior matches loadButtonsFromPath: header row
 * required, rows without a `species` value are skipped.
 */
import { SpeciesEntry } from '../model/types.ts';

export class CsvParseError extends Error {
  override readonly name = 'CsvParseError';
}

/** Split CSV text into records of raw string fields. */
function parseCsvRecords(text: string): string[][] {
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text; // strip BOM
  const records: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  let fieldStarted = false;

  const endField = (): void => {
    row.push(field);
    field = '';
    fieldStarted = false;
  };
  const endRow = (): void => {
    endField();
    // ignore fully empty lines (e.g. trailing newline)
    if (row.length > 1 || row[0] !== '') records.push(row);
    row = [];
  };

  for (let i = 0; i < src.length; i++) {
    const c = src[i]!;
    if (inQuotes) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"' && !fieldStarted) {
      inQuotes = true;
      fieldStarted = true;
    } else if (c === ',') {
      endField();
    } else if (c === '\n') {
      endRow();
    } else if (c === '\r') {
      if (src[i + 1] === '\n') i++;
      endRow();
    } else {
      field += c;
      fieldStarted = true;
    }
  }
  if (inQuotes) {
    throw new CsvParseError('unterminated quoted field');
  }
  if (field !== '' || row.length > 0) endRow();
  return records;
}

/**
 * Parse a species/buttons CSV. The header row must contain `code` and
 * `species` columns (others: group1, group2, color, colorSelected; missing
 * columns default to ''). Rows with an empty species field are skipped,
 * matching the legacy loader.
 */
export function parseSpeciesCsv(text: string): SpeciesEntry[] {
  const records = parseCsvRecords(text);
  if (records.length === 0) {
    throw new CsvParseError('empty CSV: missing header row');
  }
  const header = records[0]!.map((h) => h.trim());
  if (!header.includes('code') || !header.includes('species')) {
    throw new CsvParseError(
      `header row must contain 'code' and 'species' columns, got: ${header.join(', ')}`
    );
  }

  const col = (row: string[], name: string): string => {
    const idx = header.indexOf(name);
    return idx === -1 ? '' : (row[idx] ?? '');
  };

  const entries: SpeciesEntry[] = [];
  for (const row of records.slice(1)) {
    if (!col(row, 'species')) continue;
    entries.push({
      code: col(row, 'code'),
      species: col(row, 'species'),
      group1: col(row, 'group1'),
      group2: col(row, 'group2'),
      color: col(row, 'color'),
      colorSelected: col(row, 'colorSelected'),
    });
  }
  return entries;
}
