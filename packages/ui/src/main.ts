import '@mdi/font/css/materialdesignicons.css';
import 'vuetify/styles';

import { createPinia } from 'pinia';
import { createApp } from 'vue';
import App from './App.vue';
import { createAppVuetify } from './plugins/vuetify.ts';

// Inside the Electron shell the preload exposes the platform bridge;
// anywhere else (plain `vite dev`, tests, future web demo) the app runs on
// the in-memory adapter.
import { InMemoryPlatformAdapter } from '@quadrator/core';
import { platformKey } from './platform.ts';
import { ElectronPlatformAdapter, electronBridge } from './platform/electron.ts';

const bridge = electronBridge();
const adapter = bridge ? new ElectronPlatformAdapter(bridge) : new InMemoryPlatformAdapter();

const pinia = createPinia();

createApp(App)
  .use(pinia)
  .use(createAppVuetify())
  .provide(platformKey, adapter)
  .mount('#app');

// Dev-only diagnostics hook (the legacy app exposed window.fstore the same
// way): lets `vite dev` sessions and screenshot scripts inspect/seed stores.
if (import.meta.env.DEV) {
  (window as unknown as Record<string, unknown>)['__quadratorPinia'] = pinia;
}
