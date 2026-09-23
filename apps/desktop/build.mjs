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
 *
 * Also copies the app icon into ./dist, because electron-builder only
 * packages `dist/**`, `renderer/**` and package.json — `build/` is build-time
 * resources for the installer, not something the running app can read. The
 * main process needs its own copy to set the BrowserWindow icon.
 *
 * Also keeps this package's `version` equal to the root package.json, which
 * is the single source of truth (the UI footer imports it). electron-builder
 * reads the version from here, so without this sync a packaged build would
 * report a stale number after a root-only bump.
 */
import { build } from 'esbuild';
import { cpSync, existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const uiDist = path.join(here, '..', '..', 'packages', 'ui', 'dist');
const renderer = path.join(here, 'renderer');

syncVersionFromRoot();

/**
 * Copy the root version into apps/desktop/package.json when they differ,
 * preserving formatting elsewhere by rewriting only that one field.
 */
function syncVersionFromRoot() {
  const rootPath = path.join(here, '..', '..', 'package.json');
  const ownPath = path.join(here, 'package.json');
  const rootVersion = JSON.parse(readFileSync(rootPath, 'utf8')).version;
  const ownText = readFileSync(ownPath, 'utf8');
  const ownVersion = JSON.parse(ownText).version;
  if (rootVersion === ownVersion) return;
  writeFileSync(
    ownPath,
    ownText.replace(/("version"\s*:\s*)"[^"]*"/, `$1"${rootVersion}"`),
    'utf8'
  );
  console.log(`version: synced ${ownVersion} → ${rootVersion} from the root package.json`);
}

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

// The window/taskbar icon, alongside the bundled main process that reads it.
// build/icon.png is the 256x256 export of packages/ui/src/assets/
// QUADRATOR_LOGO_no_text.png, and is also what electron-builder hands the
// installer (see the `build` field in package.json).
cpSync(path.join(here, 'build', 'icon.png'), path.join(here, 'dist', 'icon.png'));

if (existsSync(path.join(uiDist, 'index.html'))) {
  rmSync(renderer, { recursive: true, force: true });
  cpSync(uiDist, renderer, { recursive: true });
} else if (process.argv.includes('--require-renderer')) {
  console.error('packages/ui/dist not found — run the UI build first.');
  process.exit(1);
} else {
  console.warn('packages/ui/dist not found; skipped renderer snapshot (dev-URL runs unaffected).');
}
