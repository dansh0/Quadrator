/**
 * Throttle for the crash-recovery autosave: the first notify() writes
 * immediately (a crash right after an edit still finds a snapshot), further
 * notifies during the cooldown coalesce into one trailing write. The legacy
 * app dropped trailing changes (lodash throttle, trailing: false), which
 * could lose up to 5s of tagging on a crash — the trailing write is a
 * deliberate data-safety improvement.
 */
export interface Autosaver {
  /** Signal that state changed and a snapshot should be written (throttled). */
  notify(): void;
  /** Cancel any pending trailing write (component teardown). */
  stop(): void;
}

export const AUTOSAVE_INTERVAL_MS = 5000;

export function createAutosaver(
  write: () => void,
  intervalMs: number = AUTOSAVE_INTERVAL_MS
): Autosaver {
  let cooldown: ReturnType<typeof setTimeout> | null = null;
  let pending = false;

  function fire(): void {
    pending = false;
    cooldown = setTimeout(() => {
      cooldown = null;
      if (pending) fire();
    }, intervalMs);
    write();
  }

  return {
    notify(): void {
      if (cooldown === null) fire();
      else pending = true;
    },
    stop(): void {
      if (cooldown !== null) clearTimeout(cooldown);
      cooldown = null;
      pending = false;
    },
  };
}
