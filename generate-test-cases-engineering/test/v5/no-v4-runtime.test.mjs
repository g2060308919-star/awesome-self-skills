import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../../', import.meta.url);

test('production source and installed schemas expose one V5 workflow only', async () => {
  const sourceFiles = (await readdir(new URL('src/', root), { withFileTypes: true }))
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .sort();
  assert.deepEqual(sourceFiles, ['canonical.mjs', 'entry.mjs', 'node-runtime.d.ts', 'schema-validator.mjs']);

  const schemaFiles = (await readdir(new URL('skill/generate-test-cases/scripts/schemas/', root)))
    .filter((file) => file.endsWith('.schema.json'))
    .sort();
  assert.ok(schemaFiles.length > 10);
  assert.ok(schemaFiles.every((file) => file.startsWith('v5-')));

  const manifest = JSON.parse(await readFile(new URL('skill/generate-test-cases/scripts/schema-manifest.json', root), 'utf8'));
  assert.equal(manifest.schema_version, '5.0.0');
  assert.equal(manifest.compiler_version, '0.6.0');
  assert.deepEqual(manifest.schemas.map((row) => row.file), schemaFiles);
});

test('public source, built runner, build, and package scripts contain no legacy operational dispatch', async () => {
  const paths = [
    'src/entry.mjs',
    'skill/generate-test-cases/scripts/test-compiler.mjs',
    'build/build.mjs',
    'package.json'
  ];
  const forbidden = /advanceStrict|createV4|constructV4|stageV4|migrate-v3|detectV4Run|schema_version[^\n]{0,40}["'](?:3|4)\.0\.0["']|compiler_version[^\n]{0,40}["']0\.[45]\.0["']/u;
  for (const relativePath of paths) {
    const source = await readFile(new URL(relativePath, root), 'utf8');
    assert.doesNotMatch(source, forbidden, relativePath);
  }
  const publicApi = await import('../../src/entry.mjs');
  assert.deepEqual(Object.keys(publicApi).sort(), ['advanceV5Run', 'createV5RunDirectory', 'inspectV5Run']);
});
