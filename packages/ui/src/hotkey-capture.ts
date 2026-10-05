/**
 * What a keypress means while a hotkey is being captured — shared by the
 * Species tab's "Edit hotkeys" mode and the species editor's Hotkey column.
 * Pure: it reads the fields of a KeyboardEvent and nothing else.
 */
import { hotkeyProblem } from '@quadrator/core';

export type CaptureResult =
  | { kind: 'bind'; key: string }
  | { kind: 'clear' }
  | { kind: 'cancel' }
  | { kind: 'invalid'; message: string }
  /** Not an answer: let the event through (Tab moves focus, lone modifiers). */
  | { kind: 'ignore' };

export type CaptureKeyEvent = Pick<
  KeyboardEvent,
  'key' | 'ctrlKey' | 'altKey' | 'metaKey' | 'shiftKey'
>;

const MODIFIERS = new Set(['Shift', 'Control', 'Alt', 'AltGraph', 'Meta', 'CapsLock', 'Fn']);
const NAVIGATION = new Set(['Enter', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', ' ']);

export function classifyCaptureKey(e: CaptureKeyEvent): CaptureResult {
  if (MODIFIERS.has(e.key) || e.key === 'Tab') return { kind: 'ignore' };
  if (e.key === 'Escape') return { kind: 'cancel' };
  if (e.key === 'Delete' || e.key === 'Backspace') return { kind: 'clear' };
  if (NAVIGATION.has(e.key)) {
    return { kind: 'invalid', message: 'That key moves between points — pick another' };
  }
  if (e.ctrlKey || e.altKey || e.metaKey) {
    return { kind: 'invalid', message: 'Hotkeys are single keys, without Ctrl, Alt or Cmd' };
  }
  if (e.shiftKey) {
    // Tagging ignores Shift, so a shifted key could never be pressed.
    return { kind: 'invalid', message: 'Hotkeys are single keys, without Shift' };
  }
  // Caps Lock turns letters into capitals with no Shift held.
  const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  const problem = hotkeyProblem(key);
  return problem === null ? { kind: 'bind', key } : { kind: 'invalid', message: problem };
}
