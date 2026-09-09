import { canonicalStringify } from './canonical.mjs';
import { compileCanonicalSourceStructure } from './source-locators-v4.mjs';
import { createSourceSubjectRegistry } from './source-subjects-v4.mjs';
import { createCompilerSourceRuntimeV4 } from './source-runtime-registry-v4.mjs';
import { discoverTopologyV4 } from './topology-discovery.mjs';

const DIMENSIONS = new Set([
  'shared-entity', 'role', 'client', 'interface-event', 'time', 'concurrency', 'side-effect'
]);
const RISK_KINDS = new Set([
  'null_or_missing', 'unknown_enum', 'api_failure', 'loading_failure', 'sync_delay',
  'long_content', 'pagination', 'refresh', 'business_permission_boundary'
]);
const ACCEPTANCE_ROLES = new Set(['primary_acceptance', 'dependency_contract', 'context_only']);
const NOT_APPLICABLE_REASONS = new Set(['out_of_scope', 'inapplicable_condition', 'superseded_requirement']);

/** @param {unknown} value @returns {value is Record<string, any>} */
function record(value) { return Boolean(value) && typeof value === 'object' && !Array.isArray(value); }

/** @param {unknown} value @param {string[]} keys */
function exactRecord(value, keys) {
  return record(value) && Object.keys(value).sort().join(',') === [...keys].sort().join(',');
}

/** @param {unknown} value */
function nonBlank(value) { return typeof value === 'string' && Boolean(value.trim()); }

/** @param {any} claim */
function supportedClaim(claim) {
  return claim.level !== 'E1' || claim.claim_form === 'decision-record';
}

/** @param {any} claim */
function supportedBusinessClaim(claim) {
  return claim.domain === 'business' && supportedClaim(claim);
}

/** @param {unknown} value */
function comparisonContract(value) {
  const candidate = record(value) ? /** @type {any} */ (value) : null;
  if (exactRecord(candidate, ['kind', 'exceptions']) && candidate.kind === 'all_observable_behavior_except'
    && Array.isArray(candidate.exceptions) && candidate.exceptions.every(nonBlank)) {
    return { kind: candidate.kind, exceptions: unique(candidate.exceptions) };
  }
  if (exactRecord(candidate, ['kind', 'dimensions', 'allowed_differences']) && candidate.kind === 'selected_dimensions'
    && Array.isArray(candidate.dimensions) && candidate.dimensions.length > 0 && candidate.dimensions.every(nonBlank)
    && Array.isArray(candidate.allowed_differences) && candidate.allowed_differences.every(nonBlank)) {
    return {
      kind: candidate.kind, dimensions: unique(candidate.dimensions),
      allowed_differences: unique(candidate.allowed_differences)
    };
  }
  return null;
}

/** @param {any} claim */
function semanticContainer(claim) {
  return record(claim.semantic_value) ? claim.semantic_value : {};
}

/** @param {any} claim @param {string} field */
function semanticArray(claim, field) {
  const container = semanticContainer(claim);
  return Array.isArray(container[field]) ? container[field] : [];
}

/** @param {string[]} values */
function unique(values) { return [...new Set(values)].sort(compare); }

/** @param {string} left @param {string} right */
function compare(left, right) {
  const a = Array.from(left, character => character.codePointAt(0) ?? 0);
  const b = Array.from(right, character => character.codePointAt(0) ?? 0);
  for (let index = 0; index < Math.min(a.length, b.length); index += 1) {
    if (a[index] !== b[index]) return a[index] - b[index];
  }
  return a.length - b.length;
}

/** @param {any} pack */
function sourceSystem(pack) {
  const { provider_registry, expiry_registry } = createCompilerSourceRuntimeV4();
  return { provider_registry, expiry_registry };
}

/** Reconstruct only an exact, self-contained text capture. Credential-bearing,
 * excluded, provider-specific or binary source material requires the separate
 * short-lived acquisition context and is deliberately not guessed here.
 * @param {any} pack @param {any} registries @param {any[]} [verifiedReceipts]
 */
