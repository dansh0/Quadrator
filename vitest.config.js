import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        projects: [
            {
                test: {
                    name: 'core',
                    include: ['packages/core/tests/**/*.spec.ts'],
                    environment: 'node'
                }
            },
            // Vue 3 UI package: own config for @vitejs/plugin-vue
            'packages/ui'
        ],
        coverage: {
            include: ['packages/core/src/**'],
            thresholds: {
                // STYLE_GUIDE §3 floor for core.
                'packages/core/src/**': {
                    statements: 95
                }
            }
        }
    }
});
