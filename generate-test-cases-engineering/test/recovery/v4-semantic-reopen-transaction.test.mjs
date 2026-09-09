import assert from 'node:assert/strict';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

import * as semanticReopenTransactions from '../../src/semantic-reopen-transaction-v4.mjs';
import { canonicalStringify } from '../../src/canonical.mjs';
import checkpointSchema from '../../skill/generate-test-cases/scripts/schemas/checkpoint.schema.json' with { type: 'json' };
import {
  applySemanticClarificationEventsV4,
  compileSemanticClarificationCheckpointV4,
  constructSemanticClarificationEventV4
} from '../../src/clarification-v4.mjs';
import {
  deriveDecisionReopenOverlayV4,
  ensureActiveRunLifecycleV4,
  executeSemanticReopenTransactionV4,
  projectEffectiveDecisionsV4,
  readSemanticReopenTransactionV4,
  validateReopenedDecisionV4
} from '../../src/semantic-reopen-transaction-v4.mjs';
import {
  commitRevisionTransactionV4, ensureV4RunInstance
} from '../../src/revision-transaction-v4.mjs';
import {
  appendRequest, byteDigest, readJson, sha, withCatalog, withRun
} from '../helpers/v4-revision-transaction-fixture.mjs';
import { acquireRunLock } from '../../src/run-store.mjs';
import { validateAgainstSchema } from '../../src/schema-validator.mjs';

const CASE_RUN_ID = 'RUN-aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const EXECUTION_RUN_ID = 'RUN-bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const ROOT_ID = `ROOT-${'2'.repeat(64)}`;
const OTHER_ROOT_ID = `ROOT-${'4'.repeat(64)}`;

test('T10 execution lifecycle exposes a token-checked held-lock initializer', async () => {
  await withRun(async (/** @type {string} */ directory) => {
    await ensureV4RunInstance(directory, {
      run_id: EXECUTION_RUN_ID, delivery_intent: 'execution_plan'
    });
    await assert.rejects(
      semanticReopenTransactions.ensureActiveRunLifecycleV4WithHeldLock(directory, undefined),
      /RUN_LOCK_OWNERSHIP_REQUIRED/
    );
    const release = await acquireRunLock(directory);
    try {
      const lifecycle = await semanticReopenTransactions.ensureActiveRunLifecycleV4WithHeldLock(
        directory, release
      );
      assert.equal(lifecycle.status, 'active');
      assert.equal(lifecycle.version, 1);
    } finally {
      await release();
    }
  });
});

/** @param {string} catalog */
async function setup(catalog) {
  const caseDirectory = path.join(catalog, 'runs', CASE_RUN_ID);
  const executionDirectory = path.join(catalog, 'runs', EXECUTION_RUN_ID);
  await Promise.all([
    mkdir(caseDirectory, { recursive: true }),
    mkdir(executionDirectory, { recursive: true })
  ]);
  await Promise.all([
    ensureV4RunInstance(caseDirectory, {
      run_id: CASE_RUN_ID, delivery_intent: 'case_document'
    }),
    ensureV4RunInstance(executionDirectory, {
      run_id: EXECUTION_RUN_ID, delivery_intent: 'execution_plan'
    })
  ]);
  await ensureActiveRunLifecycleV4(executionDirectory);
  await commitRevisionTransactionV4(caseDirectory, appendRequest('final', null, 0, {
    run_id: CASE_RUN_ID, semantic_root: true
  }));
  const manifestText = await readFile(path.join(caseDirectory, 'output/current.json'), 'utf8');
  const manifest = JSON.parse(manifestText);
  const bundleText = await readFile(path.join(caseDirectory, manifest.bundle.path), 'utf8');
  const checkpoint = await readJson(path.join(caseDirectory, 'derived/r000/checkpoint.json'));
  const root = checkpoint.semantic_gap_ledger[0];
  const event = {
    event_type: 'reopen_semantic_question', run_id: EXECUTION_RUN_ID,
    presentation_id: 'PRES-execution', case_ids: [], reopen_event_id: 'EVENT-reopen-1',
    case_document_ref: {
      run_id: CASE_RUN_ID, revision: 0,
      manifest_digest: byteDigest(manifestText), bundle_digest: byteDigest(bundleText)
    },
    root_refs: [{ root_issue_id: root.root_issue_id, root_version_digest: root.root_version_digest }]
  };
  const resolver = (/** @type {string} */ runId) => {
    if (runId === CASE_RUN_ID) return caseDirectory;
    if (runId === EXECUTION_RUN_ID) return executionDirectory;
    return path.join(catalog, 'runs', runId);
  };
  return {
    caseDirectory, executionDirectory, event, rootId: root.root_issue_id,
    services: { resolve_run_directory: resolver }
  };
}