function reconstructibleAcquisitions(pack, registries, verifiedReceipts = []) {
  const verified = new Set(verifiedReceipts.map((/** @type {any} */ receipt) => receipt.source_id));
  return pack.sources.filter((/** @type {any} */ source) => !verified.has(source.source_id))
    .map((/** @type {any} */ source) => {
    if (!record(source.semantic_projection) || typeof source.semantic_projection.content !== 'string'
      || source.semantic_projection.assets.length !== 0
      || source.capture_audit?.semantic_exclusions?.length !== 0) {
      throw new TypeError('V4_SOURCE_ACQUISITION_CONTEXT_REQUIRED');
    }
    const generated = compileCanonicalSourceStructure(source.source_id, source.semantic_projection.content);
    const textual = source.semantic_projection.structure.filter(
      (/** @type {any} */ unit) => !['image_region', 'user_statement'].includes(unit.type)
    );
    if (canonicalStringify(generated) !== canonicalStringify(textual)) {
      throw new TypeError('V4_SOURCE_STRUCTURE_RECOMPUTATION_MISMATCH');
    }
    return {
      source_id: source.source_id,
      input: {
        stable_source_id: source.source_id,
        source_type: source.kind,
        capture_bytes: new TextEncoder().encode(source.semantic_projection.content),
        assets: []
      },
      acquisition: {},
      additional_units: source.semantic_projection.structure.filter(
        (/** @type {any} */ unit) => ['image_region', 'user_statement'].includes(unit.type)
      )
    };
  });
}

/** @param {any} pack @param {any} evidence */
function subjectRegistry(pack, evidence) {
  const descriptors = evidence.claims.filter((/** @type {any} */ claim) =>
    claim.kind === 'requirement' && claim.domain === 'business')
    .map((/** @type {any} */ claim) => claim.subject_descriptor);
  if (!descriptors.length || descriptors.some((/** @type {any} */ item) => !record(item))) {
    throw new TypeError('V4_SOURCE_SUBJECTS_REQUIRED');
  }
  return createSourceSubjectRegistry({
    scope_refs: unique(descriptors.map((/** @type {any} */ item) => item.scope_ref)),
    module_ids: unique(descriptors.map((/** @type {any} */ item) => item.module_id)),
    entity_types: unique(descriptors.map((/** @type {any} */ item) => item.entity_type))
  });
}

/** @param {any} pack */
function canonicalTopologyStructure(pack) {
  return {
    sources: [...pack.sources].sort((a, b) => compare(a.source_id, b.source_id)).map(source => {
      const review = pack.source_reviews.find((/** @type {any} */ item) => item.source_id === source.source_id);
      const classification = (/** @type {any} */ unit) => review?.units.find(
        (/** @type {any} */ item) => item.unit_id === unit.unit_id
      )?.classification ?? 'uncertain';
      const locators = (/** @type {any} */ unit) => pack.locators.filter(
        (/** @type {any} */ locator) => locator.source_id === source.source_id && locator.unit_id === unit.unit_id
      );
      /** @type {any[]} */
      const units = [];
      const tableGroups = new Map();
      for (const unit of source.semantic_projection.structure) {
        // User answers are Decision provenance, not new product topology.
        // Feeding them back into discovery would let a clarification silently
        // change Scope and would make every answer invalidate the PRD review.
        if (unit.type === 'user_statement') continue;
        const locator = locators(unit)[0];
        if (unit.type === 'table_cell') {
          const key = unit.table_id;
          const group = tableGroups.get(key) ?? {
            kind: 'table', unit_id: key, review_class: classification(unit),
            locator_id: locator?.locator_id, cells: []
          };
          group.cells.push({ cell_id: unit.unit_id, locator_id: locator?.locator_id, text: unit.text });
          tableGroups.set(key, group);
        } else if (unit.type === 'image_region') {
          units.push({
            kind: 'image', unit_id: unit.unit_id, review_class: classification(unit),
            locator_id: locator?.locator_id, asset_digest: unit.asset_digest,
            ocr_nodes: [{ node_id: unit.unit_id, locator_id: locator?.locator_id, label: unit.text }],
            ocr_arrows: []
          });
        } else {
          units.push({
            kind: 'text_block', unit_id: unit.unit_id, review_class: classification(unit),
            locator_id: locator?.locator_id, text: unit.text
          });
        }
      }
      units.push(...tableGroups.values());
      return { source_id: source.source_id, units };
    })
  };
}

