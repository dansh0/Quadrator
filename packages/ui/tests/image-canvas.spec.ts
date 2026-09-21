// @vitest-environment happy-dom
import {
  GridOrigin,
  InMemoryPlatformAdapter,
  QuadratShape,
  QuadratV2,
  SampleV2,
  SamplingMode,
} from '@quadrator/core';
import { DOMWrapper, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it } from 'vitest';
import { OVERLAY, imageSizerKey } from '../src/canvas.ts';
import ImageCanvas from '../src/components/ImageCanvas.vue';
import { platformKey } from '../src/platform.ts';
import { createAppVuetify } from '../src/plugins/vuetify.ts';
import { useSessionStore } from '../src/stores/session.ts';
import { useTaggingStore } from '../src/stores/tagging.ts';

const flush = () => new Promise((r) => setTimeout(r, 0));

// The component's fallback container size is 800×600 (happy-dom's
// ResizeObserver never reports a real size) and the stub sizer below returns
// the same aspect, so the fitted SVG is exactly 800×600: a click at
// normalized (nx, ny) is clientX = nx*800, clientY = ny*600
// (getBoundingClientRect is all zeros in happy-dom).
const FITTED = { width: 800, height: 600 };

function quadrat(overrides: Partial<QuadratV2> = {}): QuadratV2 {
  return {
    id: 'q1',
    imagePath: '/img/reef.jpg',
    name: 'reef',
    boundary: [],
    geoDefined: false,
    rngSeed: null,
    sampling: 'stratified-random',
    shape: 'n-poly',
    gridOrigin: 'center',
    samples: [],
    ...overrides,
  };
}

interface SetupOptions {
  quadrat?: QuadratV2;
  shape?: QuadratShape;
  sampling?: SamplingMode;
  gridOrigin?: GridOrigin;
  rows?: number;
  cols?: number;
  /** false = do not register the quadrat's image with the adapter. */
  imageAvailable?: boolean;
}

async function setup(options: SetupOptions = {}) {
  setActivePinia(createPinia());
  const platform = new InMemoryPlatformAdapter();
  const q = options.quadrat ?? quadrat();
  if (options.imageAvailable !== false) {
    platform.addImage({ id: q.imagePath, name: q.name });
  }

  const store = useSessionStore();
  store.newSession(new Date('2026-07-07T12:00:00.000Z'));
  store.session!.settings.shape = options.shape ?? 'n-poly';
  store.session!.settings.sampling = options.sampling ?? 'stratified-random';
  store.session!.settings.gridOrigin = options.gridOrigin ?? 'center';
  store.session!.settings.numOfSampleRows = options.rows ?? 2;
  store.session!.settings.numOfSampleCols = options.cols ?? 2;
  store.session!.quadrats.push(q);
  store.session!.currentQuadratId = q.id;
  store.dirty = false;

  const wrapper = mount(ImageCanvas, {
    global: {
      plugins: [createAppVuetify()],
      provide: {
        [platformKey as symbol]: platform,
        [imageSizerKey as symbol]: async () => ({ width: 1600, height: 1200 }),
      },
    },
  });
  await flush(); // let the image load settle
  return { wrapper, platform, store };
}

async function clickAt(
  svg: DOMWrapper<Element>,
  nx: number,
  ny: number,
  modifiers: { ctrlKey?: boolean } = {}
): Promise<void> {
  await svg.trigger('click', {
    clientX: nx * FITTED.width,
    clientY: ny * FITTED.height,
    ctrlKey: modifiers.ctrlKey ?? false,
  });
}

async function moveTo(
  svg: DOMWrapper<Element>,
  nx: number,
  ny: number,
  modifiers: { ctrlKey?: boolean } = {}
): Promise<void> {
  await svg.trigger('mousemove', {
    clientX: nx * FITTED.width,
    clientY: ny * FITTED.height,
    ctrlKey: modifiers.ctrlKey ?? false,
  });
}

