import { SampleV1 } from '@quadrator/core';
import { describe, expect, it } from 'vitest';
import {
  CLOSE_TOLERANCE,
  IDENTITY,
  fitContain,
  nearFirstNode,
  overlayScale,
  sampleColor,
  toNormalized,
} from '../src/canvas.ts';

function sample(codes: string[]): SampleV1 {
  return { index: 0, x: 0.5, y: 0.5, codes };
}

describe('fitContain', () => {
  it('is width-limited for images wider than the container', () => {
    expect(fitContain(800, 600, 2)).toEqual({ width: 800, height: 400 });
  });

  it('is height-limited for images taller than the container', () => {
    expect(fitContain(800, 600, 0.5)).toEqual({ width: 300, height: 600 });
  });

  it('fills exactly when aspects match', () => {
    expect(fitContain(800, 600, 800 / 600)).toEqual({ width: 800, height: 600 });
  });

  it('degrades to zero for non-positive or non-finite inputs', () => {
    expect(fitContain(0, 600, 1)).toEqual({ width: 0, height: 0 });
    expect(fitContain(800, -1, 1)).toEqual({ width: 0, height: 0 });
    expect(fitContain(800, 600, 0)).toEqual({ width: 0, height: 0 });
    expect(fitContain(800, 600, NaN)).toEqual({ width: 0, height: 0 });
  });
});

describe('toNormalized', () => {
  const fitted = { width: 800, height: 600 };

  it('maps display px to 0–1 fractions at identity', () => {
    expect(toNormalized(400, 150, IDENTITY, fitted)).toEqual({ x: 0.5, y: 0.25 });
  });

  it('undoes a zoom/pan transform', () => {
    // point drawn at (0.5, 0.25) then transformed by k=2, translate (100, -50)
    const t = { k: 2, x: 100, y: -50 };
    const px = 0.5 * fitted.width * t.k + t.x;
    const py = 0.25 * fitted.height * t.k + t.y;
    expect(toNormalized(px, py, t, fitted)).toEqual({ x: 0.5, y: 0.25 });
  });
});

describe('nearFirstNode', () => {
  const nodes = [
    { x: 0.5, y: 0.5 },
    { x: 0.9, y: 0.5 },
  ];

  it('accepts clicks within the per-axis tolerance of the first node', () => {
    expect(nearFirstNode(nodes, { x: 0.52, y: 0.48 })).toBe(true);
  });

  it('is per-axis, not radial: both deltas just under tolerance pass', () => {
    const d = CLOSE_TOLERANCE - 1e-9; // radial distance d√2 > tolerance
    expect(nearFirstNode(nodes, { x: 0.5 + d, y: 0.5 + d })).toBe(true);
  });

  it('rejects when either axis is out of tolerance, and empty node lists', () => {
    expect(nearFirstNode(nodes, { x: 0.5, y: 0.5 + CLOSE_TOLERANCE })).toBe(false);
    expect(nearFirstNode([], { x: 0.5, y: 0.5 })).toBe(false);
  });
});

describe('overlayScale', () => {
  it('matches the legacy half-compensation curve', () => {
    expect(overlayScale(1)).toBe(1);
    expect(overlayScale(3)).toBe(0.5);
    expect(overlayScale(0.5)).toBeCloseTo(1 / 0.75);
  });
});

describe('sampleColor', () => {
  it('hides the current sample (crosshair renders instead)', () => {
    expect(sampleColor(sample(['Ulva']), true)).toEqual({ fill: 'none', stroke: 'none' });
  });

  it('is blue for tagged, orange for untagged (legacy palette)', () => {
    expect(sampleColor(sample(['Ulva']), false)).toEqual({ fill: 'lightblue', stroke: 'blue' });
    expect(sampleColor(sample([]), false)).toEqual({ fill: 'orange', stroke: 'darkorange' });
  });
});
