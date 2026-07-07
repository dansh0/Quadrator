/**
 * Tagging cursor + code toggling for the current quadrat. Pure UI state —
 * the cursor is not part of the session file (v1 dropped the legacy
 * per-quadrat sampleNumber, which was inconsistent for rows ≠ cols).
 * Sample codes are written directly into the session store's quadrat.
 */
import { SampleV1 } from '@quadrator/core';
import { defineStore } from 'pinia';
import { useSessionStore } from './session.ts';

export type WorkflowTab = 'prep' | 'species' | 'qa';

export const useTaggingStore = defineStore('tagging', {
  state: () => ({
    /** 0-based index into the current quadrat's samples. */
    cursor: 0,
    /**
     * Active right-panel tab. Lives here (not in RightPanel) because the
     * canvas jumps to Species ID when a sample point is clicked (legacy
     * SET_ACTIVE_TAB behavior).
     */
    activeTab: 'prep' as WorkflowTab,
  }),

  getters: {
    samples(): SampleV1[] {
      return useSessionStore().currentQuadrat?.samples ?? [];
    },
    sampleCount(): number {
      return this.samples.length;
    },
    currentSample(): SampleV1 | null {
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
    /** Clamp into the current quadrat's range (also used on quadrat switch). */
    setCursor(index: number): void {
      const max = Math.max(0, this.sampleCount - 1);
      this.cursor = Math.min(Math.max(0, index), max);
    },

    /** Canvas click on a sample point: move the cursor there, open Species ID. */
    selectSampleOnCanvas(index: number): void {
      this.setCursor(index);
      this.activeTab = 'species';
    },

    nextSample(): void {
      if (!this.atLast) this.cursor += 1;
    },

    prevSample(): void {
      if (!this.atFirst) this.cursor -= 1;
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
