import { vi } from 'vitest';

// Deterministic stand-in for Math.random (mulberry32 PRNG).
// Usage: const restore = seedMathRandom(42); ... restore();
export function seedMathRandom(seed = 1) {
    let a = seed >>> 0;
    const rng = () => {
        a |= 0;
        a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const spy = vi.spyOn(Math, 'random').mockImplementation(rng);
    return () => spy.mockRestore();
}

// Ray-casting point-in-polygon on normalized {x, y} vertices.
// `polygon` is an open ring (first vertex NOT repeated at the end).
export function pointInPolygon(point, polygon) {
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        const xi = polygon[i].x, yi = polygon[i].y;
        const xj = polygon[j].x, yj = polygon[j].y;
        const intersect = ((yi > point.y) !== (yj > point.y)) &&
            (point.x < ((xj - xi) * (point.y - yi)) / (yj - yi) + xi);
        if (intersect) inside = !inside;
    }
    return inside;
}

// A closed unit-square ring (5 nodes, last === first), as the app produces
// after the user clicks 4 corners and the first node is re-appended.
export function closedUnitSquare() {
    return [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
        { x: 1, y: 1 },
        { x: 0, y: 1 },
        { x: 0, y: 0 }
    ];
}

// A realistic hand-clicked square: nearly axis-aligned but not perfectly.
// randomSamplePointsRect degenerates on mathematically perfect alignment
// (d3.range gets a zero step - see the characterization test), and real
// clicks are never pixel-perfect, so rect tests use this shape.
export function closedClickedSquare() {
    return [
        { x: 0.011, y: 0.013 },
        { x: 0.989, y: 0.017 },
        { x: 0.993, y: 0.991 },
        { x: 0.009, y: 0.987 },
        { x: 0.011, y: 0.013 }
    ];
}

export const speciesListFixture = [
    { code: 'Anom', species: 'Anthopleura_sp', group1: 'Animal', group2: 'Intertidal sessile' },
    { code: 'Barn', species: 'Cirripedia_spp', group1: 'Animal', group2: 'Intertidal sessile' },
    { code: 'Ulva', species: 'Ulva sp., green', group1: 'Algae', group2: 'Intertidal' }
];