/** @param {any} evidence @param {any} canonicalSourceStructure */
function topologySystem(evidence, canonicalSourceStructure) {
  // Semantic topology hints and their authorization are part of the reviewed
  // Claim value. They are never reverse-engineered from the dispositions or
  // interaction reviews currently being checked.
  const authorizations = evidence.claims.filter(supportedBusinessClaim).flatMap((/** @type {any} */ claim) => {
    const value = claim.semantic_value?.topology_authorization;
    if (!record(value)
      || Object.keys(value).sort().join(',') !== 'candidates,reviewable_interaction_cells'
      || !Array.isArray(value.candidates) || !Array.isArray(value.reviewable_interaction_cells)) return [];
    return [{ claim_id: claim.claim_id, value }];
  });
  const semantic_topology_candidates = authorizations.flatMap((/** @type {any} */ { value }) =>
    value.candidates.flatMap((/** @type {any} */ candidate) => {
      if (!record(candidate) || !['module_mention', 'boundary_signal'].includes(candidate.kind)
        || typeof candidate.label !== 'string' || !candidate.label.trim()
        || !Array.isArray(candidate.locator_ids) || candidate.locator_ids.length === 0) return [];
      return [{
        kind: candidate.kind, label: candidate.label,
        locator_ids: unique(candidate.locator_ids.filter((/** @type {any} */ id) => typeof id === 'string'))
      }];
    })
  );
  const deterministic = discoverTopologyV4(canonicalSourceStructure, {
    semantic_candidates: semantic_topology_candidates
  });
  const candidateFor = (/** @type {any} */ declared) => deterministic.topology_candidates.find(
    (/** @type {any} */ item) => item.kind === declared.kind && item.label === declared.label
      && canonicalStringify(item.locator_ids) === canonicalStringify(unique(declared.locator_ids))
  );
  /** @type {Map<string, any>} */
  const claims = new Map();
  const claim = (/** @type {string} */ claimId) => {
    const current = claims.get(claimId) ?? {
      claim_id: claimId, candidate_ids: new Set(), authorized_topology_roles: new Set(),
      authorized_boundaries: new Map(), reviewable_interaction_cells: new Map()
    };
    claims.set(claimId, current);
    return current;
  };
  for (const authorization of authorizations) {
    const current = claim(authorization.claim_id);
    for (const declared of authorization.value.candidates) {
      const candidate = candidateFor(declared);
      if (!candidate) continue;
      current.candidate_ids.add(candidate.candidate_id);
      if (declared.disposition === 'module'
        && ['primary', 'upstream', 'downstream', 'external'].includes(declared.role)) {
        current.authorized_topology_roles.add(declared.role);
      }
      if (declared.disposition === 'boundary') {
      const boundary = {
          from_module_ref: declared.from_module_ref, to_module_ref: declared.to_module_ref,
          channel: declared.channel, acceptance_scope: declared.acceptance_scope
      };
        if (Object.values(boundary).every(value => typeof value === 'string' && value.trim())) {
          current.authorized_boundaries.set(canonicalStringify(boundary), boundary);
        }
      }
    }
    for (const declared of authorization.value.reviewable_interaction_cells) {
      if (!record(declared) || !Array.isArray(declared.module_ids)
        || !DIMENSIONS.has(declared.dimension)) continue;
      const cell = { module_ids: unique(declared.module_ids), dimension: declared.dimension };
      current.reviewable_interaction_cells.set(canonicalStringify(cell), cell);
    }
  }
  const verified_claims = [...claims.values()].map(item => ({
    claim_id: item.claim_id,
    candidate_ids: unique([...item.candidate_ids]),
    authorized_topology_roles: unique([...item.authorized_topology_roles]),
    authorized_boundaries: [...item.authorized_boundaries.values()].sort((a, b) => compare(canonicalStringify(a), canonicalStringify(b))),
    reviewable_interaction_cells: [...item.reviewable_interaction_cells.values()].sort((a, b) => compare(canonicalStringify(a), canonicalStringify(b)))
  })).sort((a, b) => compare(a.claim_id, b.claim_id));
  /** @type {any[]} */
  const effective_scope_decisions = [];
  return {
    canonical_source_structure: canonicalSourceStructure,
    verified_claims,
    effective_scope_decisions,
    ...(semantic_topology_candidates.length ? { semantic_topology_candidates } : {})
  };
}

