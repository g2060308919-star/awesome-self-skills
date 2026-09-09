import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import * as topology from '../../src/topology-discovery.mjs';
import * as scope from '../../src/scope-manifest-v4.mjs';

const assetDigest = `sha256:${createHash('sha256').update('architecture-image').digest('hex')}`;

/** @returns {any} */
function sourceStructure() {
  return {
    sources: [{
      source_id: 'SRC-prd',
      units: [
        { kind: 'text_block', unit_id: 'BLOCK-admin', review_class: 'normative', locator_id: 'LOC-admin', text: '评价中台' },
        { kind: 'text_block', unit_id: 'BLOCK-content', review_class: 'normative', locator_id: 'LOC-content', text: '评价内容服务' },
        { kind: 'text_block', unit_id: 'BLOCK-background', review_class: 'non_normative', locator_id: 'LOC-background', text: '员工福利后台' },
        {
          kind: 'table', unit_id: 'TABLE-services', review_class: 'normative', locator_id: 'LOC-table',
          cells: [
            { cell_id: 'CELL-safety', locator_id: 'LOC-safety', text: '内容安全服务' },
            { cell_id: 'CELL-notify', locator_id: 'LOC-notify', text: '消息通知系统' },
            { cell_id: 'CELL-help', locator_id: 'LOC-help', text: '帮助中心系统' }
          ]
        },
        {
          kind: 'image', unit_id: 'IMAGE-architecture', review_class: 'uncertain', locator_id: 'LOC-image', asset_digest: assetDigest,
          ocr_nodes: [
            { node_id: 'NODE-client', locator_id: 'LOC-client-node', label: 'C端' },
            { node_id: 'NODE-admin', locator_id: 'LOC-admin-node', label: '评价中台' },
            { node_id: 'NODE-content', locator_id: 'LOC-content-node', label: '评价内容服务' },
            { node_id: 'NODE-notify', locator_id: 'LOC-notify-node', label: '消息通知系统' }
          ],
          ocr_arrows: [
            { arrow_id: 'ARROW-content-admin', locator_id: 'LOC-arrow-content-admin', from_label: '评价内容服务', to_label: '评价中台', label: '评价查询 API' },
            { arrow_id: 'ARROW-admin-notify', locator_id: 'LOC-arrow-admin-notify', from_label: '评价中台', to_label: '消息通知系统', label: '审核完成事件' },
            { arrow_id: 'ARROW-client-admin', locator_id: 'LOC-arrow-client-admin', from_label: 'C端', to_label: '评价中台', label: '点赞数回传' }
          ]
        }
      ]
    }]
  };
}

/** @param {any} discovery @param {string} label @param {string} [kind] @returns {any} */
function candidateByLabel(discovery, label, kind = 'module_mention') {
  const found = discovery.topology_candidates.find((/** @type {any} */ item) => item.kind === kind && item.label === label);
  assert.ok(found, `missing ${kind}: ${label}`);
  return found;
}

