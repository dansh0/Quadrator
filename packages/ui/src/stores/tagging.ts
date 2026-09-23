/**
 * Tagging cursor + code toggling for the current quadrat. Pure UI state —
 * the cursor is not part of the session file (v1 dropped the legacy
 * per-quadrat sampleNumber, which was inconsistent for rows ≠ cols).
 * Sample codes are written directly into the session store's quadrat.
 */
import { PlatformAdapter, SampleV2 } from '@quadrator/core';
import { defineStore } from 'pinia';
import { RecentreMotion } from '../canvas.ts';
import { parseUiSettings } from '../settings.ts';
import { useSessionStore } from './session.ts';

export type WorkflowTab = 'prep' | 'species' | 'qa';

/**
 * How the cursor last moved. The canvas recentres the view on the current
 * sample when the user navigates to it, but must NOT when they clicked it on
 * the canvas — the point is already under their pointer, and moving the view
 * out from under a click is disorienting.
 */
export type CursorSource = 'navigation' | 'canvas';

export const useTaggingStore = defineStore('tagging', {
  state: () => ({
    /** 0-based index into the current quadrat's samples. */
    cursor: 0,
    /** What moved the cursor last (see CursorSource). */
    cursorSource: 'navigation' as CursorSource,
    /**
     * Active right-panel tab. Lives here (not in RightPanel) because the
     * canvas jumps to Species ID when a sample point is clicked (legacy
     * SET_ACTIVE_TAB behavior).
     */
    activeTab: 'prep' as WorkflowTab,
    /**
     * How the view follows the cursor while zoomed in. No control exposes
     * this at present (see settings.ts); a persisted value still applies.
     */
    recentreMotion: 'instant' as RecentreMotion,
  }),

  getters: {
    samples(): SampleV2[] {
      return useSessionStore().currentQuadrat?.samples ?? [];
    },
    sampleCount(): number {
      return this.samples.length;
    },
    currentSample(): SampleV2 | null {
      return this.samples[this.cursor] ?? null;
    },
    /** Codes tagged at the cursor's sample. */
    selectedCodes(): readonly string[] {
      return this.currentSample?.codes ?? [];
    },
    atFirst(): boolean {
      return this.cursor === 0;
    },
    atLast(): boolean {
      return this.sampleCount === 0 || this.cursor === this.sampleCount - 1;
    },
  },

  actions: {
    /** Restore the persisted view-motion preference at startup. */
    async init(platform: PlatformAdapter): Promise<void> {
      this.recentreMotion = parseUiSettings(await platform.loadSettings()).recentreMotion;
    },

    async setRecentreMotion(platform: PlatformAdapter, motion: RecentreMotion): Promise<void> {
      this.recentreMotion = motion;
      // Read-modify-write: another store owns the rest of this document.
      const current = parseUiSettings(await platform.loadSettings());
      await platform.saveSettings({ ...current, recentreMotion: motion });
    },

    /** Clamp into the current quadrat's range (also used on quadrat switch). */
    setCursor(index: number): void {
      const max = Math.max(0, this.sampleCount - 1);
      this.cursor = Math.min(Math.max(0, index), max);
      this.cursorSource = 'navigation';
    },

    /** Canvas click on a sample point: move the cursor there, open Species ID. */
    selectSampleOnCanvas(index: number): void {
      this.setCursor(index);
      this.cursorSource = 'canvas';
      this.activeTab = 'species';
    },

    nextSample(): void {
      if (this.atLast) return;
      this.cursor += 1;
      this.cursorSource = 'navigation';
    },

    prevSample(): void {
      if (this.atFirst) return;
      this.cursor -= 1;
      this.cursorSource = 'navigation';
    },

    /** Toggle a species code on the current sample. No-op without a sample. */
    toggleCode(code: string): void {
      const sample = this.currentSample;
      if (sample === null) return;
      const i = sample.codes.indexOf(code);
      if (i === -1) {
        sample.codes.push(code);
      } else {
        sample.codes.splice(i, 1);
      }
      useSessionStore().dirty = true;
    },
  },
});