/** Build the sparse-Behavior verifier solely from previously reviewed Evidence.
 * In particular, the submitted View is deliberately absent from this function:
 * using its own values as the verifier would make any invented expectation
 * self-authenticating.
 * @param {any} evidence */
function behaviorEvidence(evidence) {
  const facts = evidence.fact_ledger.map((/** @type {any} */ fact) => ({
    fact_id: fact.fact_id, module_id: fact.module_refs[0], acceptance_role: fact.acceptance_role,
    condition_field: fact.field_path.split('/').filter(Boolean).at(-1) ?? 'value'
  }));
  const factById = new Map(evidence.fact_ledger.map((/** @type {any} */ fact) => [fact.fact_id, fact]));
  const claims = evidence.claims.filter(supportedBusinessClaim).map((/** @type {any} */ claim) => {
    const submitted = Array.isArray(claim.semantic_value?.behavior_assertions)
      ? claim.semantic_value.behavior_assertions : [];
    const entries = submitted.filter((/** @type {any} */ assertion) => {
      if (!record(assertion) || Object.keys(assertion).sort().join(',') !== 'fact_id,field_path,value'
        || typeof assertion.fact_id !== 'string' || typeof assertion.field_path !== 'string'
        || !assertion.field_path.startsWith('/')) return false;
      const fact = factById.get(assertion.fact_id);
      return fact && Array.isArray(fact.claim_ids) && fact.claim_ids.includes(claim.claim_id);
    }).map((/** @type {any} */ assertion) => [
      canonicalStringify(assertion), structuredClone(assertion)
    ]);
    return {
      claim_id: claim.claim_id, level: claim.level,
      supported: claim.level !== 'E1' || claim.claim_form === 'decision-record',
      assertions: [...new Map(entries).values()]
    };
  }).filter((/** @type {any} */ claim) => claim.assertions.length > 0);
  return { facts, claims };
}

