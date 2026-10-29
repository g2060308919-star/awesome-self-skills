import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { canonicalArtifactSnapshot, canonicalStringify, digest, evidenceComponentDigests } from '../../src/canonical.mjs';
import { ensureV4RunInstance, commitRevisionTransactionV4 } from '../../src/revision-transaction-v4.mjs';
import { latestV4Contract, v4ContractForSchema } from '../../src/v4-contract.mjs';
import { constructSemanticClarificationEventV4, applySemanticClarificationEventsV4, compileSemanticClarificationCheckpointV4 } from '../../src/clarification-v4.mjs';
import { bindV4PrdCollectionObservation } from '../../src/prd-source-collection-v4.mjs';
import { reliabilityFixture, stageCollection, stageRaw } from '../helpers/v4-reliability-fixture.mjs';
import { v4PipelineFixture } from '../helpers/v4-pipeline-fixture.mjs';
import { v4GeneralQualityFixture } from '../helpers/v4-general-quality-fixture.mjs';
import { verifyCaseDocumentDeliveryV4 } from '../../src/canonical-delivery-v4.mjs';
import { constructV4TopologyEvidence, discoverV4Topology } from '../../src/topology-adapter-v4.mjs';
import { advanceStrict } from '../../src/advance-strict.mjs';
import { appendRequest, withCatalog } from '../helpers/v4-revision-transaction-fixture.mjs';

const publicAdapter = /** @type {any} */ (await import(process.env.GTC_RELIABILITY_RUNNER
  ? pathToFileURL(process.env.GTC_RELIABILITY_RUNNER).href : '../../src/entry.mjs'));

