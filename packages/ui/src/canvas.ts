/**
 * Pure math + small injectables for the image canvas. Kept out of the
 * component so coordinate transforms and drawing rules are unit-testable
 * without a DOM. Coordinate conventions (unchanged from legacy):
 *
 * - session data (boundary nodes, samples) is image-NORMALIZED: 0–1
 *   fractions of image width/height;
 * - the SVG is sized to the image fitted inside the panel ("display px"),
 *   with a translate/scale zoom transform applied to one inner group.
 */
import {
  QuadratV2,
  SampleV2,
  SettingsV2,
  Vec2,
  mulberry32,
  planSamples,
} from '@quadrator/core';
import { InjectionKey } from 'vue';

export interface FittedSize {
  width: number;
  height: number;
}

export interface CanvasTransform {
  k: number;
  x: number;
  y: number;
}

/** Identity zoom/pan. */
export const IDENTITY: CanvasTransform = { k: 1, x: 0, y: 0 };

/** Largest width×height of the given aspect that fits inside the container. */
export function fitContain(
  containerWidth: number,
  containerHeight: number,
  aspect: number
): FittedSize {
  if (containerWidth <= 0 || containerHeight <= 0 || !(aspect > 0)) {
    return { width: 0, height: 0 };
  }
  if (aspect > containerWidth / containerHeight) {
    return { width: containerWidth, height: containerWidth / aspect };
  }
  return { width: containerHeight * aspect, height: containerHeight };
}

/**
 * Convert a pointer position (px relative to the SVG's top-left) to
 * image-normalized coordinates, undoing the zoom/pan transform.
 */
export function toNormalized(
  px: number,
  py: number,
  t: CanvasTransform,
  fitted: FittedSize
): Vec2 {
  return {
    x: (px - t.x) / t.k / fitted.width,
    y: (py - t.y) / t.k / fitted.height,
  };
}

/**
 * Polygon-close tolerance: a click lands "on" the first node when both
 * normalized deltas are under 0.025 (legacy rule — per-axis, not radial).
 */
export const CLOSE_TOLERANCE = 0.025;

export function nearFirstNode(nodes: readonly Vec2[], p: Vec2): boolean {
  const first = nodes[0];
  if (first === undefined) return false;
  return Math.abs(p.x - first.x) < CLOSE_TOLERANCE && Math.abs(p.y - first.y) < CLOSE_TOLERANCE;
}

/**
 * Overlay elements (circles, strokes, crosshair) shrink as the user zooms in
 * so they stay visually similar — legacy's half-compensation curve: fully
 * constant would be 1/k, this deliberately lets elements grow/shrink a bit.
 */
export function overlayScale(k: number): number {
  return 1 / (0.5 + 0.5 * k);
}

/**
 * Overlay palette and sizes.
 *
 * Survey images are busy, low-contrast and often the same hue as the
 * overlay — orange sample points on a terracotta settlement plate is the
 * worst case, and no choice of hue survives every substrate. So legibility
 * comes from VALUE contrast instead: every element carries a dark casing
 * (`CASING`, applied as a zero-offset shadow to the whole overlay group) and
 * the marks themselves pair a light fill with a dark rim. That reads on pale
 * shell, dark algae and rust alike without the overlay shouting.
 *
 * Visual hierarchy, loudest first: sample points (the data) > boundary (the
 * structure) > grid (reference only, so it is white and semi-transparent
 * rather than saturated).
 */
