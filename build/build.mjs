import { build } from 'esbuild';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { canonicalStringify, digest } from '../src/canonical.mjs';

const schemaDirectory = 'skill/generate-test-cases/scripts/schemas';
const schemaVersion = '1.0.0';
const compilerVersion = '0.1.0';
const schemaFiles = /** @type {string[]} */ (await readdir(schemaDirectory)).filter((/** @type {string} */ file) => file.endsWith('.schema.json')).sort();
const schemas = await Promise.all(schemaFiles.map(async (/** @type {string} */ file) => {
  const schema = JSON.parse(await readFile(path.join(schemaDirectory, file), 'utf8'));
  return { file, digest: digest(schema) };
}));
const manifestBase = { schema_version: schemaVersion, schemas };
const manifestDigest = digest(manifestBase);
await writeFile(
  'skill/generate-test-cases/scripts/schema-manifest.json',
  `${canonicalStringify({ ...manifestBase, digest: manifestDigest })}\n`
);

await build({
  entryPoints: ['src/entry.mjs'],
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  define: {
    __SCHEMA_MANIFEST_DIGEST__: JSON.stringify(manifestDigest),
    __SCHEMA_VERSION__: JSON.stringify(schemaVersion),
    __COMPILER_VERSION__: JSON.stringify(compilerVersion),
    __SCHEMA_DIRECTORY__: JSON.stringify('schemas')
  },
  outfile: 'skill/generate-test-cases/scripts/test-compiler.mjs'
});
