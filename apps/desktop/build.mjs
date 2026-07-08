/**
 * Bundles the main process and preload with esbuild. tsc cannot emit here:
 * @quadrator/core is consumed as TypeScript source with .ts import
 * extensions (no build step, by design), which tsc only accepts under
 * noEmit. Type safety comes from `npm run typecheck` (tsc --noEmit).
 *
 * Also snapshots the built UI (packages/ui/dist) into ./renderer, which is
 * what electron-builder packages and what the packaged app serves. Unpackaged
 * runs load packages/ui/dist directly (see main.ts), so a stale snapshot can
 * only ever ship inside an explicitly built package.
 * `--require-renderer` (used by the dist scripts) makes a missing UI build a
 * hard error instead of a warning.
 */
import { build } from 'esbuild';
import { cpSync, existsSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const uiDist = path.join(here, '..', '..', 'packages', 'ui', 'dist');
const renderer = path.join(here, 'renderer');

await build({
  entryPoints: ['src/main.ts', 'src/preload.ts'],
  outdir: 'dist',
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node20',
  external: ['electron'],
  sourcemap: true,
});

if (existsSync(path.join(uiDist, 'index.html'))) {
  rmSync(renderer, { recursive: true, force: true });
  cpSync(uiDist, renderer, { recursive: true });
} else if (process.argv.includes('--require-renderer')) {
  console.error('packages/ui/dist not found — run the UI build first.');
  process.exit(1);
} else {
  console.warn('packages/ui/dist not found; skipped renderer snapshot (dev-URL runs unaffected).');
}
