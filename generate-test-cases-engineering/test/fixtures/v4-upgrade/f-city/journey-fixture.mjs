// @ts-nocheck -- Integration fixture composes closed runtime artifact unions for acceptance tests.
import { readFile } from 'node:fs/promises';

import { canonicalStringify, digest } from '../../../../src/canonical.mjs';
import { compileBusinessOutcomesV4 } from '../../../../src/obligations/business-outcomes-v4.mjs';
import {
  canonicalizeAuditedSourceCapture, createExpiryMatcherRegistry
} from '../../../../src/source-capture-audit.mjs';
import {
  createSourceProviderRegistry, sourceByteDigest
} from '../../../../src/source-canonicalization.mjs';
import { compileCanonicalSourceStructure } from '../../../../src/source-locators-v4.mjs';
import {
  compileScopeManifestV4, expectedInteractionCellsV4
} from '../../../../src/scope-manifest-v4.mjs';
import { discoverTopologyV4 } from '../../../../src/topology-discovery.mjs';
import { deriveV4SystemContext } from '../../../../src/v4-system-context.mjs';

const DIMENSIONS = ['shared-entity', 'role', 'client', 'interface-event', 'time', 'concurrency', 'side-effect'];
const sentence = {
  permission: '在一个 B2B 平台中，管理员可查看负向体验报表，普通用户无访问权限。所有权限用户可进入内容管理。',
  columns: '业务线选中“城市指南评价”时展示 UID、评分、点赞数、IP 四列，其他业务线时不展示这四列；有数据时正常展示相应业务值。',
  scores: 'star_level 为 1—6 时分别显示“1分”至“6分”，其他分值不在本次验收范围。',
  query: '选择该业务线点击查询，查询条件应匹配所选业务线；存在符合条件的记录时可查到对应记录。',
  sources: 'source=23 表示打车去过，source=24 表示未打车去过。'
};

/** @param {string|Uint8Array} value */
const byteDigest = (value) => sourceByteDigest(
  typeof value === 'string' ? new TextEncoder().encode(value) : value
);
/** @param {string[]} values */
const unique = (values) => [...new Set(values)].sort();

const groups = [
  { key: 'permission-admin', field: 'role', subject: '负向体验报表', outcome: '负向体验报表权限', instances: [
    { key: 'permission.admin.negative_report', value: '管理员', condition: '角色是管理员', expected: '允许查看', excerpt: sentence.permission }
  ] },
  { key: 'permission-ordinary', field: 'role', subject: '负向体验报表', outcome: '负向体验报表权限', instances: [
    { key: 'permission.ordinary.negative_report', value: '普通用户', condition: '角色是普通用户', expected: '无访问权限', excerpt: sentence.permission }
  ] },
  { key: 'permission-content', field: 'role', subject: '内容管理', outcome: '内容管理入口权限', instances: [
    { key: 'permission.authorized.content_management', value: '所有权限用户', condition: '角色属于所有权限用户', expected: '可进入', excerpt: sentence.permission }
  ] },
  { key: 'query-selected', field: 'business_line', subject: '查询条件', outcome: '查询条件匹配所选业务线', instances: [
    { key: 'query.selected_business_line', value: '城市指南评价', condition: '选择城市指南评价并点击查询', expected: '匹配所选业务线', excerpt: sentence.query }
  ] },
  { key: 'query-existing', field: 'records_exist', subject: '查询结果', outcome: '符合条件记录的查询结果', instances: [
    { key: 'query.existing_records', value: true, condition: '存在符合所选业务线条件的记录', expected: '可查到对应记录', excerpt: sentence.query }
  ] },
  ...['UID', '评分', '点赞数', 'IP'].map((column) => ({
    key: `column-${column}`, field: 'business_line', subject: column, outcome: `${column} 列显隐`, instances: [
      { key: `column.${column}.selected`, value: '城市指南评价', condition: 'selected', expected: '展示', excerpt: sentence.columns },
      { key: `column.${column}.otherwise`, value: '其他业务线', condition: 'otherwise', expected: '不展示', excerpt: sentence.columns }
    ]
  })),
  { key: 'score', field: 'star_level', subject: 'star_level', outcome: '评分值展示', instances: [1, 2, 3, 4, 5, 6].map((value) => ({
    key: `score.${value}`, value, condition: `star_level=${value}`, expected: `${value}分`, excerpt: sentence.scores
  })) },
  { key: 'source', field: 'source', subject: 'source', outcome: '内容来源展示', instances: [
    { key: 'source.23', value: 23, condition: 'source=23', expected: '打车去过', excerpt: sentence.sources },
    { key: 'source.24', value: 24, condition: 'source=24', expected: '未打车去过', excerpt: sentence.sources }
  ] }
];

