import { SampleV2, Vec2 } from '@quadrator/core';
import { describe, expect, it } from 'vitest';
import {
  CLOSE_TOLERANCE,
  IDENTITY,
  OVERLAY,
  centreOn,
  constrainPoint,
  crosshairArms,
  easeInOutCubic,
  FIT_MARGIN_PX,
  ZOOM_EXTENT,
  fitContain,
  fitRingTransform,
  fromDisplay,
  interpolateTransform,
  nearFirstNode,
  overlayScale,
  PAN_MAX_MS,
  PAN_MIN_MS,
  RECENTRE_EDGE_MARGIN,
  panDuration,
  recentreTarget,
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

describe('centreOn', () => {
  const fitted = { width: 800, height: 600 };

  it('puts the point in the middle of the view', () => {
    const t = centreOn({ x: 0.25, y: 0.75 }, fitted, 2);
    // screen position = t.x + k * displayX
    expect(t.x + t.k * 0.25 * fitted.width).toBeCloseTo(fitted.width / 2, 6);
    expect(t.y + t.k * 0.75 * fitted.height).toBeCloseTo(fitted.height / 2, 6);
  });

  it('leaves the zoom level alone — navigating pans, it does not magnify', () => {
    expect(centreOn({ x: 0.3, y: 0.3 }, fitted, 3.5).k).toBe(3.5);
  });

  it('is the identity translation for the centre point at zoom 1', () => {
    expect(centreOn({ x: 0.5, y: 0.5 }, fitted, 1)).toEqual({ k: 1, x: 0, y: 0 });
  });

  it('works for any zoom, keeping the point pinned to the middle', () => {
    for (const k of [1, 1.5, 4, 12]) {
      const t = centreOn({ x: 0.1, y: 0.9 }, fitted, k);
      expect(t.x + t.k * 0.1 * fitted.width).toBeCloseTo(fitted.width / 2, 6);
      expect(t.y + t.k * 0.9 * fitted.height).toBeCloseTo(fitted.height / 2, 6);
    }
  });
});

describe('easeInOutCubic', () => {
  it('starts at rest and ends at rest', () => {
    expect(easeInOutCubic(0)).toBe(0);
    expect(easeInOutCubic(1)).toBe(1);
  });

  it('passes through the halfway point halfway', () => {
    expect(easeInOutCubic(0.5)).toBeCloseTo(0.5, 6);
  });

  it('is slow at the ends and quick in the middle', () => {
    const near = (a: number, b: number) => easeInOutCubic(b) - easeInOutCubic(a);
    expect(near(0, 0.1)).toBeLessThan(near(0.45, 0.55));
    expect(near(0.9, 1)).toBeLessThan(near(0.45, 0.55));
  });

  it('never moves backwards', () => {
    let previous = -1;
    for (let t = 0; t <= 1; t += 0.05) {
      const v = easeInOutCubic(t);
      expect(v).toBeGreaterThanOrEqual(previous);
      previous = v;
    }
  });

  it('clamps input outside 0–1 rather than overshooting', () => {
    expect(easeInOutCubic(-2)).toBe(0);
    expect(easeInOutCubic(4)).toBe(1);
  });
});

describe('recentreTarget', () => {
  const fitted = { width: 800, height: 600 };

  /** A transform that parks `at` exactly `offset` px from the view centre. */
  const viewing = (at: Vec2, k: number, offset = { x: 0, y: 0 }) => {
    const centred = centreOn(at, fitted, k);
    return { k, x: centred.x + offset.x, y: centred.y + offset.y };
  };

  // Far enough off-centre to be outside the comfortable inset on both axes.
  const wayOff = { x: 360, y: 260 };
  const at = { x: 0.25, y: 0.75 };

  const move = (over: Partial<Parameters<typeof recentreTarget>[0]> = {}) =>
    recentreTarget({
      at,
      fromCanvasClick: false,
      fitted,
      current: viewing(at, 3, wayOff),
      motion: 'smooth',
      ...over,
    });

  it('centres the sample when the user navigates to one out of view', () => {
    expect(move()?.transform).toEqual(centreOn(at, fitted, 3));
  });

  it('stays put when the sample was clicked on the canvas', () => {
    expect(move({ fromCanvasClick: true })).toBeNull();
  });

  it('stays put when the whole image is already on screen', () => {
    expect(move({ current: { k: 1, x: 0, y: 0 } })).toBeNull();
    expect(move({ current: { k: 0.5, x: 0, y: 0 } })).toBeNull();
  });

  it('stays put for a sample that has no position', () => {
    expect(move({ at: null })).toBeNull();
  });

  it('stays put before the canvas has been measured', () => {
    expect(move({ fitted: { width: 0, height: 0 } })).toBeNull();
  });

  it('preserves the zoom level it was given', () => {
    expect(move({ current: viewing(at, 7, wayOff) })?.transform.k).toBe(7);
  });

  describe('the comfortable zone', () => {
    it('does not move for a point already near the middle', () => {
      expect(move({ current: viewing(at, 4, { x: 10, y: 10 }) })).toBeNull();
    });

    it('does not move for a point anywhere inside the inset', () => {
      const insetX = fitted.width * RECENTRE_EDGE_MARGIN;
      const insetY = fitted.height * RECENTRE_EDGE_MARGIN;
      // just inside each corner of the comfortable rectangle
      const nearly = { x: fitted.width / 2 - insetX - 1, y: fitted.height / 2 - insetY - 1 };
      expect(move({ current: viewing(at, 4, nearly) })).toBeNull();
      expect(
        move({ current: viewing(at, 4, { x: -nearly.x, y: -nearly.y }) })
      ).toBeNull();
    });

    it('moves once the point crosses the inset on either axis', () => {
      const overX = { x: fitted.width / 2 - fitted.width * RECENTRE_EDGE_MARGIN + 2, y: 0 };
      const overY = { x: 0, y: fitted.height / 2 - fitted.height * RECENTRE_EDGE_MARGIN + 2 };
      expect(move({ current: viewing(at, 4, overX) })).not.toBeNull();
      expect(move({ current: viewing(at, 4, overY) })).not.toBeNull();
    });

    it('this is what stops a repetitive tagging run from panning constantly', () => {
      // stepping along a row at moderate zoom keeps the next point in view
      const k = 2;
      let panned = 0;
      for (let col = 0; col < 5; col++) {
        const point = { x: (col + 0.5) / 5, y: 0.5 };
        const current = viewing({ x: 0.5, y: 0.5 }, k);
        if (recentreTarget({ at: point, fromCanvasClick: false, fitted, current, motion: 'smooth' })) {
          panned++;
        }
      }
      expect(panned).toBeLessThan(5);
    });
  });

  describe('motion preference', () => {
    it('off never moves the view at all', () => {
      expect(move({ motion: 'off' })).toBeNull();
    });

    it('instant moves without animating', () => {
      const decided = move({ motion: 'instant' });
      expect(decided?.transform).toEqual(centreOn(at, fitted, 3));
      expect(decided?.animate).toBe(false);
    });

    it('smooth animates a short move', () => {
      expect(move()?.animate).toBe(true);
    });
  });

  describe('long jumps cut instead of sweeping', () => {
    // A cut carries no optic flow, so it is easier on the eye than a long
    // fast pan — and at high zoom every move is a long one.
    const far = { x: 0.02, y: 0.02 };

    it('animates while the travel stays within a viewport', () => {
      const current = viewing(at, 2, { x: 300, y: 0 });
      expect(recentreTarget({ at, fromCanvasClick: false, fitted, current, motion: 'smooth' })?.animate).toBe(true);
    });

    it('cuts when the travel exceeds a viewport', () => {
      const current = centreOn({ x: 0.98, y: 0.98 }, fitted, 8);
      const decided = recentreTarget({ at: far, fromCanvasClick: false, fitted, current, motion: 'smooth' });
      expect(decided).not.toBeNull();
      expect(decided!.animate).toBe(false);
      expect(decided!.transform).toEqual(centreOn(far, fitted, 8));
    });

    it('still lands in exactly the same place either way', () => {
      const current = centreOn({ x: 0.98, y: 0.98 }, fitted, 8);
      const cut = recentreTarget({ at: far, fromCanvasClick: false, fitted, current, motion: 'smooth' });
      const instant = recentreTarget({ at: far, fromCanvasClick: false, fitted, current, motion: 'instant' });
      expect(cut!.transform).toEqual(instant!.transform);
    });
  });
});

describe('panDuration', () => {
  it('scales with distance, so long moves are not whipped across', () => {
    expect(panDuration(600)).toBeLessThan(panDuration(900));
  });

  it('never dips below the floor, however small the move', () => {
    expect(panDuration(0)).toBe(PAN_MIN_MS);
    expect(panDuration(5)).toBe(PAN_MIN_MS);
  });

  it('never exceeds the ceiling, however large the move', () => {
    expect(panDuration(100000)).toBe(PAN_MAX_MS);
  });

  it('holds the target velocity in between', () => {
    const distance = 480; // 400ms at 1200px/s
    expect(panDuration(distance)).toBeCloseTo(400, 6);
  });

  it('treats direction as irrelevant', () => {
    expect(panDuration(-300)).toBe(panDuration(300));
  });
});

describe('fitRingTransform', () => {
  // A square image fitted to a square SVG box, inside a wider panel — the
  // letterboxed case the function exists to handle.
  const fitted = { width: 600, height: 600 };
  const viewport = { width: 1000, height: 600 };
  const square = (a: number, b: number): Vec2[] => [
    { x: a, y: a },
    { x: b, y: a },
    { x: b, y: b },
    { x: a, y: b },
  ];

  /** Where a normalized point lands on screen under `t`. */
  const project = (p: Vec2, t: { k: number; x: number; y: number }) => ({
    x: t.x + t.k * p.x * fitted.width,
    y: t.y + t.k * p.y * fitted.height,
  });

  it('scales the ring to the binding axis, less the margin', () => {
    // 0.25–0.75 of a 600px box = a 300px square; the 600px-high viewport
    // binds on height: (600 - 60) / 300 = 1.8
    const t = fitRingTransform(square(0.25, 0.75), fitted, viewport)!;
    expect(t.k).toBeCloseTo(1.8, 6);
  });

  it('leaves exactly the margin on the axis it hits first', () => {
    const ring = square(0.25, 0.75);
    const t = fitRingTransform(ring, fitted, viewport)!;
    const top = project({ x: 0.25, y: 0.25 }, t);
    const bottom = project({ x: 0.75, y: 0.75 }, t);
    // The viewport's centre coincides with the SVG box's centre, so the
    // panel's top edge sits above the SVG's by half the difference.
    const overhangY = (viewport.height - fitted.height) / 2;
    expect(top.y + overhangY).toBeCloseTo(FIT_MARGIN_PX, 6);
    expect(bottom.y + overhangY).toBeCloseTo(viewport.height - FIT_MARGIN_PX, 6);
  });

  it('gives the non-binding axis more room than the margin', () => {
    const ring = square(0.25, 0.75);
    const t = fitRingTransform(ring, fitted, viewport)!;
    const left = project({ x: 0.25, y: 0.25 }, t);
    const overhangX = (viewport.width - fitted.width) / 2;
    expect(left.x + overhangX).toBeGreaterThan(FIT_MARGIN_PX);
  });

  it('binds on width when the ring is wider than the viewport aspect', () => {
    const wide: Vec2[] = [
      { x: 0.05, y: 0.45 },
      { x: 0.95, y: 0.45 },
      { x: 0.95, y: 0.55 },
      { x: 0.05, y: 0.55 },
    ];
    // 540px wide, 60px tall; width gives (1000-60)/540 = 1.74,
    // height would give (600-60)/60 = 9 — width binds.
    const t = fitRingTransform(wide, fitted, viewport)!;
    expect(t.k).toBeCloseTo((viewport.width - 2 * FIT_MARGIN_PX) / 540, 6);
  });

  it('centres the ring, not the image', () => {
    // A ring off in one corner still ends up in the middle of the view.
    const corner = square(0.05, 0.25);
    const t = fitRingTransform(corner, fitted, viewport)!;
    const centre = project({ x: 0.15, y: 0.15 }, t);
    expect(centre.x).toBeCloseTo(fitted.width / 2, 6);
    expect(centre.y).toBeCloseTo(fitted.height / 2, 6);
  });

  it('honours a caller-supplied margin', () => {
    const ring = square(0.25, 0.75);
    const tight = fitRingTransform(ring, fitted, viewport, 0)!;
    expect(tight.k).toBeCloseTo(viewport.height / 300, 6);
    expect(tight.k).toBeGreaterThan(fitRingTransform(ring, fitted, viewport)!.k);
  });

  it('never asks for a zoom outside what d3-zoom allows', () => {
    // A ring far smaller than a pixel would want an enormous scale.
    const speck: Vec2[] = [
      { x: 0.5, y: 0.5 },
      { x: 0.5000001, y: 0.5 },
      { x: 0.5000001, y: 0.5000001 },
      { x: 0.5, y: 0.5000001 },
    ];
    expect(fitRingTransform(speck, fitted, viewport)!.k).toBe(ZOOM_EXTENT[1]);

    // and the floor, for a ring in a viewport barely larger than the margin
    const huge: Vec2[] = [
      { x: 0, y: 0 },
      { x: 1e6, y: 0 },
      { x: 1e6, y: 1e6 },
      { x: 0, y: 1e6 },
    ];
    expect(fitRingTransform(huge, fitted, viewport)!.k).toBe(ZOOM_EXTENT[0]);
  });

  describe('declines to frame', () => {
    it('a ring that is not a polygon', () => {
      expect(fitRingTransform([], fitted, viewport)).toBeNull();
      expect(fitRingTransform(square(0.2, 0.8).slice(0, 2), fitted, viewport)).toBeNull();
    });

    it('an unmeasured image box', () => {
      expect(fitRingTransform(square(0.2, 0.8), { width: 0, height: 0 }, viewport)).toBeNull();
      expect(fitRingTransform(square(0.2, 0.8), { width: 600, height: 0 }, viewport)).toBeNull();
    });

    it('an unmeasured viewport', () => {
      expect(fitRingTransform(square(0.2, 0.8), fitted, { width: 0, height: 0 })).toBeNull();
      expect(fitRingTransform(square(0.2, 0.8), fitted, { width: 900, height: 0 })).toBeNull();
    });

    it('a ring with no area, which has no aspect to match', () => {
      const flat: Vec2[] = [
        { x: 0.2, y: 0.5 },
        { x: 0.5, y: 0.5 },
        { x: 0.8, y: 0.5 },
      ];
      expect(fitRingTransform(flat, fitted, viewport)).toBeNull();
      const upright: Vec2[] = [
        { x: 0.5, y: 0.2 },
        { x: 0.5, y: 0.5 },
        { x: 0.5, y: 0.8 },
      ];
      expect(fitRingTransform(upright, fitted, viewport)).toBeNull();
    });

    it('a viewport too small to hold the margin', () => {
      const ring = square(0.2, 0.8);
      expect(fitRingTransform(ring, fitted, { width: 50, height: 400 })).toBeNull();
      expect(fitRingTransform(ring, fitted, { width: 400, height: 50 })).toBeNull();
    });
  });
});

describe('interpolateTransform', () => {
  const centre = { x: 300, y: 300 };
  const from = { k: 1, x: 0, y: 0 };
  const to = { k: 4, x: -900, y: -300 };

  it('starts exactly where it started', () => {
    expect(interpolateTransform(from, to, centre, 0)).toEqual(from);
  });

  it('lands exactly on the target', () => {
    const end = interpolateTransform(from, to, centre, 1);
    expect(end.k).toBeCloseTo(to.k, 9);
    expect(end.x).toBeCloseTo(to.x, 9);
    expect(end.y).toBeCloseTo(to.y, 9);
  });

  it('clamps progress outside 0–1 rather than overshooting', () => {
    expect(interpolateTransform(from, to, centre, -3)).toEqual(
      interpolateTransform(from, to, centre, 0)
    );
    expect(interpolateTransform(from, to, centre, 7)).toEqual(
      interpolateTransform(from, to, centre, 1)
    );
  });

  it('interpolates scale geometrically, not linearly', () => {
    // halfway from 1x to 4x is 2x (the geometric mean), not 2.5x
    expect(interpolateTransform(from, to, centre, 0.5).k).toBeCloseTo(2, 9);
  });

  it('keeps the framed point in the middle of the view throughout', () => {
    // The point `to` centres is the one the animation should hold on to.
    const focus = { x: (centre.x - to.x) / to.k, y: (centre.y - to.y) / to.k };
    const startOnScreen = {
      x: from.x + from.k * focus.x,
      y: from.y + from.k * focus.y,
    };
    for (const t of [0.25, 0.5, 0.75]) {
      const m = interpolateTransform(from, to, centre, t);
      const onScreen = { x: m.x + m.k * focus.x, y: m.y + m.k * focus.y };
      // straight line from where it was to the centre
      expect(onScreen.x).toBeCloseTo(startOnScreen.x + (centre.x - startOnScreen.x) * t, 9);
      expect(onScreen.y).toBeCloseTo(startOnScreen.y + (centre.y - startOnScreen.y) * t, 9);
    }
  });

  it('reduces to a plain linear translate when the zoom does not change', () => {
    // This is the sample-to-sample pan, whose behaviour must not have moved.
    const a = { k: 2.5, x: 40, y: -60 };
    const b = { k: 2.5, x: -200, y: 130 };
    for (const t of [0, 0.3, 0.7, 1]) {
      const m = interpolateTransform(a, b, centre, t);
      expect(m.k).toBeCloseTo(2.5, 9);
      expect(m.x).toBeCloseTo(a.x + (b.x - a.x) * t, 9);
      expect(m.y).toBeCloseTo(a.y + (b.y - a.y) * t, 9);
    }
  });
});

describe('the zoom floor is the fill state', () => {
  // The floor of 1 is only correct because of this invariant: the SVG is
  // sized to fitContain, so at k = 1 the image already meets the panel on one
  // axis. If fitContain ever stopped being a contain-fit, the floor would
  // silently start meaning something else.
  it('fitContain always fills at least one axis exactly', () => {
    const cases: [number, number, number][] = [
      [1000, 600, 4 / 3], // panel wider than the image: height binds
      [600, 1000, 4 / 3], // panel taller: width binds
      [800, 800, 2], // square panel, wide image
      [800, 800, 0.5], // square panel, tall image
      [1280, 720, 1280 / 720], // aspects match: both fill
      [937, 611, 1.618],
    ];
    for (const [cw, ch, aspect] of cases) {
      const f = fitContain(cw, ch, aspect);
      const fillsWidth = Math.abs(f.width - cw) < 1e-9;
      const fillsHeight = Math.abs(f.height - ch) < 1e-9;
      expect(fillsWidth || fillsHeight, `${cw}x${ch} @ ${aspect}`).toBe(true);
      // and it never overflows the panel, which is what makes 1 a *floor*
      expect(f.width).toBeLessThanOrEqual(cw + 1e-9);
      expect(f.height).toBeLessThanOrEqual(ch + 1e-9);
    }
  });

  it('is set to that scale', () => {
    expect(ZOOM_EXTENT[0]).toBe(1);
  });

  it('clamps a quadrat that wants to sit further out than the whole image', () => {
    // A ring covering the entire image cannot have its 30px margin without
    // zooming out past fill, so it frames at the floor instead.
    const fitted = { width: 600, height: 600 };
    const viewport = { width: 1000, height: 600 };
    const whole: Vec2[] = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 1, y: 1 },
      { x: 0, y: 1 },
    ];
    // unclamped this would be (600 - 60) / 600 = 0.9
    expect(fitRingTransform(whole, fitted, viewport)!.k).toBe(1);
  });
});
