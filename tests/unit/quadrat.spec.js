import { describe, it, expect, afterEach, vi } from 'vitest';
import { Quadrat } from '../../src/dataModel/quadrat.js';
import { ipcRenderer } from '../mocks/electron.js';
import { seedMathRandom, pointInPolygon, closedUnitSquare, closedClickedSquare, speciesListFixture } from './helpers.js';

// Split a CSV line into fields, honoring double-quote escaping
function parseCsvLine(line) {
    const fields = [];
    let field = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
        const c = line[i];
        if (inQuotes) {
            if (c === '"' && line[i + 1] === '"') { field += '"'; i++; }
            else if (c === '"') { inQuotes = false; }
            else { field += c; }
        } else if (c === '"') {
            inQuotes = true;
        } else if (c === ',') {
            fields.push(field); field = '';
        } else {
            field += c;
        }
    }
    fields.push(field);
    return fields;
}

afterEach(() => {
    vi.restoreAllMocks();
    ipcRenderer.invoke.reset();
});

describe('Quadrat constructor', () => {
    it('derives its name from the image filename', () => {
        const q = new Quadrat(25, '/photos/B3_1Y_T1.JPG');
        expect(q.name).toBe('B3_1Y_T1');
    });

    it('initializes the requested number of empty samples', () => {
        const q = new Quadrat(25, '/photos/a.jpg');
        expect(q.samples).toHaveLength(25);
        q.samples.forEach(s => {
            expect(s.x).toBeUndefined();
            expect(s.y).toBeUndefined();
            expect(s.codes).toEqual([]);
        });
        expect(q.geoDefined).toBe(false);
        expect(q.cutLines).toEqual([]);
    });
});

describe('Quadrat.quadratFromSavedData', () => {
    it('restores fields from saved data', () => {
        const saved = {
            numOfSamples: 4,
            imgSrc: '/photos/a.jpg',
            name: 'custom name',
            samples: [{ sampleNumber: 0, x: 0.5, y: 0.5, codes: ['Anom'] }],
            cutLines: [[{ x: 0, y: 0 }, { x: 1, y: 1 }]],
            geoDefined: true
        };
        const q = Quadrat.quadratFromSavedData(saved);
        expect(q.name).toBe('custom name');
        expect(q.samples).toEqual(saved.samples);
        expect(q.cutLines).toEqual(saved.cutLines);
        expect(q.geoDefined).toBe(true);
    });

    it('falls back to filename-derived name and safe defaults', () => {
        const q = Quadrat.quadratFromSavedData({ numOfSamples: 2, imgSrc: '/p/img7.png' });
        expect(q.name).toBe('img7');
        expect(q.samples).toEqual([]);
        expect(q.geoDefined).toBe(false);
    });
});

describe('Quadrat.resetSamples', () => {
    it('clears coordinates, codes, cut lines and polygons', () => {
        const q = new Quadrat(4, '/p/a.jpg');
        q.samples[0].x = 0.5;
        q.samples[0].codes.push('Anom');
        q.cutLines.push([{ x: 0, y: 0 }, { x: 1, y: 1 }]);
        q.resetSamples();
        expect(q.samples).toHaveLength(4);
        expect(q.samples[0].x).toBeUndefined();
        expect(q.samples[0].codes).toEqual([]);
        expect(q.cutLines).toEqual([]);
        expect(q.polygons).toEqual([]);
    });
});

