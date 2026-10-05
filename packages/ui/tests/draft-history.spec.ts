import { describe, expect, it } from 'vitest';
import { DraftHistory, historyShortcut } from '../src/draft-history.ts';

const make = (limit?: number) => new DraftHistory<string>((a, b) => a === b, limit);

/** Apply an edit the way the editor does: record the old state, move on. */
function editTo(h: DraftHistory<string>, state: { v: string }, next: string, group?: string) {
  h.record(state.v, group ?? null);
  state.v = next;
}

describe('DraftHistory', () => {
  it('undoes and redoes steps in order', () => {
    const h = make();
    const s = { v: 'a' };
    editTo(h, s, 'b');
    editTo(h, s, 'c');
    expect(h.undo(s.v)).toBe('b');
    expect(h.undo('b')).toBe('a');
    expect(h.undo('a')).toBeNull();
    expect(h.canUndo).toBe(false);
    expect(h.redo('a')).toBe('b');
    expect(h.redo('b')).toBe('c');
    expect(h.redo('c')).toBeNull();
  });

  it('groups consecutive edits in one cell into a single step', () => {
    const h = make();
    const s = { v: '' };
    for (const v of ['U', 'Ul', 'Ulv', 'Ulva']) editTo(h, s, v, 'cell-1');
    editTo(h, s, 'Ulva!', 'cell-2');
    expect(h.undo(s.v)).toBe('Ulva');
    expect(h.undo('Ulva')).toBe('');
  });

  it('seal() closes a typing group, so the same cell starts a new step', () => {
    const h = make();
    const s = { v: '' };
    editTo(h, s, 'a', 'cell');
    h.seal();
    editTo(h, s, 'ab', 'cell');
    expect(h.undo(s.v)).toBe('a');
  });

  it('a new edit after undo discards the redo branch', () => {
    const h = make();
    const s = { v: 'a' };
    editTo(h, s, 'b');
    s.v = h.undo(s.v)!;
    editTo(h, s, 'x');
    expect(h.canRedo).toBe(false);
    expect(h.undo(s.v)).toBe('a');
  });

  it('undo closes the typing group (typing again is a fresh step)', () => {
    const h = make();
    const s = { v: '' };
    editTo(h, s, 'a', 'cell');
    editTo(h, s, 'ab', 'cell');
    s.v = h.undo(s.v)!; // back to ''
    editTo(h, s, 'z', 'cell');
    expect(h.undo(s.v)).toBe('');
  });

  it('skips steps that changed nothing (typed, then restored)', () => {
    const h = make();
    const s = { v: 'a' };
    editTo(h, s, 'b');
    editTo(h, s, 'bx', 'cell');
    editTo(h, s, 'b', 'cell'); // Esc restore folds into the same step
    expect(h.undo(s.v)).toBe('a');
  });

  it('keeps at most `limit` steps, dropping the oldest', () => {
    const h = make(3);
    const s = { v: '0' };
    for (const v of ['1', '2', '3', '4']) editTo(h, s, v);
    expect(h.undo('4')).toBe('3');
    expect(h.undo('3')).toBe('2');
    expect(h.undo('2')).toBe('1');
    expect(h.undo('1')).toBeNull();
  });

  it('clear() forgets everything', () => {
    const h = make();
    h.record('a');
    h.clear();
    expect(h.canUndo).toBe(false);
    expect(h.canRedo).toBe(false);
  });
});

describe('historyShortcut', () => {
  const k = (key: string, mods: Partial<KeyboardEvent> = {}) =>
    historyShortcut({ key, ctrlKey: false, metaKey: false, shiftKey: false, altKey: false, ...mods });

  it('maps Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z and Ctrl+Y', () => {
    expect(k('z', { ctrlKey: true })).toBe('undo');
    expect(k('z', { metaKey: true })).toBe('undo');
    expect(k('Z', { ctrlKey: true, shiftKey: true })).toBe('redo');
    expect(k('Z', { metaKey: true, shiftKey: true })).toBe('redo');
    expect(k('y', { ctrlKey: true })).toBe('redo');
  });

  it('ignores everything else', () => {
    expect(k('z')).toBeNull();
    expect(k('y', { ctrlKey: true, shiftKey: true })).toBeNull();
    expect(k('z', { ctrlKey: true, altKey: true })).toBeNull();
    expect(k('c', { ctrlKey: true })).toBeNull();
  });
});
