/**
 * Shared app factory: every shell (desktop renderer, web, future demos)
 * builds the same Vue app and differs only in the PlatformAdapter it
 * provides. Exported to other workspaces via the package `exports` map.
 */
import '@mdi/font/css/materialdesignicons.css';
import 'vuetify/styles';

import type { PlatformAdapter } from '@quadrator/core';
import type { Pinia } from 'pinia';
import { createPinia } from 'pinia';
import type { App as VueApp } from 'vue';
import { createApp } from 'vue';
import App from './App.vue';
import { platformKey } from './platform.ts';
import { createAppVuetify } from './plugins/vuetify.ts';

export function createQuadratorApp(adapter: PlatformAdapter): { app: VueApp; pinia: Pinia } {
  const pinia = createPinia();
  const app = createApp(App).use(pinia).use(createAppVuetify()).provide(platformKey, adapter);
  return { app, pinia };
}

/**
 * Dev-only diagnostics hook (the legacy app exposed window.fstore the same
 * way): lets dev sessions and screenshot scripts inspect/seed stores.
 */
export function exposeDevHook(pinia: Pinia): void {
  (window as unknown as Record<string, unknown>)['__quadratorPinia'] = pinia;
}
