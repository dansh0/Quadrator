import { SampleV2, Vec2 } from '@quadrator/core';
import { describe, expect, it } from 'vitest';
import {
  CLOSE_TOLERANCE,
  IDENTITY,
  OVERLAY,
  constrainPoint,
  crosshairArms,
  fitContain,
  fromDisplay,
  nearFirstNode,
  overlayScale,
  sampleColor,
  squareRing,
  toDisplay,
  toNormalized,
} from '../src/canvas.ts';

function sample(codes: string[]): SampleV2 {
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
  it('draws no circle for the current sample — the crosshair marks it instead', () => {
    expect(sampleColor(sample(['Ulva']), true)).toEqual({ fill: 'none', stroke: 'none' });
  });

  it('hides the current sample whatever its tag state', () => {
    expect(sampleColor(sample([]), true)).toEqual(sampleColor(sample(['Ulva']), true));
  });

  it('keeps the legacy meaning: cool for tagged, warm for untagged', () => {
    expect(sampleColor(sample(['Ulva']), false).fill).toBe(OVERLAY.SAMPLE_TAGGED);
    expect(sampleColor(sample([]), false).fill).toBe(OVERLAY.SAMPLE_UNTAGGED);
  });

  it('gives every state the same dark rim, which is what separates it from the substrate', () => {
    expect(sampleColor(sample(['Ulva']), false).stroke).toBe(OVERLAY.SAMPLE_RIM);
    expect(sampleColor(sample([]), false).stroke).toBe(OVERLAY.SAMPLE_RIM);
  });
});

// A deliberately non-square fitted box: normalized coordinates are then
// anisotropic (x scales by 800, y by 400), which is exactly the case that
// breaks angle and length math done in normalized space.
const WIDE = { width: 800, height: 400 };
const SQUARE_BOX = { width: 500, height: 500 };

const FREE = { snapAngle: false, equalLength: false };
const SNAP = { snapAngle: true, equalLength: false };
const BOTH = { snapAngle: true, equalLength: true };

/** Angle of a→b in display px, degrees, y-down screen convention. */
function angleDeg(a: Vec2, b: Vec2, fitted: { width: number; height: number }): number {
  const dx = (b.x - a.x) * fitted.width;
  const dy = (b.y - a.y) * fitted.height;
  return (Math.atan2(dy, dx) * 180) / Math.PI;
}

function lengthPx(a: Vec2, b: Vec2, fitted: { width: number; height: number }): number {
  return Math.hypot((b.x - a.x) * fitted.width, (b.y - a.y) * fitted.height);
}

describe('display/normalized conversion', () => {
  it('round-trips', () => {
    const p = { x: 0.3, y: 0.7 };
    expect(fromDisplay(toDisplay(p, WIDE), WIDE)).toEqual(p);
  });

  it('degrades to zero rather than dividing by a zero-sized box', () => {
    expect(fromDisplay({ x: 10, y: 10 }, { width: 0, height: 0 })).toEqual({ x: 0, y: 0 });
  });
});