/** @param {any[]} structure @param {string} excerpt */
function locate(structure, excerpt) {
  const matches = structure.flatMap((unit) => {
    const start = Array.from(unit.text).join('').indexOf(excerpt);
    return start < 0 ? [] : [{ unit, start: Array.from(unit.text.slice(0, start)).length }];
  });
  if (matches.length !== 1) throw new TypeError(`F_CITY_EXCERPT_NOT_UNIQUE:${excerpt}`);
  return matches[0];
}

/** @param {string} runId */
export async function fCityJourneyFixture(runId) {
  const content = await readFile(new URL('./prd.md', import.meta.url), 'utf8');
  const providers = createSourceProviderRegistry([]);
  const expiry = createExpiryMatcherRegistry([]);
  const input = {
    stable_source_id: 'source_f_city_prd', source_type: 'prd',
    capture_bytes: new TextEncoder().encode(content), assets: []
  };
  const audited = canonicalizeAuditedSourceCapture(input, providers, {}, expiry);
  if (audited.status !== 'canonical') throw new TypeError('F_CITY_SOURCE_NOT_CANONICAL');
  const structure = compileCanonicalSourceStructure(input.stable_source_id, audited.semantic_projection.content);
  const semanticProjection = { ...audited.semantic_projection, structure };
  const semanticDigest = `sha256:${digest(semanticProjection)}`;
  const source = {
    source_id: input.stable_source_id, kind: 'prd', version: '1', status: 'effective',
    authority: 'f-city-product-owner', title: 'F-CITY synthetic B2B requirement',
    scope: 'f-city', domain: 'business', content: semanticProjection.content,
    content_digest: byteDigest(semanticProjection.content).slice('sha256:'.length),
    capture_digest: audited.capture_digest, semantic_digest: semanticDigest,
    semantic_projection: semanticProjection, capture_audit: audited.capture_audit
  };
  const sourceReviews = [{
    source_id: source.source_id, semantic_digest: semanticDigest,
    units: structure.map((unit) => ({
      unit_id: unit.unit_id, content_digest: byteDigest(unit.text),
      classification: unit.type === 'heading' ? 'non_normative' : 'normative'
    }))
  }];
  const locators = [];
  const claims = [];
  const facts = [];
  const views = [];
  const scopeLocation = locate(structure, sentence.permission);
  const scopeExcerpt = scopeLocation.unit.text;
  locators.push({
    locator_id: 'LOC-f-city-scope', source_id: source.source_id, semantic_digest: semanticDigest,
    type: 'text_block_range', unit_id: scopeLocation.unit.unit_id,
    section_id: scopeLocation.unit.section_id,
    range: { start: 0, end: Array.from(scopeExcerpt).length },
    excerpt: scopeExcerpt, excerpt_digest: byteDigest(scopeExcerpt),
    domain: 'business', field_path: '/scope'
  });
  const scopeClaim = {
    claim_id: 'CLM-f-city-scope', claim_form: 'direct', level: 'E3', kind: 'requirement',
    scope: 'f-city', value: scopeExcerpt, source_locator_ids: ['LOC-f-city-scope'],
    source_id: source.source_id, domain: 'business', field_path: '/scope',
    document_level_claim: false, locator_roles: [],
    subject_descriptor: {
      scope_ref: 'f-city', module_id: 'f-city', entity_type: 'platform',
      entity_key: 'f-city', field_path: '/scope', condition: {}
    },
    semantic_value: { module: 'B2B 平台', scope: 'F-CITY' }
  };
  claims.push(scopeClaim);

  for (const group of groups) {
    const factId = `FACT-${group.key}`;
    const factFieldPath = `/business/${group.key}/${group.field}`;
    const groupClaimIds = [];
    const partitions = [];
    for (const [index, instance] of group.instances.entries()) {
      const claimId = `CLM-${instance.key}`;
      const locatorId = `LOC-${instance.key}`;
      const location = locate(structure, instance.excerpt);
      const condition = { [group.field]: instance.value };
      groupClaimIds.push(claimId);
      partitions.push({ kind: 'enum', value: instance.value, expected: instance.expected });
      locators.push({
        locator_id: locatorId, source_id: source.source_id, semantic_digest: semanticDigest,
        type: 'text_block_range', unit_id: location.unit.unit_id, section_id: location.unit.section_id,
        range: { start: location.start, end: location.start + Array.from(instance.excerpt).length },
        excerpt: instance.excerpt, excerpt_digest: byteDigest(instance.excerpt),
        domain: 'business', field_path: factFieldPath
      });
      claims.push({
        claim_id: claimId, claim_form: 'direct', level: 'E3', kind: 'requirement',
        scope: 'f-city', value: instance.excerpt, source_locator_ids: [locatorId],
        source_id: source.source_id, domain: 'business', field_path: factFieldPath,
        document_level_claim: false, locator_roles: [],
        subject_descriptor: {
          scope_ref: 'f-city', module_id: 'f-city', entity_type: 'business_outcome',
          entity_key: group.key, field_path: factFieldPath, condition
        },
        semantic_value: {
          source_value: { subject: group.subject, condition: instance.condition, result: instance.expected },
          behavior_assertions: [
            { fact_id: factId, field_path: '/business_outcome', value: group.outcome },
            { fact_id: factId, field_path: `/partitions/${index}/value`, value: instance.value },
            { fact_id: factId, field_path: `/partitions/${index}/expected`, value: instance.expected }
          ]
        }
      });
    }
    facts.push({
      fact_id: factId, statement: group.outcome, status: 'active',
      acceptance_role: 'primary_acceptance', claim_ids: groupClaimIds,
      module_refs: ['f-city'], field_path: factFieldPath
    });
    const element = {
      element_id: `EL-${group.key}`, kind: 'input_domain', fact_id: factId,
      business_outcome: group.outcome, partitions,
      evidence_bindings: [
        { field_path: '/business_outcome', claim_ids: groupClaimIds },
        ...group.instances.flatMap((instance, index) => [
          { field_path: `/partitions/${index}/value`, claim_ids: [`CLM-${instance.key}`] },
          { field_path: `/partitions/${index}/expected`, claim_ids: [`CLM-${instance.key}`] }
        ])
      ]
    };
    views.push({
      view_id: `VIEW-${group.key}`, module_id: 'f-city', type: 'input-domain', scope: 'f-city',
      source_claim_ids: groupClaimIds, elements: [element], relations: []
    });
  }
  for (const unit of structure) if (!locators.some((locator) => locator.unit_id === unit.unit_id)) {
    locators.push({
      locator_id: `LOC-structure-${unit.unit_id}`, source_id: source.source_id,
      semantic_digest: semanticDigest, type: 'text_block_range', unit_id: unit.unit_id,
      section_id: unit.section_id, range: { start: 0, end: Array.from(unit.text).length },
      excerpt: unit.text, excerpt_digest: byteDigest(unit.text), domain: 'business',
      field_path: `/source_structure/${unit.unit_id}`
    });
  }
  locators.sort((left, right) => left.locator_id.localeCompare(right.locator_id));
  const topologyLocatorId = locators.find(
    (locator) => locator.unit_id === scopeLocation.unit.unit_id
  ).locator_id;

  const unitLocator = new Map(structure.map((unit) => [
    unit.unit_id,
    unit.unit_id === scopeLocation.unit.unit_id
      ? topologyLocatorId
      : locators.find((locator) => locator.unit_id === unit.unit_id).locator_id
  ]));
  const canonicalSourceStructure = { sources: [{
    source_id: source.source_id,
    units: structure.map((unit) => ({
      kind: 'text_block', unit_id: unit.unit_id,
      review_class: unit.type === 'heading' ? 'non_normative' : 'normative',
      locator_id: unitLocator.get(unit.unit_id), text: unit.text
    }))
  }] };
  const topology = discoverTopologyV4(canonicalSourceStructure, {
    semantic_candidates: [{
      kind: 'module_mention', label: 'B2B 平台', locator_ids: [topologyLocatorId]
    }]
  });
  const reviewableCells = DIMENSIONS.map((dimension) => ({ module_ids: ['f-city'], dimension }));
  const verifiedScopeClaim = {
    claim_id: scopeClaim.claim_id,
    candidate_ids: topology.topology_candidates.map((candidate) => candidate.candidate_id),
    authorized_topology_roles: ['primary'], authorized_boundaries: [],
    reviewable_interaction_cells: reviewableCells
  };
  const dispositions = topology.topology_candidates.map((candidate) => ({
    candidate_id: candidate.candidate_id, disposition: 'module', module_ref: 'f-city',
    role: 'primary', review_basis_claim_ids: [scopeClaim.claim_id]
  }));
  const scopeResult = compileScopeManifestV4({
    discovery_digest: topology.discovery_digest,
    topology_review: { ...topology.scanned_units, unresolved_candidate_ids: [] },
    topology_dispositions: dispositions,
    primary_surface: 'f-city'
  }, {
    canonical_source_structure: canonicalSourceStructure,
    semantic_topology_candidates: [{
      kind: 'module_mention', label: 'B2B 平台', locator_ids: [topologyLocatorId]
    }],
    verified_claims: [verifiedScopeClaim], effective_scope_decisions: []
  });
  if (scopeResult.diagnostics.length) {
    throw new TypeError(`F_CITY_SCOPE_INVALID:${canonicalStringify(scopeResult.diagnostics)}`);
  }
  const scopeManifest = scopeResult.scope_manifest;
  const interactionCells = expectedInteractionCellsV4(scopeManifest);
  scopeClaim.semantic_value.topology_authorization = {
    candidates: topology.topology_candidates.map((candidate) => ({
      kind: candidate.kind, label: candidate.label, locator_ids: candidate.locator_ids,
      disposition: 'module', module_ref: 'f-city', role: 'primary'
    })),
    reviewable_interaction_cells: interactionCells
  };
  const evidenceClaims = {
    schema_version: '4.0.0', source_revision: 0, claims, fact_ledger: facts,
    semantic_gaps: [], topology_discovery: topology,
    topology_review: { ...topology.scanned_units, unresolved_candidate_ids: [] },
    topology_dispositions: dispositions, scope_manifest: scopeManifest,
    interaction_review: interactionCells.map((cell) => ({
      ...cell, status: 'checked-no-signal', reviewed_claim_ids: [scopeClaim.claim_id],
      review_basis: 'F-CITY 单一主验收模块无额外交互义务。'
    })),
    acceptance_role_assignments: facts.map((fact) => ({
      entity_kind: 'fact', entity_id: fact.fact_id, scope_ref: 'f-city',
      acceptance_role: fact.acceptance_role, parent_entity_ids: [],
      role_basis_claim_ids: fact.claim_ids
    }))
  };
  const sourcePack = {
    schema_version: '4.0.0', source_revision: 0, run_instance_id: runId,
    run_scope: 'f-city', delivery_intent: 'case_document', output_language: 'zh-CN',
    sources: [source], locators, source_reviews: sourceReviews,
    source_policy: { rules: [{
      rule_id: 'POLICY-f-city', composition_mode: 'single_source', source_ids: [source.source_id],
      scope: 'f-city', authority: 'f-city-product-owner', status: 'effective',
      rule_internal_conflict_review: []
    }] },
    decision_records: [], clarification_events: [], execution_events: [], source_assets: [], artifact_events: []
  };
  const behaviorViews = {
    schema_version: '4.0.0', source_revision: 0, views,
    interaction_matrix: interactionCells.map((cell) => ({ ...cell, status: 'checked-no-signal' })),
    interaction_candidates: [], obligation_inputs: {
      view_contexts: [], terminal_fact_routes: [], custom_responsibilities: [], combination_requests: []
    }
  };
  const emptyCases = { schema_version: '4.0.0', source_revision: 0, cases: [] };
  const context = deriveV4SystemContext({
    source_pack: sourcePack, evidence_claims: evidenceClaims,
    behavior_views: behaviorViews, case_drafts: emptyCases
  });
  const compiled = compileBusinessOutcomesV4(behaviorViews, context.behavior_evidence);
  if (compiled.kind !== 'compiled') throw new TypeError(`F_CITY_OUTCOME_INVALID:${canonicalStringify(compiled)}`);
  const cases = [];
  for (const group of groups) {
    const factId = `FACT-${group.key}`;
    for (const instance of group.instances) {
      const condition = { [group.field]: instance.value };
      const outcome = compiled.outcomes.find((item) => item.fact_id === factId
        && canonicalStringify(item.condition) === canonicalStringify(condition));
      const point = compiled.formal_test_points.find((item) => item.outcome_id === outcome?.outcome_id);
      if (!outcome || !point) throw new TypeError(`F_CITY_POINT_MISSING:${instance.key}`);
      cases.push({
        case_id: `CASE-${instance.key}`, title: `${group.subject}：${instance.condition}时${instance.expected}`,
        module_id: 'f-city', priority: 'P0',
        ordering: { business_flow_ref: null, page_action_ref: null },
        acceptance_role: 'primary_acceptance', fact_ids: [factId],
        primary_test_point_id: point.formal_test_point_id, supporting_observation_ids: [],
        business_preconditions: [],
        data_conditions: [{ condition_id: `COND-${instance.key}`, description: instance.condition }],
        steps: [{ step_id: `STEP-${instance.key}`, action: `在 ${instance.condition} 下查看${group.subject}` }],
        oracles: [{
          oracle_id: `ORACLE-${instance.key}`, observe_after_step_id: `STEP-${instance.key}`,
          surface: 'ui', expected: instance.expected, claim_ids: [`CLM-${instance.key}`]
        }]
      });
    }
  }
  return {
    artifacts: {
      source_pack: sourcePack, evidence_claims: evidenceClaims,
      behavior_views: behaviorViews,
      case_drafts: { schema_version: '4.0.0', source_revision: 0, cases }
    },
    groups
  };
}