/** @param {any} pack @param {any} evidence */
function orderingSystem(pack, evidence) {
  const locatorById = new Map(pack.locators.map((/** @type {any} */ locator) => [locator.locator_id, locator]));
  const sourceIndex = new Map(pack.sources.map((/** @type {any} */ source) => [source.source_id, source]));
  const locators = pack.locators.map((/** @type {any} */ locator) => {
    const source = sourceIndex.get(locator.source_id);
    const unitIndex = source?.semantic_projection.structure.findIndex((/** @type {any} */ unit) => unit.unit_id === locator.unit_id) ?? -1;
    const unit = source?.semantic_projection.structure[unitIndex];
    const unitKind = unit?.type === 'table_cell' ? 'table' : unit?.type === 'image_region' ? 'image' : 'text';
    const structural = unit?.type === 'table_cell' ? [unitIndex, unit.row, unit.column] : [Math.max(unitIndex, 0)];
    const start = locator.range?.start ?? locator.answer_span?.start ?? 0;
    return {
      locator_id: locator.locator_id, stable_source_id: locator.source_id,
      unit_kind: unitKind, structural_coordinates: structural, start_scalar: start
    };
  });
  const candidateById = new Map(evidence.topology_discovery.topology_candidates.map((/** @type {any} */ item) => [item.candidate_id, item]));
  const modules = evidence.scope_manifest.modules.map((/** @type {any} */ module) => {
    const ids = evidence.topology_dispositions.filter((/** @type {any} */ disposition) =>
      disposition.disposition === 'module' && disposition.module_ref === module.module_id
    ).flatMap((/** @type {any} */ disposition) => candidateById.get(disposition.candidate_id)?.locator_ids ?? []);
    if (!ids.length || ids.some((/** @type {string} */ id) => !locatorById.has(id))) {
      throw new TypeError('V4_ORDERING_MODULE_LOCATOR_REQUIRED');
    }
    return { module_id: module.module_id, role: module.role, locator_ids: unique(ids) };
  });
  /** @type {any[]} */
  const flows = [];
  /** @type {any[]} */
  const actions = [];
  /** @type {any[]} */
  const dependencies = [];
  /** @type {Map<string, {claim_id:string,locator_ids:Set<string>,subjects:Map<string,any>}>} */
  const verifiedClaimMap = new Map();
  /** @type {Map<string, {decision_id:string,subjects:Map<string,any>}>} */
  const verifiedDecisionMap = new Map();
  for (const claim of evidence.claims.filter(supportedBusinessClaim)) {
    for (const assertion of semanticArray(claim, 'ordering_assertions')) {
      let subject;
      if (exactRecord(assertion, ['kind', 'module_id', 'subject_ref', 'locator_id'])
        && assertion.kind === 'flow' && [assertion.module_id, assertion.subject_ref, assertion.locator_id].every(nonBlank)
        && claim.source_locator_ids.includes(assertion.locator_id)) {
        subject = { kind: 'flow', module_id: assertion.module_id, subject_ref: assertion.subject_ref };
        flows.push({
          module_id: assertion.module_id, subject_ref: assertion.subject_ref,
          locator_id: assertion.locator_id, claim_ids: [claim.claim_id]
        });
      } else if (exactRecord(assertion, ['kind', 'module_id', 'flow_subject_ref', 'subject_ref', 'locator_id'])
        && assertion.kind === 'action'
        && [assertion.module_id, assertion.flow_subject_ref, assertion.subject_ref, assertion.locator_id].every(nonBlank)
        && claim.source_locator_ids.includes(assertion.locator_id)) {
        subject = {
          kind: 'action', module_id: assertion.module_id,
          flow_subject_ref: assertion.flow_subject_ref, subject_ref: assertion.subject_ref
        };
        actions.push({
          module_id: assertion.module_id, flow_subject_ref: assertion.flow_subject_ref,
          subject_ref: assertion.subject_ref, locator_id: assertion.locator_id,
          claim_ids: [claim.claim_id]
        });
      } else if (exactRecord(assertion, ['kind', 'predecessor_outcome_id', 'successor_outcome_id'])
        && assertion.kind === 'outcome_dependency'
        && [assertion.predecessor_outcome_id, assertion.successor_outcome_id].every(nonBlank)) {
        subject = {
          kind: 'outcome_dependency', predecessor_outcome_id: assertion.predecessor_outcome_id,
          successor_outcome_id: assertion.successor_outcome_id
        };
        const decision = claim.claim_form === 'decision-record' && nonBlank(claim.decision_id);
        dependencies.push({
          predecessor_outcome_id: assertion.predecessor_outcome_id,
          successor_outcome_id: assertion.successor_outcome_id,
          basis: decision
            ? { kind: 'decision', decision_ids: [claim.decision_id] }
            : { kind: 'evidence', claim_ids: [claim.claim_id] }
        });
        if (decision) {
          const current = verifiedDecisionMap.get(claim.decision_id) ?? {
            decision_id: claim.decision_id, subjects: new Map()
          };
          current.subjects.set(canonicalStringify(subject), subject);
          verifiedDecisionMap.set(claim.decision_id, current);
        }
      }
      if (!subject || claim.claim_form === 'decision-record' && subject.kind === 'outcome_dependency') continue;
      const current = verifiedClaimMap.get(claim.claim_id) ?? {
        claim_id: claim.claim_id, locator_ids: new Set(), subjects: new Map()
      };
      for (const locatorId of claim.source_locator_ids) current.locator_ids.add(locatorId);
      current.subjects.set(canonicalStringify(subject), subject);
      verifiedClaimMap.set(claim.claim_id, current);
    }
  }
  return {
    sources: pack.sources.map((/** @type {any} */ source) => ({ stable_source_id: source.source_id })),
    locators, modules, flows, actions, dependencies,
    verified_claims: [...verifiedClaimMap.values()].map(item => ({
      claim_id: item.claim_id, locator_ids: unique([...item.locator_ids]),
      subjects: [...item.subjects.values()].sort((a, b) => compare(canonicalStringify(a), canonicalStringify(b)))
    })).sort((a, b) => compare(a.claim_id, b.claim_id)),
    verified_decisions: [...verifiedDecisionMap.values()].map(item => ({
      decision_id: item.decision_id,
      subjects: [...item.subjects.values()].sort((a, b) => compare(canonicalStringify(a), canonicalStringify(b)))
    })).sort((a, b) => compare(a.decision_id, b.decision_id))
  };
}

