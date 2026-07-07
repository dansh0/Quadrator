/**
 * Polygon operations: area, orientation, point-in-polygon, bbox, and
 * equal-area splitting (`splitByArea`).
 *
 * Corrected port of poly-split-js (MIT © 2016 kladess,
 * https://github.com/kladess/poly-split-js — vendored in
 * src/assets/poly-split-js-master). The port is deliberately NOT
 * bit-compatible with the vendored library: the original's vector math is
 * broken (dot product adds z components, projections produce NaN, parallel
 * segment intersection returns the number 0), which silently disabled its
 * triangle-cut branches and made point-in-polygon return true for everything
 * when the polygon had a vertical edge. This port fixes the math; correctness
 * is defined by invariant tests (piece areas, containment), not by matching
 * legacy output.
 *
 * Ring convention: OPEN rings everywhere in core — the last vertex is NOT a
 * repeat of the first. (The legacy app's `nodes` arrays are CLOSED; the
 * serialization layer strips the duplicate.)
 */
import { Vec2, eq, lerp, midpoint } from './vec2.ts';
import {
  GEOM_EPS,
  LineABC,
  Segment,
  bisector,
  crossLineSegment,
  crossSegmentSegment,
  lineOf,
  projectOntoLine,
  segLen,
  segLen2,
  tanAngle,
} from './line.ts';

/** An OPEN ring of vertices (no repeated last vertex). */
export type Ring = Vec2[];

export class GeometryError extends Error {
  override readonly name = 'GeometryError';
}

/**
 * Signed area using the legacy poly-split convention
 * (½ Σ xᵢ·(yᵢ₋₁ − yᵢ₊₁), cyclic): NEGATIVE for counter-clockwise rings in
 * y-up math coordinates. Kept because the split algorithm's sign logic
 * depends on it; use `area()` when you just want magnitude.
 */
export function signedArea(ring: Ring): number {
  const n = ring.length;
  if (n < 3) return 0;
  let result = 0;
  for (let i = 0; i < n; i++) {
    const prev = ring[(i + n - 1) % n]!;
    const next = ring[(i + 1) % n]!;
    result += ring[i]!.x * (prev.y - next.y);
  }
  return result / 2;
}

export function area(ring: Ring): number {
  return Math.abs(signedArea(ring));
}

/**
 * True when the ring is clockwise under the legacy convention (which the
 * split algorithm requires). Matches poly-split's isClockwise exactly.
 */
export function isClockwise(ring: Ring): boolean {
  return signedArea(ring) <= 0;
}

/**
 * Even-odd point-in-polygon test (PNPOLY). Handles vertical edges correctly
 * (the legacy version returned true for EVERY point when the polygon had a
 * perfectly vertical edge — audit B10). Points exactly on the boundary may
 * report either side; callers needing containment use strictly interior
 * points.
 */
export function isPointInside(ring: Ring, p: Vec2): boolean {
  const n = ring.length;
  let inside = false;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const a = ring[i]!;
    const b = ring[j]!;
    if (
      a.y > p.y !== b.y > p.y &&
      p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x
    ) {
      inside = !inside;
    }
  }
  return inside;
}

/**
 * Axis-aligned bounding box. Correct min/max (the legacy quadrat code had
 * min/max swapped and initialized to 0/Infinity — audit B5).
 */
export function bbox(ring: Ring): { min: Vec2; max: Vec2 } {
  if (ring.length === 0) {
    throw new GeometryError('bbox of empty ring');
  }
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const v of ring) {
    if (v.x < minX) minX = v.x;
    if (v.y < minY) minY = v.y;
    if (v.x > maxX) maxX = v.x;
    if (v.y > maxY) maxY = v.y;
  }
  return { min: { x: minX, y: minY }, max: { x: maxX, y: maxY } };
}

function orient(a: Vec2, b: Vec2, c: Vec2): number {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}

/**
 * True when no two non-adjacent edges properly cross. Collinear overlaps are
 * not detected (accepted limitation; they cannot be produced by the app's
 * click-defined quadrats in practice).
 */
