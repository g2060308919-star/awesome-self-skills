import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, realpath, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { readCasJson, writeCasJson, writeRawSourceBytes } from '../../src/v5/run-store.mjs';
import { resolveCatalogLayout, resolveRunLayout } from '../../src/v5/storage-paths.mjs';

test('v5 storage layout accepts only absolute real directories and fixed run paths', async () => {
  const catalogRoot = await mkdtemp(path.join(os.tmpdir(), 'gtc-v5-storage-'));
  const canonicalRoot = await realpath(catalogRoot);
  const catalog = await resolveCatalogLayout(catalogRoot);
  assert.equal(catalog.currentPointer, path.join(canonicalRoot, 'catalog/current-transaction.json'));
  await mkdir(path.join(canonicalRoot, 'runs', 'RUN-test'), { recursive: true });
  const run = await resolveRunLayout(path.join(canonicalRoot, 'runs', 'RUN-test'));
  assert.equal(run.currentPointer, path.join(canonicalRoot, 'runs', 'RUN-test', 'current-transaction.json'));
  await assert.rejects(() => resolveCatalogLayout('relative/catalog'), /RUN_ARGUMENT_INVALID/u);

  const target = await mkdtemp(path.join(os.tmpdir(), 'gtc-v5-target-'));
  const link = path.join(canonicalRoot, 'linked');
  await symlink(target, link);
  await assert.rejects(() => resolveCatalogLayout(link), /RUN_ARGUMENT_INVALID/u);
});

test('JSON CAS and raw-source CAS verify exact bytes', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'gtc-v5-cas-'));
  const written = await writeCasJson(directory, { z: 1, a: ['x'] });
  assert.match(written.digest, /^sha256:[0-9a-f]{64}$/u);
  assert.deepEqual(await readCasJson(written.path, written.digest), { a: ['x'], z: 1 });
  await writeFile(written.path, '{"a":[]}');
  await assert.rejects(() => readCasJson(written.path, written.digest), /ACCEPTED_STATE_INTEGRITY_FAILURE/u);

  const raw = Buffer.from([0, 255, 10, 13]);
  const rawWritten = await writeRawSourceBytes(directory, raw);
  assert.deepEqual(await readFile(rawWritten.path), raw);
});
