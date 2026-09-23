import { describe, expect, it } from 'vitest';
import { GeometryError, isPointInside } from '../src/geometry/polygon.ts';
import {
  GRID_ORIGINS,
  GridOrigin,
  gridCellCounts,
  rectGridLines,
  sampleRectGrid,
} from '../src/sampling/grid.ts';
import { clickedSquare, unitSquare } from './helpers.ts';

describe('sampleRectGrid', () => {
  it('centres land at exact cell midpoints of an axis-aligned square', () => {
    const points = sampleRectGrid(unitSquare, 2, 2, 'center');
    expect(points).toEqual([
      { x: 0.25, y: 0.25 },
      { x: 0.75, y: 0.25 },
      { x: 0.25, y: 0.75 },
      { x: 0.75, y: 0.75 },
    ]);
  });

  it('indexes points as row * cols + col, matching sampleRect', () => {
    const rows = 3;
    const cols = 4;
    const points = sampleRectGrid(unitSquare, rows, cols, 'center');
    expect(points).toHaveLength(rows * cols);
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const p = points[row * cols + col]!;
        expect(p.x).toBeCloseTo((col + 0.5) / cols, 12);
        expect(p.y).toBeCloseTo((row + 0.5) / rows, 12);
      }
    }
  });

  it.each([
    ['top-left', { x: 0, y: 0 }],
    ['top-right', { x: 0.5, y: 0 }],
    ['bottom-left', { x: 0, y: 0.5 }],
    ['bottom-right', { x: 0.5, y: 0.5 }],
  ] as const)('origin %s puts cell (0,0) at its named corner', (origin, expected) => {
    // 2×2 on the unit square: cell (0,0) spans x 0–0.5, y 0–0.5, and y grows
    // downward in image coordinates, so "top" is y = 0.
    expect(sampleRectGrid(unitSquare, 2, 2, origin)[0]).toEqual(expected);
  });

  it('corner origins put edge points exactly ON the quadrat boundary', () => {
    // Choosing a corner means accepting points on the edge: the outermost
    // cells' corners ARE the quadrat's own corners. (isPointInside is not
    // asserted here — PNPOLY is undefined exactly on the boundary.)
    const corners = sampleRectGrid(unitSquare, 2, 2, 'top-left');
    expect(corners[0]).toEqual({ x: 0, y: 0 });
    expect(sampleRectGrid(unitSquare, 2, 2, 'bottom-right')[3]).toEqual({ x: 1, y: 1 });
  });

  it('centres are strictly inside even a skewed, click-defined quadrat', () => {
    const points = sampleRectGrid(clickedSquare, 5, 5, 'center');
    expect(points).toHaveLength(25);
    for (const p of points) {
      expect(isPointInside(clickedSquare, p)).toBe(true);
    }
  });

  it('is deterministic: no seed, identical output every call', () => {
    for (const origin of GRID_ORIGINS) {
      expect(sampleRectGrid(clickedSquare, 3, 3, origin)).toEqual(
        sampleRectGrid(clickedSquare, 3, 3, origin)
      );
    }
  });

  it('rejects non-quadrilateral rings, bad counts and zero area', () => {
    expect(() => sampleRectGrid(unitSquare.slice(0, 3), 2, 2, 'center')).toThrow(GeometryError);
    expect(() => sampleRectGrid(unitSquare, 0, 2, 'center')).toThrow(GeometryError);
    expect(() => sampleRectGrid(unitSquare, 2, 1.5, 'center')).toThrow(GeometryError);
    const degenerate = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 1, y: 0 },
      { x: 0, y: 0 },
    ];
    expect(() => sampleRectGrid(degenerate, 2, 2, 'center')).toThrow(GeometryError);
  });

  it('every listed origin is a real placement (no unhandled enum member)', () => {
    for (const origin of GRID_ORIGINS) {
      const p = sampleRectGrid(unitSquare, 1, 1, origin as GridOrigin)[0]!;
      expect(Number.isFinite(p.x) && Number.isFinite(p.y)).toBe(true);
    }
  });
});

