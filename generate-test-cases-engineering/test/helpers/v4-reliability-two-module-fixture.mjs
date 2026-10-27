import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { v4GeneralQualityFixture } from './v4-general-quality-fixture.mjs';
import { expectedInteractionCellsV4 } from '../../src/scope-manifest-v4.mjs';
import { latestV4Contract } from '../../src/v4-contract.mjs';

/** @param {string} text */
const bytesDigest = text => `sha256:${createHash('sha256').update(text).digest('hex')}`;

/** Fully synthetic source: two declared primary modules, four distinct sourced
 * action facts, and two unresolved business rules per module. No real answers.
 * @param {string} runId @param {any} adapter */
export function twoModuleReliabilityFixture(runId, adapter) {
  const fixture = v4GeneralQualityFixture(latestV4Contract().schema_version);
  const pack = fixture.artifacts.source_pack;
  const evidence = fixture.artifacts.evidence_claims;
  pack.run_instance_id = runId;
  const scopeText = '主验收范围包含权益配置与换肤配置；两者独立保存，不共享记录、角色限制、接入规则、接口事件、时序、并发状态或副作用。';
  const modules = [
    { id: 'benefits', label: '权益配置', facts: ['f200', 'f205'], claims: ['c200', 'c205'] },
    { id: 'theme', label: '换肤配置', facts: ['f224', 'f229'], claims: ['c224', 'c229'] }
  ];
  const actions = ['保存草稿', '保存并生效'];
  const paragraphs = [scopeText, ...modules.flatMap(module => [
    module.label, ...actions.flatMap(action => [
      `${module.label}${action}：校验通过后提交表单。`,
      `${module.label}${action}：重复提交记录数未定义。`,
      `${module.label}${action}：失败后保留输入和重试规则未定义。`]),
    `${module.label}的提交中重复点击记录数，以及提交失败是否保留输入并允许重试，均待确认。`
  ])];
  const bytes = new TextEncoder().encode(paragraphs.join('\n\n'));
  const original = pack.sources[0];
  const prepared = adapter.prepareV4Source({
    metadata: Object.fromEntries(['source_id', 'kind', 'version', 'status', 'authority', 'scope', 'domain']
      .map(key => [key, original[key]])),
    raw_response_bytes: bytes, capture_bytes: bytes, assets: [], acquisition: {}, additional_units: []
  });
  assert.equal(prepared.status, 'prepared');
  const source = prepared.source;
  pack.sources = [source];
  pack.locators = source.semantic_projection.structure.map((/** @type {any} */ unit, /** @type {number} */ index) => ({
    locator_id: `LOC-two-module-${index}`, source_id: source.source_id, semantic_digest: source.semantic_digest,
    type: 'text_block_range', unit_id: unit.unit_id, section_id: unit.section_id,
    range: { start: 0, end: Array.from(unit.text).length }, excerpt: unit.text,
    excerpt_digest: bytesDigest(unit.text), domain: 'business', field_path: '/configuration'
  }));
  pack.source_reviews = [{
    source_id: source.source_id, semantic_digest: source.semantic_digest,
    units: source.semantic_projection.structure.map((/** @type {any} */ unit) => ({
      unit_id: unit.unit_id, content_digest: bytesDigest(unit.text), classification: 'normative'
    }))
  }];
  const template = structuredClone(evidence.claims[0]);
  /** @param {string} id @param {string} text @param {string} moduleId @param {string} entity */
  const claim = (id, text, moduleId, entity) => ({
    ...structuredClone(template), claim_id: id, scope: moduleId, value: text,
    source_locator_ids: [pack.locators.find((/** @type {any} */ locator) => locator.excerpt === text).locator_id],
    field_path: '/configuration', document_level_claim: false,
    subject_descriptor: { scope_ref: moduleId, module_id: moduleId, entity_type: 'configuration',
      entity_key: entity, field_path: '/configuration', condition: {} },
    semantic_value: { source_value: text }
  });
  evidence.claims = [claim('c_scope', scopeText, 'benefits', 'module_scope')];
  evidence.fact_ledger = [];
  evidence.semantic_gaps = [];
  for (const module of modules) {
    evidence.claims.push(claim(`c_${module.id}_header`, module.label, module.id, 'module_name'));
    evidence.claims.push(claim(`c_${module.id}_unknown`,
      `${module.label}的提交中重复点击记录数，以及提交失败是否保留输入并允许重试，均待确认。`, module.id, 'unknown_save_rules'));
    for (const [index, action] of actions.entries()) {
      for (const [suffix, statement, status] of [
        ['_known', '校验通过后提交表单', 'active'],
        ['', '重复提交记录数未定义', 'ambiguous'],
        ['_retry', '失败后保留输入和重试规则未定义', 'ambiguous']
      ]) {
        const claimId = module.claims[index] + suffix;
        evidence.claims.push(claim(claimId, `${module.label}${action}：${statement}。`, module.id, `${action}${statement}`));
        evidence.fact_ledger.push({ fact_id: module.facts[index] + suffix, statement: `${module.label}：${statement}`,
          status, acceptance_role: 'primary_acceptance', claim_ids: [claimId],
          module_refs: [module.id], field_path: '/configuration' });
      }
    }
    for (const aspect of ['duplicate_submission', 'failure_retry']) evidence.semantic_gaps.push({
      category: 'semantic_gap', code: aspect === 'duplicate_submission' ? 'REPEATED_SUBMISSION' : 'FAILED_SAVE',
      subject_fact_ids: module.facts.map(id => id + (aspect === 'failure_retry' ? '_retry' : '')), missing_aspect: aspect, scope_ref: module.id,
      question: aspect === 'duplicate_submission' ? `${module.label}提交中重复点击应产生几条记录？`
        : `${module.label}提交失败是否保留输入并允许重试？`,
      why_needed: '来源明确将该规则保留为待确认。', decision_impact: '答案决定记录数或失败后的可观察结果。',
      unresolved_outcome: '该业务预期仍不可确定。', answer_options: ['是', '否'], risk_level: 'high',
      source_claim_ids: module.claims.map(id => id + (aspect === 'failure_retry' ? '_retry' : '')), discovery_phase: 'pre_case', affected_test_point_ids: [],
      acceptance_impact: { classification: 'critical', criteria: ['makes_required_result_undecidable'],
        rationale: '缺少最终规则时无法确定必要验收结果。' }
    });
  }
  const topology = adapter.discoverV4Topology(pack, evidence.claims);
  assert.deepEqual(topology.topology_candidates.map((/** @type {any} */ candidate) => candidate.label).sort(), modules.map(module => module.label).sort());
  const moduleFor = (/** @type {any} */ candidate) => modules.find(module => module.label === candidate.label);
  evidence.topology_discovery = topology;
  evidence.topology_review = { ...topology.scanned_units, unresolved_candidate_ids: [] };
  evidence.topology_dispositions = topology.topology_candidates.map((/** @type {any} */ candidate) => ({
    candidate_id: candidate.candidate_id, disposition: 'module', module_ref: moduleFor(candidate)?.id,
    role: 'primary', review_basis_claim_ids: [`c_${moduleFor(candidate)?.id}_header`]
  }));
  evidence.scope_manifest = { primary_surface: 'benefits', modules: modules.map(module => ({
    module_id: module.id, name: module.label, role: 'primary', claim_ids: [`c_${module.id}_header`]
  })), boundaries: [] };
  const cells = expectedInteractionCellsV4(evidence.scope_manifest);
  evidence.claims[0].semantic_value.topology_authorization = {
    candidates: [], reviewable_interaction_cells: cells
  };
  for (const candidate of topology.topology_candidates) {
    const header = evidence.claims.find((/** @type {any} */ claim) => claim.claim_id === `c_${moduleFor(candidate)?.id}_header`);
    header.semantic_value.topology_authorization = {
      candidates: [{ kind: candidate.kind, label: candidate.label, locator_ids: candidate.locator_ids,
        disposition: 'module', module_ref: moduleFor(candidate)?.id, role: 'primary' }],
      reviewable_interaction_cells: []
    };
  }
  Object.assign(evidence, adapter.constructV4TopologyEvidence(pack, evidence.claims, {
    discovery_digest: topology.discovery_digest, primary_surface: 'benefits',
    topology_review: evidence.topology_review, topology_dispositions: evidence.topology_dispositions
  }));
  evidence.interaction_review = cells.map(cell => ({ ...cell, status: 'checked-no-signal',
    reviewed_claim_ids: ['c_scope'], review_basis: '测试来源声明两个配置模块独立，已核对该交互维度。' }));
  evidence.acceptance_role_assignments = evidence.fact_ledger.map((/** @type {any} */ fact) => ({
    entity_kind: 'fact', entity_id: fact.fact_id, scope_ref: fact.module_refs[0],
    acceptance_role: 'primary_acceptance', parent_entity_ids: [], role_basis_claim_ids: fact.claim_ids
  }));
  return { source_pack: pack, evidence_claims: evidence };
}

