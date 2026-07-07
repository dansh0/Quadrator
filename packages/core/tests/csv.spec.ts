import { describe, expect, it } from 'vitest';
import { CSV_HEADER, csvEscape, quadratCsvRows } from '../src/export/csv.ts';
import { SpeciesEntry } from '../src/model/types.ts';

const speciesList: SpeciesEntry[] = [
  { code: 'Anom', species: 'Anthopleura_sp', group1: 'Animal', group2: 'Intertidal sessile', color: '', colorSelected: '' },
  { code: 'Barn', species: 'Cirripedia_spp', group1: 'Animal', group2: 'Intertidal sessile', color: '', colorSelected: '' },
  { code: 'Ulva', species: 'Ulva sp., green', group1: 'Algae', group2: 'Intertidal', color: '', colorSelected: '' },
];

// Minimal RFC4180 line parser for assertions (same as legacy test helper).
function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i]!;
    if (inQuotes) {
      if (c === '"') {
        if (line[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      fields.push(field);
      field = '';
    } else {
      field += c;
    }
  }
  fields.push(field);
  return fields;
}

function taggedQuadrat() {
  return {
    name: 'site1',
    imagePath: '/photos/site1.jpg',
    numOfSamples: 4,
    samples: [{ codes: ['Anom'] }, { codes: ['Anom', 'Ulva'] }, { codes: [] }, { codes: [] }],
  };
}

describe('csvEscape', () => {
  it('passes plain values through and quotes special characters', () => {
    expect(csvEscape('plain')).toBe('plain');
    expect(csvEscape(42)).toBe('42');
    expect(csvEscape(null)).toBe('');
    expect(csvEscape(undefined)).toBe('');
    expect(csvEscape('a,b')).toBe('"a,b"');
    expect(csvEscape('say "hi"')).toBe('"say ""hi"""');
    expect(csvEscape('line\nbreak')).toBe('"line\nbreak"');
  });
});

describe('CSV_HEADER', () => {
  it('has 8 columns matching the row layout', () => {
    expect(CSV_HEADER.split(',')).toHaveLength(8);
  });
});

describe('quadratCsvRows', () => {
  it('produces one row per code with count and coverage (legacy toCSV expectations)', () => {
    const rows = quadratCsvRows(taggedQuadrat(), speciesList);
    expect(rows).toHaveLength(2);

    const anom = parseCsvLine(rows[0]!);
    expect(anom).toHaveLength(8);
    expect(anom[0]).toBe('site1');
    expect(anom[1]).toBe('/photos/site1.jpg');
    expect(anom[3]).toBe('Anom');
    expect(anom[4]).toBe('Anthopleura_sp');
    expect(anom[5]).toBe('Animal - Intertidal sessile');
    expect(anom[6]).toBe('2'); // count
    expect(anom[7]).toBe('50'); // coverage % of 4 samples
  });

  it('escapes fields containing commas', () => {
    const rows = quadratCsvRows(taggedQuadrat(), speciesList);
    const ulvaRow = rows.find((r) => r.includes('Ulva'));
    expect(ulvaRow).toContain('"Ulva sp., green"');
    const fields = parseCsvLine(ulvaRow!);
    expect(fields).toHaveLength(8);
    expect(fields[4]).toBe('Ulva sp., green');
  });

  it('exports codes missing from the species list as UNKNOWN CODE', () => {
    const q = taggedQuadrat();
    q.samples[2] = { codes: ['Zzz'] };
    const rows = quadratCsvRows(q, speciesList);
    const zzzRow = rows.find((r) => r.includes('Zzz'));
    expect(zzzRow).toBeDefined();
    const fields = parseCsvLine(zzzRow!);
    expect(fields[4]).toBe('UNKNOWN CODE');
    expect(fields[5]).toBe('');
    expect(fields[6]).toBe('1');
  });

  it('escapes double quotes by doubling them', () => {
    const q = { ...taggedQuadrat(), name: 'site "A" west' };
    const fields = parseCsvLine(quadratCsvRows(q, speciesList)[0]!);
    expect(fields[0]).toBe('site "A" west');
  });

  it('returns no rows for an untagged quadrat', () => {
    const q = { ...taggedQuadrat(), samples: [{ codes: [] }, { codes: [] }] };
    expect(quadratCsvRows(q, speciesList)).toEqual([]);
  });

  it('uses the provided date deterministically', () => {
    const now = new Date('2026-07-07T12:00:00Z');
    const rows = quadratCsvRows(taggedQuadrat(), speciesList, now);
    expect(parseCsvLine(rows[0]!)[2]).toBe(now.toString());
  });
});