export const OVERLAY = {
  /** Dark halo drawn under everything; the one thing doing the heavy lifting. */
  CASING: 'rgba(0, 0, 0, 0.75)',
  CASING_BLUR: 1.6,

  BOUNDARY: '#ff3b30',
  /** Boundary vertices: boundary-red core, light rim — reads as a handle. */
  NODE_RIM: '#ffffff',
  GRID: '#ffffff',
  GRID_OPACITY: 0.62,

  /** Dark rim shared by every sample point, whatever its state. */
  SAMPLE_RIM: '#10161c',
  SAMPLE_UNTAGGED: '#ffc93c',
  SAMPLE_TAGGED: '#4dabf7',

  CROSSHAIR: '#ffe600',

  BOUNDARY_WIDTH: 2.25,
  GRID_WIDTH: 1.25,
  NODE_RADIUS: 6.5,
  NODE_STROKE_WIDTH: 1.75,
  SAMPLE_RADIUS: 7,
  SAMPLE_STROKE_WIDTH: 2,
  /**
   * How close a click must land to select a sample, in display px at zoom 1.
   * Deliberately far larger than SAMPLE_RADIUS — the dot is a target to aim
   * at, not the thing you must hit. Overlaps are resolved by distance (see
   * selection.ts), so a generous radius costs no accuracy.
   */
  SAMPLE_PICK_RADIUS: 20,
  /** Distance from the sample to each arm's outer tip. */
  CROSSHAIR_LENGTH: 22,
  /**
   * Thickness of the arm's outer half. Well above the hairline width: the
   * step only reads if there is enough difference to see, and a couple of
   * tenths of a pixel disappears into antialiasing.
   */
  CROSSHAIR_WIDTH: 3.5,
  /** Thickness of the inner half — a hairline, so the centre is a point. */
  CROSSHAIR_HAIRLINE_WIDTH: 1,
  /** Where the arm steps up to full width, as a fraction of its length. */
  CROSSHAIR_SHOULDER: 0.5,
  /** How much of the arm the step itself occupies — short, so it reads sharp. */
  CROSSHAIR_SHOULDER_RAMP: 0.08,
} as const;

export interface SampleColor {
  fill: string;
  stroke: string;
}

/**
 * Sample-point palette, keeping the legacy meaning (warm = untagged, cool =
 * tagged) but pairing each fill with a dark rim so it separates from the
 * substrate.
 *
 * The current sample draws no circle at all — an unbroken crosshair renders
 * in its place, so the intersection of the two lines marks the exact point
 * being scored and nothing covers the substrate under it.
 */
export function sampleColor(sample: SampleV2, isCurrent: boolean): SampleColor {
  if (isCurrent) return { fill: 'none', stroke: 'none' };
  if (sample.codes.length > 0) {
    return { fill: OVERLAY.SAMPLE_TAGGED, stroke: OVERLAY.SAMPLE_RIM };
  }
  return { fill: OVERLAY.SAMPLE_UNTAGGED, stroke: OVERLAY.SAMPLE_RIM };
}

/**
 * Resolve an image URL's natural size. Injectable so component tests (no
 * real image loading in happy-dom) can stub it.
 */
export type ImageSizer = (url: string) => Promise<{ width: number; height: number }>;

export const imageSizerKey: InjectionKey<ImageSizer> = Symbol('imageSizer');

export const naturalImageSize: ImageSizer = (url) =>
  new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => reject(new Error('image failed to load'));
    img.src = url;
  });

// ---- drawing constraints ------------------------------------------------------
//
// All of this works in DISPLAY PIXELS, never in normalized coordinates.
// Normalized 0–1 coords are anisotropic — the x and y scales differ whenever
// the image is not square — so an angle or a length measured there does not
// match what the user sees. The fitted display box preserves the image's
// aspect ratio and zoom scales uniformly, so display px is a uniform scaling
// of image px: a 15° angle and an equal-length side mean the same thing in
// both, and a square is square.

/** Ctrl-drag snaps segments to multiples of this many degrees. */
export const ANGLE_SNAP_DEG = 15;

export function toDisplay(p: Vec2, fitted: FittedSize): Vec2 {
  return { x: p.x * fitted.width, y: p.y * fitted.height };
}

export function fromDisplay(p: Vec2, fitted: FittedSize): Vec2 {
  return {
    x: fitted.width === 0 ? 0 : p.x / fitted.width,
    y: fitted.height === 0 ? 0 : p.y / fitted.height,
  };
}

