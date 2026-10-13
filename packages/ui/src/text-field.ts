/** Shared keyboard-target checks for window-level shortcuts. */

const NON_TEXT_INPUTS = new Set(['checkbox', 'radio', 'button', 'submit', 'reset', 'range', 'color', 'file', 'image']);

/**
 * Somewhere the user types, so shortcuts must keep out. A switch's or
 * checkbox's hidden input is not: focus stays on it after a click.
 */
export function isTextField(t: EventTarget | null): boolean {
  if (!(t instanceof HTMLElement)) return false;
  if (t.isContentEditable || t.tagName === 'TEXTAREA') return true;
  return t instanceof HTMLInputElement && !NON_TEXT_INPUTS.has(t.type);
}