/** @returns {any} */
function validReview() {
  const source = sourceStructure();
  const discovery = topology.discoverTopologyV4(source);
  const moduleConfig = new Map([
    ['评价中台', ['admin', 'primary']],
    ['评价内容服务', ['content', 'upstream']],
    ['内容安全服务', ['safety', 'upstream']],
    ['消息通知系统', ['notification', 'downstream']],
    ['C端', ['client', 'external']]
  ]);
  const boundaryConfig = new Map([
    ['评价内容服务 → 评价中台', ['content', 'admin', 'api']],
    ['评价中台 → 消息通知系统', ['admin', 'notification', 'event']],
    ['C端 → 评价中台', ['client', 'admin', 'api']]
  ]);
  const topology_dispositions = [];
  const verified_claims = [];
  for (const candidate of discovery.topology_candidates) {
    const module = moduleConfig.get(candidate.label);
    const boundary = boundaryConfig.get(candidate.label);
    const claim_id = `CLM-${candidate.candidate_id.slice(3, 15)}`;
    if (module) {
      const [module_ref, role] = module;
      topology_dispositions.push({
        candidate_id: candidate.candidate_id, disposition: 'module', module_ref, role,
        review_basis_claim_ids: [claim_id]
      });
      verified_claims.push({
        claim_id, candidate_ids: [candidate.candidate_id], authorized_topology_roles: [role],
        authorized_boundaries: [], reviewable_interaction_cells: []
      });
    } else if (boundary) {
      const [from_module_ref, to_module_ref, channel] = boundary;
      const authorized = { from_module_ref, to_module_ref, channel, acceptance_scope: 'contract_only' };
      topology_dispositions.push({
        candidate_id: candidate.candidate_id, disposition: 'boundary', ...authorized,
        review_basis_claim_ids: [claim_id]
      });
      verified_claims.push({
        claim_id, candidate_ids: [candidate.candidate_id], authorized_topology_roles: [],
        authorized_boundaries: [authorized], reviewable_interaction_cells: []
      });
    } else if (candidate.label === '帮助中心系统') {
      topology_dispositions.push({
        candidate_id: candidate.candidate_id, disposition: 'not_relevant', reason: '该系统仅出现在排除范围说明中',
        review_basis: { kind: 'claim', claim_ids: [claim_id] }
      });
      verified_claims.push({
        claim_id, candidate_ids: [candidate.candidate_id], authorized_topology_roles: [],
        authorized_boundaries: [], reviewable_interaction_cells: []
      });
    } else assert.fail(`unhandled candidate ${candidate.kind}: ${candidate.label}`);
  }
  return {
    source,
    discovery,
    adapter_review: {
      discovery_digest: discovery.discovery_digest,
      primary_surface: 'admin',
      topology_review: {
        reviewed_block_ids: ['BLOCK-admin', 'BLOCK-content'],
        reviewed_table_ids: ['TABLE-services'],
        reviewed_asset_digests: [assetDigest],
        unresolved_candidate_ids: []
      },
      topology_dispositions
    },
    system_context: { canonical_source_structure: source, verified_claims, effective_scope_decisions: [] }
  };
}

test('compiler-owned discovery scans every normative or uncertain text table image node and arrow', () => {
  assert.equal(typeof topology.discoverTopologyV4, 'function');
  const result = topology.discoverTopologyV4(sourceStructure());
  assert.deepEqual(result.scanned_units, {
    reviewed_block_ids: ['BLOCK-admin', 'BLOCK-content'],
    reviewed_table_ids: ['TABLE-services'],
    reviewed_asset_digests: [assetDigest]
  });
  for (const label of ['评价中台', '评价内容服务', '内容安全服务', '消息通知系统', '帮助中心系统', 'C端']) {
    const candidate = candidateByLabel(result, label);
    assert.match(candidate.candidate_id, /^TC-[0-9a-f]{64}$/);
    assert.match(candidate.discovery_digest, /^sha256:[0-9a-f]{64}$/);
    assert.ok(candidate.locator_ids.length > 0);
  }
  for (const label of ['评价内容服务 → 评价中台', '评价中台 → 消息通知系统', 'C端 → 评价中台']) {
    candidateByLabel(result, label, 'boundary_signal');
  }
  assert.equal(result.topology_candidates.some((/** @type {any} */ item) => item.label === '员工福利后台'), false,
    'non-normative background is not a topology candidate');
  const candidateCount = result.topology_candidates.length;
  assert.throws(() => result.topology_candidates.pop(), /read only|extensible|Cannot delete|object is not extensible/i);
  assert.equal(result.topology_candidates.length, candidateCount, 'sealed compiler discovery cannot be trimmed by an Adapter');
});

test('high-recall discovery keeps suffixless headings table entities and OCR nodes as review candidates', () => {
  const source = sourceStructure();
  source.sources[0].units.push({
    kind: 'text_block', unit_id: 'BLOCK-heading', review_class: 'normative',
    locator_id: 'LOC-heading', text: '审核规则'
  });
  const table = /** @type {any} */ (source.sources[0].units.find((/** @type {any} */ unit) => unit.kind === 'table'));
  table.cells.push({ cell_id: 'CELL-order-domain', locator_id: 'LOC-order-domain', text: '订单域' });
  const image = /** @type {any} */ (source.sources[0].units.find((/** @type {any} */ unit) => unit.kind === 'image'));
  image.ocr_nodes.push({ node_id: 'NODE-gateway', locator_id: 'LOC-gateway', label: 'Gateway' });
  const discovery = topology.discoverTopologyV4(source);
  for (const label of ['审核规则', '订单域', 'Gateway']) candidateByLabel(discovery, label);
});