const RUN = 'RUN-aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
/** @param {string|Uint8Array} value */
const sha = value => 'sha256:' + createHash('sha256').update(value).digest('hex');
/** @param {string} directory @param {string} prefix @returns {Promise<any[]>} */
async function snapshot(directory, prefix = '') {
  const result = [];
  for (const entry of (await readdir(directory, { withFileTypes: true })).sort((/** @type {any} */ a, /** @type {any} */ b) => a.name.localeCompare(b.name))) {
    const relative = path.join(prefix, entry.name), absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) result.push(...await snapshot(absolute, relative));
    else result.push([relative, sha(await readFile(absolute))]);
  }
  return result;
}
/** @param {string} catalog @param {{schema?:string,pending?:boolean,answers?:string[]}} options */
async function parent(catalog, { schema = '4.3.2', pending = false, answers = [] } = {}) {
  const directory = path.join(catalog, 'runs', RUN);
  await mkdir(directory);
  const contract = v4ContractForSchema(schema);
  if (!contract) throw new Error('FIXTURE_CONTRACT_INVALID');
  await ensureV4RunInstance(directory, { run_id: RUN, delivery_intent: 'case_document', contract });
  const fixture = ['4.0.0', '4.2.0'].includes(schema) ? v4PipelineFixture()
    : reliabilityFixture(RUN, /** @type {any} */ ({ schema: '4.3.2', collision: false, upgrade: answers.length > 0 }));
  const source = fixture.artifacts.source_pack, evidence = fixture.artifacts.evidence_claims;
  source.schema_version = schema; source.run_instance_id = RUN; evidence.schema_version = schema;
  if (['4.0.0', '4.2.0'].includes(schema)) {
    evidence.semantic_gaps = [{ category: 'semantic_gap', code: 'OLD_RULE',
      subject_fact_ids: [evidence.fact_ledger[0].fact_id], source_claim_ids: [evidence.claims[0].claim_id],
      missing_aspect: 'acceptance_timing', scope_ref: 'checkout', question: '何时接受订单？',
      why_needed: '确定验收时点。', decision_impact: '改变验收结果。', unresolved_outcome: '验收时点未知。',
      answer_options: ['提交时'], risk_level: 'high', discovery_phase: 'pre_case', affected_test_point_ids: [] }];
  }
  if (answers.length) evidence.semantic_gaps = ['final', 'temporary', 'pending'].map((kind, index) => ({
    ...structuredClone(evidence.semantic_gaps[0]), code: `UPGRADE_RULE_${index}`, missing_aspect: `upgrade_rule_${index}`,
    subject_fact_ids: [['f200'], ['f205'], ['f210']][index], source_claim_ids: [['c200'], ['c205'], ['c210']][index],
    question: `测试升级规则 ${kind} 的结果是什么？` }));
  if (pending) Object.assign(evidence, JSON.parse(canonicalStringify(evidence)));
  await stageRaw(directory, 'source_pack', source);
  await stageRaw(directory, 'evidence_claims', evidence);
  if (pending) {
    let checkpoint = compileSemanticClarificationCheckpointV4({ ...contract, run_id: RUN,
      committed_revision: 0,
      committed_checkpoint_bytes: new TextEncoder().encode(`${canonicalStringify({
        schema_version: schema, compiler_version: contract.compiler_version, run_id: RUN, genesis: true })}\n`),
      discovery_phase: 'pre_case', source_review_witness: {
        expected_unit_ids: source.sources.flatMap((/** @type {any} */ item) => item.semantic_projection.structure.map((/** @type {any} */ unit) => unit.unit_id)),
        reviewed_unit_ids: source.source_reviews.flatMap((/** @type {any} */ item) => item.units.map((/** @type {any} */ unit) => unit.unit_id)) },
      fact_ledger_digest: 'sha256:' + digest(evidence.fact_ledger),
      scope_manifest_digest: 'sha256:' + digest(evidence.scope_manifest),
      behavior_views_digest: null, case_drafts_digest: null,
      facts: evidence.fact_ledger, claims: evidence.claims, diagnostic_candidates: evidence.semantic_gaps,
      prior_checkpoint: null
    }).checkpoint;
    for (const [index, resolution] of answers.entries()) {
      const presentation = checkpoint.clarification_state.presentation;
      const part = presentation.question_parts.find((/** @type {any} */ value) => value.question.includes(index === 0 ? 'final' : 'temporary'));
      const message = index === 0 ? '一条记录' : '暂定两条';
      const event = /** @type {any} */ (constructSemanticClarificationEventV4(presentation, part, 'answer_question_part', {
        answer: message, resolution, authority: resolution === 'final' ? 'product_final' : 'task_scoped',
        answer_origin: { type: resolution === 'final' ? 'authorized_confirmation' : 'user_statement',
          presentation_id: presentation.presentation_id, message_digest: sha(message),
          answer_span: { start_scalar: 0, end_scalar: Array.from(message).length, excerpt_digest: sha(message) } } }));
      const applied = applySemanticClarificationEventsV4({ checkpoint, clarification_events: [event],
        existing_decisions: source.decision_records, normalized_user_messages: [message], presentation_history: [],
        previous_obligations_by_root: [], current_obligations_by_root: [] });
      checkpoint = applied.checkpoint;
      source.decision_records = applied.decisions;
      source.clarification_events.push(event);
      const unit = { unit_id: `UNIT-upgrade-answer-${index}`, text: message, type: 'user_statement',
        presentation_id: event.presentation_id, message_digest: sha(message),
        answer_span: { start: 0, end: Array.from(message).length } };
      const material = source.sources[0];
      material.semantic_projection.structure.push(unit);
      material.semantic_digest = 'sha256:' + digest(material.semantic_projection);
      for (const locator of source.locators) locator.semantic_digest = material.semantic_digest;
      source.locators.push({ locator_id: `LOC-upgrade-answer-${index}`, source_id: material.source_id,
        semantic_digest: material.semantic_digest, unit_id: unit.unit_id, excerpt: message, excerpt_digest: sha(message),
        domain: 'business', field_path: '/state', type: 'user_statement', presentation_id: event.presentation_id,
        message_digest: sha(message), answer_span: unit.answer_span });
      source.source_reviews[0].semantic_digest = material.semantic_digest;
      source.source_reviews[0].units.push({ unit_id: unit.unit_id, content_digest: sha(message), classification: 'non_normative' });
      checkpoint.source_review_witness.expected_unit_ids.push(unit.unit_id);
      checkpoint.source_review_witness.reviewed_unit_ids.push(unit.unit_id);
    }
    if (answers.length) {
      const topology = discoverV4Topology(source, evidence.claims);
      evidence.topology_discovery = topology;
      evidence.topology_review = { ...topology.scanned_units, unresolved_candidate_ids: [] };
      evidence.topology_dispositions = topology.topology_candidates.map((/** @type {any} */ candidate) => ({
        candidate_id: candidate.candidate_id, disposition: 'module', module_ref: 'checkout', role: 'primary',
        review_basis_claim_ids: evidence.claims.filter((/** @type {any} */ claim) =>
          candidate.locator_ids.every((/** @type {string} */ id) => claim.source_locator_ids.includes(id)))
          .map((/** @type {any} */ claim) => claim.claim_id) }));
      Object.assign(evidence, constructV4TopologyEvidence(source, evidence.claims, {
        discovery_digest: topology.discovery_digest, primary_surface: 'checkout',
        topology_review: evidence.topology_review, topology_dispositions: evidence.topology_dispositions
      }));
      checkpoint.fact_ledger_digest = 'sha256:' + digest(evidence.fact_ledger);
    }
    const json = (/** @type {any} */ value) => ({ format: 'json', value });
    await commitRevisionTransactionV4(directory, { append_id: 'upgrade-fixture', append_digest: sha('upgrade-fixture'),
      base_revision: null, candidate_revision: 0, semantic_digest: sha('semantic-fixture'), commit_profile: 'pre_case_pending',
      artifacts: {
        source_pack: json(source), evidence_claims: json(evidence), checkpoint: json(checkpoint),
        decision_journal: json({ schema_version: schema, source_revision: 0, decisions: source.decision_records }),
        fact_ledger: json({ schema_version: schema, source_revision: 0, facts: evidence.fact_ledger }),
        scope_manifest: json({ schema_version: schema, source_revision: 0, ...evidence.scope_manifest }),
        clarification_state: json({ schema_version: schema, source_revision: 0, ...checkpoint.clarification_state })
      } });
  }
  if (schema === '4.3.2') {
    await stageCollection(directory, { status: 'need_revision', stage: 'source_pack', run_id: RUN,
      scope: { run_instance_id: RUN, source_revision: 0 } }, source);
    await bindV4PrdCollectionObservation(directory, source);
  }
  return { directory, source, evidence };
}

