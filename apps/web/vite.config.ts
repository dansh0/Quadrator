import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vite';

export default defineConfig({
  // Relative asset paths so the build works from any static-hosting subpath.
  base: './',
  plugins: [vue()],
});