test('discovery IDs digests and order are deterministic under source collection reordering', () => {
  const first = sourceStructure();
  const second = sourceStructure();
  second.sources.reverse();
  second.sources[0].units.reverse();
  const table = /** @type {any} */ (second.sources[0].units.find((/** @type {any} */ unit) => unit.kind === 'table'));
  const image = /** @type {any} */ (second.sources[0].units.find((/** @type {any} */ unit) => unit.kind === 'image'));
  table.cells.reverse();
  image.ocr_nodes.reverse();
  image.ocr_arrows.reverse();
  assert.deepEqual(topology.discoverTopologyV4(second), topology.discoverTopologyV4(first));
});

test('optional semantic discovery may only add candidates and cannot suppress deterministic findings', () => {
  const source = sourceStructure();
  const baseline = topology.discoverTopologyV4(source);
  const enriched = topology.discoverTopologyV4(source, {
    semantic_candidates: [{ kind: 'module_mention', label: '风控域', locator_ids: ['LOC-safety'] }]
  });
  const enrichedIds = new Set(enriched.topology_candidates.map((/** @type {any} */ item) => item.candidate_id));
  for (const candidate of baseline.topology_candidates) assert.equal(enrichedIds.has(candidate.candidate_id), true);
  candidateByLabel(enriched, '风控域');
  assert.throws(() => topology.discoverTopologyV4(source, {
    semantic_candidates: [], suppress_candidate_ids: baseline.topology_candidates.map((/** @type {any} */ item) => item.candidate_id)
  }), /TOPOLOGY_INPUT_UNKNOWN_FIELD/);
});

test('discovery rejects accessors unsafe prototypes cycles and unknown fields before reading them', () => {
  let reads = 0;
  const accessor = { sources: [] };
  Object.defineProperty(accessor, 'extra', { enumerable: true, get() { reads += 1; return 'forged'; } });
  assert.throws(() => topology.discoverTopologyV4(accessor), /TOPOLOGY_INPUT_ACCESSOR/);
  assert.equal(reads, 0);
  assert.throws(() => topology.discoverTopologyV4(Object.assign(Object.create({ polluted: true }), { sources: [] })), /TOPOLOGY_INPUT_PROTOTYPE/);
  const cyclic = /** @type {any} */ ({ sources: [] });
  cyclic.self = cyclic;
  assert.throws(() => topology.discoverTopologyV4(cyclic), /TOPOLOGY_INPUT_CYCLIC|TOPOLOGY_INPUT_UNKNOWN_FIELD/);
  assert.throws(() => topology.discoverTopologyV4({ sources: [], forged_candidates: [] }), /TOPOLOGY_INPUT_UNKNOWN_FIELD/);
});

test('completeness witness identities cannot collide across canonical sources', () => {
  const source = sourceStructure();
  source.sources.push({
    source_id: 'SRC-second',
    units: [{ kind: 'text_block', unit_id: 'BLOCK-admin', review_class: 'normative', locator_id: 'LOC-second', text: '第二管理后台' }]
  });
  assert.throws(() => topology.discoverTopologyV4(source), /TOPOLOGY_UNIT_ID_DUPLICATE/);
});

