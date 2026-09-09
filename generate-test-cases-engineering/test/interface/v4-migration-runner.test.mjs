import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { advanceStrict } from '../../src/advance-strict.mjs';
import { canonicalStringify, digest } from '../../src/canonical.mjs';
import { migrateLegacyRun } from '../../src/migrate-v3-run.mjs';
import { STAGE_FILES } from '../../src/run-store.mjs';
import { buildJourney, evaluateJourneyRevision } from '../helpers/run-journey.mjs';
import { bendReviewJourneyFixture } from '../fixtures/v4/bend-review-platform/journey-fixture.mjs';

const byteDigest = (/** @type {string|Uint8Array} */ bytes) =>
  `sha256:${createHash('sha256').update(bytes).digest('hex')}`;

/** @param {string} target */
async function exists(target) {
  try { await stat(target); return true; } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      return false;
    }
    throw error;
  }
}

/** @param {string} directory */
async function fileSnapshot(directory) {
  /** @type {Array<{path:string,byte_length:number,byte_sha256:string}>} */
  const rows = [];
  /** @param {string} current */
  async function visit(current) {
    for (const entry of await readdir(current, { withFileTypes: true })) {
      const target = path.join(current, entry.name);
      if (entry.isDirectory()) await visit(target);
      else {
        const bytes = await readFile(target);
        rows.push({
          path: path.relative(directory, target).split(path.sep).join('/'),
          byte_length: bytes.length,
          byte_sha256: byteDigest(bytes)
        });
      }
    }
  }
  await visit(directory);
  return rows.sort((left, right) => left.path.localeCompare(right.path, 'en'));
}

async function migratedActiveRun(withPendingRoot = false) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'gtc-v4-migration-runner-'));
  const catalog = path.join(root, 'catalog');
  const legacy = path.join(root, 'legacy');
  await Promise.all([mkdir(catalog), mkdir(legacy)]);
  const artifacts = buildJourney('all-e3');
  artifacts.source_pack.delivery_intent = 'case_document';
  const result = /** @type {any} */ (evaluateJourneyRevision(
    artifacts, 'pause_for_clarification'
  ));
  if (withPendingRoot) {
    const fact = artifacts.evidence_claims.fact_ledger[0];
    fact.fact_id = 'FACT-ip';
    result.clarification_state.root_snapshot_ledger = [{
      root_issue_id: 'legacy-ip', root_issue_key: 'legacy-ip', missing_type: 'ip_meaning',
      semantic_refs: [fact.claim_id], scope: 'review-platform.ip',
      question: 'IP 表示什么？', answerable: true, current: true, affected_obligation_ids: []
    }];
    result.clarification_state.root_issue_dispositions = [{ root_issue_id: 'legacy-ip', status: 'asked' }];
    result.clarification_state.asked_root_issue_ids = ['legacy-ip'];
    result.clarification_state.last_pending_root_issue_ids = ['legacy-ip'];
  }
  await writeFile(path.join(legacy, 'run-instance.json'), `${canonicalStringify({
    schema_version: '3.0.0', run_instance_id: artifacts.source_pack.run_instance_id,
    created_at: '2026-09-09T00:00:00.000Z'
  })}\n`, 'utf8');
  await mkdir(path.join(legacy, 'accepted/r000'), { recursive: true });
  for (const [stage, file] of Object.entries(STAGE_FILES)) {
    await writeFile(
      path.join(legacy, 'accepted/r000', file),
      `${canonicalStringify(artifacts[stage])}\n`, 'utf8'
    );
  }
  await mkdir(path.join(legacy, 'derived/r000'), { recursive: true });
  await writeFile(
    path.join(legacy, 'derived/r000/clarification-state.json'),
    `${canonicalStringify(result.clarification_state)}\n`, 'utf8'
  );
  await writeFile(path.join(legacy, 'checkpoint.json'), `${canonicalStringify({
    schema_version: '3.0.0', compiler_version: '0.4.0',
    run_instance_id: artifacts.source_pack.run_instance_id,
    source_revision: 0, stage: 'clarification',
    accepted_artifact_digests: Object.fromEntries(
      Object.keys(STAGE_FILES).map(key => [key, digest(artifacts[key])])
    )
  })}\n`, 'utf8');
  const migration = await migrateLegacyRun(catalog, legacy);
  return { root, catalog, legacy, artifacts, migration };
}

/** @param {string} directory @param {keyof typeof STAGE_FILES} stage @param {any} artifact */
async function stageV4(directory, stage, artifact) {
  await mkdir(path.join(directory, 'staging'), { recursive: true });
  await writeFile(path.join(directory, 'staging', STAGE_FILES[stage]), `${canonicalStringify(artifact)}\n`, 'utf8');
}

