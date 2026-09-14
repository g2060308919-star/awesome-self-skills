import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { validateReleaseCorpus } from '../../benchmark/release-corpus.mjs';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const catalogPath = path.join(repositoryRoot, 'benchmark/public-pilot/v1/catalog.json');

test('release corpus validates only source, license, provenance, task, and stratum evidence', async (/** @type {any} */ context) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'generate-test-cases-release-corpus-'));
  context.after(async () => rm(root, { recursive: true, force: true }));
  const corpusRoot = path.join(root, 'benchmark/public-pilot/v1');
  await cp(path.dirname(catalogPath), corpusRoot, { recursive: true });

  await rm(path.join(corpusRoot, 'comparators.json'));
  await rm(path.join(corpusRoot, 'review-reports'), { recursive: true, force: true });
  await rm(path.join(corpusRoot, 'adjudication'), { recursive: true, force: true });

  const report = await validateReleaseCorpus(path.join(corpusRoot, 'catalog.json'), root);

  assert.equal(report.status, 'valid');
  assert.equal(report.cases.length, 30);
  assert.deepEqual(Object.values(report.by_stratum), [5, 5, 5, 5, 5, 5]);
  assert.deepEqual(report.issues, []);
});

test('release corpus consumes caller-verified catalog bytes without rereading a mutable catalog path', async (/** @type {any} */ context) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'generate-test-cases-release-corpus-bound-'));
  context.after(async () => rm(root, { recursive: true, force: true }));
  const corpusRoot = path.join(root, 'benchmark/public-pilot/v1');
  await cp(path.dirname(catalogPath), corpusRoot, { recursive: true });
  const verifiedBytes = await readFile(path.join(corpusRoot, 'catalog.json'));

  const report = await validateReleaseCorpus(
    path.join(corpusRoot, 'catalog-does-not-exist.json'), root, undefined, verifiedBytes
  );

  assert.equal(report.status, 'valid');
  assert.equal(report.cases.length, 30);
});

test('release corpus fails when retained source bytes do not match the catalog', async (/** @type {any} */ context) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'generate-test-cases-release-corpus-tamper-'));
  context.after(async () => rm(root, { recursive: true, force: true }));
  const corpusRoot = path.join(root, 'benchmark/public-pilot/v1');
  await cp(path.dirname(catalogPath), corpusRoot, { recursive: true });
  const catalog = JSON.parse(await readFile(path.join(corpusRoot, 'catalog.json'), 'utf8'));
  const sourcePath = path.join(corpusRoot, catalog.items[0].source.path);
  await writeFile(sourcePath, 'tampered source\n');

  const report = await validateReleaseCorpus(path.join(corpusRoot, 'catalog.json'), root);

  assert.equal(report.status, 'invalid');
  assert.equal(report.issues.some((issue) => issue.code === 'CORPUS_DIGEST_MISMATCH'), true);
});

test('release corpus rejects duplicate PRD content under different case IDs and paths', async (/** @type {any} */ context) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'generate-test-cases-release-corpus-duplicate-'));
  context.after(async () => rm(root, { recursive: true, force: true }));
  const corpusRoot = path.join(root, 'benchmark/public-pilot/v1');
  await cp(path.dirname(catalogPath), corpusRoot, { recursive: true });
  const localCatalogPath = path.join(corpusRoot, 'catalog.json');
  const catalog = JSON.parse(await readFile(localCatalogPath, 'utf8'));
  const first = catalog.items[0];
  const second = catalog.items[1];
  const duplicatePath = 'cases/pf-tr-02/source/duplicate-prd.md';
  await cp(path.join(corpusRoot, first.source.path), path.join(corpusRoot, duplicatePath));
  second.source = { ...first.source, source_id: second.source.source_id, path: duplicatePath };
  second.repository = first.repository;
  second.commit = first.commit;
  second.license.upstream_url = first.license.upstream_url;
  const provenancePath = path.join(corpusRoot, second.provenance.path);
  const provenance = JSON.parse(await readFile(provenancePath, 'utf8'));
  Object.assign(provenance, {
    repository: first.repository,
    commit: first.commit,
    source_url: first.source.upstream_url,
    source_sha256: first.source.sha256,
    content_digest: first.source.sha256,
    license_url: first.license.upstream_url
  });
  const provenanceBytes = `${JSON.stringify(provenance, null, 2)}\n`;
  await writeFile(provenancePath, provenanceBytes);
  second.provenance.sha256 = createHash('sha256').update(provenanceBytes).digest('hex');
  const taskPath = path.join(corpusRoot, second.task.path);
  const task = JSON.parse(await readFile(taskPath, 'utf8'));
  task.source_paths = [duplicatePath];
  const taskBytes = `${JSON.stringify(task, null, 2)}\n`;
  await writeFile(taskPath, taskBytes);
  second.task.sha256 = createHash('sha256').update(taskBytes).digest('hex');
  await writeFile(localCatalogPath, `${JSON.stringify(catalog, null, 2)}\n`);

  const report = await validateReleaseCorpus(localCatalogPath, root);

  assert.equal(report.status, 'invalid');
  assert.equal(report.issues.some((issue) => issue.code === 'CORPUS_SOURCE_DUPLICATE'), true);
});