describe('Quadrat.randomSamplePointsRect', () => {
    it('places rows*cols stratified points inside a clicked square', () => {
        const restore = seedMathRandom(42);
        const q = new Quadrat(25, '/p/a.jpg');
        q.randomSamplePointsRect(closedClickedSquare(), 5, 5);
        restore();

        expect(q.samples).toHaveLength(25);
        const openRing = closedClickedSquare().slice(0, 4);
        q.samples.forEach((s, i) => {
            expect(s.sampleNumber).toBe(i);
            expect(pointInPolygon(s, openRing)).toBe(true);
        });
    });

    it('stratifies: exactly one point per grid cell', () => {
        const restore = seedMathRandom(7);
        const q = new Quadrat(25, '/p/a.jpg');
        q.randomSamplePointsRect(closedClickedSquare(), 5, 5);
        restore();

        // recover each point's stratum from the H-bridge interpolation:
        // x ~ lerp along the top edge, y ~ lerp along the left edge
        const seenCells = new Set();
        q.samples.forEach(s => {
            const cell = `${Math.floor(((s.x - 0.011) / (0.989 - 0.011)) * 5)},` +
                `${Math.floor(((s.y - 0.017) / (0.991 - 0.017)) * 5)}`;
            seenCells.add(cell);
        });
        expect(seenCells.size).toBe(25);
    });

    // KNOWN QUIRK (audit B11): a mathematically perfect axis-aligned square
    // makes the edge interpolation call d3.range with a zero step, which
    // returns [] - so NO sample points are produced at all. Unreachable via
    // hand clicks, but pinned here so the core rewrite fixes it consciously.
    it('produces no points for a perfectly axis-aligned square (characterization)', () => {
        const restore = seedMathRandom(42);
        const q = new Quadrat(25, '/p/a.jpg');
        q.randomSamplePointsRect(closedUnitSquare(), 5, 5);
        restore();
        expect(q.samples.every(s => s.x === undefined)).toBe(true);
    });

    it('keeps points inside a skewed (non-axis-aligned) quadrat', () => {
        const restore = seedMathRandom(3);
        // a rotated/skewed quadrilateral, closed ring
        const nodes = [
            { x: 0.2, y: 0.1 },
            { x: 0.9, y: 0.25 },
            { x: 0.8, y: 0.9 },
            { x: 0.1, y: 0.75 },
            { x: 0.2, y: 0.1 }
        ];
        const q = new Quadrat(25, '/p/a.jpg');
        q.randomSamplePointsRect(nodes, 5, 5);
        restore();

        const openRing = nodes.slice(0, 4);
        q.samples.forEach(s => {
            expect(Number.isFinite(s.x)).toBe(true);
            expect(pointInPolygon(s, openRing)).toBe(true);
        });
    });

    it('is deterministic for a fixed random sequence', () => {
        const run = () => {
            const restore = seedMathRandom(99);
            const q = new Quadrat(25, '/p/a.jpg');
            q.randomSamplePointsRect(closedClickedSquare(), 5, 5);
            restore();
            return q.samples.map(s => [s.x, s.y]);
        };
        expect(run()).toEqual(run());
        expect(run().every(([x]) => Number.isFinite(x))).toBe(true);
    });
});

describe('Quadrat.randomSamplePointsPoly', () => {
    it('places one point per sample, all inside the polygon', () => {
        const restore = seedMathRandom(11);
        // an irregular pentagon, closed ring
        const nodes = [
            { x: 0.5, y: 0.05 },
            { x: 0.95, y: 0.4 },
            { x: 0.75, y: 0.9 },
            { x: 0.25, y: 0.9 },
            { x: 0.05, y: 0.4 },
            { x: 0.5, y: 0.05 }
        ];
        const q = new Quadrat(9, '/p/a.jpg');
        q.randomSamplePointsPoly(nodes);
        restore();

        expect(ipcRenderer.invoke.calls).toHaveLength(0); // no error alert fired
        const openRing = nodes.slice(0, nodes.length - 1);
        expect(q.samples).toHaveLength(9);
        q.samples.forEach((s, i) => {
            expect(s.sampleNumber).toBe(i);
            expect(Number.isFinite(s.x)).toBe(true);
            expect(Number.isFinite(s.y)).toBe(true);
            expect(pointInPolygon(s, openRing)).toBe(true);
        });
    });

    it('cuts the polygon into numOfSamples pieces of roughly equal area', () => {
        const restore = seedMathRandom(5);
        const q = new Quadrat(4, '/p/a.jpg');
        q.randomSamplePointsPoly(closedUnitSquare());
        restore();

        expect(q.polygons).toHaveLength(4);
        // total polygon is the unit square scaled by 1000 => area 1e6; each piece ~2.5e5
        const areas = q.polygons.map(p => p.countSquare());
        const total = areas.reduce((a, b) => a + b, 0);
        expect(total).toBeCloseTo(1e6, -1);
        areas.forEach(a => {
            expect(a).toBeGreaterThan(0.9 * 2.5e5);
            expect(a).toBeLessThan(1.1 * 2.5e5);
        });
    });
});