test('T13 production runner detects an otherwise empty migrated v4 sibling from its canonical run identity', async () => {
  const fixture = await migratedActiveRun();
  try {
    const legacyBefore = await fileSnapshot(fixture.legacy);
    const instancePath = path.join(fixture.migration.sibling_run_directory, 'run-instance.json');
    const instanceBefore = await readFile(instancePath, 'utf8');

    const reply = /** @type {any} */ (await advanceStrict(
      fixture.migration.sibling_run_directory
    ));

    assert.equal(reply.status, 'need_artifact', JSON.stringify(reply));
    assert.equal(reply.stage, 'source_pack', JSON.stringify(reply));
    assert.equal(reply.scope.run_instance_id, fixture.migration.v4_run_id);
    assert.equal(await readFile(instancePath, 'utf8'), instanceBefore);
    assert.deepEqual(await fileSnapshot(fixture.legacy), legacyBefore);
    assert.equal(await exists(path.join(
      fixture.migration.sibling_run_directory, 'accepted/r000/source-pack.json'
    )), false);
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test('T13 production runner preserves a mapped legacy pending root through fresh v4 reanalysis', async () => {
  const fixture = await migratedActiveRun(true);
  try {
    assert.equal(fixture.migration.outcome, 'migrated', JSON.stringify(fixture.migration));
    const sibling = fixture.migration.sibling_run_directory;
    const reanalysis = await bendReviewJourneyFixture(fixture.migration.v4_run_id);
    await stageV4(sibling, 'source_pack', reanalysis.artifacts.source_pack);
    assert.equal((/** @type {any} */ (await advanceStrict(sibling))).stage, 'evidence_claims');
    await stageV4(sibling, 'evidence_claims', reanalysis.artifacts.evidence_claims);
    const reply = /** @type {any} */ (await advanceStrict(sibling));
    const expectedRoot = `ROOT-${digest({
      subject_fact_ids: ['FACT-ip'], missing_aspect: 'ip_meaning', scope_ref: 'review-platform.ip'
    })}`;
    assert.equal(reply.status, 'need_user_answers', JSON.stringify(reply));
    assert.ok(reply.semantic_presentation.question_parts.some(
      (/** @type {any} */ part) => part.root_issue_id === expectedRoot
    ));
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test('T13 production runner rejects fresh reanalysis that silently drops a mapped legacy pending root', async () => {
  const fixture = await migratedActiveRun(true);
  try {
    assert.equal(fixture.migration.outcome, 'migrated', JSON.stringify(fixture.migration));
    const sibling = fixture.migration.sibling_run_directory;
    const reanalysis = await bendReviewJourneyFixture(fixture.migration.v4_run_id);
    reanalysis.artifacts.evidence_claims.semantic_gaps = [];
    await stageV4(sibling, 'source_pack', reanalysis.artifacts.source_pack);
    await advanceStrict(sibling);
    await stageV4(sibling, 'evidence_claims', reanalysis.artifacts.evidence_claims);
    const reply = /** @type {any} */ (await advanceStrict(sibling));
    assert.match(JSON.stringify(reply), /MIGRATION_ROOT_REANALYSIS_MISMATCH/u);
    assert.equal(await exists(path.join(sibling, 'output/current.json')), false);
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test('T13 runner revalidates migration seed/report/index/legacy linkage before consuming a staged Source Pack', async () => {
  const fixture = await migratedActiveRun();
  try {
    const sibling = fixture.migration.sibling_run_directory;
    const source = structuredClone(fixture.artifacts.source_pack);
    source.schema_version = '4.0.0';
    source.compiler_version = '0.5.0';
    source.run_instance_id = fixture.migration.v4_run_id;
    await mkdir(path.join(sibling, 'staging'), { recursive: true });
    const stagedPath = path.join(sibling, 'staging/source-pack.json');
    const stagedBytes = `${canonicalStringify(source)}\n`;
    await writeFile(stagedPath, stagedBytes, 'utf8');

    const seedPath = path.join(sibling, 'derived/migration-replay-seed.json');
    await writeFile(seedPath, `${await readFile(seedPath, 'utf8')} `, 'utf8');
    const legacyBefore = await fileSnapshot(fixture.legacy);

    const first = /** @type {any} */ (await advanceStrict(sibling));
    const second = /** @type {any} */ (await advanceStrict(sibling));

    assert.deepEqual(second, first);
    assert.equal(first.status, 'fatal', JSON.stringify(first));
    assert.match(JSON.stringify(first), /MIGRATION_SEED_DIGEST_MISMATCH/u);
    assert.equal(await readFile(stagedPath, 'utf8'), stagedBytes);
    assert.equal(await exists(path.join(sibling, 'accepted/r000/source-pack.json')), false);
    assert.equal(await exists(path.join(sibling, 'checkpoint.json')), false);
    assert.deepEqual(await fileSnapshot(fixture.legacy), legacyBefore);
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test('T13 a migration marker with a replaced v3 identity fails closed instead of entering the v3 runner', async () => {
  const fixture = await migratedActiveRun();
  try {
    const sibling = fixture.migration.sibling_run_directory;
    await writeFile(path.join(sibling, 'run-instance.json'), `${canonicalStringify({
      schema_version: '3.0.0', run_instance_id: fixture.migration.v4_run_id,
      created_at: '2026-09-09T00:00:00.000Z'
    })}\n`, 'utf8');
    const legacyBefore = await fileSnapshot(fixture.legacy);

    const first = /** @type {any} */ (await advanceStrict(sibling));
    const second = /** @type {any} */ (await advanceStrict(sibling));

    assert.deepEqual(second, first);
    assert.equal(first.status, 'fatal', JSON.stringify(first));
    assert.match(JSON.stringify(first), /MIGRATION_SIBLING_VERSION_INVALID/u);
    assert.equal(await exists(path.join(sibling, 'accepted')), false);
    assert.equal(await exists(path.join(sibling, 'checkpoint.json')), false);
    assert.deepEqual(await fileSnapshot(fixture.legacy), legacyBefore);
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test('T13 a schema-valid sibling identity cannot redirect the frozen parent lineage', async () => {
  const fixture = await migratedActiveRun();
  try {
    const sibling = fixture.migration.sibling_run_directory;
    const instancePath = path.join(sibling, 'run-instance.json');
    const instance = JSON.parse(await readFile(instancePath, 'utf8'));
    instance.lineage.parent_run_id = 'RUN-11111111-1111-4111-8111-111111111111';
    await writeFile(instancePath, `${canonicalStringify(instance)}\n`, 'utf8');
    const legacyBefore = await fileSnapshot(fixture.legacy);

    const first = /** @type {any} */ (await advanceStrict(sibling));
    const second = /** @type {any} */ (await advanceStrict(sibling));

    assert.deepEqual(second, first);
    assert.equal(first.status, 'fatal', JSON.stringify(first));
    assert.match(JSON.stringify(first), /MIGRATION_SIBLING_LINEAGE_INVALID/u);
    assert.equal(await exists(path.join(sibling, 'accepted')), false);
    assert.equal(await exists(path.join(sibling, 'checkpoint.json')), false);
    assert.deepEqual(await fileSnapshot(fixture.legacy), legacyBefore);
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test('T13 production replay fails deterministically for broken report, index, or frozen legacy bytes', async () => {
  const cases = [
    {
      name: 'report', code: 'MIGRATION_REPORT_DIGEST_MISMATCH',
      mutate: async (/** @type {Awaited<ReturnType<typeof migratedActiveRun>>} */ fixture) => {
        const index = JSON.parse(await readFile(path.join(
          fixture.catalog, 'migrations/v4/index.json'
        ), 'utf8'));
        const reportPath = path.join(fixture.catalog, index.transactions[0].report.path);
        await writeFile(reportPath, `${await readFile(reportPath, 'utf8')} `, 'utf8');
      }
    },
    {
      name: 'index', code: 'MIGRATION_NOT_COMMITTED',
      mutate: async (/** @type {Awaited<ReturnType<typeof migratedActiveRun>>} */ fixture) => {
        const indexPath = path.join(fixture.catalog, 'migrations/v4/index.json');
        const index = JSON.parse(await readFile(indexPath, 'utf8'));
        index.transactions = [];
        await writeFile(indexPath, `${canonicalStringify(index)}\n`, 'utf8');
      }
    },
    {
      name: 'legacy', code: 'legacy_source_mutated',
      mutate: async (/** @type {Awaited<ReturnType<typeof migratedActiveRun>>} */ fixture) => {
        await writeFile(path.join(fixture.legacy, 'changed-after-migration.txt'), 'changed', 'utf8');
      }
    }
  ];
  for (const scenario of cases) {
    const fixture = await migratedActiveRun();
    try {
      await scenario.mutate(fixture);
      const legacyBefore = await fileSnapshot(fixture.legacy);
      const first = /** @type {any} */ (await advanceStrict(
        fixture.migration.sibling_run_directory
      ));
      const second = /** @type {any} */ (await advanceStrict(
        fixture.migration.sibling_run_directory
      ));
      assert.deepEqual(second, first, scenario.name);
      assert.equal(first.status, 'fatal', `${scenario.name}: ${JSON.stringify(first)}`);
      assert.match(JSON.stringify(first), new RegExp(scenario.code, 'u'), scenario.name);
      assert.equal(await exists(path.join(
        fixture.migration.sibling_run_directory, 'accepted'
      )), false, scenario.name);
      assert.deepEqual(await fileSnapshot(fixture.legacy), legacyBefore, scenario.name);
    } finally {
      await rm(fixture.root, { recursive: true, force: true });
    }
  }
});
