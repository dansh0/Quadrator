import { describe, expect, it } from 'vitest';
import { mulberry32, randomSeed } from '../src/sampling/rng.ts';

describe('mulberry32', () => {
  it('same seed ⇒ identical sequence; different seed ⇒ different sequence', () => {
    const seq = (seed: number, n: number) => Array.from({ length: n }, mulberry32(seed));
    expect(seq(42, 20)).toEqual(seq(42, 20));
    expect(seq(42, 20)).not.toEqual(seq(43, 20));
  });

  it('emits values in [0, 1)', () => {
    const rng = mulberry32(123);
    for (let i = 0; i < 10_000; i++) {
      const v = rng();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('is roughly uniform (mean of 10k draws near 0.5)', () => {
    const rng = mulberry32(7);
    let sum = 0;
    for (let i = 0; i < 10_000; i++) sum += rng();
    expect(sum / 10_000).toBeGreaterThan(0.48);
    expect(sum / 10_000).toBeLessThan(0.52);
  });

  it('normalizes seeds through >>> 0 (negative and fractional seeds still deterministic)', () => {
    expect(mulberry32(-1)()).toBe(mulberry32(0xffffffff)());
    const a = mulberry32(1.7);
    const b = mulberry32(1.7);
    expect(a()).toBe(b());
  });
});

describe('randomSeed', () => {
  it('returns an unsigned 32-bit integer usable as a mulberry32 seed', () => {
    const s = randomSeed();
    expect(Number.isInteger(s)).toBe(true);
    expect(s).toBeGreaterThanOrEqual(0);
    expect(s).toBeLessThanOrEqual(0xffffffff);
    // the seed round-trips through the v1 schema convention (plain number)
    const v = mulberry32(s)();
    expect(v).toBeGreaterThanOrEqual(0);
    expect(v).toBeLessThan(1);
  });

  it('successive calls differ even within the same millisecond (internal counter)', () => {
    const seeds = new Set(Array.from({ length: 100 }, randomSeed));
    expect(seeds.size).toBe(100);
  });
});
