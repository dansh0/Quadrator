import { describe, expect, it } from 'vitest';
import {
  add,
  cross,
  dist,
  dist2,
  dot,
  eq,
  len,
  len2,
  lerp,
  midpoint,
  scale,
  sub,
  vec2,
} from '../src/geometry/vec2.ts';

describe('vec2 primitives', () => {
  const a = vec2(3, 4);
  const b = vec2(-1, 2);

  it('vec2 constructs a plain {x, y} object', () => {
    expect(a).toEqual({ x: 3, y: 4 });
  });

  it('add / sub are component-wise and inverse of each other', () => {
    expect(add(a, b)).toEqual({ x: 2, y: 6 });
    expect(sub(a, b)).toEqual({ x: 4, y: 2 });
    expect(sub(add(a, b), b)).toEqual(a);
  });

  it('scale multiplies both components', () => {
    expect(scale(a, 2)).toEqual({ x: 6, y: 8 });
    expect(scale(a, 0)).toEqual({ x: 0, y: 0 });
    expect(scale(a, -1)).toEqual({ x: -3, y: -4 });
  });

  it('dot: perpendicular vectors → 0, parallel → product of lengths', () => {
    expect(dot(vec2(1, 0), vec2(0, 5))).toBe(0);
    expect(dot(vec2(2, 0), vec2(3, 0))).toBe(6);
    expect(dot(a, b)).toBe(3 * -1 + 4 * 2);
  });

  it('cross: sign gives turn direction, parallel vectors → 0', () => {
    expect(cross(vec2(1, 0), vec2(0, 1))).toBe(1); // CCW turn
    expect(cross(vec2(0, 1), vec2(1, 0))).toBe(-1); // CW turn
    expect(cross(vec2(2, 4), vec2(1, 2))).toBe(0); // parallel
  });

  it('len / len2 on a 3-4-5 triangle', () => {
    expect(len2(a)).toBe(25);
    expect(len(a)).toBe(5);
    expect(len(vec2(0, 0))).toBe(0);
  });

  it('dist / dist2 between points', () => {
    expect(dist2(vec2(1, 1), vec2(4, 5))).toBe(25);
    expect(dist(vec2(1, 1), vec2(4, 5))).toBe(5);
    expect(dist(a, a)).toBe(0);
  });

  it('midpoint is halfway on both axes', () => {
    expect(midpoint(vec2(0, 0), vec2(4, -2))).toEqual({ x: 2, y: -1 });
  });

  it('lerp: t=0 → a, t=1 → b, t=0.5 → midpoint', () => {
    expect(lerp(a, b, 0)).toEqual(a);
    expect(lerp(a, b, 1)).toEqual(b);
    expect(lerp(a, b, 0.5)).toEqual(midpoint(a, b));
  });

  it('eq: exact by default, tolerance when eps is given', () => {
    expect(eq(a, { x: 3, y: 4 })).toBe(true);
    expect(eq(a, { x: 3, y: 4.0000001 })).toBe(false);
    expect(eq(a, { x: 3, y: 4.0000001 }, 1e-6)).toBe(true);
    expect(eq(a, b, 1)).toBe(false); // both components must be within eps
  });
});