/** Parse an SVG points="x,y x,y" attribute back into display-px pairs. */
function parsePoints(attr: string): { x: number; y: number }[] {
  return attr
    .trim()
    .split(/\s+/)
    .map((pair) => {
      const [x, y] = pair.split(',').map(Number);
      return { x: x!, y: y! };
    });
}

describe('ImageCanvas', () => {
  beforeEach(() => setActivePinia(createPinia()));

  it('loads and sizes the current quadrat image through the adapter', async () => {
    const { wrapper } = await setup();
    const image = wrapper.find('image');
    expect(image.exists()).toBe(true);
    expect(image.attributes('href')).toBe('memory:///img/reef.jpg');
    const svg = wrapper.find('[data-test="canvas-svg"]');
    expect(svg.attributes('width')).toBe('800');
    expect(svg.attributes('height')).toBe('600');
  });

  it('quad mode: four clicks define the boundary and generate rect samples', async () => {
    const { wrapper, store } = await setup({ shape: 'quad' });
    const svg = wrapper.find('[data-test="canvas-svg"]');

    await clickAt(svg, 0.1, 0.1);
    await clickAt(svg, 0.9, 0.1);
    expect(store.currentQuadrat!.geoDefined).toBe(false);
    expect(wrapper.find('[data-test="boundary-polyline"]').exists()).toBe(true);

    await clickAt(svg, 0.9, 0.9);
    await clickAt(svg, 0.1, 0.9); // 4th node auto-completes in quad mode

    const q = store.currentQuadrat!;
    expect(q.geoDefined).toBe(true);
    expect(q.boundary).toEqual([
      { x: 0.1, y: 0.1 },
      { x: 0.9, y: 0.1 },
      { x: 0.9, y: 0.9 },
      { x: 0.1, y: 0.9 },
    ]);
    expect(q.samples).toHaveLength(4); // 2×2 settings
    expect(q.rngSeed).not.toBeNull();
    expect(store.dirty).toBe(true);

    expect(wrapper.find('[data-test="boundary-polygon"]').exists()).toBe(true);
    expect(wrapper.findAll('circle[data-test^="sample-"]')).toHaveLength(4);
    // the cursor starts at sample 0, which renders as the crosshair
    const crosshair = wrapper.find('[data-test="crosshair"]');
    expect(crosshair.exists()).toBe(true);
    // four tapered arms converging on the sample
    expect(crosshair.findAll('[data-test="crosshair-arm"]')).toHaveLength(4);
  });

  it('poly mode: a click near the first node closes the ring', async () => {
    const { wrapper, store } = await setup();
    const svg = wrapper.find('[data-test="canvas-svg"]');

    await clickAt(svg, 0.1, 0.1);
    await clickAt(svg, 0.9, 0.1);
    await clickAt(svg, 0.9, 0.9);
    await clickAt(svg, 0.5, 0.7);
    await clickAt(svg, 0.1, 0.9);
    expect(store.currentQuadrat!.geoDefined).toBe(false);

    await clickAt(svg, 0.11, 0.11); // within the 0.025 close tolerance

    const q = store.currentQuadrat!;
    expect(q.geoDefined).toBe(true);
    expect(q.boundary).toHaveLength(5); // the closing click adds no node
    expect(q.samples).toHaveLength(4);
    // equal-area cut lines are recomputed from the stored seed
    expect(wrapper.findAll('[data-test="cut-line"]').length).toBeGreaterThan(0);
  });

  it('a degenerate ring surfaces the geometry error and commits nothing', async () => {
    const { wrapper, store } = await setup({ shape: 'quad' });
    const svg = wrapper.find('[data-test="canvas-svg"]');

    // bow-tie: zero-area ring
    await clickAt(svg, 0.1, 0.1);
    await clickAt(svg, 0.9, 0.9);
    await clickAt(svg, 0.9, 0.1);
    await clickAt(svg, 0.1, 0.9);

    expect(store.currentQuadrat!.geoDefined).toBe(false);
    expect(store.currentQuadrat!.samples).toEqual([]);
    expect(wrapper.find('[data-test="draw-error"]').exists()).toBe(true);
    // the failed drawing is cleared so the user can start over
    expect(wrapper.findAll('[data-test="node-circle"]')).toHaveLength(0);
  });

  it('clicking a sample point moves the cursor and jumps to Species ID', async () => {
    const samples: SampleV2[] = [
      { index: 0, x: 0.3, y: 0.3, codes: [] },
      { index: 1, x: 0.6, y: 0.6, codes: ['Ulva'] },
    ];
    const { wrapper } = await setup({
      quadrat: quadrat({
        boundary: [
          { x: 0.1, y: 0.1 },
          { x: 0.9, y: 0.1 },
          { x: 0.9, y: 0.9 },
          { x: 0.1, y: 0.9 },
        ],
        geoDefined: true,
        rngSeed: 42,
        samples,
      }),
    });

    expect(wrapper.find('[data-test="sample-1"]').attributes('fill')).toBe(
      OVERLAY.SAMPLE_TAGGED
    );
    // clicks are resolved against the canvas, not the dot's own hit area
    await clickAt(wrapper.find('[data-test="canvas-svg"]'), 0.6, 0.6);

    const tagging = useTaggingStore();
    expect(tagging.cursor).toBe(1);
    expect(tagging.activeTab).toBe('species');
    // the newly current sample now renders as the crosshair
    expect(wrapper.find('[data-test="sample-1"]').attributes('fill')).toBe('none');
  });

  it('missing image offers re-link and recovers through the adapter', async () => {
    const { wrapper, platform, store } = await setup({ imageAvailable: false });

    expect(wrapper.find('image').exists()).toBe(false);
    expect(wrapper.find('[data-test="image-load-error"]').text()).toContain('/img/reef.jpg');

    platform.queueRelink({ id: '/moved/reef.jpg', name: 'reef.jpg' });
    await wrapper.find('[data-test="relink-image"]').trigger('click');
    await flush();

    expect(store.currentQuadrat!.imagePath).toBe('/moved/reef.jpg');
    expect(store.dirty).toBe(true);
    expect(wrapper.find('[data-test="image-load-error"]').exists()).toBe(false);
    expect(wrapper.find('image').attributes('href')).toBe('memory:///moved/reef.jpg');
  });

  it('resetBoundary clears the rendered overlay', async () => {
    const { wrapper, store } = await setup({ shape: 'quad' });
    const svg = wrapper.find('[data-test="canvas-svg"]');
    await clickAt(svg, 0.1, 0.1);
    await clickAt(svg, 0.9, 0.1);
    await clickAt(svg, 0.9, 0.9);
    await clickAt(svg, 0.1, 0.9);
    expect(wrapper.findAll('circle[data-test^="sample-"]')).toHaveLength(4);

    store.resetBoundary();
    await flush();

    expect(wrapper.find('[data-test="boundary-polygon"]').exists()).toBe(false);
    expect(wrapper.findAll('circle[data-test^="sample-"]')).toHaveLength(0);
    expect(wrapper.findAll('[data-test="node-circle"]')).toHaveLength(0);
  });
});