describe('Quadrat._getPolygonBBox (characterization)', () => {
    // KNOWN QUIRK (audit B5): min and max are swapped - `min` accumulates the
    // largest coordinates and `max` the smallest. Downstream sampling still
    // spans the correct range because linear interpolation is symmetric.
    // This test pins the CURRENT behavior; fix names/init when extracting core.
    it('returns inverted min/max fields', () => {
        const restore = seedMathRandom(1);
        const q = new Quadrat(1, '/p/a.jpg');
        q.randomSamplePointsPoly(closedUnitSquare());
        restore();

        const bbox = q._getPolygonBBox(q.polygons[0]);
        expect(bbox.min.x).toBeGreaterThanOrEqual(bbox.max.x); // inverted!
        expect(bbox.min.y).toBeGreaterThanOrEqual(bbox.max.y); // inverted!
    });
});

describe('Quadrat.toCSV', () => {
    function taggedQuadrat() {
        const q = new Quadrat(4, '/photos/site1.jpg');
        q.samples[0].codes = ['Anom'];
        q.samples[1].codes = ['Anom', 'Ulva'];
        q.samples[2].codes = [];
        q.samples[3].codes = [];
        return q;
    }

    it('produces one row per code with count and coverage', () => {
        const csv = taggedQuadrat().toCSV(speciesListFixture);
        const lines = csv.trim().split('\n');
        expect(lines).toHaveLength(2);

        const anom = parseCsvLine(lines[0]);
        expect(anom).toHaveLength(8);
        expect(anom[0]).toBe('site1');
        expect(anom[3]).toBe('Anom');
        expect(anom[4]).toBe('Anthopleura_sp');
        expect(anom[5]).toBe('Animal - Intertidal sessile');
        expect(anom[6]).toBe('2');       // count
        expect(anom[7]).toBe('50');      // coverage % of 4 samples
    });

    it('escapes fields containing commas', () => {
        const csv = taggedQuadrat().toCSV(speciesListFixture);
        const ulvaLine = csv.trim().split('\n').find(l => l.includes('Ulva'));
        expect(ulvaLine).toContain('"Ulva sp., green"');
        const fields = parseCsvLine(ulvaLine);
        expect(fields).toHaveLength(8);
        expect(fields[4]).toBe('Ulva sp., green');
    });

    it('exports codes missing from the species list as UNKNOWN CODE instead of crashing', () => {
        const q = taggedQuadrat();
        q.samples[2].codes = ['Zzz'];
        const csv = q.toCSV(speciesListFixture);
        const zzzLine = csv.trim().split('\n').find(l => l.includes('Zzz'));
        expect(zzzLine).toBeDefined();
        const fields = parseCsvLine(zzzLine);
        expect(fields[4]).toBe('UNKNOWN CODE');
        expect(fields[6]).toBe('1');
    });

    it('escapes double quotes by doubling them', () => {
        const q = taggedQuadrat();
        q.name = 'site "A" west';
        const csv = q.toCSV(speciesListFixture);
        const fields = parseCsvLine(csv.trim().split('\n')[0]);
        expect(fields[0]).toBe('site "A" west');
    });

    it('returns an empty string for an untagged quadrat', () => {
        const q = new Quadrat(4, '/photos/site1.jpg');
        expect(q.toCSV(speciesListFixture)).toBe('');
    });
});
