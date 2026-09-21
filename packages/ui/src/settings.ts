/**
 * UI settings document persisted through PlatformAdapter.loadSettings /
 * saveSettings. Validated with zod at the boundary (STYLE_GUIDE §1); an
 * unreadable document degrades to defaults rather than crashing startup.
 */
import { z } from 'zod';
import { RECENTRE_MOTIONS } from './canvas.ts';

export const uiSettingsSchema = z
  .object({
    hotkeysEnabled: z.boolean().default(true),
    /**
     * How the view follows the tagging cursor. Defaults to `instant`: a cut
     * carries no optic flow at all, which is the safest thing to hand
     * someone who has not chosen. No UI currently exposes this — the field
     * and the machinery behind it are kept so a control can be restored
     * without a schema change, and a value already persisted still applies.
     */
    recentreMotion: z.enum(RECENTRE_MOTIONS).default('instant'),
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
  recentreMotion: 'instant',
  speciesCsvText: null,
  lastSessionText: null,
};

export function parseUiSettings(value: unknown): UiSettings {
  if (value === null || value === undefined) return { ...DEFAULT_SETTINGS };
  const r = uiSettingsSchema.safeParse(value);
  return r.success ? r.data : { ...DEFAULT_SETTINGS };
}
