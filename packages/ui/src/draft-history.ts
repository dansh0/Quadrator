/**
 * Undo/redo for an edited draft (the species editor). Snapshots, not diffs:
 * a species list is small, and whole states make undo trivially correct.
 * Pure — no Vue — so the rules are tested directly.
 *
 * Typing is grouped: consecutive edits that share a `group` (one cell) are a
 * single step, so undo takes back a word, not a letter. Anything else —
 * paste, insert, delete, import, a hotkey — is a step of its own.
 */

/** Steps kept; older ones fall off the bottom. */
export const HISTORY_LIMIT = 200;

export class DraftHistory<T> {
  private past: T[] = [];
  private future: T[] = [];
  private openGroup: string | null = null;

  constructor(
    /** Two states the user could not tell apart: undoing between them is a no-op step. */
    private readonly same: (a: T, b: T) => boolean,
    private readonly limit = HISTORY_LIMIT
  ) {}

  get canUndo(): boolean {
    return this.past.length > 0;
  }

  get canRedo(): boolean {
    return this.future.length > 0;
  }

  /**
   * Note that the state is about to change from `before`. With the same
   * `group` as the previous edit, the change joins that step instead.
   */
  record(before: T, group: string | null = null): void {
    this.future = [];
    if (group !== null && group === this.openGroup) return;
    this.openGroup = group;
    this.past.push(before);
    if (this.past.length > this.limit) this.past.shift();
  }

  /** Close the current typing group (focus moved on). */
  seal(): void {
    this.openGroup = null;
  }

  /** The state to go back to from `current`, or null when there is none. */
  undo(current: T): T | null {
    this.openGroup = null;
    // A step that changed nothing (typed, then Esc-restored) is skipped.
    while (this.past.length > 0 && this.same(this.past.at(-1)!, current)) this.past.pop();
    const previous = this.past.pop();
    if (previous === undefined) return null;
    this.future.push(current);
    return previous;
  }

  /** The state to go forward to from `current`, or null when there is none. */
  redo(current: T): T | null {
    this.openGroup = null;
    const next = this.future.pop();
    if (next === undefined) return null;
    this.past.push(current);
    return next;
  }

  clear(): void {
    this.past = [];
    this.future = [];
    this.openGroup = null;
  }
}

/** Ctrl/Cmd+Z undoes; Ctrl/Cmd+Shift+Z and Ctrl+Y redo. */
export function historyShortcut(
  e: Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'metaKey' | 'shiftKey' | 'altKey'>
): 'undo' | 'redo' | null {
  if (!(e.ctrlKey || e.metaKey) || e.altKey) return null;
  const key = e.key.toLowerCase();
  if (key === 'z') return e.shiftKey ? 'redo' : 'undo';
  if (key === 'y' && !e.shiftKey) return 'redo';
  return null;
}
