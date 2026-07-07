// @vitest-environment happy-dom
import { InMemoryPlatformAdapter, serializeSession } from '@quadrator/core';
import { mount } from '@vue/test-utils';
import { createPinia } from 'pinia';
import { describe, expect, it } from 'vitest';
import App from '../src/App.vue';
import { platformKey } from '../src/platform.ts';
import { createAppVuetify } from '../src/plugins/vuetify.ts';
import { emptySession, useSessionStore } from '../src/stores/session.ts';

function mountApp(platform = new InMemoryPlatformAdapter()) {
  return mount(App, {
    global: {
      plugins: [createPinia(), createAppVuetify()],
      provide: { [platformKey as symbol]: platform },
    },
  });
}

const flush = () => new Promise((r) => setTimeout(r, 0));

describe('App shell (Vue 3 + Vuetify 3 + Pinia + core wiring)', () => {
  it('renders the home screen (no right panel) before any quadrat exists', () => {
    const wrapper = mountApp();
    expect(wrapper.find('[data-test="home-screen"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="image-canvas"]').exists()).toBe(false);
    expect(wrapper.find('[data-test="tab-prep"]').exists()).toBe(false);
  });

  it('Load Image creates a session from picked images and enters the workspace', async () => {
    const platform = new InMemoryPlatformAdapter();
    platform.queueImagePick([{ id: '/photos/reef-1.jpg', name: 'reef-1.jpg' }]);

    const wrapper = mountApp(platform);
    await wrapper.find('[data-test="home-load-images"]').trigger('click');
    await flush();

    expect(wrapper.find('[data-test="home-screen"]').exists()).toBe(false);
    expect(wrapper.find('[data-test="image-canvas"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="tab-prep"]').exists()).toBe(true);
  });

  it('Load from File opens a session through the injected PlatformAdapter', async () => {
    const platform = new InMemoryPlatformAdapter();
    platform.queueSessionOpen(
      JSON.stringify({
        schemaVersion: 1,
        savedAt: '2026-07-07T12:00:00.000Z',
        settings: { numOfSampleRows: 5, numOfSampleCols: 5, restrictToQuad: false },
        quadrats: [
          {
            id: 'q1',
            imagePath: '/photos/reef-1.jpg',
            name: 'Reef transect 1',
            boundary: [],
            geoDefined: false,
            rngSeed: 1,
            samples: [],
          },
        ],
        currentQuadratId: 'q1',
      }),
      { id: '/data/reef.json', name: 'reef.json' }
    );

    const wrapper = mountApp(platform);
    await wrapper.find('[data-test="home-open-session"]').trigger('click');
    await flush();

    expect(useSessionStore().fileRef?.name).toBe('reef.json');
    expect(wrapper.find('[data-test="image-canvas"]').exists()).toBe(true);
    // the session references an image this adapter can't resolve → re-link offer
    expect(wrapper.find('[data-test="image-load-error"]').text()).toContain('/photos/reef-1.jpg');
  });

  it('offers Continue Last Session only when an autosave snapshot exists', async () => {
    const wrapper = mountApp();
    await flush();
    expect(wrapper.find('[data-test="home-continue-last"]').exists()).toBe(false);

    const session = emptySession(new Date('2026-07-07T12:00:00.000Z'));
    session.quadrats.push({
      id: 'q1',
      imagePath: '/img/reef.jpg',
      name: 'reef',
      boundary: [],
      geoDefined: false,
      rngSeed: null,
      samples: [],
    });
    session.currentQuadratId = 'q1';
    const platform = new InMemoryPlatformAdapter();
    await platform.saveSettings({ lastSessionText: serializeSession(session) });

    const wrapper2 = mountApp(platform);
    await flush();
    await wrapper2.find('[data-test="home-continue-last"]').trigger('click');
    await flush();

    expect(wrapper2.find('[data-test="home-screen"]').exists()).toBe(false);
    expect(wrapper2.find('[data-test="image-canvas"]').exists()).toBe(true);
  });

  it('a corrupt autosave snapshot shows the legacy error and is dropped', async () => {
    const platform = new InMemoryPlatformAdapter();
    await platform.saveSettings({ lastSessionText: '{"schemaVersion": 99}' });

    const wrapper = mountApp(platform);
    await flush();
    await wrapper.find('[data-test="home-continue-last"]').trigger('click');
    await flush();

    expect(wrapper.find('[data-test="home-error"]').text()).toContain('may be corrupt');
    expect(wrapper.find('[data-test="home-continue-last"]').exists()).toBe(false);
    const settings = (await platform.loadSettings()) as Record<string, unknown>;
    expect(settings['lastSessionText']).toBeNull();
  });

  it('shows the release version on the home screen', () => {
    const wrapper = mountApp();
    expect(wrapper.find('[data-test="home-screen"]').text()).toMatch(/Beta Release v\d+\.\d+/);
  });
});
