import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { v4GeneralQualityFixture } from './v4-general-quality-fixture.mjs';
import { prepareV4Source } from '../../src/source-preparation-v4.mjs';
import { constructV4TopologyEvidence, discoverV4Topology } from '../../src/topology-adapter-v4.mjs';
import { sourceByteDigest } from '../../src/source-canonicalization.mjs';
import { stageV4PrdCollectionObservation } from '../../src/prd-source-collection-v4.mjs';
import { STAGE_FILES } from '../../src/run-store.mjs';
import { latestV4Contract } from '../../src/v4-contract.mjs';

// Synthetic, explicitly test-only business evidence; never a real user's answer.
/** @param {string} runId */
export function reliabilityFixture(runId, { collision = true, schema = latestV4Contract().schema_version, form = false, upgrade = false } = {}) {
  const fixture = v4GeneralQualityFixture(schema);
  const pack = fixture.artifacts.source_pack;
  const evidence = fixture.artifacts.evidence_claims;
  pack.run_instance_id = runId;
  const original = pack.sources[0];
  const actions = form ? ['取消', '重新打开', '名称校验'] : upgrade ? ['保存草稿', '保存并生效', '撤回配置'] : ['保存草稿', '保存并生效'];
  const statements = form ? ['取消关闭表单', '重新打开后数据规则未定义', '名称必填']
    : upgrade ? ['权益配置保存草稿：重复提交记录数未定义', '权益配置保存并生效：失败后输入保留规则未定义', '权益配置撤回配置：操作权限未定义']
    : actions.map(action => `权益配置${action}：重复提交记录数未定义`);
  const content = [original.content, ...statements].join('\n\n');
  const bytes = new TextEncoder().encode(content);
  const prepared = prepareV4Source({
    metadata: Object.fromEntries(['source_id', 'kind', 'version', 'status', 'authority', 'title', 'scope', 'domain']
      .filter(key => original[key] !== undefined).map(key => [key, original[key]])),
    raw_response_bytes: bytes, capture_bytes: bytes, assets: [], acquisition: {}, additional_units: []
  });
  if (prepared.status !== 'prepared') throw new Error('RELIABILITY_FIXTURE_SOURCE_INVALID');
  const source = prepared.source;
  pack.sources = [source];
  const structure = source.semantic_projection.structure;
  for (const locator of pack.locators) {
    const unit = structure.find((/** @type {any} */ unit) => unit.text.includes(locator.excerpt));
    Object.assign(locator, { semantic_digest: source.semantic_digest, unit_id: unit.unit_id,
      section_id: unit.section_id });
  }
  pack.source_reviews = [{ source_id: source.source_id, semantic_digest: source.semantic_digest,
    units: structure.map((/** @type {any} */ unit) => ({ unit_id: unit.unit_id,
      content_digest: sourceByteDigest(new TextEncoder().encode(unit.text)), classification: 'normative' })) }];
  const templateClaim = structuredClone(evidence.claims[0]);
  evidence.claims[0].document_level_claim = false;
  const templateFact = structuredClone(evidence.fact_ledger[0]);
  for (const [index, action] of actions.entries()) {
    const unit = structure.find((/** @type {any} */ unit) => unit.text === statements[index]);
    const claimId = ['c200', 'c205', 'c210'][index];
    const factId = ['f200', 'f205', 'f210'][index];
    const locatorId = `LOC-${claimId}`;
    pack.locators.push({ ...structuredClone(pack.locators[0]), locator_id: locatorId,
      unit_id: unit.unit_id, section_id: unit.section_id, range: { start: 0, end: Array.from(unit.text).length },
      excerpt: unit.text, excerpt_digest: sourceByteDigest(new TextEncoder().encode(unit.text)) });
    evidence.claims.push({ ...structuredClone(templateClaim), claim_id: claimId, value: unit.text,
      document_level_claim: false, source_locator_ids: [locatorId],
      subject_descriptor: { ...templateClaim.subject_descriptor, entity_key: action },
      semantic_value: { source_value: { action, result: '提交表单' } } });
    evidence.fact_ledger.push({ ...structuredClone(templateFact), fact_id: factId,
      status: form && index !== 1 ? 'active' : 'ambiguous', statement: collision && !form && !upgrade ? '权益配置：重复提交记录数未定义' : unit.text, claim_ids: [claimId] });
    evidence.acceptance_role_assignments.push({ ...structuredClone(evidence.acceptance_role_assignments[0]),
      entity_id: factId, role_basis_claim_ids: [claimId] });
  }
  const topology = discoverV4Topology(pack, evidence.claims);
  evidence.topology_discovery = topology;
  evidence.topology_review = { ...topology.scanned_units, unresolved_candidate_ids: [] };
  const interactionCells = evidence.claims[0].semantic_value.topology_authorization.reviewable_interaction_cells;
  // Each synthetic topology declaration is authorized by the Claim whose own
  // reviewed excerpt contains it, rather than borrowing another Claim's locator.
  for (const claim of evidence.claims) claim.semantic_value.topology_authorization = {
    candidates: topology.topology_candidates.filter((/** @type {any} */ candidate) =>
      candidate.locator_ids.every((/** @type {string} */ id) => claim.source_locator_ids.includes(id)))
      .map((/** @type {any} */ candidate) => ({
        kind: candidate.kind, label: candidate.label, locator_ids: [...candidate.locator_ids],
        disposition: 'module', module_ref: 'checkout', role: 'primary'
      })),
    reviewable_interaction_cells: claim === evidence.claims[0] ? interactionCells : []
  };
  evidence.topology_dispositions = topology.topology_candidates.map((/** @type {any} */ candidate) => ({
    candidate_id: candidate.candidate_id, disposition: 'module', module_ref: 'checkout', role: 'primary',
    review_basis_claim_ids: evidence.claims.filter((/** @type {any} */ claim) =>
      candidate.locator_ids.every((/** @type {string} */ id) => claim.source_locator_ids.includes(id)))
      .map((/** @type {any} */ claim) => claim.claim_id)
  }));
  Object.assign(evidence, constructV4TopologyEvidence(pack, evidence.claims, {
    discovery_digest: topology.discovery_digest, primary_surface: 'checkout',
    topology_review: evidence.topology_review, topology_dispositions: evidence.topology_dispositions
  }));
  evidence.semantic_gaps = [{
    category: 'semantic_gap', code: 'REPEATED_SUBMISSION', subject_fact_ids: ['f200', 'f205'],
    missing_aspect: 'duplicate_submission', scope_ref: 'checkout', question: '保存请求未完成时重复点击，应产生几条记录？',
    why_needed: '重复提交的业务规则未定义。', decision_impact: '决定重复点击后的记录数。',
    unresolved_outcome: '无法确定重复点击的预期结果。', answer_options: ['一条记录', '多条记录'], risk_level: 'high',
    source_claim_ids: ['c200', 'c205'], discovery_phase: 'pre_case', affected_test_point_ids: [],
    acceptance_impact: { classification: 'critical', criteria: ['makes_required_result_undecidable'],
      rationale: '记录数是必要验收结果。' }
  }];
  if (form) Object.assign(evidence.semantic_gaps[0], {
    code: 'REOPEN_DATA', subject_fact_ids: ['f205'], source_claim_ids: ['c200', 'c205', 'c210'],
    missing_aspect: 'reopen_data', question: '重新打开表单后是否保留未提交内容？'
  });
  return fixture;
}

