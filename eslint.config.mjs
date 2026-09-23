// ESLint 9 flat config for the workspaces (packages/*, apps/*).
// Level mirrors the legacy setup: Vue "essential" correctness rules plus
// typescript-eslint recommended; type errors are tsc's job (pnpm typecheck).
import js from '@eslint/js';
import vue from 'eslint-plugin-vue';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      'apps/desktop/release/**',
      'apps/desktop/renderer/**',
      'coverage/**',
      'tests/fixtures/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...vue.configs['flat/essential'],
  {
    // .vue script blocks are TypeScript: hand them to the TS parser and let
    // tsc own undefined-identifier checking (no-undef false-positives on DOM
    // types in .vue files, as typescript-eslint documents).
    files: ['**/*.vue'],
    languageOptions: { parserOptions: { parser: tseslint.parser } },
    rules: { 'no-undef': 'off' },
  },
  {
    // Node build/config scripts (esbuild driver, vite/vitest configs).
    files: ['**/*.mjs', '**/*.config.js', '**/*.config.ts', 'apps/desktop/build.mjs'],
    languageOptions: { globals: globals.node },
  }
);