describe('ImageCanvas shape modes', () => {
  beforeEach(() => setActivePinia(createPinia()));

  it('square mode: the SECOND click completes a four-vertex quadrat', async () => {
    const { wrapper, store } = await setup({ shape: 'square' });
    const svg = wrapper.find('[data-test="canvas-svg"]');

    await clickAt(svg, 0.25, 0.4);
    expect(store.currentQuadrat!.geoDefined).toBe(false);

    await clickAt(svg, 0.55, 0.4);
    const q = store.currentQuadrat!;
    expect(q.geoDefined).toBe(true);
    expect(q.boundary).toHaveLength(4);
    expect(q.shape).toBe('square');
  });

  it('square mode: the committed ring is square in display pixels', async () => {
    const { wrapper, store } = await setup({ shape: 'square' });
    const svg = wrapper.find('[data-test="canvas-svg"]');
    await clickAt(svg, 0.25, 0.4);
    await clickAt(svg, 0.55, 0.4);

    const ring = store.currentQuadrat!.boundary;
    const sides = [0, 1, 2, 3].map((i) => {
      const a = ring[i]!;
      const b = ring[(i + 1) % 4]!;
      return Math.hypot((b.x - a.x) * FITTED.width, (b.y - a.y) * FITTED.height);
    });
    for (const side of sides) {
      expect(side).toBeCloseTo(sides[0]!, 6);
    }
    // 4:3 fitted box → equal screen sides mean UNEQUAL normalized deltas
    expect(Math.abs(ring[1]!.x - ring[0]!.x)).not.toBeCloseTo(
      Math.abs(ring[3]!.y - ring[0]!.y),
      6
    );
  });

  it('square mode previews the whole CLOSED square before the second click', async () => {
    const { wrapper } = await setup({ shape: 'square' });
    const svg = wrapper.find('[data-test="canvas-svg"]');
    await clickAt(svg, 0.25, 0.4);
    await moveTo(svg, 0.55, 0.4);

    const preview = wrapper.find('[data-test="preview-ring"]');
    expect(preview.exists()).toBe(true);
    expect(parsePoints(preview.attributes('points')!)).toHaveLength(4);
    // a polygon closes itself; a polyline would leave the fourth side open
    expect(preview.element.tagName.toLowerCase()).toBe('polygon');
  });

  it('the quad/n-poly rubber band stays an open line', async () => {
    const { wrapper } = await setup({ shape: 'quad' });
    const svg = wrapper.find('[data-test="canvas-svg"]');
    await clickAt(svg, 0.25, 0.4);
    await moveTo(svg, 0.55, 0.4);
    expect(
      wrapper.find('[data-test="preview-ring"]').element.tagName.toLowerCase()
    ).toBe('polyline');
  });

  it('n-poly mode still closes by clicking back on the first node', async () => {
    const { wrapper, store } = await setup({ shape: 'n-poly' });
    const svg = wrapper.find('[data-test="canvas-svg"]');

    await clickAt(svg, 0.2, 0.2);
    await clickAt(svg, 0.8, 0.2);
    await clickAt(svg, 0.8, 0.8);
    await clickAt(svg, 0.2, 0.8);
    expect(store.currentQuadrat!.geoDefined).toBe(false);

    // closing does not add a fifth vertex — the ring is the four placed nodes
    await clickAt(svg, 0.2, 0.2);
    expect(store.currentQuadrat!.geoDefined).toBe(true);
    expect(store.currentQuadrat!.boundary).toHaveLength(4);
  });

  it('switching shape mid-draw discards the half-finished ring', async () => {
    const { wrapper, store } = await setup({ shape: 'quad' });
    const svg = wrapper.find('[data-test="canvas-svg"]');
    await clickAt(svg, 0.2, 0.2);
    await clickAt(svg, 0.8, 0.2);
    expect(wrapper.findAll('[data-test="node-circle"]')).toHaveLength(2);

    store.setShape('square');
    await wrapper.vm.$nextTick();
    expect(wrapper.findAll('[data-test="node-circle"]')).toHaveLength(0);
  });
});