/** @param {string} directory @param {keyof typeof STAGE_FILES} stage @param {any} artifact */
export async function stageRaw(directory, stage, artifact) {
  await mkdir(path.join(directory, 'staging'), { recursive: true });
  // Preserve the supplied ordering, as a real Agent can submit ordinary JSON.
  await writeFile(path.join(directory, 'staging', STAGE_FILES[stage]), `${JSON.stringify(artifact)}\n`);
}

/** @param {string} directory @param {any} reply @param {any} sourcePack */
export async function stageCollection(directory, reply, sourcePack) {
  const source = sourcePack.sources[0];
  const bytes = new TextEncoder().encode(source.content);
  await stageV4PrdCollectionObservation(directory, reply, {
    version: '1.0.0', scope: { mode: 'provided_materials', root_ref: 'provided:reliability-test-fixture',
      source_version: source.version,
      collection_window: { started_at: '2026-10-22T00:00:00.000Z', ended_at: '2026-10-22T00:00:01.000Z' } },
    channels: [{ channel: 'body', enumeration_status: 'exhausted', page_count: 1,
      terminal_page_observed: true, diagnostic_code: null },
    ...['table', 'image', 'comment', 'reply'].map(channel => ({ channel, enumeration_status: 'not_applicable',
      page_count: 0, terminal_page_observed: false, diagnostic_code: null }))],
    items: [{ item_id: 'test-body', parent_item_id: null, channel: 'body', source_id: source.source_id,
      asset_id: null, unit_ids: source.semantic_projection.structure.map((/** @type {any} */ unit) => unit.unit_id),
      acquisition_status: 'acquired', review_status: 'reviewed', unavailable_reason: null }]
  }, [{ item_id: 'test-body', raw_response_bytes: bytes, capture_bytes: bytes }]);
}
