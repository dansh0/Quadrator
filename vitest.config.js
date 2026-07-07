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
            include: [
                'src/dataModel/**',
                'src/utils/**',
                'src/store.js',
                'src/InputState.js',
                'packages/core/src/**'
            ],
            thresholds: {
                // Core is held to the STYLE_GUIDE §3 floor; the legacy globs
                // above are reported but not gated (scheduled for replacement).
                'packages/core/src/**': {
                    statements: 95
                }
            }
        }
    }
});