test('T10 semantic reopen creates one sibling, freezes inherited digests and supersedes only execution', async () => {
  await withCatalog(async (/** @type {string} */ catalog) => {
    const fixture = await setup(catalog);
    const parentManifest = await readFile(path.join(fixture.caseDirectory, 'output/current.json'), 'utf8');
    const parentCheckpoint = await readFile(path.join(fixture.caseDirectory, 'checkpoint.json'), 'utf8');
    const parentJournal = await readFile(path.join(fixture.caseDirectory, 'derived/r000/decision-journal.json'), 'utf8');
    const result = await executeSemanticReopenTransactionV4(catalog, fixture.event, fixture.services);
    assert.equal(result.status, 'semantic_reopen_committed');
    assert.match(result.sibling_run_id, /^RUN-[0-9a-f-]{36}$/u);
    assert.notEqual(result.sibling_run_id, CASE_RUN_ID);
    assert.notEqual(result.sibling_run_id, EXECUTION_RUN_ID);

    const siblingDirectory = path.join(catalog, 'runs', result.sibling_run_id);
    const instance = await readJson(path.join(siblingDirectory, 'run-instance.json'));
    const seed = await readJson(path.join(siblingDirectory, 'staging/semantic-reopen-seed.json'));
    const checkpoint = await readJson(path.join(siblingDirectory, 'checkpoint.json'));
    assert.equal(instance.delivery_intent, 'case_document');
    assert.equal(instance.lineage.parent_execution_run_id, EXECUTION_RUN_ID);
    assert.deepEqual(instance.lineage.parent_case_document_ref, fixture.event.case_document_ref);
    assert.equal(instance.lineage.decision_reopen_overlay_digest, seed.decision_reopen_overlay_digest);
    assert.equal(checkpoint.decision_reopen_overlay_digest, seed.decision_reopen_overlay_digest);
    assert.equal(checkpoint.clarification_state.root_states.find(
      (/** @type {any} */ state) => state.root_issue_id === fixture.rootId
    ).status, 'presented');
    assert.deepEqual(instance.lineage.inherited_artifacts, {
      source_pack_digest: byteDigest(await readFile(path.join(fixture.caseDirectory, 'accepted/r000/source-pack.json'))),
      decision_journal_digest: byteDigest(parentJournal),
      evidence_digest: byteDigest(await readFile(path.join(fixture.caseDirectory, 'accepted/r000/evidence-claims.json'))),
      scope_manifest_digest: byteDigest(await readFile(path.join(fixture.caseDirectory, 'derived/r000/scope-manifest.json')))
    });
    assert.equal(await readFile(path.join(fixture.caseDirectory, 'output/current.json'), 'utf8'), parentManifest);
    assert.equal(await readFile(path.join(fixture.caseDirectory, 'checkpoint.json'), 'utf8'), parentCheckpoint);
    assert.deepEqual(await readJson(path.join(fixture.executionDirectory, 'state/lifecycle.json')), {
      schema_version: '4.0.0', run_id: EXECUTION_RUN_ID, delivery_intent: 'execution_plan',
      status: 'superseded_by_semantic_reopen', version: 2,
      superseded_by: result.sibling_run_id, semantic_reopen_txn_id: result.txn_id
    });
  });
});

