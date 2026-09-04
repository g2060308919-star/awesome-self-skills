import { build } from 'esbuild';
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { canonicalStringify, digest } from '../src/canonical.mjs';

const schemaDirectory = 'skill/generate-test-cases/scripts/schemas';
const manifestPath = 'skill/generate-test-cases/scripts/schema-manifest.json';
const runnerPath = 'skill/generate-test-cases/scripts/test-compiler.mjs';
const schemaVersion = '2.1.0';
const compilerVersion = '0.3.0';
const argumentsList = process.argv.slice(2);
if (argumentsList.length > 1 || (argumentsList.length === 1 && argumentsList[0] !== '--check')) {
  throw new Error('usage: node build/build.mjs [--check]');
}
const checkOnly = argumentsList[0] === '--check';
let temporaryDirectory = null;

try {
  temporaryDirectory = checkOnly
    ? await mkdtemp(path.join(os.tmpdir(), 'generate-test-cases-build-')) : null;
  const schemaFiles = /** @type {string[]} */ (await readdir(schemaDirectory))
    .filter((/** @type {string} */ file) => file.endsWith('.schema.json')).sort();
  const schemas = await Promise.all(schemaFiles.map(async (/** @type {string} */ file) => {
    const schema = JSON.parse(await readFile(path.join(schemaDirectory, file), 'utf8'));
    return { file, digest: digest(schema) };
  }));
  const manifestBase = { compiler_version: compilerVersion, schema_version: schemaVersion, schemas };
  const manifestDigest = digest(manifestBase);
  const manifestText = `${canonicalStringify({ ...manifestBase, digest: manifestDigest })}\n`;
  const generatedManifestPath = temporaryDirectory
    ? path.join(temporaryDirectory, 'schema-manifest.json') : manifestPath;
  const generatedRunnerPath = temporaryDirectory
    ? path.join(temporaryDirectory, 'test-compiler.mjs') : runnerPath;
  await writeFile(generatedManifestPath, manifestText);
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
    outfile: generatedRunnerPath
  });
  if (temporaryDirectory) {
    for (const [committedPath, generatedPath] of [
      [manifestPath, generatedManifestPath], [runnerPath, generatedRunnerPath]
    ]) {
      let committed;
      try { committed = await readFile(committedPath); } catch { committed = null; }
      const generated = await readFile(generatedPath);
      if (committed === null || !committed.equals(generated)) {
        throw new Error(`generated artifact is stale: ${committedPath}`);
      }
    }
  }
} finally {
  if (temporaryDirectory) await rm(temporaryDirectory, { recursive: true, force: true });
}
