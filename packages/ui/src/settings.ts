/**
 * UI settings document persisted through PlatformAdapter.loadSettings /
 * saveSettings. Validated with zod at the boundary (STYLE_GUIDE §1); an
 * unreadable document degrades to defaults rather than crashing startup.
 */
import { z } from 'zod';

export const uiSettingsSchema = z
  .object({
    hotkeysEnabled: z.boolean().default(true),
    /** Last-loaded species CSV, stored by content so it survives moved files and works on web. */
    speciesCsvText: z.string().nullable().default(null),
    /**
     * Crash-recovery snapshot: the serialized session as of the last
     * autosave, offered as "Continue Last Session" on the home screen
     * (legacy stored this in localStorage).
     */
    lastSessionText: z.string().nullable().default(null),
  })
  .passthrough(); // forward-compatible: keep keys written by newer versions

export type UiSettings = z.infer<typeof uiSettingsSchema>;

export const DEFAULT_SETTINGS: UiSettings = {
  hotkeysEnabled: true,
  speciesCsvText: null,
  lastSessionText: null,
};

export function parseUiSettings(value: unknown): UiSettings {
  if (value === null || value === undefined) return { ...DEFAULT_SETTINGS };
  const r = uiSettingsSchema.safeParse(value);
  return r.success ? r.data : { ...DEFAULT_SETTINGS };
}