export function isSimple(ring: Ring): boolean {
  const n = ring.length;
  for (let i = 0; i < n; i++) {
    const a1 = ring[i]!;
    const a2 = ring[(i + 1) % n]!;
    for (let j = i + 1; j < n; j++) {
      // skip adjacent edges (shared vertex)
      if (j === i + 1 || (i === 0 && j === n - 1)) continue;
      const b1 = ring[j]!;
      const b2 = ring[(j + 1) % n]!;
      if (
        orient(a1, a2, b1) * orient(a1, a2, b2) < 0 &&
        orient(b1, b2, a1) * orient(b1, b2, a2) < 0
      ) {
        return false;
      }
    }
  }
  return true;
}

// ---------------------------------------------------------------------------
// splitByArea internals (port of Polygon.createSubPoly / createPolygons /
// findCutLine / getCut / split)
// ---------------------------------------------------------------------------

interface CutRegions {
  bisector: LineABC;
  leftTriangle: Ring;
  trapezoid: Ring;
  rightTriangle: Ring;
  p1Exists: boolean;
  p2Exists: boolean;
  p3Exists: boolean;
  p4Exists: boolean;
  leftTriangleArea: number;
  trapezoidArea: number;
  rightTriangleArea: number;
  totalArea: number;
}

/** Vertices strictly between edge i and edge j: poly1 = [i+1..j], poly2 = [j+1..i] (cyclic). */
function createSubPoly(ring: Ring, i: number, j: number): { poly1: Ring; poly2: Ring } {
  const n = ring.length;
  const poly1: Ring = [];
  const poly2: Ring = [];
  for (let k = 1; k <= j - i; k++) poly1.push(ring[k + i]!);
  for (let k = 1; k <= n - (j - i); k++) poly2.push(ring[(k + j) % n]!);
  return { poly1, poly2 };
}

/**
 * Decompose the region swept between edges l1 and l2 into
 * leftTriangle + trapezoid + rightTriangle around their bisector.
 * Legacy compared the projected points to the edge endpoints by OBJECT
 * REFERENCE (`p1 != v4`), which is always true in JS; here they are compared
 * by value within GEOM_EPS, restoring the triangle branches the original
 * algorithm intended.
 */
function createPolygons(l1: Segment, l2: Segment): CutRegions {
  const bis = bisector(lineOf(l1.start, l1.end), lineOf(l2.start, l2.end));
  const v1 = l1.start;
  const v2 = l1.end;
  const v3 = l2.start;
  const v4 = l2.end;

  const leftTriangle: Ring = [];
  const trapezoid: Ring = [];
  const rightTriangle: Ring = [];
  let p1Exists = false;
  let p2Exists = false;
  let p3Exists = false;
  let p4Exists = false;

  if (!eq(v1, v4, GEOM_EPS)) {
    const p1 = crossLineSegment(lineOf(v1, projectOntoLine(bis, v1)), l2);
    p1Exists = p1 !== null && !eq(p1, v4, GEOM_EPS);
    if (p1Exists && p1) {
      leftTriangle.push(v1, v4, p1);
      trapezoid.push(p1);
    } else {
      trapezoid.push(v4);
    }

    const p4 = crossLineSegment(lineOf(v4, projectOntoLine(bis, v4)), l1);
    p4Exists = p4 !== null && !eq(p4, v1, GEOM_EPS);
    if (p4Exists && p4) {
      leftTriangle.push(v4, v1, p4);
      trapezoid.push(p4);
    } else {
      trapezoid.push(v1);
    }
  } else {
    trapezoid.push(v4, v1);
  }

  if (!eq(v2, v3, GEOM_EPS)) {
    const p3 = crossLineSegment(lineOf(v3, projectOntoLine(bis, v3)), l1);
    p3Exists = p3 !== null && !eq(p3, v2, GEOM_EPS);
    if (p3Exists && p3) {
      rightTriangle.push(v3, v2, p3);
      trapezoid.push(p3);
    } else {
      trapezoid.push(v2);
    }

    const p2 = crossLineSegment(lineOf(v2, projectOntoLine(bis, v2)), l2);
    p2Exists = p2 !== null && !eq(p2, v3, GEOM_EPS);
    if (p2Exists && p2) {
      rightTriangle.push(v2, v3, p2);
      trapezoid.push(p2);
    } else {
      trapezoid.push(v3);
    }
  } else {
    trapezoid.push(v2, v3);
  }

  const leftTriangleArea = area(leftTriangle);
  const trapezoidArea = area(trapezoid);
  const rightTriangleArea = area(rightTriangle);

  return {
    bisector: bis,
    leftTriangle,
    trapezoid,
    rightTriangle,
    p1Exists,
    p2Exists,
    p3Exists,
    p4Exists,
    leftTriangleArea,
    trapezoidArea,
    rightTriangleArea,
    totalArea: leftTriangleArea + trapezoidArea + rightTriangleArea,
  };
}