/** Compiler-private semantic assertions extracted from already reviewed Claims.
 * A Case/View never contributes to this context, so changing the candidate under
 * review cannot manufacture its own proof. @param {any} evidence */
function semanticEvidenceSystem(evidence) {
  /** @type {any[]} */ const baseline_assertions = [];
  /** @type {any[]} */ const value_claims = [];
  /** @type {string[]} */ const supported_claim_ids = [];
  /** @type {any[]} */ const derivations = [];
  /** @type {any[]} */ const risk_review_assertions = [];
  /** @type {any[]} */ const not_applicable_assertions = [];
  /** @type {any[]} */ const diagnostics = [];
  const invalid = (/** @type {any} */ claim, /** @type {string} */ field) => diagnostics.push({
    category: 'adapter_revision', code: 'CLAIM_SEMANTIC_ASSERTION_INVALID',
    path: `/claims/${claim.claim_id}/semantic_value/${field}`,
    message: 'Structured semantic assertions in a Claim must use their closed production contract.'
  });
  for (const claim of evidence.claims.filter(supportedBusinessClaim)) {
    supported_claim_ids.push(claim.claim_id);
    const container = semanticContainer(claim);
    const descriptor = claim.subject_descriptor;
    for (const field of [
      'relative_baseline_assertions', 'test_value_assertions', 'test_value_derivations',
      'risk_review_assertions', 'not_applicable_assertions', 'ordering_assertions'
    ]) if (Object.hasOwn(container, field) && !Array.isArray(container[field])) invalid(claim, field);
    const baselineInputs = semanticArray(claim, 'relative_baseline_assertions');
    const rawBaseline = record(container.source_value) ? container.source_value : null;
    if (!baselineInputs.length && record(rawBaseline) && nonBlank(rawBaseline.reference)) {
      if (Array.isArray(rawBaseline.exceptions)) baselineInputs.push({
        reference: rawBaseline.reference,
        comparison_contract: { kind: 'all_observable_behavior_except', exceptions: rawBaseline.exceptions }
      });
      else if (Array.isArray(rawBaseline.dimensions) && Array.isArray(rawBaseline.allowed_differences)) baselineInputs.push({
        reference: rawBaseline.reference,
        comparison_contract: {
          kind: 'selected_dimensions', dimensions: rawBaseline.dimensions,
          allowed_differences: rawBaseline.allowed_differences
        }
      });
    }
    for (const assertion of baselineInputs) {
      const contract = record(assertion) ? comparisonContract(assertion.comparison_contract) : null;
      if (!exactRecord(assertion, ['reference', 'comparison_contract']) || !nonBlank(assertion.reference)
        || !contract || !record(descriptor) || !nonBlank(descriptor.module_id) || !nonBlank(descriptor.scope_ref)) {
        invalid(claim, 'relative_baseline_assertions'); continue;
      }
      baseline_assertions.push({
        claim_id: claim.claim_id, module_id: descriptor.module_id, scope_ref: descriptor.scope_ref,
        reference: assertion.reference, comparison_contract: contract
      });
    }
    for (const assertion of semanticArray(claim, 'test_value_assertions')) {
      if (!exactRecord(assertion, ['subject_ref', 'field_path', 'value'])
        || !nonBlank(assertion.subject_ref) || !nonBlank(assertion.field_path)
        || !assertion.field_path.startsWith('/') || !['requirement', 'example'].includes(claim.kind)) {
        invalid(claim, 'test_value_assertions'); continue;
      }
      value_claims.push({
        claim_id: claim.claim_id, origin_kind: claim.kind,
        subject_ref: assertion.subject_ref, field_path: assertion.field_path,
        value: structuredClone(assertion.value), supported: true
      });
    }
    for (const assertion of semanticArray(claim, 'test_value_derivations')) {
      if (claim.claim_form !== 'derived'
        || !exactRecord(assertion, ['method_id', 'method_version', 'inputs_digest', 'input_claim_ids', 'subject_ref', 'field_path', 'value'])
        || ![assertion.method_id, assertion.method_version, assertion.inputs_digest, assertion.subject_ref, assertion.field_path].every(nonBlank)
        || !/^sha256:[0-9a-f]{64}$/u.test(assertion.inputs_digest)
        || !Array.isArray(assertion.input_claim_ids) || assertion.input_claim_ids.length === 0
        || assertion.input_claim_ids.some((/** @type {any} */ id) => !nonBlank(id))
        || canonicalStringify(unique(assertion.input_claim_ids)) !== canonicalStringify(unique(claim.parent_claim_ids ?? []))) {
        invalid(claim, 'test_value_derivations'); continue;
      }
      derivations.push({
        method_id: assertion.method_id, method_version: assertion.method_version,
        inputs_digest: assertion.inputs_digest, input_claim_ids: unique(assertion.input_claim_ids),
        subject_ref: assertion.subject_ref, field_path: assertion.field_path,
        value: structuredClone(assertion.value)
      });
    }
    for (const assertion of semanticArray(claim, 'risk_review_assertions')) {
      if (!exactRecord(assertion, ['module_id', 'risk_kind', 'status'])
        || !nonBlank(assertion.module_id) || !RISK_KINDS.has(assertion.risk_kind)
        || !['formal', 'semantic_gap'].includes(assertion.status)) {
        invalid(claim, 'risk_review_assertions'); continue;
      }
      risk_review_assertions.push({ ...structuredClone(assertion), claim_id: claim.claim_id });
    }
    for (const assertion of semanticArray(claim, 'not_applicable_assertions')) {
      const subject = record(assertion) ? assertion.subject : null;
      const riskSubject = exactRecord(subject, ['kind', 'module_id', 'risk_kind'])
        && subject.kind === 'risk' && nonBlank(subject.module_id) && RISK_KINDS.has(subject.risk_kind);
      const outcomeSubject = exactRecord(subject, ['kind', 'fact_id', 'condition'])
        && subject.kind === 'formal_outcome' && nonBlank(subject.fact_id) && record(subject.condition);
      if (!exactRecord(assertion, ['subject', 'acceptance_role', 'reason_code', 'reason'])
        || (!riskSubject && !outcomeSubject) || !ACCEPTANCE_ROLES.has(assertion.acceptance_role)
        || !NOT_APPLICABLE_REASONS.has(assertion.reason_code) || !nonBlank(assertion.reason)
        || /(?:PRD|需求|文档).{0,8}(?:未提及|未说明|未定义)|not\s+(?:mentioned|documented)/iu.test(assertion.reason)) {
        invalid(claim, 'not_applicable_assertions'); continue;
      }
      const decision = claim.claim_form === 'decision-record' && nonBlank(claim.decision_id);
      not_applicable_assertions.push({
        subject: structuredClone(subject), acceptance_role: assertion.acceptance_role,
        reason_code: assertion.reason_code, reason: assertion.reason,
        basis: decision
          ? { kind: 'scope_decision', decision_ids: [claim.decision_id] }
          : { kind: 'evidence', claim_ids: [claim.claim_id] }
      });
    }
    for (const assertion of semanticArray(claim, 'ordering_assertions')) {
      const flow = exactRecord(assertion, ['kind', 'module_id', 'subject_ref', 'locator_id'])
        && assertion.kind === 'flow'
        && [assertion.module_id, assertion.subject_ref, assertion.locator_id].every(nonBlank);
      const action = exactRecord(assertion, ['kind', 'module_id', 'flow_subject_ref', 'subject_ref', 'locator_id'])
        && assertion.kind === 'action'
        && [assertion.module_id, assertion.flow_subject_ref, assertion.subject_ref, assertion.locator_id].every(nonBlank);
      const dependency = exactRecord(assertion, ['kind', 'predecessor_outcome_id', 'successor_outcome_id'])
        && assertion.kind === 'outcome_dependency'
        && [assertion.predecessor_outcome_id, assertion.successor_outcome_id].every(nonBlank);
      if ((!flow && !action && !dependency)
        || (flow || action) && !claim.source_locator_ids.includes(assertion.locator_id)) {
        invalid(claim, 'ordering_assertions');
      }
    }
  }
  const byCanonical = (/** @type {any} */ a, /** @type {any} */ b) => compare(canonicalStringify(a), canonicalStringify(b));
  return {
    baseline_assertions: baseline_assertions.sort(byCanonical), value_claims: value_claims.sort(byCanonical),
    supported_claim_ids: unique(supported_claim_ids),
    derivations: derivations.sort(byCanonical), risk_review_assertions: risk_review_assertions.sort(byCanonical),
    not_applicable_assertions: not_applicable_assertions.sort(byCanonical), diagnostics
  };
}

