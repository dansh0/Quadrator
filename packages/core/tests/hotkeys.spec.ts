import fc from 'fast-check';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { SpeciesEntry } from '../src/model/types.ts';
import {
  ASSIGNABLE_HOTKEYS,
  DEFAULT_HOTKEYS,
  HotkeyError,
  SpeciesValidationError,
  assertValidSpecies,
  hotkeyProblem,
  resolveHotkeys,
  validateSpecies,
} from '../src/species/hotkeys.ts';
import { parseSpeciesCsv } from '../src/species/parse.ts';
import { serializeSpeciesCsv } from '../src/species/serialize.ts';

const realButtonsCsv = readFileSync('tests/fixtures/buttons.csv', 'utf8');

function entry(code: string, hotkey = '', extra: Partial<SpeciesEntry> = {}): SpeciesEntry {
  return {
    code,
    species: `${code} species`,
    group1: '',
    group2: '',
    color: '',
    colorSelected: '',
    hotkey,
    ...extra,
  };
}

describe('resolveHotkeys', () => {
  it('reproduces the legacy positional layout when no keys are explicit', () => {
    const entries = parseSpeciesCsv(realButtonsCsv);
    const keys = resolveHotkeys(entries);
    entries.slice(0, 24).forEach((e, i) => expect(keys.get(e.code)).toBe(DEFAULT_HOTKEYS[i]));
    // the real list has 32 species; the 24-key pool runs out
    expect(keys.size).toBe(24);
    expect(keys.has(entries[24]!.code)).toBe(false);
  });

  it('honours explicit keys and auto-fills the rest, skipping taken keys', () => {
    const keys = resolveHotkeys([entry('A'), entry('B', 'q'), entry('C'), entry('D', '1')]);
    expect(Object.fromEntries(keys)).toEqual({ B: 'q', D: '1', A: 'w', C: 'e' });
  });

  it('gives a key to every species when explicit keys sit outside the pool', () => {
    const many = Array.from({ length: 30 }, (_, i) => entry(`S${i}`, i < 10 ? String(i) : ''));
    expect(resolveHotkeys(many).size).toBe(30); // 10 digits + 20 of the 24 defaults
  });

  it('resolves a repeated code once, from its first row', () => {
    const keys = resolveHotkeys([entry('A'), entry('A'), entry('B')]);
    expect(Object.fromEntries(keys)).toEqual({ A: 'q', B: 'w' });
  });

  it('throws HotkeyError on a duplicate or unassignable explicit key', () => {
    expect(() => resolveHotkeys([entry('A', 'q'), entry('B', 'q')])).toThrow(HotkeyError);
    expect(() => resolveHotkeys([entry('A', 'q'), entry('B', 'q')])).toThrow(/row 2/);
    expect(() => resolveHotkeys([entry('A', 'Enter')])).toThrow(HotkeyError);
    expect(() => resolveHotkeys([entry('A', '!')])).toThrow(HotkeyError);
  });

  it('ignores problems in other fields (tagging still works with odd colours)', () => {
    expect(() => resolveHotkeys([entry('A', '', { color: 'not a colour' })])).not.toThrow();
  });
});

describe('hotkeyProblem', () => {
  it('accepts unshifted single keys and explains everything else', () => {
    for (const k of ['a', 'z', '0', ';', ',', '/', '`', '\\', "'"]) expect(hotkeyProblem(k)).toBeNull();
    expect(hotkeyProblem('Q')).toMatch(/lowercase/);
    for (const k of ['', ' ', '!', 'Enter', 'ArrowLeft', 'qq', 'é']) {
      expect(hotkeyProblem(k)).toMatch(/can't be a hotkey/);
    }
  });

  it('every default key is assignable', () => {
    for (const k of DEFAULT_HOTKEYS) expect(ASSIGNABLE_HOTKEYS.has(k)).toBe(true);
  });
});

describe('validateSpecies', () => {
  it('passes the real buttons.csv fixture', () => {
    expect(validateSpecies(parseSpeciesCsv(realButtonsCsv))).toEqual([]);
  });

  it('reports each problem with its row and field', () => {
    const issues = validateSpecies([
      entry('A', 'q'),
      entry('', ''),
      entry('A', 'q'),
      entry(' B', '', { species: '  ' }),
      entry('C', '', { color: 'rgb(1,2,3)', colorSelected: '#12' }),
    ]);
    expect(issues.map((i) => [i.row, i.field])).toEqual([
      [1, 'code'],
      [2, 'code'],
      [2, 'hotkey'],
      [3, 'code'],
      [3, 'species'],
      [4, 'color'],
      [4, 'colorSelected'],
    ]);
    expect(issues[1]!.message).toMatch(/already used on row 1/);
  });

  it('accepts blank colours, hex of every length and colour names', () => {
    const colours = ['', '#abc', '#abcd', '#aabbcc', '#aabbccdd', 'green', 'light-blue', 'primary'];
    expect(validateSpecies(colours.map((c, i) => entry(`S${i}`, '', { color: c })))).toEqual([]);
  });

  it('assertValidSpecies throws one error carrying every issue', () => {
    const bad = [entry(''), entry(''), entry(''), entry(''), entry('')];
    try {
      assertValidSpecies(bad);
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(SpeciesValidationError);
      expect((e as SpeciesValidationError).issues).toHaveLength(5);
      expect((e as Error).message).toMatch(/and 2 more/);
    }
  });
});

describe('serializeSpeciesCsv', () => {
  it('writes the header and every column, quoting where needed', () => {
    const text = serializeSpeciesCsv([
      entry('Ulva', ',', { species: 'Ulva sp., "green"', color: '#4caf50' }),
    ]);
    expect(text).toBe(
      'code,species,group1,group2,color,colorSelected,hotkey\n' +
        'Ulva,"Ulva sp., ""green""",,,#4caf50,,","\n'
    );
  });

  it('round-trips the real fixture', () => {
    const entries = parseSpeciesCsv(realButtonsCsv);
    expect(parseSpeciesCsv(serializeSpeciesCsv(entries))).toEqual(entries);
  });

  it('round-trips arbitrary lists (property)', () => {
    const text = fc.string({ unit: 'binary', maxLength: 12 });
    const arbEntry = fc.record({
      code: text,
      species: text.filter((s) => s !== ''),
      group1: text,
      group2: text,
      color: text,
      colorSelected: text,
      hotkey: fc.constantFrom('', ...ASSIGNABLE_HOTKEYS),
    });
    fc.assert(
      fc.property(fc.array(arbEntry, { maxLength: 8 }), (entries) => {
        expect(parseSpeciesCsv(serializeSpeciesCsv(entries))).toEqual(entries);
      })
    );
  });
});
