import { build } from 'esbuild';

await build({
  entryPoints: ['src/entry.mjs'],
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  outfile: 'skill/generate-test-cases/scripts/test-compiler.mjs'
});
