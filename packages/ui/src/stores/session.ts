/**
 * Session store: owns the loaded SessionV1 and its file binding. All disk
 * traffic goes through the PlatformAdapter passed into the actions; the
 * store itself stays platform-free and fully unit-testable with
 * InMemoryPlatformAdapter.
 */
import {
  FileRef,
  PlatformAdapter,
  QuadratV1,
  SampleV1,
  SessionV1,
  Vec2,
  mulberry32,
  parseSession,
  randomSeed,
  samplePolygon,
  sampleRect,
  serializeSession,
} from '@quadrator/core';
import { defineStore } from 'pinia';

/** Display name for a new quadrat: file name without its extension. */
function imageBaseName(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(0, dot) : name;
}

export interface SessionState {
  session: SessionV1 | null;
  /** File the session was loaded from / last saved to; null = never saved. */
  fileRef: FileRef | null;
  /** Unsaved changes since the last open/save. */
  dirty: boolean;
}

export function emptySession(now: Date = new Date()): SessionV1 {
  return {
    schemaVersion: 1,
    savedAt: now.toISOString(),
    settings: { numOfSampleRows: 5, numOfSampleCols: 5, restrictToQuad: false },
    quadrats: [],
    currentQuadratId: null,
  };
}

export const useSessionStore = defineStore('session', {
  state: (): SessionState => ({
    session: null,
    fileRef: null,
    dirty: false,
  }),

  getters: {
    hasSession: (s) => s.session !== null,
    quadratCount: (s) => s.session?.quadrats.length ?? 0,
    currentQuadrat: (s) =>
      s.session?.quadrats.find((q) => q.id === s.session?.currentQuadratId) ?? null,
    currentIndex(): number {
      if (this.session === null || this.currentQuadrat === null) return -1;
      return this.session.quadrats.indexOf(this.currentQuadrat);
    },
    hasPrevQuadrat(): boolean {
      return this.currentIndex > 0;
    },
    hasNextQuadrat(): boolean {
      return this.currentIndex >= 0 && this.currentIndex < this.quadratCount - 1;
    },
  },

  actions: {
    newSession(now: Date = new Date()) {
      this.session = emptySession(now);
      this.fileRef = null;
      this.dirty = false;
    },

    /**
     * Open a session via the platform's file dialog. Returns true when a
     * session was loaded, false when the user cancelled. Parse failures
     * (SyntaxError / ZodError) propagate to the caller — the current
     * session is never replaced by a half-loaded one.
     */
    async open(platform: PlatformAdapter): Promise<boolean> {
      const file = await platform.openSession();
      if (file === null) return false;
      const session = parseSession(file.text); // throws before any state change
      this.session = session;
      this.fileRef = file.ref;
      this.dirty = false;
      return true;
    },

    /** Save to the current file, or fall back to save-as. False = cancelled. */
    async save(platform: PlatformAdapter, now: Date = new Date()): Promise<boolean> {
      if (this.session === null) return false;
      if (this.fileRef === null || !platform.capabilities.canOverwrite) {
        return this.saveAs(platform, now);
      }
      this.session.savedAt = now.toISOString();
      await platform.saveSession(this.fileRef, serializeSession(this.session));
      this.dirty = false;
      return true;
    },

    /**
     * Ask the user for images and append one quadrat per pick (duplicate
     * paths deliberately get separate quadrats — legacy collided them,
     * audit B3). Creates a session first when none exists. Returns the new
     * quadrats (empty = cancelled).
     */
    async addImages(platform: PlatformAdapter, now: Date = new Date()): Promise<QuadratV1[]> {
      const refs = await platform.pickImages();
      if (refs.length === 0) return [];
      if (this.session === null) this.newSession(now);
      const session = this.session!;

      const used = new Set(session.quadrats.map((q) => q.id));
      let n = session.quadrats.length + 1;
      const added: QuadratV1[] = refs.map((ref) => {
        while (used.has(`q${n}`)) n++;
        used.add(`q${n}`);
        return {
          id: `q${n}`,
          imagePath: ref.id,
          name: imageBaseName(ref.name),
          boundary: [],
          geoDefined: false,
          rngSeed: null,
          samples: [],
        };
      });

      session.quadrats.push(...added);
      session.currentQuadratId = added[0]!.id;
      this.dirty = true;
      return added;
    },

    selectQuadrat(id: string): void {
      if (this.session?.quadrats.some((q) => q.id === id)) {
        this.session.currentQuadratId = id;
      }
    },

    /** Move to the adjacent quadrat in display order. False = at the edge. */
    stepQuadrat(delta: 1 | -1): boolean {
      const i = this.currentIndex;
      if (i === -1) return false;
      const target = this.session!.quadrats[i + delta];
      if (target === undefined) return false;
      this.session!.currentQuadratId = target.id;
      return true;
    },

    /**
     * Commit a drawn boundary (OPEN ring, image-normalized 0–1 coords — the
     * legacy coordinate convention) on the current quadrat and generate its
     * sample points with a fresh stored seed, so the layout is reproducible.
     * Quad-restricted settings or a 4-vertex ring use stratified rect
     * sampling; anything else uses equal-area polygon sampling. Geometry
     * errors (e.g. a self-intersecting ring) propagate to the caller and
     * leave the quadrat untouched.
     */
    defineBoundary(ring: Vec2[], seed: number = randomSeed()): void {
      const quadrat = this.currentQuadrat;
      const settings = this.session?.settings;
      if (quadrat === null || settings === undefined) return;

      const n = settings.numOfSampleRows * settings.numOfSampleCols;
      const rng = mulberry32(seed);
      const points =
        settings.restrictToQuad || ring.length === 4
          ? sampleRect(ring, settings.numOfSampleRows, settings.numOfSampleCols, rng)
          : samplePolygon(ring, n, rng).points;

      const samples: SampleV1[] = points.map((p, index) => ({
        index,
        x: p.x,
        y: p.y,
        codes: [],
      }));

      quadrat.boundary = ring.map((p) => ({ x: p.x, y: p.y }));
      quadrat.geoDefined = true;
      quadrat.rngSeed = seed;
      quadrat.samples = samples;
      this.dirty = true;
    },

    /** Clear the current quadrat's boundary and samples (legacy Reset Nodes). */
    resetBoundary(): void {
      const quadrat = this.currentQuadrat;
      if (quadrat === null) return;
      quadrat.boundary = [];
      quadrat.geoDefined = false;
      quadrat.rngSeed = null;
      quadrat.samples = [];
      this.dirty = true;
    },

    renameCurrentQuadrat(name: string): void {
      if (this.currentQuadrat !== null) {
        this.currentQuadrat.name = name;
        this.dirty = true;
      }
    },

    /** Save under a new name chosen by the user. False = cancelled. */
    async saveAs(platform: PlatformAdapter, now: Date = new Date()): Promise<boolean> {
      if (this.session === null) return false;
      this.session.savedAt = now.toISOString();
      const suggested = this.fileRef?.name ?? 'session.json';
      const ref = await platform.saveSessionAs(serializeSession(this.session), suggested);
      if (ref === null) return false;
      this.fileRef = ref;
      this.dirty = false;
      return true;
    },
  },
});
