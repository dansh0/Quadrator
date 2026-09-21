import { describe, expect, it } from 'vitest';
import {
  GeometryError,
  area,
  bbox,
  centroid,
  interiorPoint,
  isClockwise,
  isPointInside,
  isSimple,
  signedArea,
} from '../src/geometry/polygon.ts';
import { bowtie, clickedSquare, lShape, pentagon, unitSquare } from './helpers.ts';

describe('signedArea / area', () => {
  it('unit square has area 1', () => {
    expect(area(unitSquare)).toBeCloseTo(1, 10);
  });

  it('L-shape has area 12 (4x4 minus 2x2)', () => {
    expect(area(lShape)).toBeCloseTo(12, 10);
  });

  it('area is orientation-independent, signedArea flips sign', () => {
    const reversed = [...unitSquare].reverse();
    expect(area(reversed)).toBeCloseTo(area(unitSquare), 12);
    expect(signedArea(reversed)).toBeCloseTo(-signedArea(unitSquare), 12);
  });

  it('handles negative coordinates', () => {
    const ring = unitSquare.map((v) => ({ x: v.x - 10, y: v.y - 20 }));
    expect(area(ring)).toBeCloseTo(1, 10);
  });

  it('fewer than 3 vertices → zero area', () => {
    expect(area([])).toBe(0);
    expect(area([{ x: 0, y: 0 }, { x: 1, y: 1 }])).toBe(0);
  });
});

describe('isClockwise', () => {
  it('a ring and its reverse disagree', () => {
    expect(isClockwise(unitSquare)).not.toBe(isClockwise([...unitSquare].reverse()));
  });
});

describe('isPointInside', () => {
  it('center of unit square is inside (vertical edges — legacy bug case)', () => {
    expect(isPointInside(unitSquare, { x: 0.5, y: 0.5 })).toBe(true);
  });

  it('points outside a polygon with vertical edges are outside', () => {
    // Legacy isPointInsidePoly returned TRUE for every point here.
    expect(isPointInside(unitSquare, { x: 1.5, y: 0.5 })).toBe(false);
    expect(isPointInside(unitSquare, { x: -0.5, y: 0.5 })).toBe(false);
    expect(isPointInside(unitSquare, { x: 0.5, y: 2 })).toBe(false);
    expect(isPointInside(unitSquare, { x: 0.5, y: -1 })).toBe(false);
  });

  it('concave notch of the L-shape is outside', () => {
    expect(isPointInside(lShape, { x: 3, y: 3 })).toBe(false);
    expect(isPointInside(lShape, { x: 1, y: 3 })).toBe(true);
    expect(isPointInside(lShape, { x: 3, y: 1 })).toBe(true);
  });

  it('works on irregular click-defined quadrats', () => {
    expect(isPointInside(clickedSquare, { x: 300, y: 300 })).toBe(true);
    expect(isPointInside(clickedSquare, { x: 50, y: 300 })).toBe(false);
  });

  it('orientation-independent', () => {
    const p = { x: 200, y: 200 };
    expect(isPointInside(pentagon, p)).toBe(true);
    expect(isPointInside([...pentagon].reverse(), p)).toBe(true);
  });
});

describe('bbox', () => {
  it('returns correct min/max (legacy had them inverted — audit B5)', () => {
    const { min, max } = bbox(clickedSquare);
    expect(min).toEqual({ x: 96.2, y: 98.7 });
    expect(max).toEqual({ x: 512.9, y: 495.3 });
  });

  it('handles negative coordinates', () => {
    const { min, max } = bbox([
      { x: -5, y: 3 },
      { x: 2, y: -7 },
      { x: 0, y: 0 },
    ]);
    expect(min).toEqual({ x: -5, y: -7 });
    expect(max).toEqual({ x: 2, y: 3 });
  });

  it('throws on empty ring', () => {
    expect(() => bbox([])).toThrow(GeometryError);
  });
});