/** Give nested sets real, independently traceable members: each action has a
 * separate Claim for its explicit validation precondition; the scope Fact is
 * context-only and refers to both modules explicitly named in the source.
 * @param {string} runId @param {any} adapter */
export function collectionOrderReliabilityFixture(runId, adapter) {
  const fixture = twoModuleReliabilityFixture(runId, adapter);
  const pack = fixture.source_pack;
  const evidence = fixture.evidence_claims;
  const names = new Map([['f200', 'f3'], ['f205', 'f10'], ['f224', 'f100'], ['f229', 'f229']]);
  for (const fact of evidence.fact_ledger) {
    fact.fact_id = names.get(fact.fact_id) ?? fact.fact_id;
    const parent = evidence.claims.find((/** @type {any} */ claim) => claim.claim_id === fact.claim_ids[0]);
    const locator = pack.locators.find((/** @type {any} */ locator) => locator.locator_id === parent.source_locator_ids[0]);
    const excerpt = locator.excerpt.includes('校验通过') ? '校验通过' : '未定义';
    const start = Array.from(locator.excerpt.slice(0, locator.excerpt.indexOf(excerpt))).length;
    const conditionLocator = {
      ...structuredClone(locator), locator_id: `LOC-zz-condition-${parent.claim_id}`,
      range: { start, end: start + Array.from(excerpt).length }, excerpt, excerpt_digest: bytesDigest(excerpt)
    };
    pack.locators.push(conditionLocator);
    const conditionClaim = {
      ...structuredClone(parent), claim_id: `${parent.claim_id}_condition`, value: excerpt,
      source_locator_ids: [conditionLocator.locator_id],
      subject_descriptor: { ...parent.subject_descriptor, entity_key: `${parent.subject_descriptor.entity_key}的提交前置条件` },
      semantic_value: { source_value: { precondition: excerpt } }
    };
    evidence.claims.push(conditionClaim);
    fact.claim_ids.push(conditionClaim.claim_id);
  }
  for (const gap of evidence.semantic_gaps) {
    gap.subject_fact_ids = gap.subject_fact_ids.map((/** @type {string} */ id) => names.get(id) ?? id);
    gap.source_claim_ids = evidence.fact_ledger.filter((/** @type {any} */ fact) => gap.subject_fact_ids.includes(fact.fact_id))
      .flatMap((/** @type {any} */ fact) => fact.claim_ids);
  }
  const scopeClaim = evidence.claims.find((/** @type {any} */ claim) => claim.claim_id === 'c_scope');
  evidence.claims.push({
    ...structuredClone(scopeClaim), claim_id: 'c_theme_scope', scope: 'theme',
    subject_descriptor: { ...scopeClaim.subject_descriptor, scope_ref: 'theme', module_id: 'theme' },
    semantic_value: { source_value: scopeClaim.value }
  });
  evidence.fact_ledger.push({
    fact_id: 'f_scope', statement: scopeClaim.value, status: 'active', acceptance_role: 'context_only',
    claim_ids: ['c_scope', 'c_theme_scope'], module_refs: ['benefits', 'theme'], field_path: '/configuration'
  });
  evidence.acceptance_role_assignments = evidence.fact_ledger.map((/** @type {any} */ fact) => ({
    entity_kind: 'fact', entity_id: fact.fact_id, scope_ref: fact.module_refs[0],
    acceptance_role: fact.acceptance_role, parent_entity_ids: [], role_basis_claim_ids: [...fact.claim_ids]
  }));
  return fixture;
}
