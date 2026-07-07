// @vitest-environment happy-dom
import { InMemoryPlatformAdapter, QuadratV1, SampleV1 } from '@quadrator/core';
import { DOMWrapper, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it } from 'vitest';
import { imageSizerKey } from '../src/canvas.ts';
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

function quadrat(overrides: Partial<QuadratV1> = {}): QuadratV1 {
  return {
    id: 'q1',
    imagePath: '/img/reef.jpg',
    name: 'reef',
    boundary: [],
    geoDefined: false,
    rngSeed: null,
    samples: [],
    ...overrides,
  };
}

interface SetupOptions {
  quadrat?: QuadratV1;
  restrictToQuad?: boolean;
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
  store.session!.settings.restrictToQuad = options.restrictToQuad ?? false;
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
  ny: number
): Promise<void> {
  await svg.trigger('click', { clientX: nx * FITTED.width, clientY: ny * FITTED.height });
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
    const { wrapper, store } = await setup({ restrictToQuad: true });
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
    expect(wrapper.findAll('.sample-circle')).toHaveLength(4);
    // the cursor starts at sample 0, which renders as the crosshair
    expect(wrapper.find('[data-test="crosshair"]').exists()).toBe(true);
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
    const { wrapper, store } = await setup({ restrictToQuad: true });
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
    const samples: SampleV1[] = [
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

    const tagged = wrapper.find('[data-test="sample-1"]');
    expect(tagged.attributes('fill')).toBe('lightblue');
    await tagged.trigger('click');

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
    const { wrapper, store } = await setup({ restrictToQuad: true });
    const svg = wrapper.find('[data-test="canvas-svg"]');
    await clickAt(svg, 0.1, 0.1);
    await clickAt(svg, 0.9, 0.1);
    await clickAt(svg, 0.9, 0.9);
    await clickAt(svg, 0.1, 0.9);
    expect(wrapper.findAll('.sample-circle')).toHaveLength(4);

    store.resetBoundary();
    await flush();

    expect(wrapper.find('[data-test="boundary-polygon"]').exists()).toBe(false);
    expect(wrapper.findAll('.sample-circle')).toHaveLength(0);
    expect(wrapper.findAll('[data-test="node-circle"]')).toHaveLength(0);
  });
});