test('scope manifest is derived from the compiler discovery and includes all four topology roles', () => {
  assert.equal(typeof scope.compileScopeManifestV4, 'function');
  const fixture = validReview();
  const result = scope.compileScopeManifestV4(fixture.adapter_review, fixture.system_context);
  assert.deepEqual(result.diagnostics, []);
  assert.equal(result.discovery.discovery_digest, fixture.discovery.discovery_digest);
  assert.deepEqual(result.scope_manifest.modules.map((/** @type {any} */ item) => [item.module_id, item.role]), [
    ['admin', 'primary'], ['client', 'external'], ['content', 'upstream'], ['notification', 'downstream'], ['safety', 'upstream']
  ]);
  assert.deepEqual(result.scope_manifest.boundaries.map((/** @type {any} */ item) => [item.from, item.to, item.channel]), [
    ['admin', 'notification', 'event'], ['client', 'admin', 'api'], ['content', 'admin', 'api']
  ]);
  assert.equal(result.scope_manifest.primary_surface, 'admin');
});

test('scope manifest bytes and digest are deterministic under Adapter review ordering', () => {
  const first = validReview();
  const expected = scope.compileScopeManifestV4(first.adapter_review, first.system_context);
  const reordered = validReview();
  reordered.adapter_review.topology_dispositions.reverse();
  reordered.system_context.verified_claims.reverse();
  const actual = scope.compileScopeManifestV4(reordered.adapter_review, reordered.system_context);
  assert.deepEqual(actual.scope_manifest, expected.scope_manifest);
  assert.equal(actual.scope_manifest_digest, expected.scope_manifest_digest);
});

test('scope review fails closed for every omitted structure unit or candidate and cannot self-certify forged discovery', () => {
  const cases = /** @type {Array<(fixture:any)=>void>} */ ([
    fixture => { fixture.adapter_review.topology_review.reviewed_block_ids = ['BLOCK-admin']; },
    fixture => { fixture.adapter_review.topology_review.reviewed_table_ids = []; },
    fixture => { fixture.adapter_review.topology_review.reviewed_asset_digests = []; },
    fixture => { fixture.adapter_review.topology_dispositions = fixture.adapter_review.topology_dispositions.slice(1); },
    fixture => { fixture.adapter_review.topology_dispositions = fixture.adapter_review.topology_dispositions.filter((/** @type {any} */ item) => item.module_ref !== 'safety'); },
    fixture => { fixture.adapter_review.discovery_digest = `sha256:${'0'.repeat(64)}`; },
    fixture => { fixture.adapter_review.topology_candidates = []; }
  ]);
  for (const change of cases) {
    const fixture = validReview();
    change(fixture);
    const result = scope.compileScopeManifestV4(fixture.adapter_review, fixture.system_context);
    assert.ok(result.diagnostics.length > 0);
    assert.equal(result.scope_manifest, null);
  }
});

test('not-relevant needs supported evidence or an effective scoped Decision', () => {
  const missing = validReview();
  const exclusion = /** @type {any} */ (missing.adapter_review.topology_dispositions.find((/** @type {any} */ item) => item.disposition === 'not_relevant'));
  delete exclusion.review_basis;
  assert.ok(scope.compileScopeManifestV4(missing.adapter_review, missing.system_context).diagnostics.some((/** @type {any} */ item) => item.code === 'TOPOLOGY_NOT_RELEVANT_BASIS_INVALID'));

  const decision = validReview();
  const decisionExclusion = /** @type {any} */ (decision.adapter_review.topology_dispositions.find((/** @type {any} */ item) => item.disposition === 'not_relevant'));
  decisionExclusion.review_basis = { kind: 'decision', decision_ids: ['DEC-help-out-of-scope'] };
  decision.system_context.effective_scope_decisions = [{
    decision_id: 'DEC-help-out-of-scope', effective: true,
    candidate_ids: [decisionExclusion.candidate_id]
  }];
  const result = scope.compileScopeManifestV4(decision.adapter_review, decision.system_context);
  assert.deepEqual(result.diagnostics, []);
  assert.equal(result.scope_manifest.modules.some((/** @type {any} */ item) => item.module_id === 'help'), false);
});

test('a module role cannot be invented or changed without source-backed authorization', () => {
  const fixture = validReview();
  const client = /** @type {any} */ (fixture.adapter_review.topology_dispositions.find((/** @type {any} */ item) => item.module_ref === 'client'));
  client.role = 'downstream';
  const result = scope.compileScopeManifestV4(fixture.adapter_review, fixture.system_context);
  assert.ok(result.diagnostics.some((/** @type {any} */ item) => item.code === 'TOPOLOGY_ROLE_BASIS_INVALID'));
  assert.equal(result.scope_manifest, null);
});

