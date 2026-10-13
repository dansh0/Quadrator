import type { FileRef } from '@quadrator/core';

/** The confirmation shown after a session save (menu button and Ctrl+S). */
export function savedNotice(ref: FileRef | null): string {
  return ref === null ? 'Session saved.' : `Session saved to ${ref.name}.`;
}
