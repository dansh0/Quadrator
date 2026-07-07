import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [vue()],
  test: {
    name: 'ui',
    include: ['tests/**/*.spec.ts'],
    environment: 'node',
    server: {
      deps: {
        // Vuetify ships .css imports in its ESM dist; inline it so Vite
        // transforms them instead of Node choking on the extension.
        inline: ['vuetify'],
      },
    },
  },
});