/** Find the cut segment carving `target` area out of the decomposed region. */
function findCutLine(target: number, res: CutRegions): Segment | null {
  if (target > res.totalArea) return null;

  if (res.leftTriangle.length > 0 && target < res.leftTriangleArea) {
    const m = target / res.leftTriangleArea;
    const p = lerp(res.leftTriangle[1]!, res.leftTriangle[2]!, m);
    if (res.p1Exists) return { start: p, end: res.leftTriangle[0]! };
    if (res.p4Exists) return { start: res.leftTriangle[0]!, end: p };
  } else if (
    res.leftTriangleArea < target &&
    target < res.leftTriangleArea + res.trapezoidArea
  ) {
    const t = lineOf(res.trapezoid[0]!, res.trapezoid[3]!);
    const tgA = tanAngle(t, res.bisector);
    const s = target - res.leftTriangleArea;
    let m: number;
    if (Math.abs(tgA) > GEOM_EPS) {
      const a = segLen({ start: res.trapezoid[0]!, end: res.trapezoid[1]! });
      const b = segLen({ start: res.trapezoid[2]!, end: res.trapezoid[3]! });
      const hh = (2 * res.trapezoidArea) / (a + b);
      const d = a * a - 4 * tgA * s;
      if (d < 0) return null; // no real solution (legacy produced NaN here)
      // Stable form of (a − √d)/(2·tgA): the direct form cancels
      // catastrophically when tgA·s ≪ a² (found by property testing).
      const h = (2 * s) / (a + Math.sqrt(d));
      m = h / hh;
    } else {
      m = s / res.trapezoidArea;
    }
    return {
      start: lerp(res.trapezoid[0]!, res.trapezoid[3]!, m),
      end: lerp(res.trapezoid[1]!, res.trapezoid[2]!, m),
    };
  } else if (
    res.rightTriangle.length > 0 &&
    target > res.leftTriangleArea + res.trapezoidArea
  ) {
    const s = target - res.leftTriangleArea - res.trapezoidArea;
    const m = s / res.rightTriangleArea;
    const p = lerp(res.rightTriangle[2]!, res.rightTriangle[1]!, m);
    if (res.p3Exists) return { start: res.rightTriangle[0]!, end: p };
    if (res.p2Exists) return { start: p, end: res.rightTriangle[0]! };
  }
  return null;
}

/** Try to cut `target` area between edges l1 and l2 given the two sub-rings. */
function getCut(
  l1: Segment,
  l2: Segment,
  target: number,
  poly1: Ring,
  poly2: Ring
): Segment | null {
  const sn1 = target + signedArea(poly2);
  const sn2 = target + signedArea(poly1);

  if (sn1 > 0) {
    const cut = findCutLine(sn1, createPolygons(l1, l2));
    if (cut) return cut;
  } else if (sn2 > 0) {
    const cut = findCutLine(sn2, createPolygons(l2, l1));
    if (cut) return { start: cut.end, end: cut.start };
  }
  return null;
}

/** True when segment cut lies inside ring, ignoring the two edges it starts/ends on. */
function isSegmentInsidePoly(
  ring: Ring,
  cut: Segment,
  excludeEdge1: number,
  excludeEdge2: number
): boolean {
  const n = ring.length;
  for (let i = 0; i < n; i++) {
    if (i === excludeEdge1 || i === excludeEdge2) continue;
    const p1 = ring[i]!;
    const p2 = ring[(i + 1) % n]!;
    const p = crossSegmentSegment({ start: p1, end: p2 }, cut);
    if (p) {
      const d1 = (p1.x - p.x) ** 2 + (p1.y - p.y) ** 2;
      const d2 = (p2.x - p.x) ** 2 + (p2.y - p.y) ** 2;
      if (d1 > GEOM_EPS && d2 > GEOM_EPS) return false;
    }
  }
  return isPointInside(ring, midpoint(cut.start, cut.end));
}

