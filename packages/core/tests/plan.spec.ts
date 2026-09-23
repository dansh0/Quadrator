import { describe, expect, it } from 'vitest';
import { GeometryError, isPointInside } from '../src/geometry/polygon.ts';
import { rectGridLines, sampleRectGrid } from '../src/sampling/grid.ts';
import { SamplePlanSettings, planSamples } from '../src/sampling/plan.ts';
import { samplePolygon, samplePolygonCentres } from '../src/sampling/poly.ts';
import { sampleRect } from '../src/sampling/rect.ts';
import { mulberry32 } from '../src/sampling/rng.ts';
import { sampleUniform } from '../src/sampling/uniform.ts';
import { clickedSquare, pentagon, unitSquare } from './helpers.ts';

const settings = (over: Partial<SamplePlanSettings> = {}): SamplePlanSettings => ({
  numOfSampleRows: 3,
  numOfSampleCols: 3,
  sampling: 'stratified-random',
  gridOrigin: 'center',
  ...over,
});

describe('planSamples: quadrilateral rings', () => {
  it('stratified-random matches sampleRect exactly', () => {
    const plan = planSamples(clickedSquare, settings(), mulberry32(7));
    expect(plan.points).toEqual(sampleRect(clickedSquare, 3, 3, mulberry32(7)));
  });

  it('regular-grid matches sampleRectGrid exactly and ignores the rng', () => {
    const plan = planSamples(
      clickedSquare,
      settings({ sampling: 'regular-grid', gridOrigin: 'top-left' }),
      mulberry32(7)
    );
    expect(plan.points).toEqual(sampleRectGrid(clickedSquare, 3, 3, 'top-left'));
    // a different seed cannot change a deterministic grid
    expect(
      planSamples(
        clickedSquare,
        settings({ sampling: 'regular-grid', gridOrigin: 'top-left' }),
        mulberry32(999)
      ).points
    ).toEqual(plan.points);
  });

  it('random matches sampleUniform exactly', () => {
    const plan = planSamples(clickedSquare, settings({ sampling: 'random' }), mulberry32(7));
    expect(plan.points).toEqual(sampleUniform(clickedSquare, 9, mulberry32(7)));
  });

  it('draws grid lines for the stratified and grid modes, none for random', () => {
    expect(planSamples(unitSquare, settings(), mulberry32(1)).lines).toEqual(
      rectGridLines(unitSquare, 3, 3)
    );
    expect(
      planSamples(unitSquare, settings({ sampling: 'regular-grid' }), mulberry32(1)).lines
    ).toEqual(rectGridLines(unitSquare, 3, 3));
    expect(planSamples(unitSquare, settings({ sampling: 'random' }), mulberry32(1)).lines).toEqual(
      []
    );
  });
});

describe("planSamples: the 'fill' origin", () => {
  it('draws one fewer row and column of cells for the same point count', () => {
    const plan = planSamples(
      unitSquare,
      settings({ sampling: 'regular-grid', gridOrigin: 'fill', numOfSampleRows: 5, numOfSampleCols: 5 }),
      mulberry32(1)
    );
    expect(plan.points).toHaveLength(25);
    // a 4×4 grid has 3 interior lines each way; a 5×5 grid would have 4
    expect(plan.lines).toEqual(rectGridLines(unitSquare, 4, 4));
    expect(plan.lines).toHaveLength(6);
  });

  it('puts points on the grid lines, not inside the cells', () => {
    const plan = planSamples(
      unitSquare,
      settings({ sampling: 'regular-grid', gridOrigin: 'fill', numOfSampleRows: 3, numOfSampleCols: 3 }),
      mulberry32(1)
    );
    expect(plan.points).toEqual(sampleRectGrid(unitSquare, 3, 3, 'fill'));
    // the corners of the quadrat are sampled
    expect(plan.points).toContainEqual({ x: 0, y: 0 });
    expect(plan.points).toContainEqual({ x: 1, y: 1 });
  });

  it('still yields the same count as a centre grid, just placed differently', () => {
    const opts = { sampling: 'regular-grid' as const, numOfSampleRows: 4, numOfSampleCols: 3 };
    const centre = planSamples(unitSquare, settings({ ...opts, gridOrigin: 'center' }), mulberry32(1));
    const fill = planSamples(unitSquare, settings({ ...opts, gridOrigin: 'fill' }), mulberry32(1));
    expect(fill.points).toHaveLength(centre.points.length);
    expect(fill.points).not.toEqual(centre.points);
    expect(fill.lines.length).toBeLessThan(centre.lines.length);
  });
});

