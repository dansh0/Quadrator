// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import ImagePrepTab from '../src/components/tabs/ImagePrepTab.vue';
import { useSessionStore } from '../src/stores/session.ts';
import { mountWithShell, seedSession, taggedQuadrat } from './helpers.ts';

/** A quadrat that still needs its boundary drawn — when the controls show. */
function undrawnQuadrat() {
  return { ...taggedQuadrat('q1', 0), boundary: [], geoDefined: false, rngSeed: null };
}

/** mountWithShell installs the Pinia the component uses, so seed after it. */
async function setup(quadrat = undrawnQuadrat()) {
  const { wrapper } = mountWithShell(ImagePrepTab);
  seedSession([quadrat]);
  const store = useSessionStore();
  await wrapper.vm.$nextTick();
  return { wrapper, store };
}

/**
 * A Vuetify select's text input is readonly — picking a value means opening
 * its menu, which happy-dom cannot lay out. Setting the component's model
 * exercises the same binding the menu would.
 */
async function setSelect(
  wrapper: Awaited<ReturnType<typeof setup>>['wrapper'],
  test: string,
  value: string
) {
  await wrapper.findComponent(`[data-test="${test}"]`).setValue(value);
}

describe('ImagePrepTab sampling controls', () => {
  it('shows the sampling and shape selects while the quadrat has no boundary', async () => {
    const { wrapper } = await setup();
    expect(wrapper.find('[data-test="sampling-select"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="shape-select"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="rows-input"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="cols-input"]').exists()).toBe(true);
  });

  it('hides them once the boundary is defined — settings apply to the NEXT one', async () => {
    const { wrapper, store } = await setup();
    store.currentQuadrat!.geoDefined = true;
    await wrapper.vm.$nextTick();

    expect(wrapper.find('[data-test="geo-hint"]').exists()).toBe(false);
    expect(wrapper.find('[data-test="sampling-select"]').exists()).toBe(false);
    expect(wrapper.find('[data-test="shape-select"]').exists()).toBe(false);
  });

  it('offers the grid placement select only in regular-grid mode', async () => {
    const { wrapper, store } = await setup();
    expect(wrapper.find('[data-test="grid-origin-select"]').exists()).toBe(false);

    store.setSampling('regular-grid');
    await wrapper.vm.$nextTick();
    expect(wrapper.find('[data-test="grid-origin-select"]').exists()).toBe(true);

    store.setSampling('random');
    await wrapper.vm.$nextTick();
    expect(wrapper.find('[data-test="grid-origin-select"]').exists()).toBe(false);
  });

  it('locks placement to centre for an n-poly, which has no cell corners', async () => {
    const { wrapper, store } = await setup();
    store.setSampling('regular-grid');
    store.setShape('n-poly');
    await wrapper.vm.$nextTick();

    const origin = wrapper.find('[data-test="grid-origin-select"]');
    expect(origin.attributes('class')).toContain('v-input--disabled');
    expect(origin.text()).toContain('centre');
  });

  it('unlocks placement for quad and square', async () => {
    const { wrapper, store } = await setup();
    store.setSampling('regular-grid');
    store.setShape('quad');
    await wrapper.vm.$nextTick();

    const origin = wrapper.find('[data-test="grid-origin-select"]');
    expect(origin.attributes('class')).not.toContain('v-input--disabled');
  });

  it('writes the row and column counts through to the session settings', async () => {
    const { wrapper, store } = await setup();
    await wrapper.find('[data-test="rows-input"]').find('input').setValue('4');
    expect(store.session!.settings.numOfSampleRows).toBe(4);

    await wrapper.find('[data-test="cols-input"]').find('input').setValue('6');
    expect(store.session!.settings).toMatchObject({
      numOfSampleRows: 4,
      numOfSampleCols: 6,
    });
  });

  it('ignores a cleared or zero count rather than storing an invalid grid', async () => {
    const { wrapper, store } = await setup();
    await wrapper.find('[data-test="rows-input"]').find('input').setValue('0');
    expect(store.session!.settings.numOfSampleRows).toBe(5);
  });

  it('tells the user how the selected shape is completed', async () => {
    const { wrapper, store } = await setup();
    expect(wrapper.find('[data-test="geo-hint"]').text()).toContain('click the first point again');

    store.setShape('quad');
    await wrapper.vm.$nextTick();
    expect(wrapper.find('[data-test="geo-hint"]').text()).toContain('fourth click');

    store.setShape('square');
    await wrapper.vm.$nextTick();
    expect(wrapper.find('[data-test="geo-hint"]').text()).toContain('Click twice');
  });

  it('mentions the Ctrl locks, dropping the length lock where it cannot apply', async () => {
    const { wrapper, store } = await setup();
    expect(wrapper.find('[data-test="geo-hint"]').text()).toContain('15°');
    expect(wrapper.find('[data-test="geo-hint"]').text()).toContain("previous segment's length");

    store.setShape('square');
    await wrapper.vm.$nextTick();
    // a square is fixed by one side, so there is never a previous segment
    expect(wrapper.find('[data-test="geo-hint"]').text()).toContain('15°');
    expect(wrapper.find('[data-test="geo-hint"]').text()).not.toContain(
      "previous segment's length"
    );
  });

  it("explains what 'fill' does to the grid, and only for 'fill'", async () => {
    const { wrapper, store } = await setup();
    store.setSampling('regular-grid');
    store.setShape('quad');
    store.setGridSize(5, 4);
    await wrapper.vm.$nextTick();
    expect(wrapper.find('[data-test="grid-size-hint"]').exists()).toBe(false);

    store.setGridOrigin('fill');
    await wrapper.vm.$nextTick();
    expect(wrapper.find('[data-test="grid-size-hint"]').text()).toBe(
      '5 × 4 points on a 4 × 3 grid, edges included'
    );
  });

  it("shows 'centre' for a locked polygon even if a corner was picked for a quad", async () => {
    const { wrapper, store } = await setup();
    store.setSampling('regular-grid');
    store.setShape('quad');
    store.setGridOrigin('fill');
    await wrapper.vm.$nextTick();
    expect(wrapper.find('[data-test="grid-origin-select"]').text()).toContain('Fill');

    store.setShape('n-poly');
    await wrapper.vm.$nextTick();
    const origin = wrapper.find('[data-test="grid-origin-select"]');
    expect(origin.text()).toContain('Center');
    expect(origin.text()).not.toContain('Fill');
  });

  it('writes each select back to the session settings', async () => {
    const { wrapper, store } = await setup();

    await setSelect(wrapper, 'sampling-select', 'regular-grid');
    expect(store.session!.settings.sampling).toBe('regular-grid');

    await setSelect(wrapper, 'shape-select', 'square');
    expect(store.session!.settings.shape).toBe('square');

    await setSelect(wrapper, 'grid-origin-select', 'bottom-left');
    expect(store.session!.settings.gridOrigin).toBe('bottom-left');
  });
});