/** Drop consecutive duplicate vertices (within eps), including last≈first. */
function dedupeRing(ring: Ring, eps = GEOM_EPS): Ring {
  const out: Ring = [];
  for (const v of ring) {
    if (out.length === 0 || !eq(out[out.length - 1]!, v, eps)) out.push(v);
  }
  while (out.length > 1 && eq(out[0]!, out[out.length - 1]!, eps)) out.pop();
  return out;
}

export interface SplitResult {
  /** The cut-off ring whose area ≈ targetArea. */
  piece: Ring;
  /** The remainder ring (area ≈ original − targetArea). */
  rest: Ring;
  /** The straight cut separating piece from rest. */
  cutLine: [Vec2, Vec2];
}

/**
 * Split an OPEN ring into two rings with a single straight cut such that one
 * ring's area is `targetArea`. Among all valid cuts the shortest is chosen
 * (same objective as poly-split). Throws GeometryError on degenerate input
 * (< 3 distinct vertices, zero area, self-intersecting ring) or when
 * targetArea is not strictly between 0 and the ring's area — the legacy
 * library half-completed silently in these cases (audit B9).
 */
export function splitByArea(ring: Ring, targetArea: number): SplitResult {
  const clean = dedupeRing(ring);
  if (clean.length < 3) {
    throw new GeometryError(
      `splitByArea requires at least 3 distinct vertices, got ${clean.length}`
    );
  }
  if (!isSimple(clean)) {
    throw new GeometryError('splitByArea requires a simple (non-self-intersecting) ring');
  }
  const total = area(clean);
  if (total <= GEOM_EPS) {
    throw new GeometryError('splitByArea requires a ring with non-zero area');
  }
  if (!(targetArea > 0) || targetArea >= total - GEOM_EPS) {
    throw new GeometryError(
      `targetArea must be in (0, area); got ${targetArea} of ${total}`
    );
  }

  // The algorithm requires clockwise orientation (legacy convention). Work on
  // a copy — the legacy library reversed the caller's array in place.
  const work = isClockwise(clean) ? [...clean] : [...clean].reverse();
  const n = work.length;

  let best: { ringA: Ring; ringB: Ring; cut: Segment; sqLen: number } | null = null;

  for (let i = 0; i < n - 1; i++) {
    for (let j = i + 1; j < n; j++) {
      const { poly1, poly2 } = createSubPoly(work, i, j);
      const l1: Segment = { start: work[i]!, end: work[i + 1]! };
      const l2: Segment = { start: work[j]!, end: work[(j + 1) % n]! };

      const cut = getCut(l1, l2, targetArea, poly1, poly2);
      if (!cut) continue;

      const sqLen = segLen2(cut);
      if (
        (best === null || sqLen < best.sqLen) &&
        isSegmentInsidePoly(work, cut, i, j)
      ) {
        // Validate by measurement: getCut's decomposition model can misplace
        // the cut on near-degenerate edge pairs (tiny edges from almost-
        // duplicate vertices — found by property testing, ~1.7% area error).
        // Reject candidates whose measured piece area misses the target; an
        // accurate candidate exists whenever a valid cut exists at all.
        const ringA = dedupeRing([...poly1, cut.start, cut.end]);
        const ringB = dedupeRing([...poly2, cut.end, cut.start]);
        const err = Math.min(
          Math.abs(area(ringA) - targetArea),
          Math.abs(area(ringB) - targetArea)
        );
        if (err > total * GEOM_EPS) continue;
        best = { ringA, ringB, cut, sqLen };
      }
    }
  }

  if (!best) {
    throw new GeometryError('splitByArea found no valid cut');
  }

  // getCut's sign bookkeeping determines which side carries the target area;
  // assign by measurement rather than re-deriving the legacy sign algebra.
  const closerA =
    Math.abs(area(best.ringA) - targetArea) <= Math.abs(area(best.ringB) - targetArea);
  return {
    piece: closerA ? best.ringA : best.ringB,
    rest: closerA ? best.ringB : best.ringA,
    cutLine: [best.cut.start, best.cut.end],
  };
}