describe('isSimple', () => {
  it('accepts convex and concave simple rings', () => {
    expect(isSimple(unitSquare)).toBe(true);
    expect(isSimple(pentagon)).toBe(true);
    expect(isSimple(lShape)).toBe(true);
  });

  it('rejects the self-intersecting bowtie', () => {
    expect(isSimple(bowtie)).toBe(false);
  });
});

describe('centroid', () => {
  it('is the exact centre of a square, whatever the winding', () => {
    expect(centroid(unitSquare)).toEqual({ x: 0.5, y: 0.5 });
    expect(centroid([...unitSquare].reverse())).toEqual({ x: 0.5, y: 0.5 });
  });

  it('is area-weighted, not the mean of the vertices', () => {
    // A square with an extra vertex on one edge: vertex-mean would drift
    // toward the duplicated edge, the true centroid does not.
    const withMidpointVertex = [
      { x: 0, y: 0 },
      { x: 0.5, y: 0 },
      { x: 1, y: 0 },
      { x: 1, y: 1 },
      { x: 0, y: 1 },
    ];
    const c = centroid(withMidpointVertex);
    expect(c.x).toBeCloseTo(0.5, 12);
    expect(c.y).toBeCloseTo(0.5, 12);
  });

  it('lands OUTSIDE a sufficiently concave ring — the reason interiorPoint exists', () => {
    // Wide, shallow "U": the centroid sits in the notch, not in the material.
    const u = [
      { x: 0, y: 0 },
      { x: 6, y: 0 },
      { x: 6, y: 6 },
      { x: 5, y: 6 },
      { x: 5, y: 1 },
      { x: 1, y: 1 },
      { x: 1, y: 6 },
      { x: 0, y: 6 },
    ];
    expect(isPointInside(u, centroid(u))).toBe(false);
  });

  it('rejects rings that cannot have one', () => {
    expect(() => centroid([])).toThrow(GeometryError);
    expect(() => centroid(unitSquare.slice(0, 2))).toThrow(GeometryError);
    expect(() =>
      centroid([
        { x: 0, y: 0 },
        { x: 1, y: 1 },
        { x: 2, y: 2 },
      ])
    ).toThrow(GeometryError);
  });
});

describe('interiorPoint', () => {
  it('returns the centroid when the centroid is already inside', () => {
    expect(interiorPoint(unitSquare)).toEqual(centroid(unitSquare));
    expect(interiorPoint(pentagon)).toEqual(centroid(pentagon));
  });

  it('returns a point inside for concave rings whose centroid escapes', () => {
    const u = [
      { x: 0, y: 0 },
      { x: 6, y: 0 },
      { x: 6, y: 6 },
      { x: 5, y: 6 },
      { x: 5, y: 1 },
      { x: 1, y: 1 },
      { x: 1, y: 6 },
      { x: 0, y: 6 },
    ];
    const p = interiorPoint(u);
    expect(isPointInside(u, p)).toBe(true);
    expect(p).not.toEqual(centroid(u));
    // stays on the centroid's scanline, in the widest span of it
    expect(p.y).toBeCloseTo(centroid(u).y, 12);
  });

  it('is inside for the L-shape too', () => {
    expect(isPointInside(lShape, interiorPoint(lShape))).toBe(true);
  });

  it('is deterministic', () => {
    expect(interiorPoint(lShape)).toEqual(interiorPoint(lShape));
  });

  it('rejects a zero-area ring before computing anything', () => {
    expect(() =>
      interiorPoint([
        { x: 0, y: 0 },
        { x: 1, y: 1 },
        { x: 2, y: 2 },
      ])
    ).toThrow(GeometryError);
  });

  it('throws rather than returning a point outside a self-intersecting ring', () => {
    // A bow-tie whose lobes nearly cancel: the area is non-zero so the
    // centroid is computed, but it lands far outside the ring's y range, so
    // the scanline finds no interior span at all.
    const nearCancellingBowtie = [
      { x: 0, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
      { x: 10.0001, y: 0 },
    ];
    expect(() => interiorPoint(nearCancellingBowtie)).toThrow(GeometryError);
    expect(() => interiorPoint(nearCancellingBowtie)).toThrow(/no interior point/);
  });
});