test('T17 public bootstrap creates one latest version_upgrade successor and leaves failed staging bytes unchanged', async () => {
  await withCatalog(async catalog => {
    const f = await parent(catalog);
    const before = await snapshot(f.directory);
    const first = await publicAdapter.createV4RunDirectory(catalog, { creation_reason: 'version_upgrade', parent_run_id: RUN });
    const second = await publicAdapter.createV4RunDirectory(catalog, { creation_reason: 'version_upgrade', parent_run_id: RUN });
    assert.equal(first.run_id, second.run_id);
    assert.equal(first.lineage.creation_reason, 'version_upgrade');
    const identity = JSON.parse(await readFile(path.join(first.run_directory, 'run-instance.json')));
    assert.equal(identity.schema_version, latestV4Contract().schema_version);
    assert.deepEqual(await snapshot(f.directory), before);
    const evidence = JSON.parse(await readFile(path.join(first.run_directory, 'staging/evidence-claims.json')));
    assert.equal(canonicalStringify({ fact_ledger: evidence.fact_ledger }), canonicalStringify({ fact_ledger: f.evidence.fact_ledger }));
    assert.equal((await publicAdapter.advanceStrict(first.run_directory)).stage, 'evidence_claims');
    const pending = await publicAdapter.advanceStrict(first.run_directory);
    assert.equal(pending.status, 'need_user_answers', JSON.stringify(pending));
    assert.deepEqual(await snapshot(f.directory), before);
  });
});

test('T17 committed pending history is verified before latest recompile; byte corruption is rejected', async () => {
  const { createVersionUpgradeSiblingV4 } = await import('../../src/version-upgrade-v4.mjs');
  await withCatalog(async catalog => {
    const f = await parent(catalog, { pending: true });
    const before = await snapshot(f.directory);
    const result = await createVersionUpgradeSiblingV4(catalog, { parent_run_id: RUN });
    assert.equal(result.strategy.restart_stage, 'evidence_claims');
    assert.deepEqual(await snapshot(f.directory), before);
    await writeFile(path.join(f.directory, 'accepted/r000/evidence-claims.json'), '{}\n');
    await assert.rejects(createVersionUpgradeSiblingV4(catalog, { parent_run_id: RUN }), /UPGRADE_HISTORY_ARTIFACT_DIGEST_INVALID/);
  });
});

test('T20 interruption at each real upgrade journal phase resumes the same successor', async () => {
  const { createVersionUpgradeSiblingV4 } = await import('../../src/version-upgrade-v4.mjs');
  for (const phase of ['reserved', 'identity_created', 'materials_staged', 'complete']) {
    await withCatalog(async catalog => {
      const f = await parent(catalog);
      const before = await snapshot(f.directory);
      await assert.rejects(createVersionUpgradeSiblingV4(catalog, { parent_run_id: RUN }, {
        after_phase(value) { if (value === phase) throw new Error('injected interruption'); }
      }), /injected interruption/);
      const result = await createVersionUpgradeSiblingV4(catalog, { parent_run_id: RUN });
      const replay = await createVersionUpgradeSiblingV4(catalog, { parent_run_id: RUN });
      assert.equal(result.run_id, replay.run_id);
      assert.equal((await readdir(path.join(catalog, 'runs'))).length, 2);
      assert.deepEqual(await snapshot(f.directory), before);
    });
  }
});

test('T20 every published historical pair has a declared bounded strategy; unknown pairs fail closed', async () => {
  const { createVersionUpgradeSiblingV4, V4_UPGRADE_SUPPORT_MATRIX } = await import('../../src/version-upgrade-v4.mjs');
  for (const schema of ['4.0.0', '4.2.0', '4.3.0', '4.3.1', '4.3.2']) {
    await withCatalog(async catalog => {
      const f = await parent(catalog, { schema, pending: true });
      const result = await createVersionUpgradeSiblingV4(catalog, { parent_run_id: RUN });
      assert.ok(V4_UPGRADE_SUPPORT_MATRIX.some(item => item.schema_version === schema));
      assert.equal(result.strategy.answer_policy, 'prove_final_else_reask');
      assert.deepEqual(JSON.parse(await readFile(path.join(result.run_directory, 'staging/source-pack.json'))).sources, f.source.sources);
    });
  }
  await withCatalog(async catalog => {
    const f = await parent(catalog);
    const identityPath = path.join(f.directory, 'run-instance.json');
    const identity = JSON.parse(await readFile(identityPath));
    identity.schema_version = '4.99.0';
    await writeFile(identityPath, JSON.stringify(identity));
    await assert.rejects(createVersionUpgradeSiblingV4(catalog, { parent_run_id: RUN }), /UPGRADE_PARENT_CONTRACT_UNSUPPORTED/);
    assert.deepEqual(await readdir(path.join(catalog, 'runs')), [RUN]);
  });
});