describe('rectGridLines', () => {
  it('draws the interior cell boundaries only, never the quadrat outline', () => {
    const lines = rectGridLines(unitSquare, 3, 4);
    expect(lines).toHaveLength(3 - 1 + (4 - 1));
  });

  it('a 1×1 grid has no interior lines', () => {
    expect(rectGridLines(unitSquare, 1, 1)).toEqual([]);
  });

  it('lines span the quadrat at the cell fractions', () => {
    const lines = rectGridLines(unitSquare, 2, 2);
    // one vertical at x = 0.5, one horizontal at y = 0.5
    expect(lines).toEqual([
      [
        { x: 0.5, y: 0 },
        { x: 0.5, y: 1 },
      ],
      [
        { x: 0, y: 0.5 },
        { x: 1, y: 0.5 },
      ],
    ]);
  });

  it('rejects non-quadrilateral rings', () => {
    expect(() => rectGridLines(unitSquare.slice(0, 3), 2, 2)).toThrow(GeometryError);
  });
});

describe("sampleRectGrid: the 'fill' origin", () => {
  it('samples the grid intersections, boundary corners included', () => {
    // 3×3 points on the unit square: 0, 0.5, 1 on each axis
    expect(sampleRectGrid(unitSquare, 3, 3, 'fill')).toEqual([
      { x: 0, y: 0 },
      { x: 0.5, y: 0 },
      { x: 1, y: 0 },
      { x: 0, y: 0.5 },
      { x: 0.5, y: 0.5 },
      { x: 1, y: 0.5 },
      { x: 0, y: 1 },
      { x: 0.5, y: 1 },
      { x: 1, y: 1 },
    ]);
  });

  it('keeps the sample count at rows×cols, like every other origin', () => {
    for (const origin of GRID_ORIGINS) {
      expect(sampleRectGrid(unitSquare, 4, 6, origin)).toHaveLength(24);
    }
  });

  it('covers all four quadrat corners, which no per-cell origin does', () => {
    const corners = sampleRectGrid(unitSquare, 2, 2, 'fill');
    expect(corners).toEqual([
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 0, y: 1 },
      { x: 1, y: 1 },
    ]);
  });

  it('puts a lone point on an axis in the middle rather than on one edge', () => {
    expect(sampleRectGrid(unitSquare, 1, 3, 'fill')).toEqual([
      { x: 0, y: 0.5 },
      { x: 0.5, y: 0.5 },
      { x: 1, y: 0.5 },
    ]);
    expect(sampleRectGrid(unitSquare, 1, 1, 'fill')).toEqual([{ x: 0.5, y: 0.5 }]);
  });

  it('follows a skewed quadrat: edge points sit on its edges', () => {
    const points = sampleRectGrid(clickedSquare, 3, 3, 'fill');
    expect(points[0]).toEqual(clickedSquare[0]);
    expect(points[2]).toEqual(clickedSquare[1]);
    expect(points[6]).toEqual(clickedSquare[3]);
    expect(points[8]).toEqual(clickedSquare[2]);
  });

  it('keeps row * cols + col indexing', () => {
    const rows = 3;
    const cols = 4;
    const points = sampleRectGrid(unitSquare, rows, cols, 'fill');
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const p = points[row * cols + col]!;
        expect(p.x).toBeCloseTo(col / (cols - 1), 12);
        expect(p.y).toBeCloseTo(row / (rows - 1), 12);
      }
    }
  });
});

describe('gridCellCounts', () => {
  it('gives per-cell origins one cell per sample', () => {
    for (const origin of GRID_ORIGINS.filter((o) => o !== 'fill')) {
      expect(gridCellCounts(5, 4, origin)).toEqual({ cellRows: 5, cellCols: 4 });
    }
  });

  it("gives 'fill' one fewer division on each axis", () => {
    expect(gridCellCounts(5, 4, 'fill')).toEqual({ cellRows: 4, cellCols: 3 });
  });

  it('never collapses an axis below a single cell', () => {
    expect(gridCellCounts(1, 1, 'fill')).toEqual({ cellRows: 1, cellCols: 1 });
    expect(gridCellCounts(2, 1, 'fill')).toEqual({ cellRows: 1, cellCols: 1 });
  });
});
