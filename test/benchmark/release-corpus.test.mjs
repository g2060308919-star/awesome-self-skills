import assert from 'node:assert/strict';
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