test('T10 production semantic reopen compiles a schema-valid single-target sibling without a test compiler', async () => {
  await withCatalog(async (/** @type {string} */ catalog) => {
    const fixture = await setup(catalog);
    const result = await executeSemanticReopenTransactionV4(catalog, fixture.event, {
      resolve_run_directory: fixture.services.resolve_run_directory
    });
    const siblingDirectory = path.join(catalog, 'runs', result.sibling_run_id);
    const checkpoint = await readJson(path.join(siblingDirectory, 'checkpoint.json'));
    assert.deepEqual(validateAgainstSchema(checkpoint, checkpointSchema), []);
    assert.equal(checkpoint.commit_profile, 'pre_case_pending');
    assert.equal(checkpoint.decision_reopen_overlay_digest, result.decision_reopen_overlay_digest);
    assert.deepEqual(checkpoint.reopened_targets, result.reopened_targets);
    assert.deepEqual(checkpoint.clarification_state.remaining_part_ids, [
      checkpoint.clarification_state.presentation.question_parts[0].question_part_id
    ]);
    assert.equal(checkpoint.clarification_state.presentation.question_parts.length, 1);
    assert.equal(
      checkpoint.clarification_state.presentation.question_parts[0].root_issue_id,
      fixture.rootId
    );

    const part = checkpoint.clarification_state.presentation.question_parts[0];
    const message = '新的确定结果';
    const messageDigest = byteDigest(message);
    const event = constructSemanticClarificationEventV4(
      checkpoint.clarification_state.presentation,
      part,
      'answer_question_part',
      {
        answer: message,
        authority: 'product_final',
        resolution: 'final',
        answer_origin: {
          type: 'authorized_confirmation',
          presentation_id: checkpoint.clarification_state.presentation.presentation_id,
          message_digest: messageDigest,
          answer_span: {
            start_scalar: 0,
            end_scalar: Array.from(message).length,
            excerpt_digest: messageDigest
          }
        }
      }
    );
    const parentJournal = await readJson(path.join(
      fixture.caseDirectory, 'derived/r000/decision-journal.json'
    ));
    const applied = applySemanticClarificationEventsV4({
      checkpoint,
      clarification_events: [event],
      existing_decisions: parentJournal.decisions,
      presentation_history: [checkpoint.clarification_state.presentation],
      normalized_user_messages: [message],
      previous_obligations_by_root: [],
      current_obligations_by_root: []
    });
    assert.equal(applied.commit_required, true);
    const decision = applied.decisions.at(-1);
    assert.deepEqual(
      decision.supersedes_decision_ids,
      result.reopened_targets[0].decision_suspension.newly_suspended_decision_ids
    );
    assert.equal(decision.target.root_version_digest, result.reopened_targets[0].reopened_root_version_digest);

    const projectedEvidence = await readJson(path.join(
      siblingDirectory, 'accepted/r000/evidence-claims.json'
    ));
    const recompiled = compileSemanticClarificationCheckpointV4({
      run_id: result.sibling_run_id, committed_revision: 1,
      committed_checkpoint_bytes: new TextEncoder().encode(`${canonicalStringify(checkpoint)}\n`),
      discovery_phase: 'pre_case',
      source_review_witness: checkpoint.source_review_witness,
      fact_ledger_digest: checkpoint.fact_ledger_digest,
      scope_manifest_digest: checkpoint.scope_manifest_digest,
      behavior_views_digest: null, case_drafts_digest: null,
      facts: projectedEvidence.fact_ledger, claims: projectedEvidence.claims,
      diagnostic_candidates: [], prior_checkpoint: applied.checkpoint
    }).checkpoint;
    assert.deepEqual(recompiled.reopened_targets, checkpoint.reopened_targets);
    assert.deepEqual(recompiled.decision_suspension_ledger, checkpoint.decision_suspension_ledger);
    assert.equal(
      recompiled.decision_reopen_overlay_digest,
      checkpoint.decision_reopen_overlay_digest
    );
  });
});

test('T10 reopened evidence removes suspended Decision Claims and restores direct ancestry only for the target', () => {
  const decision1 = `DEC-${'1'.repeat(64)}`;
  const decision2 = `DEC-${'2'.repeat(64)}`;
  const otherDecision = `DEC-${'3'.repeat(64)}`;
  const directClaim = `CLM-${'a'.repeat(64)}`;
  const decisionClaim1 = `CLM-${'b'.repeat(64)}`;
  const decisionClaim2 = `CLM-${'c'.repeat(64)}`;
  const otherClaim = `CLM-${'d'.repeat(64)}`;
  const targetFact = `FACT-${'e'.repeat(64)}`;
  const otherFact = `FACT-${'f'.repeat(64)}`;
  const evidence = {
    schema_version: '4.0.0', source_revision: 0,
    claims: [
      { claim_id: directClaim, claim_form: 'direct', superseded_by: decisionClaim1 },
      {
        claim_id: decisionClaim1, claim_form: 'decision-record', decision_id: decision1,
        superseded_by: decisionClaim2
      },
      { claim_id: decisionClaim2, claim_form: 'decision-record', decision_id: decision2 },
      { claim_id: otherClaim, claim_form: 'decision-record', decision_id: otherDecision }
    ],
    fact_ledger: [
      { fact_id: targetFact, status: 'active', claim_ids: [decisionClaim2] },
      { fact_id: otherFact, status: 'active', claim_ids: [otherClaim] }
    ]
  };
  const projected = semanticReopenTransactions.projectReopenedEvidenceV4(
    evidence,
    [{ root_issue_id: ROOT_ID, cumulative_suspended_decision_ids: [decision1, decision2] }],
    [{ root_issue_id: ROOT_ID, subject_fact_ids: [targetFact] }]
  );
  assert.deepEqual(projected.claims, [
    { claim_id: directClaim, claim_form: 'direct' },
    { claim_id: otherClaim, claim_form: 'decision-record', decision_id: otherDecision }
  ]);
  assert.deepEqual(projected.fact_ledger, [
    { fact_id: targetFact, status: 'ambiguous', claim_ids: [directClaim] },
    { fact_id: otherFact, status: 'active', claim_ids: [otherClaim] }
  ]);
});

