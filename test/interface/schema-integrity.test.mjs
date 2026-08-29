import assert from 'node:assert/strict';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { loadSchemaRegistry } from '../../src/schema-registry.mjs';
import { canonicalStringify, digest } from '../../src/canonical.mjs';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const schemaDirectory = path.join(repositoryRoot, 'skill/generate-test-cases/scripts/schemas');
const manifestPath = path.join(repositoryRoot, 'skill/generate-test-cases/scripts/schema-manifest.json');
const runnerPath = path.join(repositoryRoot, 'skill/generate-test-cases/scripts/test-compiler.mjs');

/** @param {string} runDirectory @param {string} [compilerPath] */
function runCompiler(runDirectory, compilerPath = runnerPath) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [compilerPath, runDirectory], { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (/** @type {string} */ chunk) => { stdout += chunk; });
    child.stderr.on('data', (/** @type {string} */ chunk) => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', (/** @type {number | null} */ code) => resolve({ code, stdout, stderr }));
  });
}

test('schema registry loads every versioned schema from its manifest', async () => {
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  const registry = await loadSchemaRegistry(schemaDirectory, manifest.digest);

  assert.equal(registry.schemaVersion, '1.0.0');
  assert.equal(registry.schemas.size, 8);
});

test('schema integrity mismatch is fatal before an empty run is read', async () => {
  const temporarySkill = await mkdtemp(path.join(os.tmpdir(), 'test-compiler-skill-'));
  const temporaryScripts = path.join(temporarySkill, 'scripts');
  const temporaryManifest = path.join(temporaryScripts, 'schema-manifest.json');
  const temporaryRunner = path.join(temporaryScripts, 'test-compiler.mjs');
  const runDirectory = await mkdtemp(path.join(os.tmpdir(), 'test-compiler-'));
  try {
    await mkdir(temporaryScripts, { recursive: true });
    await cp(schemaDirectory, path.join(temporaryScripts, 'schemas'), { recursive: true });
    await cp(runnerPath, temporaryRunner);
    const originalManifest = await readFile(manifestPath, 'utf8');
    await writeFile(temporaryManifest, originalManifest.replace('"schema_version":"1.0.0"', '"schema_version":"9.0.0"'));
    const result = await runCompiler(runDirectory, temporaryRunner);
    const reply = JSON.parse(result.stdout);

    assert.equal(result.code, 0, result.stderr);
    assert.equal(reply.status, 'fatal');
    assert.equal(reply.diagnostics[0].code, 'SCHEMA_INTEGRITY_MISMATCH');
  } finally {
    await rm(temporarySkill, { recursive: true, force: true });
    await rm(runDirectory, { recursive: true, force: true });
  }
});

test('schema tampering is fatal before an empty run is read', async () => {
  const temporarySkill = await mkdtemp(path.join(os.tmpdir(), 'test-compiler-skill-'));
  const temporaryScripts = path.join(temporarySkill, 'scripts');
  const temporaryRunner = path.join(temporaryScripts, 'test-compiler.mjs');
  const runDirectory = await mkdtemp(path.join(os.tmpdir(), 'test-compiler-'));
  try {
    await mkdir(temporaryScripts, { recursive: true });
    await cp(schemaDirectory, path.join(temporaryScripts, 'schemas'), { recursive: true });
    await cp(manifestPath, path.join(temporaryScripts, 'schema-manifest.json'));
    await cp(runnerPath, temporaryRunner);
    const tamperedSchema = path.join(temporaryScripts, 'schemas/source-pack.schema.json');
    await writeFile(tamperedSchema, (await readFile(tamperedSchema, 'utf8')).replace('"1.0.0"', '"9.0.0"'));
    const result = await runCompiler(runDirectory, temporaryRunner);
    const reply = JSON.parse(result.stdout);

    assert.equal(result.code, 0, result.stderr);
    assert.equal(reply.status, 'fatal');
    assert.equal(reply.diagnostics[0].code, 'SCHEMA_INTEGRITY_MISMATCH');
  } finally {
    await rm(temporarySkill, { recursive: true, force: true });
    await rm(runDirectory, { recursive: true, force: true });
  }
});

test('packaged runner binds the frozen compiler version into schema integrity', async () => {
  const temporarySkill = await mkdtemp(path.join(os.tmpdir(), 'test-compiler-skill-'));
  const temporaryScripts = path.join(temporarySkill, 'scripts');
  const temporaryRunner = path.join(temporaryScripts, 'test-compiler.mjs');
  const runDirectory = await mkdtemp(path.join(os.tmpdir(), 'test-compiler-'));
  try {
    await mkdir(temporaryScripts, { recursive: true });
    await cp(schemaDirectory, path.join(temporaryScripts, 'schemas'), { recursive: true });
    await cp(manifestPath, path.join(temporaryScripts, 'schema-manifest.json'));
    await writeFile(temporaryRunner, (await readFile(runnerPath, 'utf8')).replace(/var embeddedCompilerVersion = [^;]+;/, 'var embeddedCompilerVersion = "0.1.1";'));
    const result = await runCompiler(runDirectory, temporaryRunner);

    assert.equal(JSON.parse(result.stdout).status, 'fatal');
    assert.equal(JSON.parse(result.stdout).diagnostics[0].code, 'SCHEMA_INTEGRITY_MISMATCH');
  } finally {
    await rm(temporarySkill, { recursive: true, force: true });
    await rm(runDirectory, { recursive: true, force: true });
  }
});

test('installed runner rejects a supported-digest schema with an unsupported keyword', async () => {
  const temporarySkill = await mkdtemp(path.join(os.tmpdir(), 'test-compiler-skill-'));
  const temporaryScripts = path.join(temporarySkill, 'scripts');
  const temporaryRunner = path.join(temporaryScripts, 'test-compiler.mjs');
  const runDirectory = await mkdtemp(path.join(os.tmpdir(), 'test-compiler-'));
  try {
    await mkdir(temporaryScripts, { recursive: true });
    await cp(schemaDirectory, path.join(temporaryScripts, 'schemas'), { recursive: true });
    const schemaPath = path.join(temporaryScripts, 'schemas/source-pack.schema.json');
    const schema = JSON.parse(await readFile(schemaPath, 'utf8'));
    schema.unsupported_keyword = true;
    await writeFile(schemaPath, `${canonicalStringify(schema)}\n`);
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
    manifest.schemas.find((/** @type {any} */ entry) => entry.file === 'source-pack.schema.json').digest = digest(schema);
    const base = { compiler_version: manifest.compiler_version, schema_version: manifest.schema_version, schemas: manifest.schemas };
    manifest.digest = digest(base);
    await writeFile(path.join(temporaryScripts, 'schema-manifest.json'), `${canonicalStringify(manifest)}\n`);
    await writeFile(temporaryRunner, (await readFile(runnerPath, 'utf8')).replace(/"[a-f0-9]{64}"/, JSON.stringify(manifest.digest)));
    const result = await runCompiler(runDirectory, temporaryRunner);

    assert.equal(JSON.parse(result.stdout).status, 'fatal');
    assert.equal(JSON.parse(result.stdout).diagnostics[0].code, 'SCHEMA_INTEGRITY_MISMATCH');
  } finally {
    await rm(temporarySkill, { recursive: true, force: true });
    await rm(runDirectory, { recursive: true, force: true });
  }
});