describe('constrainPoint', () => {
  it('leaves the first vertex completely free', () => {
    const p = { x: 0.37, y: 0.61 };
    expect(constrainPoint([], p, WIDE, BOTH)).toEqual(p);
  });

  it('returns the cursor untouched when no constraint is active', () => {
    const p = { x: 0.37, y: 0.61 };
    expect(constrainPoint([{ x: 0.1, y: 0.1 }], p, WIDE, FREE)).toEqual(p);
  });

  it('snaps to 15° steps measured on SCREEN, not in normalized space', () => {
    const from = { x: 0.5, y: 0.5 };
    // 40° on screen must land on 45°, the nearest multiple of 15.
    const target = {
      x: from.x + (Math.cos((40 * Math.PI) / 180) * 200) / WIDE.width,
      y: from.y + (Math.sin((40 * Math.PI) / 180) * 200) / WIDE.height,
    };
    const snapped = constrainPoint([from], target, WIDE, SNAP);
    expect(angleDeg(from, snapped, WIDE)).toBeCloseTo(45, 6);
  });

  it('would snap to the WRONG angle if the box were treated as square', () => {
    // Same normalized input, different aspect: proof the conversion matters.
    const from = { x: 0.5, y: 0.5 };
    const target = { x: 0.75, y: 0.75 };
    expect(angleDeg(from, target, WIDE)).toBeCloseTo(26.565, 3);
    expect(angleDeg(from, target, SQUARE_BOX)).toBeCloseTo(45, 6);
    expect(angleDeg(from, constrainPoint([from], target, WIDE, SNAP), WIDE)).toBeCloseTo(30, 6);
  });

  it('preserves the cursor reach when only the angle is snapped', () => {
    const from = { x: 0.2, y: 0.2 };
    const target = { x: 0.6, y: 0.5 };
    const snapped = constrainPoint([from], target, WIDE, SNAP);
    expect(lengthPx(from, snapped, WIDE)).toBeCloseTo(lengthPx(from, target, WIDE), 6);
  });

  it('locks length to the previous segment once there are two nodes', () => {
    const nodes = [
      { x: 0.1, y: 0.1 },
      { x: 0.4, y: 0.1 },
    ];
    const previous = lengthPx(nodes[0]!, nodes[1]!, WIDE);
    const locked = constrainPoint(nodes, { x: 0.9, y: 0.8 }, WIDE, BOTH);
    expect(lengthPx(nodes[1]!, locked, WIDE)).toBeCloseTo(previous, 6);
  });

  it('cannot lock length with only one node placed — nothing to copy yet', () => {
    const target = { x: 0.9, y: 0.8 };
    const nodes = [{ x: 0.1, y: 0.1 }];
    const out = constrainPoint(nodes, target, WIDE, BOTH);
    // angle is snapped, but the reach is still the cursor's own
    expect(lengthPx(nodes[0]!, out, WIDE)).toBeCloseTo(lengthPx(nodes[0]!, target, WIDE), 6);
  });

  it('applies both locks together: snapped angle AND matched length', () => {
    const nodes = [
      { x: 0.1, y: 0.5 },
      { x: 0.5, y: 0.5 },
    ];
    const locked = constrainPoint(nodes, { x: 0.52, y: 0.9 }, WIDE, BOTH);
    expect(angleDeg(nodes[1]!, locked, WIDE) % 15).toBeCloseTo(0, 6);
    expect(lengthPx(nodes[1]!, locked, WIDE)).toBeCloseTo(lengthPx(nodes[0]!, nodes[1]!, WIDE), 6);
  });

  it('returns the cursor unchanged when it sits exactly on the last node', () => {
    const nodes = [{ x: 0.3, y: 0.3 }];
    expect(constrainPoint(nodes, { x: 0.3, y: 0.3 }, WIDE, BOTH)).toEqual({ x: 0.3, y: 0.3 });
  });

  it('is inert before the canvas has been measured', () => {
    const p = { x: 0.9, y: 0.9 };
    expect(constrainPoint([{ x: 0, y: 0 }], p, { width: 0, height: 0 }, BOTH)).toEqual(p);
  });
});

describe('squareRing', () => {
  it('is square in DISPLAY pixels even when the image is not', () => {
    const ring = squareRing({ x: 0.1, y: 0.5 }, { x: 0.4, y: 0.5 }, WIDE);
    const sides = [0, 1, 2, 3].map((i) => lengthPx(ring[i]!, ring[(i + 1) % 4]!, WIDE));
    for (const side of sides) {
      expect(side).toBeCloseTo(sides[0]!, 6);
    }
  });

  it('would be a rectangle if built in normalized coordinates', () => {
    // Guards the bug this function exists to avoid: equal normalized deltas
    // are unequal on screen whenever the box is not square.
    const ring = squareRing({ x: 0.1, y: 0.5 }, { x: 0.4, y: 0.5 }, WIDE);
    const normalizedWidth = Math.abs(ring[1]!.x - ring[0]!.x);
    const normalizedHeight = Math.abs(ring[3]!.y - ring[0]!.y);
    expect(normalizedWidth).not.toBeCloseTo(normalizedHeight, 6);
  });

  it('has square corners', () => {
    const ring = squareRing({ x: 0.2, y: 0.2 }, { x: 0.5, y: 0.35 }, WIDE);
    const ab = angleDeg(ring[0]!, ring[1]!, WIDE);
    const bc = angleDeg(ring[1]!, ring[2]!, WIDE);
    expect(Math.abs(((bc - ab + 540) % 360) - 180)).toBeCloseTo(90, 6);
  });

  it('puts v0→v1 and v3→v2 as the matching pair sampleRect expects', () => {
    const ring = squareRing({ x: 0, y: 0 }, { x: 0.5, y: 0 }, SQUARE_BOX);
    expect(ring[0]).toEqual({ x: 0, y: 0 });
    expect(ring[1]).toEqual({ x: 0.5, y: 0 });
    expect(ring[2]!.x).toBeCloseTo(0.5, 12);
    expect(ring[2]!.y).toBeCloseTo(0.5, 12);
    expect(ring[3]!.x).toBeCloseTo(0, 12);
    expect(ring[3]!.y).toBeCloseTo(0.5, 12);
  });

  it('hangs below a left-to-right side (clockwise on screen)', () => {
    const ring = squareRing({ x: 0.2, y: 0.2 }, { x: 0.6, y: 0.2 }, SQUARE_BOX);
    expect(ring[2]!.y).toBeGreaterThan(ring[1]!.y);
  });

  it('is empty before the canvas has been measured', () => {
    expect(squareRing({ x: 0, y: 0 }, { x: 1, y: 1 }, { width: 0, height: 0 })).toEqual([]);
  });
});