test('T18 latest continuation reuses only fully proven final answer; temporary and pending roots are reasked', async () => {
  const { createVersionUpgradeSiblingV4 } = await import('../../src/version-upgrade-v4.mjs');
  await withCatalog(async catalog => {
    const f = await parent(catalog, { pending: true, answers: ['final', 'temporary'] });
    const original = await snapshot(f.directory);
    const sibling = await createVersionUpgradeSiblingV4(catalog, { parent_run_id: RUN });
    let reply = await advanceStrict(sibling.run_directory);
    assert.equal(reply.status, 'need_revision', JSON.stringify(reply));
    assert.equal(reply.stage, 'evidence_claims');
    reply = await advanceStrict(sibling.run_directory);
    assert.equal(reply.status, 'need_user_answers', JSON.stringify(reply));
    const checkpoint = JSON.parse(await readFile(path.join(sibling.run_directory, 'checkpoint.json')));
    assert.deepEqual(checkpoint.clarification_state.root_states.map((/** @type {any} */ state) => state.status).sort(),
      ['presented', 'presented', 'resolved_final']);
    assert.equal(reply.semantic_presentation.question_parts.length, 2);
    const audits = await readdir(path.join(sibling.run_directory, 'upgrade/answer-bindings'));
    assert.equal(audits.length, 1);
    const audit = JSON.parse(await readFile(path.join(sibling.run_directory, 'upgrade/answer-bindings', audits[0])));
    assert.equal(audit.mappings.filter((/** @type {any} */ mapping) => mapping.reusable).length, 1);
    assert.equal(audit.candidate_checkpoint_digest, sha(await readFile(path.join(sibling.run_directory, 'checkpoint.json'))));
    const acceptedSource = JSON.parse(await readFile(path.join(sibling.run_directory, 'accepted/r000/source-pack.json')));
    assert.deepEqual(acceptedSource.decision_records, f.source.decision_records);
    const { proveVersionUpgradeAnswerReuseV4 } = await import('../../src/version-upgrade-v4.mjs');
    const prior = { source_pack: f.source, evidence_claims: JSON.parse(await readFile(path.join(f.directory, 'accepted/r000/evidence-claims.json'))),
      checkpoint: JSON.parse(await readFile(path.join(f.directory, 'checkpoint.json'))) };
    const next = { source_pack: acceptedSource, evidence_claims: JSON.parse(await readFile(path.join(sibling.run_directory, 'accepted/r000/evidence-claims.json'))), checkpoint };
    const finalDecision = f.source.decision_records.find((/** @type {any} */ decision) => decision.resolution === 'final');
    assert.equal(proveVersionUpgradeAnswerReuseV4(prior, next, finalDecision).reusable, true);
    const changes = [
      (/** @type {any} */ value) => { value.source_pack.sources[0].semantic_digest = sha('changed-source'); },
      (/** @type {any} */ value) => { value.evidence_claims.fact_ledger[0].statement += 'changed'; },
      (/** @type {any} */ value) => { value.evidence_claims.claims[0].subject_descriptor.condition = { state: 'changed' }; },
      (/** @type {any} */ value) => { value.evidence_claims.claims.push({ ...value.evidence_claims.claims[0], claim_id: 'EXTRA-CLAIM' }); },
      (/** @type {any} */ value) => { value.evidence_claims.semantic_gaps[0].acceptance_impact.rationale += 'changed'; },
      (/** @type {any} */ value) => { value.evidence_claims.semantic_gaps[0].scope_ref += '/wider'; },
      (/** @type {any} */ value) => { value.source_pack.decision_records = []; },
      (/** @type {any} */ value) => { value.checkpoint.semantic_gap_ledger.forEach((/** @type {any} */ root) => { root.missing_aspect += 'changed'; }); },
      (/** @type {any} */ value) => { value.checkpoint.semantic_gap_ledger.forEach((/** @type {any} */ root) => { root.root_version_digest = sha('changed-root'); }); }
    ];
    for (const change of changes) {
      const changed = structuredClone(next); change(changed);
      assert.equal(proveVersionUpgradeAnswerReuseV4(prior, changed, finalDecision).reusable, false);
    }
    const temporary = f.source.decision_records.find((/** @type {any} */ decision) => decision.resolution === 'temporary');
    assert.equal(proveVersionUpgradeAnswerReuseV4(prior, next, temporary).reusable, false);
    const { verifyVersionUpgradeSiblingV4 } = await import('../../src/version-upgrade-v4.mjs');
    await verifyVersionUpgradeSiblingV4(sibling.run_directory);
    const auditPath = path.join(sibling.run_directory, 'upgrade/answer-bindings', audits[0]);
    const originalAudit = await readFile(auditPath);
    await writeFile(auditPath, '{}\n');
    await assert.rejects(verifyVersionUpgradeSiblingV4(sibling.run_directory), /UPGRADE_REUSE_AUDIT_INVALID/);
    await writeFile(auditPath, originalAudit);
    await rm(auditPath);
    await assert.rejects(verifyVersionUpgradeSiblingV4(sibling.run_directory), /UPGRADE_REUSE_AUDIT_MISSING/);
    await writeFile(auditPath, originalAudit);
    assert.deepEqual(await snapshot(f.directory), original);
  });
});