export interface ConstraintOptions {
  /** Snap the segment's angle to ANGLE_SNAP_DEG multiples (Ctrl). */
  snapAngle: boolean;
  /** Force the segment's length to match the previous segment's (Ctrl). */
  equalLength: boolean;
}

/**
 * Apply the active drawing constraints to a cursor position, given the
 * boundary nodes placed so far. All coordinates are image-normalized; the
 * conversion to and from display px happens here.
 *
 * With no nodes yet, or no constraint active, the point is returned
 * unchanged — the first vertex is always free.
 */
export function constrainPoint(
  nodes: readonly Vec2[],
  p: Vec2,
  fitted: FittedSize,
  opts: ConstraintOptions
): Vec2 {
  const prev = nodes[nodes.length - 1];
  if (prev === undefined || (!opts.snapAngle && !opts.equalLength)) return p;
  if (fitted.width === 0 || fitted.height === 0) return p;

  const prevPx = toDisplay(prev, fitted);
  const pPx = toDisplay(p, fitted);
  const dx = pPx.x - prevPx.x;
  const dy = pPx.y - prevPx.y;
  const reach = Math.hypot(dx, dy);
  if (reach === 0) return p;

  const angle = opts.snapAngle ? snapToStep(Math.atan2(dy, dx), ANGLE_SNAP_DEG) : Math.atan2(dy, dx);

  // Equal-length needs a previous segment to copy, so it only applies from
  // the third vertex on; before that the cursor's own reach is kept.
  const previousSegment = nodes[nodes.length - 2];
  const length =
    opts.equalLength && previousSegment !== undefined
      ? distance(toDisplay(previousSegment, fitted), prevPx)
      : reach;

  return fromDisplay(
    { x: prevPx.x + Math.cos(angle) * length, y: prevPx.y + Math.sin(angle) * length },
    fitted
  );
}

function snapToStep(radians: number, stepDeg: number): number {
  const step = (stepDeg * Math.PI) / 180;
  return Math.round(radians / step) * step;
}

function distance(a: Vec2, b: Vec2): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

/**
 * The square defined by one side a→b: the other two corners sit at a right
 * angle to that side, on the side you reach by turning clockwise on screen
 * (for a left-to-right first side, the square hangs below it).
 *
 * Vertex order is v0=a, v1=b, v2, v3 — the order `sampleRect` and
 * `sampleRectGrid` expect, with v0→v1 and v3→v2 as the "horizontal" pair.
 *
 * Computed in display px so the result is square on screen and in the image;
 * doing it in normalized coordinates would produce a rectangle.
 */
export function squareRing(a: Vec2, b: Vec2, fitted: FittedSize): Vec2[] {
  if (fitted.width === 0 || fitted.height === 0) return [];
  const aPx = toDisplay(a, fitted);
  const bPx = toDisplay(b, fitted);
  // (dx, dy) rotated 90°: in y-down screen space this turns clockwise.
  const perp = { x: -(bPx.y - aPx.y), y: bPx.x - aPx.x };
  return [
    a,
    b,
    fromDisplay({ x: bPx.x + perp.x, y: bPx.y + perp.y }, fitted),
    fromDisplay({ x: aPx.x + perp.x, y: aPx.y + perp.y }, fitted),
  ];
}

/**
 * The partition lines to draw under a quadrat's samples: grid lines for a
 * quadrilateral, equal-area cuts for a polygon, nothing for `random`.
 *
 * The layout is re-derived from the boundary, the stored seed and the mode
 * the quadrat recorded, then checked against the stored sample positions. If
 * they disagree — the row/col counts changed after this quadrat was defined,
 * say — nothing is drawn. A grid that does not match its points would
 * misrepresent how the data was collected, which is worse than no grid.
 */