test('T10 semantic reopen replay, conflict and concurrent duplicates converge without replaying supersession', async () => {
  await withCatalog(async (/** @type {string} */ catalog) => {
    const fixture = await setup(catalog);
    const results = await Promise.all(Array.from({ length: 3 }, () =>
      executeSemanticReopenTransactionV4(catalog, structuredClone(fixture.event), fixture.services)));
    assert.equal(new Set(results.map((result) => result.sibling_run_id)).size, 1);
    assert.equal(new Set(results.map((result) => canonicalStringify(result))).size, 1);
    const first = results[0];
    const replay = await executeSemanticReopenTransactionV4(catalog, fixture.event, fixture.services);
    assert.deepEqual(replay, first);
    assert.equal((await readJson(path.join(fixture.executionDirectory, 'state/lifecycle.json'))).version, 2);
    assert.equal((await readdir(path.join(catalog, 'runs'))).filter(
      (/** @type {string} */ name) => name === first.sibling_run_id
    ).length, 1);

    const conflict = structuredClone(fixture.event);
    conflict.root_refs = [{ root_issue_id: OTHER_ROOT_ID, root_version_digest: sha('other-root') }];
    await assert.rejects(
      executeSemanticReopenTransactionV4(catalog, conflict, fixture.services),
      /REOPEN_EVENT_PAYLOAD_CONFLICT/
    );
  });
});

for (const phase of ['reserved', 'sibling_committed', 'execution_superseded']) {
  test(`T10 semantic reopen recovers after ${phase}`, async () => {
    await withCatalog(async (/** @type {string} */ catalog) => {
      const fixture = await setup(catalog);
      let injected = false;
      await assert.rejects(executeSemanticReopenTransactionV4(catalog, fixture.event, fixture.services, {
        after_phase(observed) {
          if (!injected && observed === phase) {
            injected = true;
            throw new Error(`CRASH_AFTER_${phase}`);
          }
        }
      }), new RegExp(`CRASH_AFTER_${phase}`, 'u'));
      const recovered = await executeSemanticReopenTransactionV4(catalog, fixture.event, fixture.services);
      assert.equal(recovered.status, 'semantic_reopen_committed');
      assert.equal((await readSemanticReopenTransactionV4(catalog, EXECUTION_RUN_ID, fixture.event.reopen_event_id)).phase, 'complete');
      assert.equal((await readJson(path.join(fixture.executionDirectory, 'state/lifecycle.json'))).version, 2);
    });
  });
}

test('T10 crash after sibling r000 commit recovers before superseding its active execution parent', async () => {
  await withCatalog(async (/** @type {string} */ catalog) => {
    const fixture = await setup(catalog);
    await assert.rejects(
      executeSemanticReopenTransactionV4(catalog, fixture.event, fixture.services, {
        after_phase(observed) {
          if (observed === 'sibling_revision_committed') {
            throw new Error('CRASH_AFTER_SIBLING_REVISION_COMMITTED');
          }
        }
      }),
      /CRASH_AFTER_SIBLING_REVISION_COMMITTED/
    );
    const transaction = await readSemanticReopenTransactionV4(
      catalog, EXECUTION_RUN_ID, fixture.event.reopen_event_id
    );
    assert.equal(transaction.phase, 'reserved');
    const siblingDirectory = path.join(catalog, 'runs', transaction.sibling_run_id);
    assert.equal((await readJson(path.join(
      siblingDirectory, 'transactions/committed/r000.json'
    ))).commit_profile, 'pre_case_pending');
    assert.equal((await readJson(path.join(
      fixture.executionDirectory, 'state/lifecycle.json'
    ))).status, 'active');

    const recovered = await executeSemanticReopenTransactionV4(
      catalog, fixture.event, fixture.services
    );
    assert.equal(recovered.sibling_run_id, transaction.sibling_run_id);
    assert.equal((await readJson(path.join(
      fixture.executionDirectory, 'state/lifecycle.json'
    ))).status, 'superseded_by_semantic_reopen');
  });
});