describe('ImageCanvas drawing constraints', () => {
  beforeEach(() => setActivePinia(createPinia()));

  /** Screen-space angle of the segment ending at index i, in degrees. */
  function lastAngle(boundary: { x: number; y: number }[], i: number): number {
    const a = boundary[i - 1]!;
    const b = boundary[i]!;
    return (
      (Math.atan2((b.y - a.y) * FITTED.height, (b.x - a.x) * FITTED.width) * 180) / Math.PI
    );
  }

  /** Distance to the nearest 15° multiple, robust to float wrap at the step. */
  function offSnap(angleDeg: number): number {
    const m = ((angleDeg % 15) + 15) % 15;
    return Math.min(m, 15 - m);
  }

  it('Ctrl snaps the placed vertex to a 15° step on screen', async () => {
    const { wrapper, store } = await setup({ shape: 'quad' });
    const svg = wrapper.find('[data-test="canvas-svg"]');

    await clickAt(svg, 0.2, 0.5);
    // unconstrained this lands at ~20.6° on screen; Ctrl must pull it to 15°
    await clickAt(svg, 0.7, 0.75, { ctrlKey: true });

    const nodes = store.session!.settings; // settings untouched by drawing
    expect(nodes.shape).toBe('quad');
    const drawn = wrapper.findAll('[data-test="node-circle"]');
    expect(drawn).toHaveLength(2);

    const placed = [
      { x: 0.2, y: 0.5 },
      {
        x: Number(drawn[1]!.attributes('cx')) / FITTED.width,
        y: Number(drawn[1]!.attributes('cy')) / FITTED.height,
      },
    ];
    expect(offSnap(lastAngle(placed, 1))).toBeCloseTo(0, 6);
    // and it genuinely moved: the raw click was not on a 15° step
    expect(offSnap(lastAngle([{ x: 0.2, y: 0.5 }, { x: 0.7, y: 0.75 }], 1))).toBeGreaterThan(1);
  });

  it('without Ctrl the vertex lands exactly where the user clicked', async () => {
    const { wrapper } = await setup({ shape: 'quad' });
    const svg = wrapper.find('[data-test="canvas-svg"]');
    await clickAt(svg, 0.2, 0.5);
    await clickAt(svg, 0.7, 0.75);

    const drawn = wrapper.findAll('[data-test="node-circle"]');
    expect(Number(drawn[1]!.attributes('cx'))).toBeCloseTo(0.7 * FITTED.width, 6);
    expect(Number(drawn[1]!.attributes('cy'))).toBeCloseTo(0.75 * FITTED.height, 6);
  });

  it('Ctrl also matches the previous segment length from the third vertex', async () => {
    const { wrapper, store } = await setup({ shape: 'quad' });
    const svg = wrapper.find('[data-test="canvas-svg"]');

    await clickAt(svg, 0.2, 0.2);
    await clickAt(svg, 0.5, 0.2);
    await clickAt(svg, 0.9, 0.9, { ctrlKey: true });
    await clickAt(svg, 0.2, 0.9);

    const ring = store.currentQuadrat!.boundary;
    const px = (a: { x: number; y: number }, b: { x: number; y: number }) =>
      Math.hypot((b.x - a.x) * FITTED.width, (b.y - a.y) * FITTED.height);
    expect(px(ring[1]!, ring[2]!)).toBeCloseTo(px(ring[0]!, ring[1]!), 6);
  });

  it('the length lock does not apply to the second vertex — nothing to match yet', async () => {
    const { wrapper } = await setup({ shape: 'quad' });
    const svg = wrapper.find('[data-test="canvas-svg"]');
    await clickAt(svg, 0.2, 0.5);
    await clickAt(svg, 0.5, 0.5, { ctrlKey: true });

    // 0° is already a 15° multiple, so the point is unmoved by the snap
    const drawn = wrapper.findAll('[data-test="node-circle"]');
    expect(Number(drawn[1]!.attributes('cx'))).toBeCloseTo(0.5 * FITTED.width, 6);
  });

  it('shows a rubber band to the constrained point while drawing', async () => {
    const { wrapper } = await setup({ shape: 'quad' });
    const svg = wrapper.find('[data-test="canvas-svg"]');
    expect(wrapper.find('[data-test="preview-ring"]').exists()).toBe(false);

    await clickAt(svg, 0.2, 0.5);
    await moveTo(svg, 0.7, 0.75);
    const free = parsePoints(wrapper.find('[data-test="preview-ring"]').attributes('points')!);
    expect(free[1]!.x).toBeCloseTo(0.7 * FITTED.width, 6);

    await moveTo(svg, 0.7, 0.75, { ctrlKey: true });
    const snapped = parsePoints(wrapper.find('[data-test="preview-ring"]').attributes('points')!);
    expect(snapped[1]).not.toEqual(free[1]);
  });

  it('drops the preview when the pointer leaves the canvas', async () => {
    const { wrapper } = await setup({ shape: 'quad' });
    const svg = wrapper.find('[data-test="canvas-svg"]');
    await clickAt(svg, 0.2, 0.5);
    await moveTo(svg, 0.7, 0.75);
    expect(wrapper.find('[data-test="preview-node"]').exists()).toBe(true);

    await svg.trigger('mouseleave');
    expect(wrapper.find('[data-test="preview-node"]').exists()).toBe(false);
  });

  it('shows no preview once the boundary is committed', async () => {
    const { wrapper } = await setup({ shape: 'square' });
    const svg = wrapper.find('[data-test="canvas-svg"]');
    await clickAt(svg, 0.25, 0.4);
    await clickAt(svg, 0.55, 0.4);
    await moveTo(svg, 0.7, 0.7);
    expect(wrapper.find('[data-test="preview-ring"]').exists()).toBe(false);
  });
});

