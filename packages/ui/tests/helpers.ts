import { InMemoryPlatformAdapter, QuadratV1, SessionV1 } from '@quadrator/core';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import type { Component } from 'vue';
import { platformKey } from '../src/platform.ts';
import { createAppVuetify } from '../src/plugins/vuetify.ts';
import { useSessionStore } from '../src/stores/session.ts';

/** Mount with the full app shell: fresh Pinia (also activated for stores), Vuetify, injected adapter. */
export function mountWithShell(
  component: Component,
  platform: InMemoryPlatformAdapter = new InMemoryPlatformAdapter()
) {
  const pinia = createPinia();
  setActivePinia(pinia);
  const wrapper = mount(component, {
    global: {
      plugins: [pinia, createAppVuetify()],
      provide: { [platformKey as symbol]: platform },
    },
  });
  return { wrapper, platform, pinia };
}

/** A quadrat with a defined boundary and n blank tagged samples. */
export function taggedQuadrat(id: string, nSamples: number): QuadratV1 {
  return {
    id,
    imagePath: `/img/${id}.jpg`,
    name: id,
    boundary: [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
      { x: 0, y: 100 },
    ],
    geoDefined: true,
    rngSeed: 1,
    samples: Array.from({ length: nSamples }, (_, index) => ({
      index,
      x: 10 + index,
      y: 20 + index,
      codes: [] as string[],
    })),
  };
}

/** Install a session with the given quadrats into the active session store. */
export function seedSession(quadrats: QuadratV1[], currentId = quadrats[0]?.id ?? null): SessionV1 {
  const store = useSessionStore();
  store.newSession(new Date('2026-07-07T12:00:00.000Z'));
  store.session!.quadrats.push(...quadrats);
  store.session!.currentQuadratId = currentId;
  return store.session!;
}

export const SPECIES_CSV =
  'code,species,group1,group2,color,colorSelected\n' +
  'Ulva,Ulva sp.,Algae,Intertidal,#4caf50,#2e7d32\n' +
  'Barn,Cirripedia spp,Animal,Sessile,#9c27b0,#7c1790\n' +
  'Myt,Mytilus sp.,Animal,Sessile,#2196f3,#1565c0\n';