export function quadratGridLines(
  quadrat: QuadratV2 | null,
  settings: SettingsV2 | undefined
): readonly [Vec2, Vec2][] {
  if (quadrat === null || settings === undefined) return [];
  if (!quadrat.geoDefined || quadrat.rngSeed === null) return [];
  if (quadrat.sampling === 'random') return [];

  try {
    const { points, lines } = planSamples(
      quadrat.boundary,
      {
        numOfSampleRows: settings.numOfSampleRows,
        numOfSampleCols: settings.numOfSampleCols,
        sampling: quadrat.sampling,
        gridOrigin: quadrat.gridOrigin,
      },
      mulberry32(quadrat.rngSeed)
    );
    const matches =
      points.length === quadrat.samples.length &&
      points.every((p, i) => p.x === quadrat.samples[i]?.x && p.y === quadrat.samples[i]?.y);
    return matches ? lines : [];
  } catch {
    return [];
  }
}

/**
 * The current sample's crosshair: four arms that run at full thickness from
 * the tip inward, step down to a hairline at their midpoint, and carry that
 * hairline the rest of the way to the centre.
 *
 * A plain cross puts its heaviest ink exactly where the sample is, hiding the
 * substrate being scored; arms with a gap in the middle leave the position to
 * the eye's guess. The stepped profile gives both — the open, four-tick look
 * near the centre, with a fine line still converging on one unambiguous
 * point. The step is spread over a short ramp rather than a hard corner, so
 * it reads as deliberate at any zoom.
 *
 * SVG stroke width cannot vary along a line, so each arm is a polygon.
 * Returns display-px points; `scale` is the overlay scale in force.
 */
export function crosshairArms(centre: Vec2, scale: number): Vec2[][] {
  const length = OVERLAY.CROSSHAIR_LENGTH * scale;
  const outer = (OVERLAY.CROSSHAIR_WIDTH * scale) / 2;
  const hair = (OVERLAY.CROSSHAIR_HAIRLINE_WIDTH * scale) / 2;
  const shoulder = length * OVERLAY.CROSSHAIR_SHOULDER;
  const ramp = (length * OVERLAY.CROSSHAIR_SHOULDER_RAMP) / 2;

  // right, down, left, up — y grows downward in image coordinates
  const directions: Vec2[] = [
    { x: 1, y: 0 },
    { x: 0, y: 1 },
    { x: -1, y: 0 },
    { x: 0, y: -1 },
  ];

  return directions.map((dir) => {
    const perp: Vec2 = { x: -dir.y, y: dir.x };
    const at = (along: number, across: number): Vec2 => ({
      x: centre.x + dir.x * along + perp.x * across,
      y: centre.y + dir.y * along + perp.y * across,
    });
    // Walked from the centre out along one side, then back along the other.
    return [
      at(0, hair),
      at(shoulder - ramp, hair),
      at(shoulder + ramp, outer),
      at(length, outer),
      at(length, -outer),
      at(shoulder + ramp, -outer),
      at(shoulder - ramp, -hair),
      at(0, -hair),
    ];
  });
}

// ---- view centring --------------------------------------------------------

/**
 * How the view follows the tagging cursor:
 * - `smooth` glides, but only when the move is short enough to be comfortable
 * - `instant` always cuts — no optic flow at all
 * - `off` never moves the view
 */
export const RECENTRE_MOTIONS = ['smooth', 'instant', 'off'] as const;

export type RecentreMotion = (typeof RECENTRE_MOTIONS)[number];

/**
 * The point is left alone while it sits within this fraction of the viewport,
 * measured in from each edge. Tagging is repetitive — hundreds of points a
 * session — so the cumulative exposure to motion matters far more than how
 * any single pan looks. In row-major sampling orders the next point is
 * usually already on screen, and this turns most navigations into no motion
 * at all while still keeping a comfortable margin of context around it.
 */
export const RECENTRE_EDGE_MARGIN = 0.15;