describe('planSamples: polygon rings', () => {
  it('stratified-random matches samplePolygon exactly, cuts included', () => {
    const plan = planSamples(pentagon, settings(), mulberry32(7));
    const direct = samplePolygon(pentagon, 9, mulberry32(7));
    expect(plan.points).toEqual(direct.points);
    expect(plan.lines).toEqual(direct.cutLines);
  });

  it('regular-grid places points at the centre of each equal-area piece', () => {
    const plan = planSamples(pentagon, settings({ sampling: 'regular-grid' }), mulberry32(7));
    const direct = samplePolygonCentres(pentagon, 9);
    expect(plan.points).toEqual(direct.points);
    expect(plan.lines).toEqual(direct.cutLines);
  });

  it("'fill' is ignored for polygons too — piece centres either way", () => {
    const centre = planSamples(
      pentagon,
      settings({ sampling: 'regular-grid', gridOrigin: 'center' }),
      mulberry32(1)
    );
    const fill = planSamples(
      pentagon,
      settings({ sampling: 'regular-grid', gridOrigin: 'fill' }),
      mulberry32(1)
    );
    expect(fill.points).toEqual(centre.points);
    expect(fill.lines).toEqual(centre.lines);
  });

  it('grid origin is ignored for polygons — there are no cell corners', () => {
    const centre = planSamples(
      pentagon,
      settings({ sampling: 'regular-grid', gridOrigin: 'center' }),
      mulberry32(1)
    );
    const corner = planSamples(
      pentagon,
      settings({ sampling: 'regular-grid', gridOrigin: 'bottom-right' }),
      mulberry32(1)
    );
    expect(corner.points).toEqual(centre.points);
  });

  it('random ignores the partition entirely', () => {
    const plan = planSamples(pentagon, settings({ sampling: 'random' }), mulberry32(7));
    expect(plan.lines).toEqual([]);
    expect(plan.points).toEqual(sampleUniform(pentagon, 9, mulberry32(7)));
  });
});

describe('planSamples: invariants across every mode', () => {
  const modes = ['stratified-random', 'regular-grid', 'random'] as const;
  const rings = [
    ['quadrilateral', clickedSquare],
    ['pentagon', pentagon],
  ] as const;

  it.each(
    modes.flatMap((sampling) => rings.map(([name, ring]) => [sampling, name, ring] as const))
  )('%s on a %s yields rows×cols points, all inside', (sampling, _name, ring) => {
    const plan = planSamples(ring, settings({ sampling, numOfSampleRows: 2, numOfSampleCols: 4 }), mulberry32(3));
    expect(plan.points).toHaveLength(8);
    for (const p of plan.points) {
      expect(isPointInside(ring, p)).toBe(true);
    }
  });

  it.each(modes)('%s is reproducible from the same seed', (sampling) => {
    const a = planSamples(pentagon, settings({ sampling }), mulberry32(12));
    const b = planSamples(pentagon, settings({ sampling }), mulberry32(12));
    expect(a.points).toEqual(b.points);
  });

  it.each(modes)('%s rejects a degenerate ring rather than returning points', (sampling) => {
    const degenerate = [
      { x: 0, y: 0 },
      { x: 1, y: 1 },
      { x: 2, y: 2 },
      { x: 3, y: 3 },
    ];
    expect(() => planSamples(degenerate, settings({ sampling }), mulberry32(1))).toThrow(
      GeometryError
    );
  });
});