test('T10 stale root, bad parent digest and inactive execution fail before reservation', async () => {
  for (const mutate of [
    (/** @type {any} */ fixture) => { fixture.event.root_refs[0].root_version_digest = sha('stale'); },
    (/** @type {any} */ fixture) => { fixture.event.case_document_ref.manifest_digest = sha('forged'); },
    async (/** @type {any} */ fixture) => {
      const lifecycle = await readJson(path.join(fixture.executionDirectory, 'state/lifecycle.json'));
      lifecycle.status = 'cancelled';
      const { atomicWriteJson } = await import('../../src/run-store.mjs');
      await atomicWriteJson(fixture.executionDirectory, path.join(fixture.executionDirectory, 'state/lifecycle.json'), lifecycle);
    }
  ]) {
    await withCatalog(async (/** @type {string} */ catalog) => {
      const fixture = await setup(catalog);
      await mutate(fixture);
      await assert.rejects(
        executeSemanticReopenTransactionV4(catalog, fixture.event, fixture.services),
        /REOPEN_(ROOT_VERSION_STALE|PARENT_MANIFEST_DIGEST_MISMATCH|EXECUTION_NOT_ACTIVE)/
      );
      assert.equal(await readSemanticReopenTransactionV4(
        catalog, EXECUTION_RUN_ID, fixture.event.reopen_event_id
      ), null);
      assert.equal((await readdir(path.join(catalog, 'runs'))).length, 2);
    });
  }
});

test('T10 semantic reopen rejects a mutated inherited artifact from the committed parent revision', async () => {
  await withCatalog(async (/** @type {string} */ catalog) => {
    const fixture = await setup(catalog);
    const sourcePath = path.join(fixture.caseDirectory, 'accepted/r000/source-pack.json');
    const source = await readJson(sourcePath);
    source.mutated_after_commit = true;
    await writeFile(sourcePath, `${canonicalStringify(source)}\n`, 'utf8');

    await assert.rejects(
      executeSemanticReopenTransactionV4(catalog, fixture.event, fixture.services),
      /REOPEN_PARENT_ARTIFACT_DIGEST_MISMATCH/
    );
    assert.equal(await readSemanticReopenTransactionV4(
      catalog, EXECUTION_RUN_ID, fixture.event.reopen_event_id
    ), null);
    assert.equal((await readdir(path.join(catalog, 'runs'))).length, 2);
  });
});

test('T10 a reopened parent cannot drop an ancestor suspension ledger', async () => {
  await withCatalog(async (/** @type {string} */ catalog) => {
    const fixture = await setup(catalog);
    const instancePath = path.join(fixture.caseDirectory, 'run-instance.json');
    const instance = await readJson(instancePath);
    const currentDecision = `DEC-${'1'.repeat(64)}`;
    const ancestorDecision = `DEC-${'0'.repeat(64)}`;
    instance.lineage = {
      creation_reason: 'reopen_semantic_question',
      parent_case_document_ref: fixture.event.case_document_ref,
      parent_execution_run_id: EXECUTION_RUN_ID,
      reopen_event_id: 'EVENT-ancestor',
      reopened_targets: [{
        root_issue_id: fixture.rootId,
        prior_root_version_digest: sha('ancestor'),
        reopened_root_version_digest: fixture.event.root_refs[0].root_version_digest,
        decision_suspension: {
          newly_suspended_decision_ids: [currentDecision],
          cumulative_suspended_decision_ids: [ancestorDecision, currentDecision],
          reopen_event_id: 'EVENT-ancestor'
        }
      }],
      decision_reopen_overlay_digest: sha('forged-overlay'),
      inherited_artifacts: {
        source_pack_digest: sha('source'), decision_journal_digest: sha('journal'),
        evidence_digest: sha('evidence'), scope_manifest_digest: sha('scope')
      }
    };
    const { atomicWriteJson } = await import('../../src/run-store.mjs');
    await atomicWriteJson(fixture.caseDirectory, instancePath, instance);
    await assert.rejects(
      executeSemanticReopenTransactionV4(catalog, fixture.event, fixture.services),
      /REOPEN_PARENT_SUSPENSION_LINEAGE_INVALID/
    );
    assert.equal(await readSemanticReopenTransactionV4(
      catalog, EXECUTION_RUN_ID, fixture.event.reopen_event_id
    ), null);
  });
});

