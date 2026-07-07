/**
 * Seeded pseudo-random number generation. The legacy app used bare
 * Math.random, which made sample layouts irreproducible; core takes an
 * explicit Rng everywhere so the same seed always reproduces the same
 * sample points (and sessions can store the seed — v1 schema `rngSeed`).
 */

/** Uniform random source over [0, 1). */
export type Rng = () => number;

/**
 * mulberry32 — small, fast, good-enough 32-bit PRNG. Same implementation as
 * tests/unit/helpers.js seedMathRandom, so legacy and core tests can share
 * expectations.
 */
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

let seedCounter = 0;

/** Non-cryptographic seed for "just give me a fresh layout" call sites. */
export function randomSeed(): number {
  seedCounter = (seedCounter + 0x9e3779b9) | 0;
  return (Date.now() ^ seedCounter) >>> 0;
}