test('T19 reading a completed 4.3.2 delivery is immutable; explicit upgrade produces a separate latest delivery', async () => {
  const { createVersionUpgradeSiblingV4 } = await import('../../src/version-upgrade-v4.mjs');
  await withCatalog(async catalog => {
    const directory = path.join(catalog, 'runs', RUN);
    await mkdir(directory);
    await ensureV4RunInstance(directory, { run_id: RUN, delivery_intent: 'case_document', contract: v4ContractForSchema('4.3.2') });
    const fixture = v4GeneralQualityFixture('4.3.2');
    fixture.artifacts.source_pack.run_instance_id = RUN;
    const request = await advanceStrict(directory);
    await stageRaw(directory, 'source_pack', fixture.artifacts.source_pack);
    assert.equal(request.stage, 'source_pack', JSON.stringify(request));
    await stageCollection(directory, request, fixture.artifacts.source_pack);
    let reply = await advanceStrict(directory);
    for (const stage of ['evidence_claims', 'behavior_views', 'case_drafts']) {
      assert.equal(reply.stage, stage, JSON.stringify(reply));
      await stageRaw(directory, /** @type {any} */ (stage), /** @type {any} */ (fixture.artifacts)[stage]);
      reply = await advanceStrict(directory);
    }
    assert.equal(reply.status, 'finished', JSON.stringify(reply));
    const original = await snapshot(directory);
    const historical = await verifyCaseDocumentDeliveryV4(directory);
    assert.equal(historical.manifest.schema_version, '4.3.2');
    assert.deepEqual(await snapshot(directory), original);
    const successor = await createVersionUpgradeSiblingV4(catalog, { parent_run_id: RUN });
    reply = await advanceStrict(successor.run_directory);
    assert.equal(reply.stage, 'evidence_claims', JSON.stringify(reply));
    reply = await advanceStrict(successor.run_directory);
    for (const stage of ['behavior_views', 'case_drafts']) {
      assert.equal(reply.stage, stage, JSON.stringify(reply));
      const artifact = { ...structuredClone(/** @type {any} */ (fixture.artifacts)[stage]), schema_version: latestV4Contract().schema_version };
      await stageRaw(successor.run_directory, /** @type {any} */ (stage), artifact);
      reply = await advanceStrict(successor.run_directory);
    }
    assert.equal(reply.status, 'finished', JSON.stringify(reply));
    const latest = await verifyCaseDocumentDeliveryV4(successor.run_directory);
    assert.equal(latest.manifest.schema_version, latestV4Contract().schema_version);
    assert.notEqual(latest.manifest.run_id, historical.manifest.run_id);
    assert.deepEqual(await snapshot(directory), original);
  });
});


test('T20 cross-artifact corruption is rejected even when attacker recomputes all outer byte hashes', async () => {
  const { createVersionUpgradeSiblingV4 } = await import('../../src/version-upgrade-v4.mjs');
  await withCatalog(async catalog => {
    const f = await parent(catalog, { pending: true });
    const factsFile = path.join(f.directory, 'derived/r000/fact-ledger.json');
    const facts = JSON.parse(await readFile(factsFile));
    facts.facts[0].statement += 'corrupt';
    const factsBytes = `${canonicalStringify(facts)}\n`;
    await writeFile(factsFile, factsBytes);
    const recordFile = path.join(f.directory, 'transactions/committed/r000.json');
    const record = JSON.parse(await readFile(recordFile));
    record.artifact_digests.fact_ledger = sha(factsBytes);
    await writeFile(recordFile, `${canonicalStringify(record)}\n`);
    const journalFile = path.join(f.directory, 'transactions/revisions', `${record.txn_id}.json`);
    const journal = JSON.parse(await readFile(journalFile));
    journal.artifact_digests = record.artifact_digests;
    journal.result.artifact_digests = record.artifact_digests;
    journal.candidate_digest = 'sha256:' + digest({ base_revision: journal.base_revision, candidate_revision: journal.candidate_revision,
      commit_profile: journal.commit_profile, semantic_digest: journal.semantic_digest, artifact_digests: journal.artifact_digests });
    await writeFile(journalFile, `${canonicalStringify(journal)}\n`);
    const receiptFile = path.join(f.directory, 'transactions/appends', `${journal.append_key}.json`);
    const receipt = JSON.parse(await readFile(receiptFile));
    receipt.result = journal.result;
    await writeFile(receiptFile, `${canonicalStringify(receipt)}\n`);
    const before = await snapshot(f.directory);
    await assert.rejects(createVersionUpgradeSiblingV4(catalog, { parent_run_id: RUN }), /REVISION_ARTIFACT_RELATION_INVALID/);
    assert.deepEqual(await snapshot(f.directory), before);
    assert.equal((await readdir(path.join(catalog, 'runs'))).length, 1);
  });
});