/**
 * Derive the ordinary production compiler context from the four persisted v4
 * Agent artifacts. The result contains no execution resources and accepts no
 * fifth semantic artifact. Sources that cannot be exactly reconstructed require
 * the runner's short-lived acquisition context instead of being guessed.
 * @param {unknown} submittedArtifacts @param {any|null} [sourceAcquisition]
 */
export function deriveV4SystemContext(submittedArtifacts, sourceAcquisition = null) {
  if (!record(submittedArtifacts) || Object.keys(submittedArtifacts).length !== 4
    || !['source_pack', 'evidence_claims', 'behavior_views', 'case_drafts'].every(key => Object.hasOwn(submittedArtifacts, key))) {
    throw new TypeError('V4_ARTIFACT_SET_INVALID');
  }
  const artifacts = /** @type {any} */ (submittedArtifacts);
  const pack = artifacts.source_pack;
  const evidence = artifacts.evidence_claims;
  if (pack?.schema_version !== '4.0.0' || evidence?.schema_version !== '4.0.0') {
    throw new TypeError('V4_ARTIFACT_VERSION_INVALID');
  }
  const preCase = deriveV4PreCaseSystemContext(pack, evidence, sourceAcquisition);
  return {
    ...preCase,
    behavior_evidence: behaviorEvidence(evidence),
    ordering: orderingSystem(pack, evidence),
    semantic_evidence: semanticEvidenceSystem(evidence),
  };
}

