// Web shell entry: the shared UI on the browser adapter (File System Access
// API where available, input/download fallback elsewhere).
import { createQuadratorApp, exposeDevHook } from '@quadrator/ui/app';
import { BrowserPlatformAdapter } from '@quadrator/ui/platform/browser';

const { app, pinia } = createQuadratorApp(new BrowserPlatformAdapter());
app.mount('#app');

if (import.meta.env.DEV) exposeDevHook(pinia);