test('T20 acquired history is verified without deleting pending material; corrupted acquisition state fails closed', async () => {
  const { createVersionUpgradeSiblingV4 } = await import('../../src/version-upgrade-v4.mjs');
  const { loadSourceAcquisitionCompilerStateV4, stageV4SourceAcquisitionAction } = await import('../../src/source-acquisition-v4.mjs');
  await withCatalog(async catalog => {
    const directory = path.join(catalog, 'runs', RUN);
    await mkdir(directory);
    await ensureV4RunInstance(directory, { run_id: RUN, delivery_intent: 'case_document', contract: v4ContractForSchema('4.0.0') });
    const safe = v4PipelineFixture().artifacts.source_pack;
    safe.run_instance_id = RUN;
    const unsafe = structuredClone(safe);
    unsafe.sources[0].content += '\n[fixture](https://unknown.example.invalid/doc?signature=TEST_ONLY_SECRET)';
    await stageRaw(directory, 'source_pack', unsafe);
    const blocked = await advanceStrict(directory);
    assert.equal(blocked.status, 'need_artifact', JSON.stringify(blocked));
    const bytes = new TextEncoder().encode(safe.sources[0].content);
    await stageV4SourceAcquisitionAction(directory, blocked, safe,
      blocked.artifact_requests.map((/** @type {any} */ request, /** @type {number} */ index) => ({
        artifact_request_id: request.artifact_request_id,
        input: { kind: 'safe_upload_ref', upload_id: `UPLOAD-upgrade-test-${index}`, media_type: 'text/markdown',
          byte_length: bytes.length, content_digest: sha(bytes) }, material: bytes
      })));
    const accepted = await advanceStrict(directory);
    assert.equal(accepted.stage, 'evidence_claims', JSON.stringify(accepted));
    const source = JSON.parse(await readFile(path.join(directory, 'accepted/r000/source-pack.json')));
    const marker = path.join(directory, 'staging/source-acquisition', `EVENT-${'a'.repeat(64)}.bin`);
    await writeFile(marker, 'test-only pending material');
    const verified = await loadSourceAcquisitionCompilerStateV4(directory, source, { read_only: true });
    if (!verified) throw new Error('SOURCE_ACQUISITION_FIXTURE_REQUIRED');
    assert.ok(verified.verified_source_receipts.length > 0);
    assert.equal(await readFile(marker, 'utf8'), 'test-only pending material');
    const original = await snapshot(directory);
    const sibling = await createVersionUpgradeSiblingV4(catalog, { parent_run_id: RUN });
    assert.equal(sibling.strategy.source_policy, 'reacquire_with_preserved_materials');
    assert.deepEqual(await snapshot(directory), original);
    const stateFile = path.join(directory, 'derived/source-acquisition.json');
    const state = JSON.parse(await readFile(stateFile));
    state.source_receipts[0].capture_digest = sha('corrupted-capture');
    await writeFile(stateFile, `${canonicalStringify(state)}\n`);
    await assert.rejects(createVersionUpgradeSiblingV4(catalog, { parent_run_id: RUN }), /SOURCE_ACQUISITION_STATE_INVALID/);
    assert.equal(await readFile(marker, 'utf8'), 'test-only pending material');
  });
});

test('T20 rehashed foreign checkpoints, wrong bases and journal result bindings are rejected', async () => {
  const { createVersionUpgradeSiblingV4 } = await import('../../src/version-upgrade-v4.mjs');
  for (const mode of ['foreign_run', 'wrong_base', 'wrong_journal_base', 'wrong_result', 'hidden_as_no_op']) {
    await withCatalog(async catalog => {
      const f = await parent(catalog, { pending: true });
      const recordFile = path.join(f.directory, 'transactions/committed/r000.json');
      const record = JSON.parse(await readFile(recordFile));
      const journalFile = path.join(f.directory, 'transactions/revisions', `${record.txn_id}.json`);
      const journal = JSON.parse(await readFile(journalFile));
      if (mode === 'foreign_run' || mode === 'wrong_base') {
        const previous = JSON.parse(await readFile(path.join(f.directory, 'checkpoint.json')));
        const contract = v4ContractForSchema('4.3.2');
        const checkpoint = compileSemanticClarificationCheckpointV4({ ...contract,
          run_id: mode === 'foreign_run' ? 'RUN-bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' : RUN,
          committed_revision: 0, committed_checkpoint_bytes: new TextEncoder().encode(mode === 'wrong_base' ? '{}\n'
            : `${canonicalStringify({ ...contract, candidate: undefined, strict_semantic_delivery: undefined, run_id: RUN, genesis: true })}\n`),
          discovery_phase: 'pre_case', source_review_witness: previous.source_review_witness,
          fact_ledger_digest: previous.fact_ledger_digest, scope_manifest_digest: previous.scope_manifest_digest,
          behavior_views_digest: null, case_drafts_digest: null,
          facts: f.evidence.fact_ledger, claims: f.evidence.claims, diagnostic_candidates: f.evidence.semantic_gaps,
          prior_checkpoint: null }).checkpoint;
        const checkpointBytes = `${canonicalStringify(checkpoint)}\n`;
        const clarificationBytes = `${canonicalStringify({ schema_version: '4.3.2', source_revision: 0, ...checkpoint.clarification_state })}\n`;
        await writeFile(path.join(f.directory, 'checkpoint.json'), checkpointBytes);
        await writeFile(path.join(f.directory, 'derived/r000/checkpoint.json'), checkpointBytes);
        await writeFile(path.join(f.directory, 'derived/r000/clarification-state.json'), clarificationBytes);
        record.checkpoint_digest = sha(checkpointBytes);
        record.artifact_digests.checkpoint = sha(checkpointBytes);
        record.artifact_digests.clarification_state = sha(clarificationBytes);
        journal.result.checkpoint_digest = record.checkpoint_digest;
      }
      if (mode === 'wrong_journal_base') journal.base_revision = 3;
      if (mode === 'wrong_result') journal.result.committed_revision = 99;
      if (mode === 'hidden_as_no_op') { journal.result.status = 'no_op'; journal.base_revision = 3; }
      journal.artifact_digests = record.artifact_digests;
      journal.result.artifact_digests = record.artifact_digests;
      journal.candidate_digest = 'sha256:' + digest({ base_revision: journal.base_revision, candidate_revision: journal.candidate_revision,
        commit_profile: journal.commit_profile, semantic_digest: journal.semantic_digest, artifact_digests: journal.artifact_digests });
      await writeFile(recordFile, `${canonicalStringify(record)}\n`);
      await writeFile(journalFile, `${canonicalStringify(journal)}\n`);
      const receiptFile = path.join(f.directory, 'transactions/appends', `${journal.append_key}.json`);
      const receipt = JSON.parse(await readFile(receiptFile)); receipt.result = journal.result;
      await writeFile(receiptFile, `${canonicalStringify(receipt)}\n`);
      const before = await snapshot(f.directory);
      await assert.rejects(createVersionUpgradeSiblingV4(catalog, { parent_run_id: RUN }), /UPGRADE_HISTORY_(CHECKPOINT_BINDING|BASE|JOURNAL)_INVALID/, mode);
      assert.deepEqual(await snapshot(f.directory), before);
      assert.equal((await readdir(path.join(catalog, 'runs'))).length, 1);
    });
  }
});

