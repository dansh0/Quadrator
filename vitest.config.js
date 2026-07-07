import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'url';

export default defineConfig({
    resolve: {
        alias: {
            // App modules import from 'electron' (renderer with nodeIntegration).
            // Point that at a mock so pure logic is testable outside Electron.
            electron: fileURLToPath(new URL('./tests/mocks/electron.js', import.meta.url)),
            '@': fileURLToPath(new URL('./src', import.meta.url))
        }
    },
    test: {
        include: ['tests/unit/**/*.spec.js', 'packages/core/tests/**/*.spec.ts'],
        environment: 'node',
        coverage: {
            include: ['src/dataModel/**', 'src/utils/**', 'src/store.js', 'src/InputState.js']
        }
    }
});
