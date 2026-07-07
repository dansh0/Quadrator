import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CsvParseError, parseSpeciesCsv } from '../src/species/parse.ts';

// cwd-relative: vitest runs from the repo root
const realButtonsCsv = readFileSync('tests/fixtures/buttons.csv', 'utf8');

describe('parseSpeciesCsv', () => {
  it('parses the real buttons.csv fixture like csv-parser did', () => {
    const entries = parseSpeciesCsv(realButtonsCsv);
    expect(entries).toHaveLength(32); // 33 lines − header, none lack species

    expect(entries[0]).toEqual({
      code: 'Anom',
      species: 'Anthopleura_sp',
      group1: 'Animal',
      group2: 'Intertidal sessile',
      color: '#9c27b0',
      colorSelected: '#7c1790',
    });

    // codes with special characters survive
    expect(entries.map((e) => e.code)).toContain('?#1');
    // trailing space in the real file is preserved (csv-parser did not trim)
    const sarg = entries.find((e) => e.code === 'Sarg');
    expect(sarg?.species).toBe('Sargassum spp. ');
  });

  it('skips rows without a species value (legacy filter)', () => {
    const text = 'code,species,group1,group2\nA,Alpha,g1,g2\nB,,g1,g2\nC,Gamma,g1,g2\n';
    const entries = parseSpeciesCsv(text);
    expect(entries.map((e) => e.code)).toEqual(['A', 'C']);
  });

  it('handles quoted fields, embedded commas, and doubled quotes', () => {
    const text =
      'code,species,group1,group2\n' +
      'Ulva,"Ulva sp., green",Algae,Intertidal\n' +
      'Q,"say ""hi""",g1,g2\n';
    const entries = parseSpeciesCsv(text);
    expect(entries[0]?.species).toBe('Ulva sp., green');
    expect(entries[1]?.species).toBe('say "hi"');
  });

  it('handles CRLF line endings and a UTF-8 BOM', () => {
    const text = '﻿code,species,group1,group2\r\nA,Alpha,g1,g2\r\n';
    const entries = parseSpeciesCsv(text);
    expect(entries).toHaveLength(1);
    expect(entries[0]?.code).toBe('A');
  });

  it('missing optional columns default to empty strings', () => {
    const entries = parseSpeciesCsv('code,species\nA,Alpha\n');
    expect(entries[0]).toEqual({
      code: 'A',
      species: 'Alpha',
      group1: '',
      group2: '',
      color: '',
      colorSelected: '',
    });
  });

  it('rejects input without the required header columns', () => {
    expect(() => parseSpeciesCsv('')).toThrow(CsvParseError);
    expect(() => parseSpeciesCsv('foo,bar\n1,2\n')).toThrow(CsvParseError);
    expect(() => parseSpeciesCsv('code,name\nA,Alpha\n')).toThrow(CsvParseError);
  });

  it('rejects an unterminated quoted field', () => {
    expect(() => parseSpeciesCsv('code,species\nA,"broken\n')).toThrow(CsvParseError);
  });
});