/**
 * Beyond this many viewports of travel the view cuts instead of gliding.
 *
 * A hard cut is usually LESS sickening than a long fast pan: with no optic
 * flow the brain reads it as a scene change rather than self-motion. Long
 * sweeps are exactly the high-velocity full-field motion that provokes
 * vection, and they are unavoidable at high zoom, where consecutive samples
 * are more than a screen apart. So gliding is reserved for the moderate
 * zooms where it is both comfortable and useful.
 */
export const RECENTRE_JUMP_VIEWPORTS = 1;

/** Pan timing: distance-scaled, so short moves stay snappy and long ones do
 * not whip across the screen. */
export const PAN_MIN_MS = 200;
export const PAN_MAX_MS = 600;
export const PAN_VELOCITY_PX_PER_S = 1200;

/** How long a pan of `distance` display px should take, in ms. */
export function panDuration(distance: number): number {
  const ideal = (Math.abs(distance) / PAN_VELOCITY_PX_PER_S) * 1000;
  return Math.min(PAN_MAX_MS, Math.max(PAN_MIN_MS, ideal));
}

/**
 * The transform that puts `at` (image-normalized) in the middle of the view,
 * at the current zoom. The SVG is sized to the fitted image and centred in
 * its panel, so the SVG's own midpoint is what the user sees as the centre.
 *
 * Zoom is deliberately preserved: navigating between samples should move the
 * view, never change how closely it is magnified.
 */
export function centreOn(at: Vec2, fitted: FittedSize, k: number): CanvasTransform {
  const p = toDisplay(at, fitted);
  return { k, x: fitted.width / 2 - k * p.x, y: fitted.height / 2 - k * p.y };
}

export interface Recentre {
  transform: CanvasTransform;
  /** False = cut straight there; see RECENTRE_JUMP_VIEWPORTS. */
  animate: boolean;
}

/**
 * Where the view should move when the tagging cursor lands on a sample, or
 * null to leave it where it is. The whole rule lives here rather than in the
 * component so each clause is testable on its own.
 *
 * It stays put when:
 * - motion is `off`;
 * - the point was clicked **on the canvas** — it is already where the user is
 *   looking, and moving the view out from under a click is disorienting;
 * - the whole image is on screen anyway (zoom 1 or below);
 * - the sample has no coordinates;
 * - the point is already comfortably in view (RECENTRE_EDGE_MARGIN).
 */
export function recentreTarget(options: {
  at: Vec2 | null;
  fromCanvasClick: boolean;
  fitted: FittedSize;
  current: CanvasTransform;
  motion: RecentreMotion;
}): Recentre | null {
  const { at, fromCanvasClick, fitted, current, motion } = options;
  if (motion === 'off' || at === null || fromCanvasClick) return null;
  if (current.k <= 1) return null;
  if (fitted.width === 0 || fitted.height === 0) return null;

  // Where the point currently sits in the viewport.
  const p = toDisplay(at, fitted);
  const onScreen = { x: current.x + current.k * p.x, y: current.y + current.k * p.y };
  const insetX = fitted.width * RECENTRE_EDGE_MARGIN;
  const insetY = fitted.height * RECENTRE_EDGE_MARGIN;
  const comfortable =
    onScreen.x >= insetX &&
    onScreen.x <= fitted.width - insetX &&
    onScreen.y >= insetY &&
    onScreen.y <= fitted.height - insetY;
  if (comfortable) return null;

  const transform = centreOn(at, fitted, current.k);
  const travel = Math.hypot(transform.x - current.x, transform.y - current.y);
  const limit = Math.max(fitted.width, fitted.height) * RECENTRE_JUMP_VIEWPORTS;
  return { transform, animate: motion === 'smooth' && travel <= limit };
}

/**
 * Ease-in-out cubic: starts and ends at rest, quickest in the middle. Gives
 * the pan a sense of weight rather than a mechanical slide, and makes the
 * arrival legible — the eye can follow where the view settled.
 */
export function easeInOutCubic(t: number): number {
  const p = Math.min(1, Math.max(0, t));
  return p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
}

/** Honour the OS "reduce motion" setting; unknown environments animate. */
export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}