test('an arrow candidate cannot be remapped to different manifest endpoints even with a matching submitted Claim projection', () => {
  const fixture = validReview();
  const arrow = candidateByLabel(fixture.discovery, '评价内容服务 → 评价中台', 'boundary_signal');
  const disposition = /** @type {any} */ (fixture.adapter_review.topology_dispositions.find((/** @type {any} */ item) => item.candidate_id === arrow.candidate_id));
  disposition.from_module_ref = 'admin';
  disposition.to_module_ref = 'content';
  const claim = /** @type {any} */ (fixture.system_context.verified_claims.find((/** @type {any} */ item) => item.candidate_ids.includes(arrow.candidate_id)));
  claim.authorized_boundaries = [{
    from_module_ref: 'admin', to_module_ref: 'content', channel: disposition.channel, acceptance_scope: 'contract_only'
  }];
  const result = scope.compileScopeManifestV4(fixture.adapter_review, fixture.system_context);
  assert.ok(result.diagnostics.some((/** @type {any} */ item) => item.code === 'TOPOLOGY_BOUNDARY_ENDPOINT_MISMATCH'));
});

test('[P-17][BR-10] manifest generates every expected interaction cell and a one-module matrix cannot self-declare completeness', () => {
  const fixture = validReview();
  const compiled = scope.compileScopeManifestV4(fixture.adapter_review, fixture.system_context);
  const expected = scope.expectedInteractionCellsV4(compiled.scope_manifest);
  assert.equal(expected.length, 70, 'five modules produce ten unordered pairs across seven fixed dimensions');
  const oneModule = expected.filter(cell => cell.module_ids.includes('admin') && cell.module_ids.includes('client'));
  assert.ok(scope.validateInteractionReviewV4(compiled.scope_manifest, oneModule, { verified_claims: fixture.system_context.verified_claims })
    .some(item => item.code === 'INTERACTION_REVIEW_INCOMPLETE'));
});

test('checked-no-signal interaction cells require reviewed Claims and a nonblank review basis', () => {
  const fixture = validReview();
  const compiled = scope.compileScopeManifestV4(fixture.adapter_review, fixture.system_context);
  const expected = scope.expectedInteractionCellsV4(compiled.scope_manifest);
  const claims = structuredClone(fixture.system_context.verified_claims);
  const reviews = expected.map((cell, index) => {
    const claim_id = `CLM-interaction-${index}`;
    claims.push({
      claim_id, candidate_ids: [], authorized_topology_roles: [], authorized_boundaries: [],
      reviewable_interaction_cells: [{ module_ids: cell.module_ids, dimension: cell.dimension }]
    });
    return { ...cell, status: 'checked-no-signal', reviewed_claim_ids: [claim_id], review_basis: '已审阅该模块对在此维度的规范性来源，未发现交互信号' };
  });
  assert.deepEqual(scope.validateInteractionReviewV4(compiled.scope_manifest, reviews, { verified_claims: claims }), []);
  for (const change of /** @type {Array<(item:any)=>void>} */ ([
    item => { item.reviewed_claim_ids = []; },
    item => { item.review_basis = ' '; },
    item => { item.reviewed_claim_ids = ['CLM-unrelated']; }
  ])) {
    const invalid = structuredClone(reviews);
    change(invalid[0]);
    assert.ok(scope.validateInteractionReviewV4(compiled.scope_manifest, invalid, { verified_claims: claims }).length > 0);
  }
});