test('T10 cumulative suspension prevents ancestor Decisions from reviving across consecutive reopen', () => {
  const prior = [{ root_issue_id: ROOT_ID, cumulative_suspended_decision_ids: ['DEC-D1'] }];
  const decisions = [{
    decision_id: 'DEC-D1', target: { root_issue_id: ROOT_ID, root_version_digest: sha('v1') },
    status: 'active', supersedes_decision_ids: []
  }, {
    decision_id: 'DEC-D2', target: { root_issue_id: ROOT_ID, root_version_digest: sha('v2') },
    status: 'active', supersedes_decision_ids: ['DEC-D1']
  }, {
    decision_id: 'DEC-other', target: { root_issue_id: OTHER_ROOT_ID, root_version_digest: sha('other') },
    status: 'active', supersedes_decision_ids: []
  }];
  const overlay = deriveDecisionReopenOverlayV4({
    reopen_event_id: 'EVENT-second',
    targets: [{ root_issue_id: ROOT_ID, prior_root_version_digest: sha('v2') }],
    decisions, prior_suspension_ledger: prior
  });
  assert.deepEqual(overlay.reopened_targets[0].decision_suspension.newly_suspended_decision_ids, ['DEC-D2']);
  assert.deepEqual(overlay.reopened_targets[0].decision_suspension.cumulative_suspended_decision_ids, ['DEC-D1', 'DEC-D2']);
  const projection = projectEffectiveDecisionsV4(decisions, overlay.decision_suspension_ledger);
  assert.deepEqual(projection.effective_decisions.map((/** @type {any} */ item) => item.decision_id), ['DEC-other']);
  assert.deepEqual(projection.audit_decisions.filter(
    (/** @type {any} */ item) => item.status === 'suspended_by_reopen'
  ).map((/** @type {any} */ item) => item.decision_id), ['DEC-D1', 'DEC-D2']);

  const target = overlay.reopened_targets[0];
  assert.doesNotThrow(() => validateReopenedDecisionV4({
    decision_id: 'DEC-D3',
    target: { root_issue_id: ROOT_ID, root_version_digest: target.reopened_root_version_digest },
    supersedes_decision_ids: ['DEC-D2']
  }, target));
  assert.throws(() => validateReopenedDecisionV4({
    decision_id: 'DEC-D3',
    target: { root_issue_id: ROOT_ID, root_version_digest: target.reopened_root_version_digest },
    supersedes_decision_ids: ['DEC-D1', 'DEC-D2']
  }, target), /REOPEN_DECISION_SUPERSESSION_INVALID/);
});

test('T10 suspension ledgers reject unknown, duplicate and cross-root Decision identities', () => {
  const journal = [{
    decision_id: 'DEC-one', target: { root_issue_id: ROOT_ID, root_version_digest: sha('one') },
    status: 'active', supersedes_decision_ids: []
  }, {
    decision_id: 'DEC-other', target: { root_issue_id: OTHER_ROOT_ID, root_version_digest: sha('other') },
    status: 'active', supersedes_decision_ids: []
  }];
  assert.throws(() => projectEffectiveDecisionsV4(journal, [{
    root_issue_id: ROOT_ID, cumulative_suspended_decision_ids: ['DEC-missing']
  }]), /DECISION_SUSPENSION_ID_UNKNOWN/);
  assert.throws(() => projectEffectiveDecisionsV4(journal, [{
    root_issue_id: ROOT_ID, cumulative_suspended_decision_ids: ['DEC-other']
  }]), /DECISION_SUSPENSION_ROOT_MISMATCH/);
  assert.throws(() => projectEffectiveDecisionsV4([...journal, structuredClone(journal[0])], []),
    /DECISION_JOURNAL_DUPLICATE/);
});