test('T20 non-ready current pointers require valid identity and a verified prior delivery', async () => {
  const { createVersionUpgradeSiblingV4 } = await import('../../src/version-upgrade-v4.mjs');
  await withCatalog(async catalog => {
    const f = await parent(catalog, { pending: true });
    await mkdir(path.join(f.directory, 'output'), { recursive: true });
    await writeFile(path.join(f.directory, 'output/current.json'), '{"status":"garbage"}\n');
    const before = await snapshot(f.directory);
    await assert.rejects(createVersionUpgradeSiblingV4(catalog, { parent_run_id: RUN }), /UPGRADE_HISTORY_MANIFEST_INVALID/);
    assert.deepEqual(await snapshot(f.directory), before);
  });
  await withCatalog(async catalog => {
    const directory = path.join(catalog, 'runs', RUN);
    await mkdir(directory);
    const contract = v4ContractForSchema('4.3.0');
    await ensureV4RunInstance(directory, { run_id: RUN, delivery_intent: 'case_document', contract });
    await commitRevisionTransactionV4(directory, appendRequest('final', null, 0, { run_id: RUN, contract }));
    await commitRevisionTransactionV4(directory, appendRequest('pre_case_pending', 0, 1, {
      run_id: RUN, contract, base_checkpoint_text: await readFile(path.join(directory, 'checkpoint.json'), 'utf8')
    }));
    const original = await snapshot(directory);
    const successor = await createVersionUpgradeSiblingV4(catalog, { parent_run_id: RUN });
    assert.equal(successor.lineage.parent_revision, 1);
    assert.deepEqual(await snapshot(directory), original);
    const pointerFile = path.join(directory, 'output/current.json');
    const pointer = JSON.parse(await readFile(pointerFile));
    for (const change of [
      { run_id: 'RUN-bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' }, { active_revision: 0 },
      { previous_ready_revision: 1 }, { previous_ready_manifest_digest: sha('unrelated') }
    ]) {
      await writeFile(pointerFile, `${canonicalStringify({ ...pointer, ...change })}\n`);
      await assert.rejects(createVersionUpgradeSiblingV4(catalog, { parent_run_id: RUN }), /UPGRADE_HISTORY_MANIFEST_INVALID/);
    }
  });
  for (const schema of ['4.0.0', '4.2.0']) await withCatalog(async catalog => {
    const directory = path.join(catalog, 'runs', RUN);
    await mkdir(directory);
    const contract = v4ContractForSchema(schema);
    await ensureV4RunInstance(directory, { run_id: RUN, delivery_intent: 'case_document', contract });
    await commitRevisionTransactionV4(directory, appendRequest('final', null, 0, { run_id: RUN, contract }));
    const historicalPointer = await readFile(path.join(directory, 'output/current.json'));
    await commitRevisionTransactionV4(directory, appendRequest('pre_case_pending', 0, 1, {
      run_id: RUN, contract, base_checkpoint_text: await readFile(path.join(directory, 'checkpoint.json'), 'utf8')
    }));
    assert.deepEqual(await readFile(path.join(directory, 'output/current.json')), historicalPointer);
    const original = await snapshot(directory);
    const successor = await createVersionUpgradeSiblingV4(catalog, { parent_run_id: RUN });
    assert.equal(successor.lineage.parent_revision, 1);
    assert.deepEqual(await snapshot(directory), original);
  });
});