/** @returns {any} */
function acceptanceFixture() {
  const assignments = [];
  const claim_authorizations = [];
  const decision_authorizations = [];
  for (const [suffix, role, basisKind] of [
    ['client-like-button', 'context_only', 'claim'],
    ['like-count-interface', 'dependency_contract', 'decision'],
    ['admin-like-count', 'primary_acceptance', 'claim']
  ]) {
    const fact = `FACT-${suffix}`;
    const point = `TP-${suffix}`;
    const caseId = `CASE-${suffix}`;
    const ids = [fact, point, caseId];
    for (const [index, entity_kind] of ['fact', 'test_point', 'case'].entries()) {
      const entity_id = ids[index];
      const parent_entity_ids = index === 0 ? [] : [ids[index - 1]];
      if (basisKind === 'claim') {
        const claim_id = `CLM-role-${suffix}-${entity_kind}`;
        assignments.push({ entity_kind, entity_id, scope_ref: suffix, acceptance_role: role,
          parent_entity_ids, role_basis_claim_ids: [claim_id] });
        claim_authorizations.push({ claim_id, entity_id, scope_ref: suffix, acceptance_role: role, allows_upgrade_from: [] });
      } else {
        const decision_id = `DEC-role-${suffix}-${entity_kind}`;
        assignments.push({ entity_kind, entity_id, scope_ref: suffix, acceptance_role: role,
          parent_entity_ids, role_basis_decision_ids: [decision_id] });
        decision_authorizations.push({ decision_id, effective: true, entity_id, scope_ref: suffix,
          acceptance_role: role, allows_upgrade_from: [] });
      }
    }
  }
  return { assignments, context: { claim_authorizations, decision_authorizations } };
}

test('Fact to Test Point to Case preserves three acceptance roles and separate coverage counts', () => {
  const fixture = acceptanceFixture();
  const result = scope.validateAcceptanceRoleAssignmentsV4(fixture.assignments, fixture.context);
  assert.deepEqual(result.diagnostics, []);
  assert.deepEqual(result.coverage, {
    primary_acceptance: 1, dependency_contract: 1, context_only: 1,
    primary_denominator: 1, boundary_denominator: 1
  });
});

test('role assignment rejects missing basis stale Decisions and unsupported context-to-primary upgrades', () => {
  const missing = acceptanceFixture();
  delete missing.assignments[0].role_basis_claim_ids;
  const missingResult = scope.validateAcceptanceRoleAssignmentsV4(missing.assignments, missing.context);
  assert.ok(missingResult.diagnostics.length > 0);
  assert.deepEqual(missingResult.assignments, []);
  assert.deepEqual(missingResult.coverage, {
    primary_acceptance: 0, dependency_contract: 0, context_only: 0,
    primary_denominator: 0, boundary_denominator: 0
  });

  const stale = acceptanceFixture();
  stale.context.decision_authorizations[0].effective = false;
  assert.ok(scope.validateAcceptanceRoleAssignmentsV4(stale.assignments, stale.context).diagnostics
    .some((/** @type {any} */ item) => item.code === 'ACCEPTANCE_ROLE_BASIS_INVALID'));

  const upgraded = acceptanceFixture();
  const clientCase = /** @type {any} */ (upgraded.assignments.find((/** @type {any} */ item) => item.entity_id === 'CASE-client-like-button'));
  clientCase.acceptance_role = 'primary_acceptance';
  assert.ok(scope.validateAcceptanceRoleAssignmentsV4(upgraded.assignments, upgraded.context).diagnostics
    .some((/** @type {any} */ item) => ['ACCEPTANCE_ROLE_BASIS_INVALID', 'ACCEPTANCE_ROLE_UPGRADE_UNAUTHORIZED'].includes(item.code)));
});

test('acceptance lineage cannot cross business scope even with an otherwise valid role authorization', () => {
  const fixture = acceptanceFixture();
  const clientCase = /** @type {any} */ (fixture.assignments.find((/** @type {any} */ item) => item.entity_id === 'CASE-client-like-button'));
  const authorization = /** @type {any} */ (fixture.context.claim_authorizations.find((/** @type {any} */ item) => item.entity_id === clientCase.entity_id));
  clientCase.scope_ref = 'different-scope';
  authorization.scope_ref = 'different-scope';
  const result = scope.validateAcceptanceRoleAssignmentsV4(fixture.assignments, fixture.context);
  assert.ok(result.diagnostics.some((/** @type {any} */ item) => item.code === 'ACCEPTANCE_ROLE_LINEAGE_INVALID'));
});
