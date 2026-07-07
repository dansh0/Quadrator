/**
 * Bundles the main process and preload with esbuild. tsc cannot emit here:
 * @quadrator/core is consumed as TypeScript source with .ts import
 * extensions (no build step, by design), which tsc only accepts under
 * noEmit. Type safety comes from `npm run typecheck` (tsc --noEmit).
 */
import { build } from 'esbuild';

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
