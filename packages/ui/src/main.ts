// Desktop-renderer entry (apps/desktop loads the build of this file).
// Inside the Electron shell the preload exposes the platform bridge;
// anywhere else (plain `vite dev`, tests) the app runs on the in-memory
// adapter. The web shell has its own entry: apps/web.
import { InMemoryPlatformAdapter } from '@quadrator/core';
import { createQuadratorApp, exposeDevHook } from './app.ts';
import { ElectronPlatformAdapter, electronBridge } from './platform/electron.ts';

const bridge = electronBridge();
const adapter = bridge ? new ElectronPlatformAdapter(bridge) : new InMemoryPlatformAdapter();

const { app, pinia } = createQuadratorApp(adapter);
app.mount('#app');

if (import.meta.env.DEV) exposeDevHook(pinia);
