import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vite';

export default defineConfig({
  // Relative asset paths so the built app also loads over file:// inside
  // the Electron shell (apps/desktop loads packages/ui/dist directly).
  base: './',
  plugins: [vue()],
});