/** Derive the compiler-private source/topology state available immediately
 * after Source Pack and Evidence Claims exist, before Views or Cases are asked
 * for. @param {unknown} submittedPack @param {unknown} submittedEvidence
 * @param {any|null} [sourceAcquisition] */
export function deriveV4PreCaseSystemContext(submittedPack, submittedEvidence, sourceAcquisition = null) {
  if (!record(submittedPack) || !record(submittedEvidence)
    || submittedPack.schema_version !== '4.0.0' || submittedEvidence.schema_version !== '4.0.0') {
    throw new TypeError('V4_PRE_CASE_ARTIFACT_INVALID');
  }
  const pack = /** @type {any} */ (submittedPack);
  const evidence = /** @type {any} */ (submittedEvidence);
  const registries = sourceSystem(pack);
  if (sourceAcquisition !== null && (!record(sourceAcquisition)
    || !Array.isArray(sourceAcquisition.verified_source_receipts)
    || !Array.isArray(sourceAcquisition.verified_acquisition_records)
    || Object.keys(sourceAcquisition).some(key => ![
      'verified_source_receipts', 'verified_acquisition_records'
    ].includes(key)))) throw new TypeError('V4_SOURCE_ACQUISITION_CONTEXT_INVALID');
  const receipts = sourceAcquisition?.verified_source_receipts ?? [];
  const canonical_source_structure = canonicalTopologyStructure(pack);
  const topology = topologySystem(evidence, canonical_source_structure);
  const source = {
    provider_registry: registries.provider_registry,
    expiry_registry: registries.expiry_registry,
    subject_registry: subjectRegistry(pack, evidence),
    acquisitions: reconstructibleAcquisitions(pack, registries, receipts),
    ...(sourceAcquisition ?? {})
  };
  const claim_assessments = evidence.claims.filter((/** @type {any} */ claim) => claim.domain === 'business')
    .map((/** @type {any} */ claim) => ({
    claim_id: claim.claim_id, domain: 'business_semantics', level: claim.level,
    support_review: claim.level === 'E1' && claim.claim_form !== 'decision-record' ? 'uncertain' : 'supported'
    }));
  return {
    source, topology,
    interaction: { verified_claims: topology.verified_claims },
    claim_assessments,
    decisions: { delivery_requested: false, root_statuses: [] }
  };
}
