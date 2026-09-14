import { readFile } from 'node:fs/promises';

import { digest } from '../../../../src/canonical.mjs';
import { compileBusinessOutcomesV4 } from '../../../../src/obligations/business-outcomes-v4.mjs';
import {
  canonicalizeAuditedSourceCapture, createExpiryMatcherRegistry
} from '../../../../src/source-capture-audit.mjs';
import {
  createSourceProviderRegistry, sourceByteDigest
} from '../../../../src/source-canonicalization.mjs';
import { compileCanonicalSourceStructure } from '../../../../src/source-locators-v4.mjs';
import { compileScopeManifestV4, expectedInteractionCellsV4 } from '../../../../src/scope-manifest-v4.mjs';
import { discoverTopologyV4 } from '../../../../src/topology-discovery.mjs';

const fixtureRoot = new URL('./', import.meta.url);
const dimensions = Object.freeze([
  'shared-entity', 'role', 'client', 'interface-event', 'time', 'concurrency', 'side-effect'
]);

/** @param {string} left @param {string} right */
function compare(left, right) {
  const a = Array.from(left, character => character.codePointAt(0) ?? 0);
  const b = Array.from(right, character => character.codePointAt(0) ?? 0);
  for (let index = 0; index < Math.min(a.length, b.length); index += 1) {
    if (a[index] !== b[index]) return a[index] - b[index];
  }
  return a.length - b.length;
}

/** @param {string[]} values */
function unique(values) { return [...new Set(values)].sort(compare); }

/** @param {string} value */
function bytesDigest(value) { return sourceByteDigest(new TextEncoder().encode(value)); }

/** @param {any[]} structure @param {string} excerpt */
function locate(structure, excerpt) {
  const matches = structure.flatMap(unit => {
    const start = unit.text.indexOf(excerpt);
    return start < 0 ? [] : [{ unit, start }];
  });
  if (matches.length !== 1) throw new TypeError(`BEND_FIXTURE_EXCERPT_NOT_UNIQUE:${excerpt}`);
  return matches[0];
}

/** @param {any} element */
function requiredBindings(element) {
  if (element.kind === 'input_domain') return [
    '/business_outcome',
    ...element.partitions.flatMap((/** @type {any} */ _partition, /** @type {number} */ index) => [
      `/partitions/${index}/value`, `/partitions/${index}/expected`
    ])
  ];
  return ['/business_outcome', '/condition', '/expected'];
}

/** @param {any} value @param {string} pointerValue */
function pointer(value, pointerValue) {
  return pointerValue.slice(1).split('/').reduce((/** @type {any} */ current, segment) => current[segment], value);
}

/**
 * @param {string} runInstanceId
 * @param {number} revision
 * @param {any[]} clarificationEvents
 * @param {{source_file?:string,source_providers?:any[],clarification_messages?:string[]}} options
 */
