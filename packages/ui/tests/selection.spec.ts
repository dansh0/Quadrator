import { describe, expect, it } from 'vitest';
import { Picker } from '../src/selection.ts';

// Square box: display px and normalized deltas differ only by a factor of
// 400, which keeps the arithmetic in these cases easy to read.
const BOX = { width: 400, height: 400 };
// Deliberately non-square, to catch a radius measured in normalized space
// (which would be an ellipse on screen).
const WIDE = { width: 800, height: 200 };

const at = (x: number, y: number) => ({ x, y });

describe('Picker', () => {
  const picker = new Picker<string>(20);

  it('rejects a radius that could never select anything', () => {
    expect(() => new Picker<string>(0)).toThrow(RangeError);
    expect(() => new Picker<string>(-5)).toThrow(RangeError);
  });

  it('selects a target the click landed near but not on', () => {
    const targets = [{ value: 'a', at: at(0.5, 0.5) }];
    // 0.53 → 12px away, well outside the 7px dot but inside the 20px radius
    const hit = picker.nearest(targets, at(0.53, 0.5), BOX);
    expect(hit?.value).toBe('a');
    expect(hit?.distance).toBeCloseTo(12, 6);
  });

  it('returns null for a click on empty canvas', () => {
    const targets = [{ value: 'a', at: at(0.5, 0.5) }];
    expect(picker.nearest(targets, at(0.9, 0.9), BOX)).toBeNull();
    expect(picker.nearest([], at(0.5, 0.5), BOX)).toBeNull();
  });

  it('cuts off at the radius', () => {
    const targets = [{ value: 'a', at: at(0.5, 0.5) }];
    // 19.6px in, 20.4px out — the exact boundary is left unspecified rather
    // than pinned, since a float comparison there proves nothing useful
    expect(picker.nearest(targets, at(0.549, 0.5), BOX)?.value).toBe('a');
    expect(picker.nearest(targets, at(0.551, 0.5), BOX)).toBeNull();
  });

  describe('overlapping hit areas', () => {
    // 24px apart, so their 20px radii overlap in the middle
    const targets = [
      { value: 'left', at: at(0.47, 0.5) },
      { value: 'right', at: at(0.53, 0.5) },
    ];

    it('picks the nearer target, not the first', () => {
      expect(picker.nearest(targets, at(0.52, 0.5), BOX)?.value).toBe('right');
    });

    it('picks the nearer target, not the last', () => {
      expect(picker.nearest(targets, at(0.48, 0.5), BOX)?.value).toBe('left');
    });

    it('is unaffected by the order the candidates arrive in', () => {
      const reversed = [...targets].reverse();
      expect(picker.nearest(reversed, at(0.52, 0.5), BOX)?.value).toBe('right');
      expect(picker.nearest(reversed, at(0.48, 0.5), BOX)?.value).toBe('left');
    });

    it('breaks an exact tie deterministically, on the earlier candidate', () => {
      expect(picker.nearest(targets, at(0.5, 0.5), BOX)?.value).toBe('left');
      expect(picker.nearest([...targets].reverse(), at(0.5, 0.5), BOX)?.value).toBe('right');
    });

    it('still finds the nearer of three crowded targets', () => {
      const crowd = [
        { value: 'a', at: at(0.5, 0.5) },
        { value: 'b', at: at(0.54, 0.5) },
        { value: 'c', at: at(0.58, 0.5) },
      ];
      expect(picker.nearest(crowd, at(0.545, 0.5), BOX)?.value).toBe('b');
    });
  });

  it('measures the radius in display px, so it stays a circle on a wide image', () => {
    const targets = [{ value: 'a', at: at(0.5, 0.5) }];
    // 0.025 normalized on x = 20px on this box; the same normalized offset on
    // y is only 5px. A radius applied in normalized space would reject the
    // first and accept the second at four times the on-screen distance.
    expect(picker.nearest(targets, at(0.525, 0.5), WIDE)?.distance).toBeCloseTo(20, 6);
    expect(picker.nearest(targets, at(0.5, 0.525), WIDE)?.distance).toBeCloseTo(5, 6);
    // 0.1 on y is 20px — still inside; on x it would be 80px and outside
    expect(picker.nearest(targets, at(0.5, 0.6), WIDE)?.value).toBe('a');
    expect(picker.nearest(targets, at(0.6, 0.5), WIDE)).toBeNull();
  });

  it('scales the reach with the overlay, so the hit area tracks the mark', () => {
    const targets = [{ value: 'a', at: at(0.5, 0.5) }];
    const point = at(0.56, 0.5); // 24px away: outside a 20px reach
    expect(picker.nearest(targets, point, BOX)).toBeNull();
    expect(picker.nearest(targets, point, BOX, 1.5)?.value).toBe('a');
    expect(picker.nearest(targets, point, BOX, 0.5)).toBeNull();
  });

  it('selects nothing before the canvas has been measured', () => {
    const targets = [{ value: 'a', at: at(0.5, 0.5) }];
    expect(picker.nearest(targets, at(0.5, 0.5), { width: 0, height: 0 })).toBeNull();
  });

  it('hits() answers the same question as nearest(), for cursor feedback', () => {
    const targets = [{ value: 'a', at: at(0.5, 0.5) }];
    expect(picker.hits(targets, at(0.53, 0.5), BOX)).toBe(true);
    expect(picker.hits(targets, at(0.9, 0.9), BOX)).toBe(false);
  });

  it('works with any target type, not just indices', () => {
    const vertices = new Picker<{ id: string }>(20);
    const targets = [{ value: { id: 'v0' }, at: at(0.5, 0.5) }];
    expect(vertices.nearest(targets, at(0.51, 0.5), BOX)?.value).toEqual({ id: 'v0' });
  });
});