test('T18 reused-final audit permits exact interrupted first-commit recovery and still rejects missing proof', async () => {
  const { createVersionUpgradeSiblingV4, applyVersionUpgradeAnswersV4, verifyVersionUpgradeSiblingV4 } = await import('../../src/version-upgrade-v4.mjs');
  for (const phase of ['artifacts_committed', 'checkpoint_committed', 'delivery_committed']) await withCatalog(async catalog => {
    const f = await parent(catalog, { pending: true, answers: ['final', 'temporary'] });
    const sibling = await createVersionUpgradeSiblingV4(catalog, { parent_run_id: RUN });
    await advanceStrict(sibling.run_directory);
    const source = JSON.parse(await readFile(path.join(sibling.run_directory, 'accepted/r000/source-pack.json')));
    const evidence = canonicalArtifactSnapshot(JSON.parse(await readFile(path.join(sibling.run_directory, 'staging/evidence-claims.json'))));
    const oldCheckpoint = JSON.parse(await readFile(path.join(f.directory, 'checkpoint.json')));
    const contract = latestV4Contract();
    const compiled = compileSemanticClarificationCheckpointV4({ ...contract, run_id: sibling.run_id, committed_revision: 0,
      committed_checkpoint_bytes: new TextEncoder().encode(`${canonicalStringify({ schema_version: contract.schema_version,
        compiler_version: contract.compiler_version, run_id: sibling.run_id, genesis: true })}\n`),
      discovery_phase: 'pre_case', source_review_witness: oldCheckpoint.source_review_witness,
      ...evidenceComponentDigests(evidence), behavior_views_digest: null, case_drafts_digest: null,
      facts: evidence.fact_ledger, claims: evidence.claims, diagnostic_candidates: evidence.semantic_gaps, prior_checkpoint: null });
    const { checkpoint } = await applyVersionUpgradeAnswersV4(sibling.run_directory, source, evidence, compiled);
    assert.equal(checkpoint.clarification_state.root_states.filter((/** @type {any} */ state) => state.status === 'resolved_final').length, 1);
    const json = (/** @type {any} */ value) => ({ format: 'json', value });
    const request = { append_id: `upgrade-interrupted-${phase}`, append_digest: sha(phase),
      base_revision: null, candidate_revision: 0, semantic_digest: sha('upgrade-recovery'), commit_profile: 'pre_case_pending', artifacts: {
        source_pack: json(source), evidence_claims: json(evidence), checkpoint: json(checkpoint),
        decision_journal: json({ schema_version: contract.schema_version, source_revision: 0, decisions: source.decision_records }),
        fact_ledger: json({ schema_version: contract.schema_version, source_revision: 0, facts: evidence.fact_ledger }),
        scope_manifest: json({ schema_version: contract.schema_version, source_revision: 0, ...evidence.scope_manifest }),
        clarification_state: json({ schema_version: contract.schema_version, source_revision: 0, ...checkpoint.clarification_state })
      } };
    await assert.rejects(commitRevisionTransactionV4(sibling.run_directory, request, { after_phase: reached => {
      if (reached === phase) throw new Error('INJECTED_UPGRADE_COMMIT_INTERRUPTION');
    } }), /INJECTED_UPGRADE_COMMIT_INTERRUPTION/);
    await verifyVersionUpgradeSiblingV4(sibling.run_directory);
    const reply = await publicAdapter.advanceStrict(sibling.run_directory);
    assert.equal(reply.status, 'need_user_answers', JSON.stringify(reply));
    await assert.rejects(readFile(path.join(sibling.run_directory, 'staging/pending-revision.json')), { code: 'ENOENT' });
    await verifyVersionUpgradeSiblingV4(sibling.run_directory);
    const event = publicAdapter.constructV4Action(reply, { action: 'answer_question_part',
      question_part_id: reply.semantic_presentation.question_parts[0].question_part_id,
      answer: '已确认', user_message: '测试确认：已确认', resolution: 'final', origin_type: 'authorized_confirmation' });
    const nextSource = structuredClone(source);
    nextSource.source_revision = 1; nextSource.clarification_events.push(event);
    const material = nextSource.sources[0], message = '测试确认：已确认';
    const unit = { unit_id: 'UNIT-after-recovery', type: 'user_statement', text: message,
      presentation_id: event.presentation_id, message_digest: sha(message),
      answer_span: { start: event.answer_origin.answer_span.start_scalar, end: event.answer_origin.answer_span.end_scalar } };
    material.semantic_projection.structure.push(unit);
    material.semantic_digest = 'sha256:' + digest(material.semantic_projection);
    for (const locator of nextSource.locators) locator.semantic_digest = material.semantic_digest;
    nextSource.locators.push({ locator_id: 'LOC-after-recovery', source_id: material.source_id,
      semantic_digest: material.semantic_digest, type: 'user_statement', unit_id: unit.unit_id,
      excerpt: event.answer, excerpt_digest: event.answer_origin.answer_span.excerpt_digest,
      domain: 'business', field_path: '/clarification_answers/recovery', presentation_id: event.presentation_id,
      message_digest: sha(message), answer_span: unit.answer_span });
    nextSource.source_reviews[0].semantic_digest = material.semantic_digest;
    nextSource.source_reviews[0].units.push({ unit_id: unit.unit_id, content_digest: sha(message), classification: 'non_normative' });
    await stageRaw(sibling.run_directory, 'source_pack', nextSource);
    const nextReply = await publicAdapter.advanceStrict(sibling.run_directory);
    assert.equal(nextReply.status, 'need_user_answers', JSON.stringify(nextReply));
    const acceptedNext = JSON.parse(await readFile(path.join(sibling.run_directory, 'accepted/r001/source-pack.json')));
    assert.ok(acceptedNext.decision_records.some((/** @type {any} */ decision) => decision.answer === '已确认'));
    const auditName = (await readdir(path.join(sibling.run_directory, 'upgrade/answer-bindings')))[0];
    await rm(path.join(sibling.run_directory, 'upgrade/answer-bindings', auditName));
    await assert.rejects(verifyVersionUpgradeSiblingV4(sibling.run_directory), /UPGRADE_REUSE_AUDIT_MISSING/);
  });
});