describe('crosshairArms', () => {
  const centre = { x: 100, y: 50 };

  /** Thickness of an arm across its axis, between two opposing points. */
  const spread = (a: Vec2, b: Vec2) => Math.hypot(b.x - a.x, b.y - a.y);

  it('returns four arms, one per direction', () => {
    expect(crosshairArms(centre, 1)).toHaveLength(4);
  });

  it('runs as a hairline from the centre to the shoulder', () => {
    for (const arm of crosshairArms(centre, 1)) {
      // points 0 and 7 are the two sides at the centre; 1 and 6 at the shoulder
      expect(spread(arm[0]!, arm[7]!)).toBeCloseTo(OVERLAY.CROSSHAIR_HAIRLINE_WIDTH, 6);
      expect(spread(arm[1]!, arm[6]!)).toBeCloseTo(OVERLAY.CROSSHAIR_HAIRLINE_WIDTH, 6);
    }
  });

  it('runs at full thickness from the shoulder to the tip', () => {
    for (const arm of crosshairArms(centre, 1)) {
      expect(spread(arm[2]!, arm[5]!)).toBeCloseTo(OVERLAY.CROSSHAIR_WIDTH, 6);
      expect(spread(arm[3]!, arm[4]!)).toBeCloseTo(OVERLAY.CROSSHAIR_WIDTH, 6);
    }
  });

  it('steps up at the arm\'s midpoint', () => {
    const [right] = crosshairArms(centre, 1);
    const midpoint = OVERLAY.CROSSHAIR_LENGTH * OVERLAY.CROSSHAIR_SHOULDER;
    const stepStart = right![1]!.x - centre.x;
    const stepEnd = right![2]!.x - centre.x;
    expect((stepStart + stepEnd) / 2).toBeCloseTo(midpoint, 6);
    expect(midpoint).toBeCloseTo(OVERLAY.CROSSHAIR_LENGTH / 2, 6);
  });

  it('makes the step short, so it reads as a step and not a wedge', () => {
    const [right] = crosshairArms(centre, 1);
    const stepLength = right![2]!.x - right![1]!.x;
    expect(stepLength).toBeCloseTo(
      OVERLAY.CROSSHAIR_LENGTH * OVERLAY.CROSSHAIR_SHOULDER_RAMP,
      6
    );
    expect(stepLength).toBeLessThan(OVERLAY.CROSSHAIR_LENGTH * 0.15);
  });

  it('every arm touches the exact centre, so the point is unambiguous', () => {
    for (const arm of crosshairArms(centre, 1)) {
      const mid = { x: (arm[0]!.x + arm[7]!.x) / 2, y: (arm[0]!.y + arm[7]!.y) / 2 };
      expect(mid.x).toBeCloseTo(centre.x, 6);
      expect(mid.y).toBeCloseTo(centre.y, 6);
    }
  });

  it('reaches the full length in all four directions', () => {
    const tips = crosshairArms(centre, 1).map((arm) => ({
      x: (arm[3]!.x + arm[4]!.x) / 2,
      y: (arm[3]!.y + arm[4]!.y) / 2,
    }));
    const L = OVERLAY.CROSSHAIR_LENGTH;
    expect(tips).toEqual([
      { x: centre.x + L, y: centre.y },
      { x: centre.x, y: centre.y + L },
      { x: centre.x - L, y: centre.y },
      { x: centre.x, y: centre.y - L },
    ]);
  });

  it('scales with the overlay, keeping the profile proportional', () => {
    const scaled = crosshairArms(centre, 2);
    expect(spread(scaled[0]![0]!, scaled[0]![7]!)).toBeCloseTo(
      OVERLAY.CROSSHAIR_HAIRLINE_WIDTH * 2,
      6
    );
    expect(spread(scaled[0]![3]!, scaled[0]![4]!)).toBeCloseTo(OVERLAY.CROSSHAIR_WIDTH * 2, 6);
    expect(scaled[0]![3]!.x - centre.x).toBeCloseTo(OVERLAY.CROSSHAIR_LENGTH * 2, 6);
  });
});
