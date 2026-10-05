import type { SpeciesEntry } from '@quadrator/core';
import { describe, expect, it } from 'vitest';
import { classifyCaptureKey } from '../src/hotkey-capture.ts';
import {
  GRID_COLUMNS,
  applyPaste,
  autoSelectedColor,
  blankRow,
  columnOptions,
  diffCodes,
  filterOptions,
  fromDraft,
  isMultiCellPaste,
  mergeByCode,
  moveCell,
  moveRow,
  parseClipboardGrid,
  toDraft,
  validateDraft,
} from '../src/species-grid.ts';

function entry(code: string, extra: Partial<SpeciesEntry> = {}): SpeciesEntry {
  return {
    code,
    species: `${code} sp.`,
    group1: '',
    group2: '',
    color: '',
    colorSelected: '',
    hotkey: '',
    ...extra,
  };
}

const key = (k: string, mods: Partial<KeyboardEvent> = {}) =>
  classifyCaptureKey({ key: k, ctrlKey: false, altKey: false, metaKey: false, shiftKey: false, ...mods });

describe('classifyCaptureKey', () => {
  it('binds single unshifted keys, lowercasing Caps Lock capitals', () => {
    expect(key('q')).toEqual({ kind: 'bind', key: 'q' });
    expect(key(';')).toEqual({ kind: 'bind', key: ';' });
    expect(key('Q')).toEqual({ kind: 'bind', key: 'q' }); // Caps Lock, no Shift
  });

  it('Delete/Backspace clear, Escape cancels, Tab and lone modifiers pass through', () => {
    expect(key('Delete')).toEqual({ kind: 'clear' });
    expect(key('Backspace')).toEqual({ kind: 'clear' });
    expect(key('Escape')).toEqual({ kind: 'cancel' });
    for (const k of ['Tab', 'Shift', 'Control', 'CapsLock']) expect(key(k)).toEqual({ kind: 'ignore' });
  });

  it('refuses navigation keys, modifier combinations and unassignable keys with a reason', () => {
    for (const k of ['Enter', 'ArrowLeft', ' ']) expect(key(k)).toMatchObject({ kind: 'invalid' });
    expect(key('Q', { shiftKey: true })).toMatchObject({ kind: 'invalid', message: /Shift/ });
    expect(key('!', { shiftKey: true })).toMatchObject({ kind: 'invalid', message: /Shift/ });
    expect(key('s', { ctrlKey: true })).toMatchObject({ kind: 'invalid', message: /Ctrl/ });
    expect(key('é')).toMatchObject({ kind: 'invalid', message: /can't be a hotkey/ });
    expect(key('F2')).toMatchObject({ kind: 'invalid' });
  });
});

describe('draft rows', () => {
  it('toDraft remembers each saved code; fromDraft drops blank rows and ids', () => {
    const rows = toDraft([entry('A'), entry('B')]);
    expect(rows.map((r) => r.originalCode)).toEqual(['A', 'B']);
    expect(new Set(rows.map((r) => r.id)).size).toBe(2);
    expect(toDraft([entry('A')], false)[0]!.originalCode).toBeNull();

    const saved = fromDraft([...rows, blankRow()]);
    expect(saved).toEqual([entry('A'), entry('B')]);
  });

  it('fills a blank selected colour with a darker shade of the colour', () => {
    expect(autoSelectedColor('#ffffff')).toBe('#cccccc');
    expect(autoSelectedColor('#fff')).toBe('#cccccc');
    expect(autoSelectedColor('green')).toBe('');
    const [row] = fromDraft(toDraft([entry('A', { color: '#4caf50' })]));
    expect(row!.colorSelected).toBe(autoSelectedColor('#4caf50'));
    const [kept] = fromDraft(toDraft([entry('A', { color: '#4caf50', colorSelected: '#000' })]));
    expect(kept!.colorSelected).toBe('#000');
  });

  it('validateDraft keys errors by row id and ignores blank rows', () => {
    const rows = [...toDraft([entry('A', { hotkey: 'q' }), entry('A', { hotkey: 'q' })]), blankRow()];
    const errors = validateDraft(rows);
    expect(errors.get(`${rows[1]!.id}:code`)).toMatch(/already used on row 1/);
    expect(errors.get(`${rows[1]!.id}:hotkey`)).toMatch(/already used/);
    expect([...errors.keys()].some((k) => k.startsWith(`${rows[2]!.id}:`))).toBe(false);
  });
});

describe('cell movement', () => {
  it('moves one cell and stops at the edges', () => {
    const last = GRID_COLUMNS.length - 1;
    expect(moveCell({ row: 1, col: 1 }, 'up', 3)).toEqual({ row: 0, col: 1 });
    expect(moveCell({ row: 1, col: 1 }, 'right', 3)).toEqual({ row: 1, col: 2 });
    expect(moveCell({ row: 0, col: 0 }, 'up', 3)).toBeNull();
    expect(moveCell({ row: 0, col: 0 }, 'left', 3)).toBeNull();
    expect(moveCell({ row: 2, col: 0 }, 'down', 3)).toBeNull();
    expect(moveCell({ row: 0, col: last }, 'right', 3)).toBeNull();
  });

  it('moveRow reorders and ignores out-of-range moves', () => {
    expect(moveRow(['a', 'b', 'c'], 0, 2)).toEqual(['b', 'c', 'a']);
    expect(moveRow(['a', 'b', 'c'], 2, 0)).toEqual(['c', 'a', 'b']);
    expect(moveRow(['a', 'b'], 0, 5)).toEqual(['a', 'b']);
  });
});

describe('clipboard paste', () => {
  it('parses spreadsheet TSV, including quoted cells and CRLF', () => {
    expect(parseClipboardGrid('a\tb\r\nc\td\r\n')).toEqual([
      ['a', 'b'],
      ['c', 'd'],
    ]);
    expect(parseClipboardGrid('"multi\nline"\t"say ""hi"""\n')).toEqual([['multi\nline', 'say "hi"']]);
    expect(parseClipboardGrid('a\t\tc')).toEqual([['a', '', 'c']]);
  });

  it('tells a multi-cell paste from text for one cell', () => {
    expect(isMultiCellPaste('Ulva sp.')).toBe(false);
    expect(isMultiCellPaste('Ulva sp.\n')).toBe(false); // one cell copied with its line break
    expect(isMultiCellPaste('a\tb')).toBe(true);
    expect(isMultiCellPaste('a\nb')).toBe(true);
  });

  it('fills cells from the paste point, adding rows and dropping overflow columns', () => {
    const rows = toDraft([entry('A')]);
    const out = applyPaste(rows, { row: 0, col: 5 }, [
      ['#111', ' Q ', 'overflow'],
      ['#222', 'w'],
    ]);
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({ code: 'A', colorSelected: '#111', hotkey: 'q' });
    expect(out[1]).toMatchObject({ code: '', colorSelected: '#222', hotkey: 'w' });
    expect(rows[0]!.colorSelected).toBe(''); // input untouched
  });

  it('skips a header row pasted into the first column', () => {
    const out = applyPaste([blankRow()], { row: 0, col: 0 }, [
      ['code', 'species'],
      ['Ulva', 'Ulva sp.'],
    ]);
    expect(out.map((r) => [r.code, r.species])).toEqual([['Ulva', 'Ulva sp.']]);
  });
});

describe('import + save diff', () => {
  it('mergeByCode updates matching codes in place and appends new ones', () => {
    const rows = toDraft([entry('A'), entry('B')]);
    const out = mergeByCode(rows, [entry('B', { species: 'new' }), entry('C')]);
    expect(out.map((r) => [r.code, r.species, r.originalCode])).toEqual([
      ['A', 'A sp.', 'A'],
      ['B', 'new', 'B'],
      ['C', 'C sp.', null],
    ]);
  });

  it('diffCodes finds renames and deletions, and nothing for untouched lists', () => {
    const saved = [entry('A'), entry('B'), entry('C')];
    expect(diffCodes(saved, toDraft(saved))).toEqual({ renames: new Map(), deleted: [] });

    const rows = toDraft(saved);
    rows[0]!.code = 'A2'; // rename
    rows.splice(1, 1); // delete B
    expect(diffCodes(saved, rows)).toEqual({ renames: new Map([['A', 'A2']]), deleted: ['B'] });
  });

  it('a replaced list keeps codes that are still present (not deleted)', () => {
    const saved = [entry('A'), entry('B')];
    const rows = toDraft([entry('B'), entry('Z')], false);
    expect(diffCodes(saved, rows)).toEqual({ renames: new Map(), deleted: ['A'] });
  });
});

describe('columnOptions', () => {
  it('lists each distinct group once, sorted, ignoring blanks and edge spaces', () => {
    const rows = toDraft([
      entry('A', { group1: 'Animal', group2: 'Sessile' }),
      entry('B', { group1: 'Algae ', group2: '' }),
      entry('C', { group1: 'Animal', group2: 'Mobile' }),
      entry('D', { group1: '  ' }),
    ]);
    expect(columnOptions(rows, 'group1')).toEqual(['Algae', 'Animal']);
    expect(columnOptions(rows, 'group2')).toEqual(['Mobile', 'Sessile']);
  });

  it('lists colours lowercased, deduplicated, in the order they first appear', () => {
    const rows = toDraft([
      entry('A', { color: '#9C27B0' }),
      entry('B', { color: '#00bcd4' }),
      entry('C', { color: '#9c27b0 ' }),
      entry('D', { color: '' }),
      entry('E', { color: '#795548' }),
    ]);
    expect(columnOptions(rows, 'color')).toEqual(['#9c27b0', '#00bcd4', '#795548']);
  });
});

describe('filterOptions', () => {
  it('shows everything when opened by click, else options containing the text', () => {
    const all = ['Algae', 'Animal', 'Mollusc'];
    expect(filterOptions(all, null)).toEqual(all);
    expect(filterOptions(all, '  ')).toEqual(all);
    expect(filterOptions(all, 'AL')).toEqual(['Algae', 'Animal']);
    expect(filterOptions(all, 'llu')).toEqual(['Mollusc']);
    expect(filterOptions(all, 'x')).toEqual([]);
  });
});

