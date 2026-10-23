import assert from 'node:assert/strict';
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { advanceStrict } from '../../src/entry.mjs';
import { ensureV4RunInstance } from '../../src/revision-transaction-v4.mjs';
import { v4ContractForSchema } from '../../src/v4-contract.mjs';

test('formal entry routes every historical v4 pair to a compiler-created latest successor without changing the old run', async () => {
  for (const version of ['4.0.0', '4.2.0', '4.3.0', '4.3.1', '4.3.2']) {
    const contract = v4ContractForSchema(version);
    const directory = await mkdtemp(path.join(os.tmpdir(), 'reliability-public-upgrade-'));
    try {
      await ensureV4RunInstance(directory, { run_id: 'RUN-aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        delivery_intent: 'case_document', contract });
      const before = await readFile(path.join(directory, 'run-instance.json'), 'utf8');
      const entries = await readdir(directory);
      const reply = /** @type {any} */ (await advanceStrict(directory));
      assert.equal(reply.status, 'fatal');
      assert.equal(reply.diagnostics[0].code, 'VERSION_UPGRADE_REQUIRED');
      assert.deepEqual(await readdir(directory), entries);
      assert.equal(await readFile(path.join(directory, 'run-instance.json'), 'utf8'), before);
    } finally { await rm(directory, { recursive: true, force: true }); }
  }
});

test('formal entry rejects unknown v4 versions without attempting an old generator', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'reliability-unknown-version-'));
  try {
    await writeFile(path.join(directory, 'run-instance.json'), JSON.stringify({
      schema_version: '4.99.0', compiler_version: '0.99.0'
    }));
    const reply = /** @type {any} */ (await advanceStrict(directory));
    assert.equal(reply.status, 'fatal');
    assert.equal(reply.diagnostics[0].code, 'VERSION_UPGRADE_UNSUPPORTED');
    assert.deepEqual(await readdir(directory), ['run-instance.json']);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