describe('ImageCanvas grid overlay', () => {
  beforeEach(() => setActivePinia(createPinia()));

  it('draws the cell grid for a stratified quad', async () => {
    const { wrapper } = await setup({ shape: 'quad', rows: 2, cols: 3 });
    const svg = wrapper.find('[data-test="canvas-svg"]');
    await clickAt(svg, 0.1, 0.1);
    await clickAt(svg, 0.9, 0.1);
    await clickAt(svg, 0.9, 0.9);
    await clickAt(svg, 0.1, 0.9);

    // 2 rows × 3 cols → 1 horizontal + 2 vertical interior lines
    expect(wrapper.findAll('[data-test="cut-line"]')).toHaveLength(3);
  });

  it('draws no grid at all in random mode', async () => {
    const { wrapper } = await setup({ shape: 'quad', sampling: 'random', rows: 2, cols: 3 });
    const svg = wrapper.find('[data-test="canvas-svg"]');
    await clickAt(svg, 0.1, 0.1);
    await clickAt(svg, 0.9, 0.1);
    await clickAt(svg, 0.9, 0.9);
    await clickAt(svg, 0.1, 0.9);

    expect(wrapper.findAll('circle[data-test^="sample-"]')).toHaveLength(6);
    expect(wrapper.findAll('[data-test="cut-line"]')).toHaveLength(0);
  });

  it('hides the grid when the row/col counts no longer match the stored samples', async () => {
    const { wrapper, store } = await setup({ shape: 'quad', rows: 2, cols: 3 });
    const svg = wrapper.find('[data-test="canvas-svg"]');
    await clickAt(svg, 0.1, 0.1);
    await clickAt(svg, 0.9, 0.1);
    await clickAt(svg, 0.9, 0.9);
    await clickAt(svg, 0.1, 0.9);
    expect(wrapper.findAll('[data-test="cut-line"]').length).toBeGreaterThan(0);

    store.setGridSize(4, 4);
    await wrapper.vm.$nextTick();
    expect(wrapper.findAll('[data-test="cut-line"]')).toHaveLength(0);
  });
});