export async function bendReviewJourneyFixture(
  runInstanceId = 'RUN-12345678-1234-4234-8234-123456789abc',
  revision = 0,
  clarificationEvents = [],
  options = {}
) {
  const content = await readFile(new URL(options.source_file ?? 'prd.md', fixtureRoot), 'utf8');
  const providerRegistry = createSourceProviderRegistry(options.source_providers ?? []);
  const expiryRegistry = createExpiryMatcherRegistry([]);
  const input = {
    stable_source_id: 'source_bend_review_prd', source_type: 'prd',
    capture_bytes: new TextEncoder().encode(content), assets: []
  };
  const audited = canonicalizeAuditedSourceCapture(input, providerRegistry, {}, expiryRegistry);
  if (audited.status !== 'canonical') throw new TypeError('BEND_FIXTURE_SOURCE_NOT_CANONICAL');
  const structure = compileCanonicalSourceStructure(input.stable_source_id, audited.semantic_projection.content);
  const semanticProjection = { ...audited.semantic_projection, structure };
  let semanticDigest = `sha256:${digest(semanticProjection)}`;
  const source = {
    source_id: input.stable_source_id, kind: 'prd', version: '1', status: 'effective',
    authority: 'review-platform-owner', title: 'B 端评价平台：列表筛选与内容展示',
    scope: 'review-platform', domain: 'business', content: semanticProjection.content,
    content_digest: bytesDigest(semanticProjection.content).slice('sha256:'.length),
    capture_digest: audited.capture_digest, semantic_digest: semanticDigest,
    semantic_projection: semanticProjection, capture_audit: audited.capture_audit
  };

  /** @type {any[]} */
  const claimDefinitions = [
    ['scope', '主验收范围为评价中台的 B 端评价列表；C 端提交评价，城市指南后端汇总评价，评价内容服务提供内容，内容安全提供审核结果。只验证这些依赖在 B 端呈现的结果，不扩展为各上游模块的内部验收。', '/topology', 'review-platform', 'review_scope', 'modules', { modules: ['评价中台', 'C 端', '城市指南后端', '评价内容服务', '内容安全'] }],
    ['business-line', 'B 端评价列表新增业务线筛选，选择业务线后仅展示该业务线的评价。', '/filters/business_line', 'review-platform', 'review_filter', 'business_line', { selected_result: 'same_business_line' }],
    ['source-22', '当 source=22 时，来源显示为“打车去过”。', '/columns/source', 'review-platform', 'review_source', 'source', { value: 22, expected: '打车去过' }],
    ['source-23', '当 source=23 时，来源显示为“普通用户”。', '/columns/source', 'review-platform', 'review_source', 'source', { value: 23, expected: '普通用户' }],
    ['star-500', '当 star_level=500 时，推荐程度显示为“推荐”。', '/columns/star_level', 'review-platform', 'review_star', 'star_level', { value: 500, expected: '推荐' }],
    ['star-1', '当 star_level=1 时，推荐程度显示为“常规”。', '/columns/star_level', 'review-platform', 'review_star', 'star_level', { value: 1, expected: '常规' }],
    ['star-0', '当 star_level=0 时，推荐程度显示为“不推荐”。', '/columns/star_level', 'review-platform', 'review_star', 'star_level', { value: 0, expected: '不推荐' }],
    ['baseline', '除本次新增与明确变更外，其他筛选项、列、内容分类、标记、质量、相关性均与当前线上一致。', '/compatibility/unchanged', 'review-platform', 'review_baseline', 'observable_behavior', { reference: '当前线上', exceptions: ['本次新增与明确变更'] }],
    ['ip', '列表展示 IP，但 IP 的业务含义未定义。', '/columns/ip/meaning', 'review-platform', 'review_ip', 'meaning', null],
    ['empty', '字段为空时的展示方式未定义。', '/columns/empty/display', 'review-platform', 'review_empty', 'empty_display', null],
    ['sort', '排序方向未定义。', '/sorting/direction', 'review-platform', 'review_sort', 'direction', null]
  ];
  /** @type {any[]} */
  const locators = [];
  const claims = claimDefinitions.map(([key, excerpt, fieldPath, scopeRef, entityKey, subjectField, semanticValue]) => {
    const { unit, start } = locate(structure, String(excerpt));
    const locatorId = `LOC-${key}`;
    locators.push({
      locator_id: locatorId, source_id: source.source_id, semantic_digest: semanticDigest,
      type: 'text_block_range', unit_id: unit.unit_id, section_id: unit.section_id,
      range: { start, end: start + Array.from(String(excerpt)).length }, excerpt,
      excerpt_digest: bytesDigest(String(excerpt)), domain: 'business', field_path: fieldPath
    });
    return {
      claim_id: `CLM-${key}`, claim_form: 'direct', level: 'E3', kind: 'requirement',
      scope: scopeRef, value: excerpt, source_locator_ids: [locatorId], source_id: source.source_id,
      domain: 'business', field_path: fieldPath, document_level_claim: false, locator_roles: [],
      subject_descriptor: {
        scope_ref: scopeRef, module_id: 'review-admin', entity_type: 'review',
        entity_key: entityKey, field_path: fieldPath,
        condition: semanticValue && typeof semanticValue === 'object' && Object.hasOwn(semanticValue, 'value')
          ? { value: semanticValue.value } : {}
      },
      semantic_value: semanticValue
    };
  });
  const nonNormativeSectionIds = new Set(structure
    .filter(unit => unit.type === 'heading' && /（非执行环境）/u.test(unit.text))
    .map(unit => unit.section_id));
  const sourceReviews = [{
    source_id: source.source_id, semantic_digest: semanticDigest,
    units: structure.map(unit => ({
      unit_id: unit.unit_id, content_digest: bytesDigest(unit.text),
      classification: unit.type === 'heading' || unit.text.startsWith('本 PRD 不提供')
        || nonNormativeSectionIds.has(unit.section_id)
        ? 'non_normative' : 'normative'
    }))
  }];
  for (const unit of structure) if (!locators.some(locator => locator.unit_id === unit.unit_id)) {
    locators.push({
      locator_id: `LOC-structure-${unit.unit_id}`, source_id: source.source_id,
      semantic_digest: semanticDigest, type: 'text_block_range', unit_id: unit.unit_id,
      section_id: unit.section_id, range: { start: 0, end: Array.from(unit.text).length },
      excerpt: unit.text, excerpt_digest: bytesDigest(unit.text), domain: 'business',
      field_path: `/source_structure/${unit.unit_id}`
    });
  }
  const answerEvents = clarificationEvents.filter(event => event?.event_type === 'answer_question_part');
  const answerMessages = options.clarification_messages ?? answerEvents.map(event => `答复：${event.answer}`);
  if (answerMessages.length !== answerEvents.length) {
    throw new TypeError('BEND_FIXTURE_ANSWER_MESSAGE_COUNT_MISMATCH');
  }
  for (let index = 0; index < answerEvents.length; index += 1) {
    const event = answerEvents[index];
    const message = answerMessages[index].replace(/^\ufeff/u, '').replace(/\r\n?/gu, '\n').normalize('NFC');
    if (bytesDigest(message) !== event.answer_origin?.message_digest) {
      throw new TypeError('BEND_FIXTURE_ANSWER_MESSAGE_DIGEST_MISMATCH');
    }
    const unit = {
      unit_id: `UNIT-answer-${index + 1}-${event.event_id.slice('EVENT-'.length, 'EVENT-'.length + 12)}`,
      text: message, type: 'user_statement', presentation_id: event.presentation_id,
      message_digest: event.answer_origin.message_digest,
      answer_span: {
        start: event.answer_origin.answer_span.start_scalar,
        end: event.answer_origin.answer_span.end_scalar
      }
    };
    structure.push(unit);
    sourceReviews[0].units.push({
      unit_id: unit.unit_id, content_digest: bytesDigest(unit.text), classification: 'non_normative'
    });
    locators.push({
      locator_id: `LOC-answer-${index + 1}-${event.event_id.slice('EVENT-'.length, 'EVENT-'.length + 12)}`,
      source_id: source.source_id, semantic_digest: source.semantic_digest,
      type: 'user_statement', unit_id: unit.unit_id,
      excerpt: event.answer, excerpt_digest: event.answer_origin.answer_span.excerpt_digest,
      domain: 'business', field_path: `/clarification_answers/${index}`,
      presentation_id: event.presentation_id, message_digest: event.answer_origin.message_digest,
      answer_span: {
        start: event.answer_origin.answer_span.start_scalar,
        end: event.answer_origin.answer_span.end_scalar
      }
    });
  }
  if (answerEvents.length) {
    semanticDigest = `sha256:${digest(source.semantic_projection)}`;
    source.semantic_digest = semanticDigest;
    for (const locator of locators) locator.semantic_digest = semanticDigest;
    sourceReviews[0].semantic_digest = semanticDigest;
  }
  const canonicalLocatorOrder = [...locators].sort((left, right) => compare(left.locator_id, right.locator_id));
  const topologyLocators = new Map(structure.map(unit => [
    unit.unit_id,
    canonicalLocatorOrder.find(locator => locator.unit_id === unit.unit_id)?.locator_id ?? `LOC-structure-${unit.unit_id}`
  ]));
  const canonicalSourceStructure = {
    sources: [{
      source_id: source.source_id,
      units: structure.map(unit => ({
        kind: 'text_block', unit_id: unit.unit_id,
        review_class: sourceReviews[0].units.find(review => review.unit_id === unit.unit_id)?.classification
          ?? 'uncertain',
        locator_id: topologyLocators.get(unit.unit_id), text: unit.text
      }))
    }]
  };
  const scopeLocator = locators.find(locator => locator.locator_id === 'LOC-scope')?.locator_id;
  if (!scopeLocator) throw new TypeError('BEND_FIXTURE_SCOPE_LOCATOR_MISSING');
  const semanticTopologyCandidates = ['C 端', '内容安全'].map(label => ({
    kind: 'module_mention', label, locator_ids: [scopeLocator]
  }));
  const topologyDiscovery = discoverTopologyV4(canonicalSourceStructure, {
    semantic_candidates: semanticTopologyCandidates
  });
  /** @type {Map<string,[string,string]>} */
  const moduleByLabel = new Map([
    ['主验收范围为评价中台', ['review-admin', 'primary']],
    ['C 端', ['consumer-app', 'upstream']],
    ['城市指南后端', ['city-guide-backend', 'upstream']],
    ['评价内容服务', ['review-content-service', 'upstream']],
    ['内容安全', ['content-safety', 'upstream']]
  ]);
  const dispositions = topologyDiscovery.topology_candidates.map((/** @type {any} */ candidate) => {
    const mapping = moduleByLabel.get(candidate.label);
    if (!mapping) throw new TypeError(`BEND_FIXTURE_TOPOLOGY_UNEXPECTED:${candidate.label}`);
    return {
      candidate_id: candidate.candidate_id, disposition: 'module', module_ref: mapping[0],
      role: mapping[1], review_basis_claim_ids: ['CLM-scope']
    };
  });
  const expectedCells = [];
  const moduleIds = unique([...moduleByLabel.values()].map(value => value[0]));
  for (let left = 0; left < moduleIds.length; left += 1) {
    for (let right = left + 1; right < moduleIds.length; right += 1) {
      for (const dimension of dimensions) expectedCells.push({
        module_ids: [moduleIds[left], moduleIds[right]], dimension
      });
    }
  }
  const verifiedScopeClaim = {
    claim_id: 'CLM-scope',
    candidate_ids: topologyDiscovery.topology_candidates.map((/** @type {any} */ candidate) => candidate.candidate_id),
    authorized_topology_roles: ['primary', 'upstream'], authorized_boundaries: [],
    reviewable_interaction_cells: expectedCells
  };
  const topologyReview = {
    ...topologyDiscovery.scanned_units, unresolved_candidate_ids: []
  };
  const compiledScope = compileScopeManifestV4({
    discovery_digest: topologyDiscovery.discovery_digest, primary_surface: 'review-admin',
    topology_review: topologyReview, topology_dispositions: dispositions
  }, {
    canonical_source_structure: canonicalSourceStructure,
    semantic_topology_candidates: semanticTopologyCandidates,
    verified_claims: [verifiedScopeClaim], effective_scope_decisions: []
  });
  if (compiledScope.diagnostics.length) {
    throw new TypeError(`BEND_FIXTURE_SCOPE_INVALID:${JSON.stringify(compiledScope.diagnostics)}`);
  }
  const scopeManifest = compiledScope.scope_manifest;
  const interactionCells = expectedInteractionCellsV4(scopeManifest);
  const factDefinitions = [
    ['business-line', '业务线筛选只展示所选业务线评价', 'active', '/filters/business_line'],
    ['source-22', 'source=22 显示打车去过', 'active', '/columns/source/22'],
    ['source-23', 'source=23 显示普通用户', 'active', '/columns/source/23'],
    ['star-500', 'star_level=500 显示推荐', 'active', '/columns/star_level/500'],
    ['star-1', 'star_level=1 显示常规', 'active', '/columns/star_level/1'],
    ['star-0', 'star_level=0 显示不推荐', 'active', '/columns/star_level/0'],
    ['baseline', '其余筛选项和列与当前线上一致', 'active', '/compatibility/unchanged'],
    ['ip', 'IP 业务含义未定义', 'ambiguous', '/columns/ip/meaning'],
    ['empty', '空值展示未定义', 'ambiguous', '/columns/empty/display'],
    ['sort', '排序方向未定义', 'ambiguous', '/sorting/direction']
  ];
  const factLedger = factDefinitions.map(([key, statement, status, fieldPath]) => ({
    fact_id: `FACT-${key}`, statement, status, acceptance_role: 'primary_acceptance',
    claim_ids: [`CLM-${key}`], module_refs: ['review-admin'], field_path: fieldPath
  }));
  const semanticGaps = [
    ['ip', 'IP_MEANING_UNRESOLVED', 'ip_meaning', 'IP 表示发布者提交评价时的 IP 归属地，还是评价地点信息？', '需要明确 IP 列的业务含义。', '答案决定 IP 列的数据条件和展示预期。', 'IP 列相关场景保持待确认。', ['发布者提交评价时的 IP 归属地', '评价地点信息'], 'high'],
    ['empty', 'EMPTY_DISPLAY_UNRESOLVED', 'empty_display', '字段出现空值时显示空白、横线还是其他文案？', '需要明确空值的业务展示口径。', '答案决定空值场景的可观察预期。', '空值展示场景保持待确认。', ['空白', '—', '其他文案'], 'medium'],
    ['sort', 'SORT_DIRECTION_UNRESOLVED', 'sort_direction', '评价列表默认按哪个方向排序？', '需要明确列表的默认业务顺序。', '答案决定首屏记录顺序的预期。', '排序相关场景保持明确未决。', ['升序', '降序'], 'high']
  ].map(([key, code, aspect, question, why, impact, unresolved, answerOptions, risk]) => ({
    category: 'semantic_gap', code, subject_fact_ids: [`FACT-${key}`], missing_aspect: aspect,
    scope_ref: `review-platform.${key}`, question, why_needed: why, decision_impact: impact,
    unresolved_outcome: unresolved, answer_options: answerOptions, risk_level: risk,
    source_claim_ids: [`CLM-${key}`], discovery_phase: 'pre_case', affected_test_point_ids: []
  }));
  const evidenceClaims = {
    schema_version: '4.0.0', source_revision: revision, claims, fact_ledger: factLedger,
    semantic_gaps: semanticGaps, topology_discovery: topologyDiscovery,
    topology_review: topologyReview, topology_dispositions: dispositions,
    scope_manifest: scopeManifest,
    interaction_review: interactionCells.map(cell => ({
      ...cell, status: 'checked-no-signal', reviewed_claim_ids: ['CLM-scope'],
      review_basis: `已审阅 ${cell.module_ids.join(' / ')} 的 ${cell.dimension} 交互信号。`
    })),
    acceptance_role_assignments: factLedger.map(fact => ({
      entity_kind: 'fact', entity_id: fact.fact_id, scope_ref: 'review-platform',
      acceptance_role: fact.acceptance_role, parent_entity_ids: [], role_basis_claim_ids: fact.claim_ids
    }))
  };

  /** @type {any[]} */
  const viewDefinitions = [
    ['business-line', 'input_domain', '按业务线筛选评价', [{ value: '目标业务线', expected: '仅展示所选业务线的评价' }]],
    ['source', 'input_domain', '按来源值展示来源名称', [
      { value: 22, expected: '打车去过' }, { value: 23, expected: '普通用户' }
    ]],
    ['star', 'input_domain', '按推荐程度值展示中文名称', [
      { value: 500, expected: '推荐' }, { value: 1, expected: '常规' }, { value: 0, expected: '不推荐' }
    ]],
    ['baseline', 'state', '其余筛选项和列保持线上相对基线', null]
  ];
  /** @param {string} key */
  const claimIdsFor = key => key === 'source' ? ['CLM-source-22', 'CLM-source-23']
    : key === 'star' ? ['CLM-star-500', 'CLM-star-1', 'CLM-star-0'] : [`CLM-${key}`];
  const elements = viewDefinitions.map(([key, kind, outcome, partitions]) => {
    const factId = `FACT-${key}`;
    const claimsForElement = claimIdsFor(key);
    /** @type {any} */
    const element = kind === 'input_domain' ? {
      element_id: `EL-${key}`, kind, fact_id: factId, business_outcome: outcome,
      partitions: partitions.map((/** @type {any} */ partition) => ({ kind: 'enum', ...partition }))
    } : {
      element_id: `EL-${key}`, kind, fact_id: factId, business_outcome: outcome,
      condition: { candidate_version: true }, expected: '除明确变更外与执行时采集的当前线上表现一致'
    };
    element.evidence_bindings = requiredBindings(element).map(field_path => {
      const partitionMatch = /^\/partitions\/(\d+)\/(?:value|expected)$/u.exec(field_path);
      const partitionClaimId = partitionMatch && ['source', 'star'].includes(key)
        ? claimsForElement[Number(partitionMatch[1])] : null;
      return {
        field_path,
        claim_ids: partitionClaimId ? [partitionClaimId] : claimsForElement
      };
    });
    return element;
  });
  // Grouped value mappings are one business Fact each even though each enum value
  // has its own atomic Claim and locator.
  for (const [factId, claimIds] of /** @type {Array<[string,string[]]>} */ ([
    ['FACT-source', ['CLM-source-22', 'CLM-source-23']],
    ['FACT-star', ['CLM-star-500', 'CLM-star-1', 'CLM-star-0']]
  ])) {
    const first = factLedger.findIndex(fact => fact.fact_id === claimIds[0].replace('CLM-', 'FACT-'));
    const members = factLedger.filter(fact => claimIds.includes(fact.claim_ids[0]));
    factLedger.splice(first, members.length, {
      fact_id: factId,
      statement: factId === 'FACT-source' ? '来源值映射为业务名称' : '推荐程度值映射为业务名称',
      status: 'active', acceptance_role: 'primary_acceptance', claim_ids: claimIds,
      module_refs: ['review-admin'], field_path: factId === 'FACT-source' ? '/columns/source' : '/columns/star_level'
    });
  }
  // Behavior evidence is carried by immutable Evidence Claims, never derived
  // back from the Agent-authored Behavior Views. Keep the source-level value
  // for subject/conflict review and add only the exact field assertions this
  // Claim independently supports.
  for (const claim of claims) {
    const behaviorAssertions = elements.flatMap(element =>
      element.evidence_bindings.flatMap((/** @type {any} */ binding) =>
        binding.claim_ids.includes(claim.claim_id) ? [{
          fact_id: element.fact_id,
          field_path: binding.field_path,
          value: pointer(element, binding.field_path)
        }] : []));
    claim.semantic_value = {
      source_value: structuredClone(claim.semantic_value),
      behavior_assertions: behaviorAssertions
    };
  }
  for (const [key, businessOutcome] of [
    ['ip', 'IP 列业务含义'],
    ['empty', '空值展示方式'],
    ['sort', '默认排序方向']
  ]) {
    const claim = claims.find((item) => item.claim_id === `CLM-${key}`);
    if (!claim) throw new TypeError(`BEND_FIXTURE_DECISION_PROJECTION_MISSING:${key}`);
    claim.semantic_value.decision_answer_projection = [
      { fact_id: `FACT-${key}`, field_path: '/business_outcome', value_kind: 'literal', value: businessOutcome },
      { fact_id: `FACT-${key}`, field_path: '/condition', value_kind: 'literal', value: {} },
      { fact_id: `FACT-${key}`, field_path: '/expected', value_kind: 'answer' }
    ];
  }
  const scopeClaim = claims.find(claim => claim.claim_id === 'CLM-scope');
  if (!scopeClaim) throw new TypeError('BEND_FIXTURE_SCOPE_CLAIM_MISSING');
  scopeClaim.semantic_value.topology_authorization = {
    candidates: topologyDiscovery.topology_candidates.map((/** @type {any} */ candidate) => {
      const disposition = dispositions.find(
        (/** @type {any} */ item) => item.candidate_id === candidate.candidate_id
      );
      if (!disposition || disposition.disposition !== 'module') {
        throw new TypeError(`BEND_FIXTURE_TOPOLOGY_AUTHORIZATION_MISSING:${candidate.candidate_id}`);
      }
      return {
        kind: candidate.kind,
        label: candidate.label,
        locator_ids: structuredClone(candidate.locator_ids),
        disposition: disposition.disposition,
        module_ref: disposition.module_ref,
        role: disposition.role
      };
    }),
    reviewable_interaction_cells: structuredClone(expectedCells)
  };
  evidenceClaims.acceptance_role_assignments = factLedger.map(fact => ({
    entity_kind: 'fact', entity_id: fact.fact_id, scope_ref: 'review-platform',
    acceptance_role: fact.acceptance_role, parent_entity_ids: [], role_basis_claim_ids: fact.claim_ids
  }));
  const behaviorViews = {
    schema_version: '4.0.0', source_revision: revision,
    views: elements.map(element => ({
      view_id: `VIEW-${element.element_id.slice(3)}`, module_id: 'review-admin',
      type: element.kind === 'input_domain' ? 'input-domain' : 'state', scope: 'review-platform',
      source_claim_ids: unique(element.evidence_bindings.flatMap((/** @type {any} */ binding) => binding.claim_ids)),
      elements: [element], relations: []
    })),
    interaction_matrix: interactionCells.map(cell => ({ ...cell, status: 'checked-no-signal' })),
    interaction_candidates: [], obligation_inputs: {
      view_contexts: [], terminal_fact_routes: [], custom_responsibilities: [], combination_requests: []
    }
  };
  const behaviorEvidence = {
    facts: factLedger.map(fact => ({
      fact_id: fact.fact_id, module_id: 'review-admin', acceptance_role: fact.acceptance_role,
      condition_field: fact.field_path.split('/').filter(Boolean).at(-1)
    })),
    claims: claims.map(claim => ({
      claim_id: claim.claim_id, level: claim.level, supported: true,
      assertions: structuredClone(claim.semantic_value.behavior_assertions)
    })).filter(claim => claim.assertions.length)
  };
  const compiledOutcomes = compileBusinessOutcomesV4(behaviorViews, behaviorEvidence);
  if (compiledOutcomes.kind !== 'compiled') {
    throw new TypeError(`BEND_FIXTURE_OUTCOME_INVALID:${JSON.stringify(compiledOutcomes)}`);
  }
  const outcomeByCondition = new Map(compiledOutcomes.outcomes.map((/** @type {any} */ outcome) => [
    JSON.stringify(outcome.condition), outcome
  ]));
  const pointByOutcome = new Map(compiledOutcomes.formal_test_points.map((/** @type {any} */ point) => [
    point.outcome_id, point.formal_test_point_id
  ]));
  /** @type {any[]} */
  const caseSpecs = [
    ['business-line', { business_line: '目标业务线' }, '按业务线筛选只展示所选评价', '选择目标业务线并执行筛选', '列表仅展示所选业务线的评价', ['CLM-business-line']],
    ['source-22', { source: 22 }, '来源 22 显示打车去过', '查看 source=22 的评价', '来源列显示“打车去过”', ['CLM-source-22']],
    ['source-23', { source: 23 }, '来源 23 显示普通用户', '查看 source=23 的评价', '来源列显示“普通用户”', ['CLM-source-23']],
    ['star-500', { star_level: 500 }, '推荐程度 500 显示推荐', '查看 star_level=500 的评价', '推荐程度显示“推荐”', ['CLM-star-500']],
    ['star-1', { star_level: 1 }, '推荐程度 1 显示常规', '查看 star_level=1 的评价', '推荐程度显示“常规”', ['CLM-star-1']],
    ['star-0', { star_level: 0 }, '推荐程度 0 显示不推荐', '查看 star_level=0 的评价', '推荐程度显示“不推荐”', ['CLM-star-0']],
    ['baseline', { candidate_version: true }, '其余筛选项和列保持当前线上一致', '在相同业务条件下比较当前线上与待测版本', '除明确变更外，其他筛选项、列、内容分类、标记、质量和相关性保持一致', ['CLM-baseline']]
  ];
  const caseDrafts = {
    schema_version: '4.0.0', source_revision: revision,
    cases: caseSpecs.map(([key, condition, title, action, expected, oracleClaimIds]) => {
      const outcome = outcomeByCondition.get(JSON.stringify(condition));
      if (!outcome) throw new TypeError(`BEND_FIXTURE_OUTCOME_MISSING:${key}`);
      const stepId = `STEP-${key}`;
      /** @type {any} */
      const candidate = {
        case_id: `CASE-adapter-${key}`, title, module_id: 'review-admin', priority: 'P0',
        ordering: { business_flow_ref: null, page_action_ref: null },
        acceptance_role: 'primary_acceptance', fact_ids: [outcome.fact_id],
        primary_test_point_id: pointByOutcome.get(outcome.outcome_id), supporting_observation_ids: [],
        business_preconditions: [], data_conditions: [],
        steps: [{ step_id: stepId, action }],
        oracles: [{
          oracle_id: `ORACLE-${key}`, observe_after_step_id: stepId, surface: 'ui',
          expected, claim_ids: oracleClaimIds
        }]
      };
      if (key === 'baseline') candidate.baseline_spec = {
        baseline_id: 'BASELINE-current-production', kind: 'declared_reference',
        acquisition: 'capture_at_execution', reference: '当前线上',
        comparison_contract: {
          kind: 'all_observable_behavior_except', exceptions: ['本次新增与明确变更']
        }, claim_ids: ['CLM-baseline']
      };
      return candidate;
    })
  };
  const sourcePack = {
    schema_version: '4.0.0', source_revision: revision, run_instance_id: runInstanceId,
    run_scope: 'review-platform', delivery_intent: 'case_document', output_language: 'zh-CN',
    sources: [source], locators: canonicalLocatorOrder, source_reviews: sourceReviews,
    source_policy: { rules: [{
      rule_id: 'POLICY-bend-review', composition_mode: 'single_source',
      source_ids: [source.source_id], scope: 'review-platform', authority: 'review-platform-owner',
      status: 'effective', rule_internal_conflict_review: []
    }] },
    decision_records: [], clarification_events: structuredClone(clarificationEvents),
    execution_events: [], source_assets: [], artifact_events: []
  };
  return {
    artifacts: { source_pack: sourcePack, evidence_claims: evidenceClaims, behavior_views: behaviorViews, case_drafts: caseDrafts },
    raw: { content, input, providerRegistry, expiryRegistry },
    expectations: {
      module_ids: moduleIds, case_titles: caseSpecs.map(item => item[2]), gap_keys: ['IP', '空值', '排序'],
      formal_test_point_ids: compiledOutcomes.formal_test_points.map((/** @type {any} */ point) => point.formal_test_point_id)
    }
  };
}
