/**
 * Features held back on some platforms. Each gate is a single function so
 * restoring a feature is a one-line change here; DESIGN.md §3 "Held back on
 * the web" lists what each gate hides and what has to land before it returns.
 */
import type { PlatformAdapter } from '@quadrator/core';

/**
 * Session files: Save Session, Load Session, Load from File, Continue Last
 * Session, Ctrl+S, and the crash-recovery autosave that feeds Continue.
 *
 * Offered only where image references survive a reload. On the web every
 * image id dies with the tab, so a restored session comes back with each
 * image needing a manual relink — workable, but not a flow to hand people
 * until images persist (Phase 4 cloud storage, or stored file handles).
 * The machinery stays wired and tested; only the entry points are hidden.
 */
export function sessionFilesEnabled(platform: PlatformAdapter): boolean {
  return platform.capabilities.persistentFileIds;
}