describe('ImageCanvas sample selection', () => {
  beforeEach(() => setActivePinia(createPinia()));

  const boundary = [
    { x: 0.1, y: 0.1 },
    { x: 0.9, y: 0.1 },
    { x: 0.9, y: 0.9 },
    { x: 0.1, y: 0.9 },
  ];

  /** A defined quadrat with samples at the given normalized positions. */
  async function withSamples(positions: { x: number; y: number }[]) {
    return setup({
      quadrat: quadrat({
        boundary,
        geoDefined: true,
        rngSeed: 42,
        samples: positions.map((p, index) => ({ index, x: p.x, y: p.y, codes: [] })),
      }),
    });
  }

  it('hides the boundary vertex handles once the boundary is set', async () => {
    const { wrapper } = await withSamples([{ x: 0.5, y: 0.5 }]);
    expect(wrapper.find('[data-test="boundary-polygon"]').exists()).toBe(true);
    expect(wrapper.findAll('[data-test="node-circle"]')).toHaveLength(0);
  });

  it('brings the handles back when the boundary is reset for redrawing', async () => {
    const { wrapper, store } = await withSamples([{ x: 0.5, y: 0.5 }]);
    store.resetBoundary();
    await wrapper.vm.$nextTick();

    const svg = wrapper.find('[data-test="canvas-svg"]');
    await clickAt(svg, 0.2, 0.2);
    expect(wrapper.findAll('[data-test="node-circle"]')).toHaveLength(1);
  });

  it('selects a sample from a click well outside the dot itself', async () => {
    const { wrapper } = await withSamples([{ x: 0.5, y: 0.5 }]);
    const svg = wrapper.find('[data-test="canvas-svg"]');

    // 16px away on an 800×600 canvas: outside the 7px dot, inside the reach
    await clickAt(svg, 0.52, 0.5);
    expect(useTaggingStore().cursor).toBe(0);
    expect(useTaggingStore().activeTab).toBe('species');
  });

  it('ignores a click on empty canvas rather than grabbing the nearest point', async () => {
    const { wrapper } = await withSamples([
      { x: 0.2, y: 0.2 },
      { x: 0.8, y: 0.8 },
    ]);
    const tagging = useTaggingStore();
    tagging.setCursor(1);

    await clickAt(wrapper.find('[data-test="canvas-svg"]'), 0.5, 0.5);
    expect(tagging.cursor).toBe(1);
  });

  it('picks the NEARER of two samples whose hit areas overlap', async () => {
    // 24px apart horizontally on the 800px-wide canvas
    const { wrapper } = await withSamples([
      { x: 0.485, y: 0.5 },
      { x: 0.515, y: 0.5 },
    ]);
    const svg = wrapper.find('[data-test="canvas-svg"]');
    const tagging = useTaggingStore();

    await clickAt(svg, 0.51, 0.5);
    expect(tagging.cursor).toBe(1);

    await clickAt(svg, 0.49, 0.5);
    expect(tagging.cursor).toBe(0);
  });

  it('picks by distance, not by which dot is painted last', async () => {
    // sample 0 renders first, so an SVG hit test would favour sample 1 in the
    // overlap; the click here is nearer to 0 and must select it
    const { wrapper } = await withSamples([
      { x: 0.5, y: 0.5 },
      { x: 0.53, y: 0.5 },
    ]);
    await clickAt(wrapper.find('[data-test="canvas-svg"]'), 0.505, 0.5);
    expect(useTaggingStore().cursor).toBe(0);
  });

  it('shows a pointer cursor only within reach of a sample', async () => {
    const { wrapper } = await withSamples([{ x: 0.5, y: 0.5 }]);
    const svg = wrapper.find('[data-test="canvas-svg"]');

    await moveTo(svg, 0.5, 0.5);
    expect(svg.attributes('style')).toContain('pointer');

    await moveTo(svg, 0.2, 0.2);
    expect(svg.attributes('style')).toContain('grab');
  });

  it('never selects a sample whose coordinates are missing', async () => {
    const { wrapper } = await setup({
      quadrat: quadrat({
        boundary,
        geoDefined: true,
        rngSeed: 42,
        samples: [{ index: 0, x: null, y: null, codes: [] }],
      }),
    });
    await clickAt(wrapper.find('[data-test="canvas-svg"]'), 0.5, 0.5);
    expect(useTaggingStore().activeTab).not.toBe('species');
  });
});
