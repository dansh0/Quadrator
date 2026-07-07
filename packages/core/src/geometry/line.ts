/**
 * Lines in ABC form (A·x + B·y + C = 0) and segments as start/end point
 * pairs. Corrected port of poly-split-js Line.js (MIT © 2016 kladess):
 * - parallel intersections return null instead of the number 0 (the legacy
 *   `return 0` made callers read `.value` off a number → NaN downstream);
 * - projection uses a real point-to-line formula (the legacy version built a
 *   direction vector with an undefined z and a dot product that ADDED the z
 *   components, so every projection was NaN).
 */
import { Vec2 } from './vec2.ts';

/** Tolerance carried over from poly-split (POLY_SPLIT_EPS). */
export const GEOM_EPS = 1e-6;

export interface LineABC {
  readonly A: number;
  readonly B: number;
  readonly C: number;
}

export interface Segment {
  readonly start: Vec2;
  readonly end: Vec2;
}

/** Infinite line through two points, in ABC form. */
export function lineOf(start: Vec2, end: Vec2): LineABC {
  return {
    A: start.y - end.y,
    B: end.x - start.x,
    C: start.x * end.y - end.x * start.y,
  };
}

export function segLen2(s: Segment): number {
  const dx = s.end.x - s.start.x;
  const dy = s.end.y - s.start.y;
  return dx * dx + dy * dy;
}

export function segLen(s: Segment): number {
  return Math.sqrt(segLen2(s));
}

/** Nearest point on the infinite line to p (orthogonal projection). */
export function projectOntoLine(l: LineABC, p: Vec2): Vec2 {
  const q = (l.A * p.x + l.B * p.y + l.C) / (l.A * l.A + l.B * l.B);
  return { x: p.x - l.A * q, y: p.y - l.B * q };
}

function det(a: number, b: number, c: number, d: number): number {
  return a * d - b * c;
}

function within(v: number, a: number, b: number): boolean {
  return Math.min(a, b) <= v + GEOM_EPS && v <= Math.max(a, b) + GEOM_EPS;
}

function withinSeg(p: Vec2, s: Segment): boolean {
  return within(p.x, s.start.x, s.end.x) && within(p.y, s.start.y, s.end.y);
}

/** Intersection of two infinite lines; null if parallel. */
export function intersectLineLine(l1: LineABC, l2: LineABC): Vec2 | null {
  const d = det(l1.A, l1.B, l2.A, l2.B);
  if (d === 0) return null;
  return {
    x: -det(l1.C, l1.B, l2.C, l2.B) / d,
    y: -det(l1.A, l1.C, l2.A, l2.C) / d,
  };
}

/** Intersection of infinite line l with segment seg; null if none. */
export function crossLineSegment(l: LineABC, seg: Segment): Vec2 | null {
  const p = intersectLineLine(l, lineOf(seg.start, seg.end));
  if (!p) return null;
  return withinSeg(p, seg) ? p : null;
}

/**
 * Intersection of two segments (bounding-box tolerance GEOM_EPS, matching
 * legacy semantics); null if parallel or the crossing lies outside either
 * segment. Collinear overlap is reported as null, same as legacy.
 */
export function crossSegmentSegment(a: Segment, b: Segment): Vec2 | null {
  const p = intersectLineLine(lineOf(a.start, a.end), lineOf(b.start, b.end));
  if (!p) return null;
  return withinSeg(p, a) && withinSeg(p, b) ? p : null;
}

/** Angle bisector of two lines (difference of the normalized equations). */
export function bisector(l1: LineABC, l2: LineABC): LineABC {
  const q1 = Math.sqrt(l1.A * l1.A + l1.B * l1.B);
  const q2 = Math.sqrt(l2.A * l2.A + l2.B * l2.B);
  return {
    A: l1.A / q1 - l2.A / q2,
    B: l1.B / q1 - l2.B / q2,
    C: l1.C / q1 - l2.C / q2,
  };
}

/** Tangent of the angle between two lines. */
export function tanAngle(l1: LineABC, l2: LineABC): number {
  return (l1.A * l2.B - l2.A * l1.B) / (l1.A * l2.A + l1.B * l2.B);
}
