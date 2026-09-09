import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import replySchema from '../../skill/generate-test-cases/scripts/schemas/reply.schema.json' with { type: 'json' };
import { advanceStrict } from '../../src/advance-strict.mjs';
import { canonicalStringify, digest } from '../../src/canonical.mjs';
import { migrateLegacyRun } from '../../src/migrate-v3-run.mjs';
import { STAGE_FILES } from '../../src/run-store.mjs';
import { validateAgainstSchema } from '../../src/schema-validator.mjs';
import { bendReviewJourneyFixture } from '../fixtures/v4/bend-review-platform/journey-fixture.mjs';
import { buildJourney, evaluateJourneyRevision } from '../helpers/run-journey.mjs';

/** @param {string} directory @param {keyof typeof STAGE_FILES} stage @param {any} value */
async function stage(directory, stage, value) {
  await mkdir(path.join(directory, 'staging'), { recursive: true });
  await writeFile(path.join(directory, 'staging', STAGE_FILES[stage]), `${canonicalStringify(value)}\n`, 'utf8');
}

/** @param {string} target */
async function exists(target) {
  try { await stat(target); return true; } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return false;
    throw error;
  }
}

test('[P-11][BR-14][BR-15] T15 adapter repair cannot become a business/resource question and zero Case cannot fall back to stray output', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'gtc-v4-no-fallback-'));
  try {
    const initial = /** @type {any} */ (await advanceStrict(directory));
    const fixture = await bendReviewJourneyFixture(initial.scope.run_instance_id);
    fixture.artifacts.evidence_claims.semantic_gaps = [];
    await stage(directory, 'source_pack', fixture.artifacts.source_pack);
    await advanceStrict(directory);
    await stage(directory, 'evidence_claims', fixture.artifacts.evidence_claims);
    await advanceStrict(directory);

    const malformedViews = structuredClone(fixture.artifacts.behavior_views);
    malformedViews.views[0].elements[0].evidence_bindings = malformedViews.views[0].elements[0]
      .evidence_bindings.filter((/** @type {any} */ binding) => binding.field_path !== '/business_outcome');
    await stage(directory, 'behavior_views', malformedViews);
    const repair = /** @type {any} */ (await advanceStrict(directory));
    assert.equal(repair.status, 'need_revision', JSON.stringify(repair));
    assert.equal(repair.stage, 'behavior_views');
    assert.notEqual(repair.status, 'need_user_answers');
    assert.doesNotMatch(JSON.stringify(repair), /环境|账号|权限资源|样本数据|查询方式/iu);

    await stage(directory, 'behavior_views', fixture.artifacts.behavior_views);
    const next = /** @type {any} */ (await advanceStrict(directory));
    assert.equal(next.status, 'need_artifact', JSON.stringify(next));
    assert.equal(next.stage, 'case_drafts');

    const strayMarkdown = path.join(directory, 'agent-fallback-test-cases.md');
    const strayWorkbook = path.join(directory, 'agent-fallback-test-cases.xlsx');
    await writeFile(strayMarkdown, '# Agent 手工兜底：不得交付\n', 'utf8');
    await writeFile(strayWorkbook, 'not-an-authorized-workbook', 'utf8');
    const zeroCases = structuredClone(fixture.artifacts.case_drafts);
    zeroCases.cases = [];
    await stage(directory, 'case_drafts', zeroCases);
    const fatal = /** @type {any} */ (await advanceStrict(directory));

    assert.equal(fatal.status, 'fatal', JSON.stringify(fatal));
    assert.equal(fatal.result_kind, 'quality_failure');
    assert.equal(fatal.incomplete_reason.code, 'APPLICABLE_PRIMARY_OUTCOME_WITHOUT_CASE');
    assert.deepEqual(fatal.produced_artifacts, []);
    assert.deepEqual(validateAgainstSchema(fatal, replySchema), []);
    assert.doesNotMatch(JSON.stringify(fatal), /agent-fallback-test-cases/iu);
    assert.equal(await exists(path.join(directory, 'output/current.json')), false);
    assert.equal(await readFile(strayMarkdown, 'utf8'), '# Agent 手工兜底：不得交付\n');
    assert.equal(await readFile(strayWorkbook, 'utf8'), 'not-an-authorized-workbook');
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('T15 replay re-verifies and preserves the earlier canonical current manifest byte-for-byte', async () => {
  const deliveredDirectory = await mkdtemp(path.join(os.tmpdir(), 'gtc-v4-authority-'));
  try {
    const initial = /** @type {any} */ (await advanceStrict(deliveredDirectory));
    const fixture = await bendReviewJourneyFixture(initial.scope.run_instance_id);
    fixture.artifacts.evidence_claims.semantic_gaps = [];
    for (const stageName of /** @type {Array<keyof typeof STAGE_FILES>} */ (Object.keys(STAGE_FILES))) {
      await stage(deliveredDirectory, stageName, fixture.artifacts[stageName]);
      await advanceStrict(deliveredDirectory);
    }
    const before = await readFile(path.join(deliveredDirectory, 'output/current.json'), 'utf8');
    const replay = /** @type {any} */ (await advanceStrict(deliveredDirectory));
    assert.equal(replay.status, 'finished');
    assert.equal(await readFile(path.join(deliveredDirectory, 'output/current.json'), 'utf8'), before);
    assert.deepEqual(
      replay.produced_artifacts.map((/** @type {any} */ item) => item.path).sort(),
      Object.values(JSON.parse(before)).filter((/** @type {any} */ item) => item?.path)
        .map((/** @type {any} */ item) => item.path).sort()
    );
  } finally {
    await rm(deliveredDirectory, { recursive: true, force: true });
  }
});

test('T15 a read-only v3 migration sibling is consumable by the production runner only through fresh v4 source reanalysis', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'gtc-v4-migration-journey-'));
  const catalog = path.join(root, 'catalog');
  const legacy = path.join(root, 'legacy');
  try {
    await Promise.all([mkdir(catalog), mkdir(legacy)]);
    const legacyArtifacts = buildJourney('all-e3');
    legacyArtifacts.source_pack.delivery_intent = 'case_document';
    const legacyResult = /** @type {any} */ (evaluateJourneyRevision(
      legacyArtifacts, 'pause_for_clarification'
    ));
    await writeFile(path.join(legacy, 'run-instance.json'), `${canonicalStringify({
      schema_version: '3.0.0', run_instance_id: legacyArtifacts.source_pack.run_instance_id,
      created_at: '2026-09-09T00:00:00.000Z'
    })}\n`, 'utf8');
    await mkdir(path.join(legacy, 'accepted/r000'), { recursive: true });
    for (const [stageName, fileName] of Object.entries(STAGE_FILES)) {
      await writeFile(
        path.join(legacy, 'accepted/r000', fileName),
        `${canonicalStringify(legacyArtifacts[stageName])}\n`, 'utf8'
      );
    }
    await mkdir(path.join(legacy, 'derived/r000'), { recursive: true });
    await writeFile(
      path.join(legacy, 'derived/r000/clarification-state.json'),
      `${canonicalStringify(legacyResult.clarification_state)}\n`, 'utf8'
    );
    await writeFile(path.join(legacy, 'checkpoint.json'), `${canonicalStringify({
      schema_version: '3.0.0', compiler_version: '0.4.0',
      run_instance_id: legacyArtifacts.source_pack.run_instance_id,
      source_revision: 0, stage: 'clarification',
      accepted_artifact_digests: Object.fromEntries(
        Object.keys(STAGE_FILES).map(key => [key, digest(legacyArtifacts[key])])
      )
    })}\n`, 'utf8');
    const legacySourceBefore = await readFile(path.join(legacy, 'accepted/r000/source-pack.json'), 'utf8');

    const migrated = await migrateLegacyRun(catalog, legacy);
    assert.equal(migrated.outcome, 'migrated', JSON.stringify(migrated));
    assert.equal(migrated.authority, 'migration_diagnostic');
    assert.equal(await readFile(path.join(legacy, 'accepted/r000/source-pack.json'), 'utf8'), legacySourceBefore);

    const reanalysis = await bendReviewJourneyFixture(migrated.v4_run_id);
    reanalysis.artifacts.evidence_claims.semantic_gaps = [];
    await stage(migrated.sibling_run_directory, 'source_pack', reanalysis.artifacts.source_pack);
    let reply = /** @type {any} */ (await advanceStrict(migrated.sibling_run_directory));
    assert.equal(reply.status, 'need_artifact', JSON.stringify(reply));
    assert.equal(reply.stage, 'evidence_claims', JSON.stringify(reply));
    for (const stageName of /** @type {Array<keyof typeof STAGE_FILES>} */ ([
      'evidence_claims', 'behavior_views', 'case_drafts'
    ])) {
      await stage(migrated.sibling_run_directory, stageName, reanalysis.artifacts[stageName]);
      reply = await advanceStrict(migrated.sibling_run_directory);
    }
    assert.equal(reply.status, 'finished', JSON.stringify(reply));
    assert.equal(reply.result_kind, 'delivered_cases');
    assert.equal(await readFile(path.join(legacy, 'accepted/r000/source-pack.json'), 'utf8'), legacySourceBefore);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
