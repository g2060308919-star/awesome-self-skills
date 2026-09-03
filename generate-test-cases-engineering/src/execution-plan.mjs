import { canonicalStringify, digest } from './canonical.mjs';
import { createPresentationSnapshot, replayWorkflowHistory } from './execution-events.mjs';

const REASON_CODES = new Set([
  'selected_for_run', 'not_applicable', 'user_deferred', 'temporary_rule_unconfirmed',
  'business_rule_missing', 'authority_missing', 'capability_unavailable',
  'risk_not_adopted', 'scope_excluded_for_run', 'other_explicit'
]);

/** @param {string} code @param {string} path @param {string} message */
function diagnostic(code, path, message) {
  return { category: 'classification', code, path, message };
}

/** @param {unknown} value @returns {any[]} */
function records(value) {
  return Array.isArray(value) ? value.filter((item) => item && typeof item === 'object' && !Array.isArray(item)) : [];
}

/** @param {unknown} value @returns {string[]} */
function strings(value) {
  return Array.isArray(value) ? [...new Set(value.filter((item) => typeof item === 'string'))].sort() : [];
}

/** @param {any} value @returns {any} */
export function normalizeSemantic(value) {
  if (Array.isArray(value)) return value.map(normalizeSemantic);
  if (!value || typeof value !== 'object') return value;
  /** @type {Record<string,any>} */
  const result = {};
  for (const [key, child] of Object.entries(value)) {
    if (['run_instance_id', 'source_revision', 'event_id', 'clarification_event_seq', 'event_at',
      'confirmed_at', 'presentation_id', 'prompt_id', 'group_id', 'question_id',
      'item_semantic_change_head_seq', 'plan_change_head_seq'].includes(key)) continue;
    result[key] = normalizeSemantic(child);
  }
  return result;
}

/** @param {any} sourcePack */
function maximumEventSequence(sourcePack) {
  let maximum = 0;
  for (const field of ['decision_records', 'clarification_events', 'execution_events']) {
    for (const item of records(sourcePack?.[field])) {
      if (Number.isSafeInteger(item.clarification_event_seq)) maximum = Math.max(maximum, item.clarification_event_seq);
    }
  }
  return maximum;
}

/** @param {unknown} claimIds @param {any} evidenceClaims */
function claimClosure(claimIds, evidenceClaims) {
  const byId = new Map(records(evidenceClaims?.claims).map((claim) => [String(claim.claim_id ?? ''), claim]));
  return strings(claimIds).flatMap((claimId) => byId.has(claimId)
    ? [{ claim_id: claimId, semantic: normalizeSemantic(byId.get(claimId)) }] : []);
}

/** @param {any} item @param {any} evidenceClaims */
function itemDigest(item, evidenceClaims) {
  const evidenceRefs = item.item_kind === 'case'
    ? [...strings(item.semantic.evidence_refs), ...strings(item.semantic.source_claim_ids)]
    : item.semantic_status === 'not_applicable'
      ? [String(item.semantic.exclusion_claim_id ?? '')]
      : strings(item.semantic.source_claim_ids);
  return digest({
    item_kind: item.item_kind,
    item_id: item.item_id,
    title: item.title,
    semantic_status: item.semantic_status,
    semantic: normalizeSemantic(item.semantic),
    claims: claimClosure(evidenceRefs, evidenceClaims)
  });
}

/** @param {any} item @param {any} sourcePack @param {any} evidenceClaims */
function basisSemantic(item, sourcePack, evidenceClaims) {
  if (!item.basis) return null;
  if (item.basis.origin === 'default_grounded_recommendation') return item.basis;
  if (item.basis.origin === 'derived_not_applicable') {
    return {
      origin: item.basis.origin,
      exclusion_claim_semantic_digest: digest(claimClosure([item.basis.exclusion_claim_id], evidenceClaims))
    };
  }
  if (item.basis.origin === 'user_execution_decision') {
    const event = records(sourcePack?.execution_events).find((candidate) => candidate.event_id === item.basis.execution_event_id);
    const decision = records(event?.decisions).find((candidate) => candidate.item_kind === item.item_kind && candidate.item_id === item.item_id);
    return { origin: item.basis.origin, execution_decision_semantic_digest: digest(normalizeSemantic({
      actor: event?.actor, authority_scope: event?.authority_scope, decision
    })) };
  }
  return item.basis;
}

/** @param {any} item */
function itemKey(item) {
  return `${item.item_kind}\0${item.item_id}`;
}

/** @param {any} decision */
function adoptionDecisionSemantic(decision) {
  return {
    action: 'adopt_exploratory', exploratory_id: String(decision?.exploratory_id ?? ''),
    business_rule: String(decision?.business_rule ?? '').normalize('NFC').trim(),
    expected_result: String(decision?.expected_result ?? '').normalize('NFC').trim(),
    confirmer: String(decision?.confirmer ?? '').normalize('NFC').trim(),
    authority_scope: String(decision?.authority_scope ?? '').normalize('NFC').trim(),
    effective_scope: String(decision?.effective_scope ?? '').normalize('NFC').trim(),
    evidence_level: decision?.evidence_level
  };
}

/** @param {any} promotion @param {any} sourcePack */
function promotionSemantic(promotion, sourcePack) {
  const decision = records(sourcePack?.decision_records).find(
    (candidate) => candidate.decision_id === promotion.adoption_decision_id
  );
  return {
    exploratory_id: promotion.exploratory_id,
    adoption_decision_semantic_digest: promotion.adoption_decision_semantic_digest
      ?? digest(adoptionDecisionSemantic(decision)),
    obligation_ids: strings(promotion.obligation_ids), case_ids: strings(promotion.case_ids)
  };
}

/**
 * Promotion is proven by compiler-owned lineage: an accepted adoption Decision
 * must have an E3 claim, and at least one current formal obligation must cite
 * that claim. Until then the Exploratory remains active and Pending.
 * @param {any} semanticBundle @param {any} obligations @param {any} evidenceClaims
 * @param {any} sourcePack @param {any} priorWorkflowState
 */
function derivePromotions(semanticBundle, obligations, evidenceClaims, sourcePack, priorWorkflowState) {
  const promotions = records(priorWorkflowState?.promoted_exploratory).map((item) => structuredClone(item));
  const promotedIds = new Set(promotions.map((item) => String(item.exploratory_id ?? '')));
  const priorItems = records(priorWorkflowState?.execution_plan?.items ?? priorWorkflowState?.plan?.items);
  const knownExploratory = new Set([
    ...records(semanticBundle?.exploratory).map((item) => String(item.exploratory_id ?? '')),
    ...priorItems.filter((item) => item.item_kind === 'exploratory').map((item) => String(item.item_id ?? ''))
  ]);
  const claims = records(evidenceClaims?.claims);
  const formalIds = new Set(records(semanticBundle?.coverage?.formal?.entries)
    .map((entry) => String(entry.obligation_id ?? '')));
  const cases = [...records(semanticBundle?.grounded), ...records(semanticBundle?.conditional)];
  const adoptions = records(sourcePack?.decision_records)
    .filter((decision) => decision.decision_type === 'exploratory_adoption')
    .sort((left, right) => Number(left.clarification_event_seq ?? 0) - Number(right.clarification_event_seq ?? 0));
  for (const adoption of adoptions) {
    const exploratoryId = String(adoption.exploratory_id ?? '');
    if (!knownExploratory.has(exploratoryId) || promotedIds.has(exploratoryId)) continue;
    const adoptionClaimIds = new Set(claims.filter((claim) => (
      claim.decision_id === adoption.decision_id && claim.level === 'E3'
    )).map((claim) => String(claim.claim_id ?? '')));
    const obligationIds = records(obligations).filter((obligation) => (
      formalIds.has(String(obligation.obligation_id ?? ''))
      && strings(obligation.source_claim_ids).some((claimId) => adoptionClaimIds.has(claimId))
    )).map((obligation) => String(obligation.obligation_id)).sort();
    if (obligationIds.length === 0) continue;
    const obligationSet = new Set(obligationIds);
    const caseIds = cases.filter((entry) => strings(entry.obligation_ids)
      .some((obligationId) => obligationSet.has(obligationId)))
      .map((entry) => String(entry.case_id ?? '')).filter(Boolean).sort();
    promotions.push({
      exploratory_id: exploratoryId, adoption_decision_id: String(adoption.decision_id ?? ''),
      obligation_ids: obligationIds, case_ids: [...new Set(caseIds)]
    });
    promotedIds.add(exploratoryId);
  }
  return promotions;
}

/** @param {any} item @param {any} sourcePack @param {any} evidenceClaims @param {any[]} diagnostics @param {number} index */
function legalDisposition(item, sourcePack, evidenceClaims, diagnostics, index) {
  const path = `/execution_plan/items/${index}`;
  if (item.execution_disposition === 'pending') {
    if (item.reason_code !== null || item.reason !== null || item.basis !== null) diagnostics.push(diagnostic(
      'PENDING_METADATA_INVALID', path, 'Pending items cannot carry a reason or basis.'
    ));
    return;
  }
  if (!REASON_CODES.has(item.reason_code) || typeof item.reason !== 'string' || item.reason.trim().length === 0 || !item.basis) diagnostics.push(diagnostic(
    'EXECUTION_REASON_INVALID', path, 'A non-pending item requires a legal reason, explanation, and basis.'
  ));
  if (item.execution_disposition === 'execute' && (item.item_kind !== 'case' || item.semantic_status !== 'grounded'
    || item.reason_code !== 'selected_for_run')) diagnostics.push(diagnostic(
    'EXECUTION_STATUS_INVALID', path, 'Only a Grounded Case can be Execute.'
  ));
  const exclusion = item.semantic_status === 'not_applicable';
  const isDerived = item.basis?.origin === 'derived_not_applicable';
  if (exclusion !== (item.execution_disposition === 'do_not_execute'
    && item.reason_code === 'not_applicable' && isDerived)) diagnostics.push(diagnostic(
    'NOT_APPLICABLE_EXECUTION_INVARIANT', path, 'NotApplicable must use only its derived DoNotExecute basis and vice versa.'
  ));
  if (isDerived && claimClosure([item.basis.exclusion_claim_id], evidenceClaims).length !== 1) diagnostics.push(diagnostic(
    'NOT_APPLICABLE_EXCLUSION_INVALID', `${path}/basis/exclusion_claim_id`, 'The exclusion claim must resolve to accepted evidence.'
  ));
  if (item.basis?.origin === 'user_execution_decision') {
    const event = records(sourcePack?.execution_events).find((candidate) => candidate.event_id === item.basis.execution_event_id);
    if (!event) diagnostics.push(diagnostic(
      'EXECUTION_EVENT_MISSING', `${path}/basis/execution_event_id`, 'A user execution decision must reference its retained event.'
    ));
  }
}

/** @param {any} semanticBundle @param {any} obligations @param {any} evidenceClaims @param {any} priorPlan @param {any} sourcePack @param {any[]} promotions @param {any[]} diagnostics */
function buildInitialItems(semanticBundle, obligations, evidenceClaims, priorPlan, sourcePack, promotions, diagnostics) {
  const obligationById = new Map(records(obligations).map((item) => [String(item.obligation_id ?? ''), item]));
  /** @type {any[]} */
  const items = [];
  /** @param {any} entry @param {string} semanticStatus */
  const addCase = (entry, semanticStatus) => items.push({
    item_kind: 'case', item_id: String(entry.case_id ?? ''), title: String(entry.title ?? entry.case_id ?? ''),
    semantic_status: semanticStatus, related_obligation_ids: strings(entry.obligation_ids), semantic: entry
  });
  for (const entry of records(semanticBundle?.grounded)) addCase(entry, 'grounded');
  for (const entry of records(semanticBundle?.conditional)) addCase(entry, 'conditional');
  for (const entry of records(semanticBundle?.blocked)) {
    const id = String(entry.obligation_id ?? '');
    const obligation = obligationById.get(id);
    items.push({
      item_kind: 'formal_test_point', item_id: id,
      title: String(obligation?.title ?? entry.recovery?.question ?? id),
      semantic_status: 'blocked', related_obligation_ids: [id], semantic: entry
    });
  }
  for (const entry of records(semanticBundle?.coverage?.not_applicable)) {
    const id = String(entry.obligation_id ?? '');
    const obligation = obligationById.get(id);
    items.push({
      item_kind: 'formal_test_point', item_id: id, title: String(obligation?.title ?? id),
      semantic_status: 'not_applicable', related_obligation_ids: [id], semantic: entry
    });
  }
  const promotedIds = new Set(records(promotions).map((item) => String(item.exploratory_id ?? '')));
  for (const entry of records(semanticBundle?.exploratory).filter(
    (candidate) => !promotedIds.has(String(candidate.exploratory_id ?? ''))
  )) items.push({
    item_kind: 'exploratory', item_id: String(entry.exploratory_id ?? ''),
    title: String(entry.title ?? entry.exploratory_id ?? ''), semantic_status: 'exploratory',
    related_obligation_ids: [], semantic: entry
  });
  items.sort((left, right) => itemKey(left).localeCompare(itemKey(right), 'en'));
  const seen = new Set();
  const priorByKey = new Map(records(priorPlan?.items).map((item) => [itemKey(item), item]));
  const eventHead = maximumEventSequence(sourcePack);
  for (let index = 0; index < items.length; index += 1) {
    const item = items[index];
    const key = itemKey(item);
    if (!item.item_id || seen.has(key)) diagnostics.push(diagnostic(
      'EXECUTION_ITEM_DUPLICATE', `/execution_plan/items/${index}`, 'Each decision item identity must be nonempty and unique.'
    ));
    seen.add(key);
    item.item_semantic_digest = itemDigest(item, evidenceClaims);
    const prior = priorByKey.get(key);
    item.item_semantic_change_head_seq = prior && prior.item_semantic_digest === item.item_semantic_digest
      ? Number(prior.item_semantic_change_head_seq ?? 0) : prior ? eventHead : 0;
    if (prior && prior.item_semantic_digest === item.item_semantic_digest
      && prior.execution_disposition !== 'pending') Object.assign(item, {
      execution_disposition: prior.execution_disposition,
      reason_code: prior.reason_code, reason: prior.reason, basis: structuredClone(prior.basis)
    });
    else if (item.semantic_status === 'grounded') Object.assign(item, {
      execution_disposition: 'execute', reason_code: 'selected_for_run', reason: 'Selected for this run.',
      basis: { origin: 'default_grounded_recommendation' }
    });
    else if (item.semantic_status === 'not_applicable') Object.assign(item, {
      execution_disposition: 'do_not_execute', reason_code: 'not_applicable',
      reason: 'Excluded by supported scope evidence.',
      basis: { origin: 'derived_not_applicable', exclusion_claim_id: String(item.semantic.exclusion_claim_id ?? '') }
    });
    else Object.assign(item, {
      execution_disposition: 'pending', reason_code: null, reason: null, basis: null
    });
    delete item.semantic;
  }
  return items;
}

/** @param {any} semanticBundle @param {any[]} items @param {any[]} diagnostics */
function buildCoverage(semanticBundle, items, diagnostics) {
  const formal = records(semanticBundle?.coverage?.formal?.entries);
  if (Number(semanticBundle?.coverage?.formal?.total) !== formal.length) diagnostics.push(diagnostic(
    'FORMAL_COUNT_MISMATCH', '/coverage/formal/total', 'Formal total must equal its complete entry ledger.'
  ));
  const formalIds = new Set();
  for (const entry of formal) {
    const id = String(entry.obligation_id ?? '');
    if (!id || formalIds.has(id)) diagnostics.push(diagnostic(
      'FORMAL_INVENTORY_INVALID', '/coverage/formal/entries', 'Formal Test Point identities must be unique.'
    ));
    formalIds.add(id);
  }
  const runnerIds = items.filter((item) => item.item_kind === 'case'
    && item.semantic_status === 'grounded' && item.execution_disposition === 'execute')
    .map((item) => item.item_id).sort();
  const coverage = formal.filter((entry) => entry.status !== 'not_applicable').map((entry) => {
    const obligationId = String(entry.obligation_id);
    const related = items.filter((item) => item.item_kind === 'case' && item.semantic_status === 'grounded'
      && item.related_obligation_ids.includes(obligationId)).map((item) => item.item_id).sort();
    const execute = related.filter((caseId) => runnerIds.includes(caseId));
    const status = related.length > 0 && execute.length === related.length ? 'full'
      : execute.length > 0 ? 'partial' : 'none';
    return { obligation_id: obligationId, related_grounded_case_ids: related, execute_case_ids: execute, status };
  }).sort((left, right) => left.obligation_id.localeCompare(right.obligation_id, 'en'));
  return { runnerIds, coverage, formal };
}

/** @param {any[]} items @param {any[]} formal @param {any[]} tpCoverage */
function buildSummary(items, formal, tpCoverage) {
  /** @param {(item:any)=>boolean} predicate */
  const count = (predicate) => items.filter(predicate).length;
  return {
    case_count: count((item) => item.item_kind === 'case'),
    formal_test_point_count: formal.length,
    applicable_formal_test_point_count: formal.filter((item) => item.status !== 'not_applicable').length,
    not_applicable_formal_test_point_count: formal.filter((item) => item.status === 'not_applicable').length,
    full_test_point_count: tpCoverage.filter((item) => item.status === 'full').length,
    partial_test_point_count: tpCoverage.filter((item) => item.status === 'partial').length,
    none_test_point_count: tpCoverage.filter((item) => item.status === 'none').length,
    exploratory_count: count((item) => item.item_kind === 'exploratory'),
    execute_case_count: count((item) => item.item_kind === 'case' && item.execution_disposition === 'execute'),
    do_not_execute_case_count: count((item) => item.item_kind === 'case' && item.execution_disposition === 'do_not_execute'),
    do_not_execute_formal_test_point_count: count((item) => item.item_kind === 'formal_test_point' && item.execution_disposition === 'do_not_execute'),
    do_not_execute_exploratory_count: count((item) => item.item_kind === 'exploratory' && item.execution_disposition === 'do_not_execute'),
    pending_case_count: count((item) => item.item_kind === 'case' && item.execution_disposition === 'pending'),
    pending_formal_test_point_count: count((item) => item.item_kind === 'formal_test_point' && item.execution_disposition === 'pending'),
    pending_exploratory_count: count((item) => item.item_kind === 'exploratory' && item.execution_disposition === 'pending')
  };
}

/** @param {any} sourcePack */
function semanticSourceDigest(sourcePack) {
  return digest(normalizeSemantic({
    sources: records(sourcePack?.sources), run_scope: sourcePack?.run_scope,
    decisions: records(sourcePack?.decision_records).filter((item) => item.disposition === 'final' || item.disposition === 'temporary')
  }));
}

/** @param {any} input */
export function compileExecutionPlan(input) {
  /** @type {any[]} */
  const diagnostics = [];
  const semanticBundle = input?.semanticBundle ?? {};
  const sourcePack = input?.sourcePack ?? {};
  const promotions = derivePromotions(
    semanticBundle, input?.obligations, input?.evidenceClaims,
    sourcePack, input?.priorWorkflowState
  );
  const items = buildInitialItems(
    semanticBundle, input?.obligations, input?.evidenceClaims,
    input?.priorWorkflowState?.execution_plan ?? input?.priorWorkflowState?.plan,
    sourcePack, promotions, diagnostics
  );
  const semanticSource = semanticSourceDigest(sourcePack);
  const priorPlan = input?.priorWorkflowState?.execution_plan ?? input?.priorWorkflowState?.plan;
  const baseCoverage = buildCoverage(semanticBundle, items, diagnostics);
  const baseProjection = {
    semantic_source_digest: semanticSource,
    items: items.map((item) => ({ ...item, basis: basisSemantic(item, sourcePack, input?.evidenceClaims) })),
    promoted_exploratory: promotions.map((item) => promotionSemantic(item, sourcePack)),
    test_point_execution_coverage: baseCoverage.coverage
  };
  const basePlanDigest = priorPlan?.plan_digest ?? digest(baseProjection);
  const replay = replayWorkflowHistory({
    sourcePack,
    items,
    priorState: input?.priorWorkflowState,
    currentPresentation: input?.priorWorkflowState?.presentation_snapshot ?? null,
    runInstanceId: sourcePack.run_instance_id,
    runIdentityDigest: input?.runIdentityDigest,
    executionScope: sourcePack.run_scope,
    sourceRevision: input?.priorWorkflowState?.presentation_snapshot?.source_revision
      ?? Math.max(0, Number(sourcePack.source_revision ?? 0) - 1),
    planDigest: basePlanDigest,
    planChangeHeadSeq: Number(priorPlan?.plan_change_head_seq ?? 0),
    priorWorkflowEventHeadSeq: Number(input?.priorWorkflowState?.workflow_event_head_seq ?? 0),
    priorConfirmation: input?.priorWorkflowState?.confirmation ?? priorPlan?.confirmation ?? null,
    priorActivePause: input?.priorWorkflowState?.active_pause ?? null
  });
  diagnostics.push(...replay.diagnostics);
  const currentItems = replay.items;
  currentItems.forEach((item, index) => legalDisposition(item, sourcePack, input?.evidenceClaims, diagnostics, index));
  const { runnerIds, coverage, formal } = buildCoverage(semanticBundle, currentItems, diagnostics);
  const summary = buildSummary(currentItems, formal, coverage);
  const semanticProjection = {
    semantic_source_digest: semanticSource,
    items: currentItems.map((item) => ({
      ...item,
      basis: basisSemantic(item, sourcePack, input?.evidenceClaims)
    })),
    promoted_exploratory: promotions.map((item) => promotionSemantic(item, sourcePack)),
    test_point_execution_coverage: coverage
  };
  const planDigest = digest(semanticProjection);
  const pending = summary.pending_case_count + summary.pending_formal_test_point_count + summary.pending_exploratory_count;
  const planChangeHead = replay.plan_change_head_seq;
  const confirmation = replay.confirmation;
  const ready = pending === 0 && confirmation
    && confirmation.confirmed_plan_digest === planDigest
    && confirmation.confirmed_plan_change_head_seq === planChangeHead;
  const plan = {
    status: replay.active_pause ? 'paused'
      : pending > 0 ? 'decision_required' : ready ? 'ready' : 'awaiting_confirmation',
    resume_target: replay.active_pause?.resume_target ?? null,
    run_identity_digest: String(input?.runIdentityDigest ?? ''),
    semantic_source_digest: semanticSource,
    plan_digest: planDigest,
    plan_change_head_seq: planChangeHead,
    items: currentItems,
    runner_case_ids: runnerIds,
    promoted_exploratory: promotions,
    test_point_execution_coverage: coverage,
    summary,
    confirmation
  };
  const purpose = pending > 0 ? 'execution_closure' : 'final_confirmation';
  const pendingItems = currentItems.filter((item) => item.execution_disposition === 'pending');
  const visibleItems = purpose === 'execution_closure' ? pendingItems : currentItems;
  const executionOptions = [
    { option_code: 'do_not_execute', label: 'Do not execute', meaning: 'Keep the true status and exclude this item from the run.' },
    ...(pendingItems.some((item) => item.item_kind === 'formal_test_point') ? [
      { option_code: 'final', label: 'Provide final rule', meaning: 'Supply an authoritative business answer and recompile.' },
      { option_code: 'temporary', label: 'Provide temporary rule', meaning: 'Supply a provisional business answer without upgrading evidence.' },
      { option_code: 'reopen_root_issues', label: 'Reopen issue', meaning: 'Reopen a previously handled business issue and recompile.' }
    ] : []),
    { option_code: 'request_reanalysis', label: 'Reanalyze source', meaning: 'Re-read existing source locators without adding business truth.' },
    ...(pendingItems.some((item) => item.item_kind === 'exploratory') ? [{
      option_code: 'adopt', label: 'Adopt risk', meaning: 'Confirm a business rule and recompile this exploratory risk through the formal pipeline.'
    }] : []),
    { option_code: 'pause', label: 'Pause', meaning: 'Save the pending plan for later.' }
  ];
  const presentation = ready ? null : createPresentationSnapshot({
    purpose,
    entryContext: 'active_analysis',
    runInstanceId: sourcePack.run_instance_id,
    sourceRevision: Number(sourcePack.source_revision ?? 0),
    planDigest,
    planChangeHeadSeq: planChangeHead,
    groups: [{
      question: purpose === 'execution_closure'
        ? 'Choose Execute, DoNotExecute, or pause for every pending item.'
        : 'Confirm, modify, or pause the complete execution plan.',
      items: visibleItems,
      allowedOptions: purpose === 'execution_closure'
        ? executionOptions
        : [
          { option_code: 'confirm', label: 'Confirm', meaning: 'Confirm this displayed plan.' },
          { option_code: 'modify', label: 'Modify', meaning: 'Change one or more execution choices.' },
          { option_code: 'pause', label: 'Pause', meaning: 'Save before confirmation.' }
        ],
      answerExample: purpose === 'execution_closure'
        ? 'Do not execute the named item because the business rule is missing.'
        : 'Confirm the displayed plan.'
    }]
  });
  return {
    kind: ready ? 'ready' : 'analysis_only',
    plan: JSON.parse(canonicalStringify(plan)),
    presentation,
    workflow_event_head_seq: replay.workflow_event_head_seq,
    workflow_event_log_digest: replay.workflow_event_log_digest,
    diagnostics
  };
}

/** @param {any} plan @param {any} sourcePack @param {any} evidenceClaims */
export function projectReadyExecutionPlan(plan, sourcePack, evidenceClaims) {
  if (plan?.status !== 'ready' || !plan.confirmation) throw new Error('Execution plan is not ready.');
  const items = records(plan.items).map((item) => {
    const projected = {
      item_kind: item.item_kind, item_id: item.item_id, title: item.title,
      semantic_status: item.semantic_status, item_semantic_digest: item.item_semantic_digest,
      related_obligation_ids: strings(item.related_obligation_ids),
      execution_disposition: item.execution_disposition, reason_code: item.reason_code,
      reason: item.reason, basis: basisSemantic(item, sourcePack, evidenceClaims)
    };
    return projected;
  });
  const confirmationSemantic = {
    action: 'confirm_plan', actor: String(plan.confirmation.actor).normalize('NFC').trim(),
    authority_scope: String(plan.confirmation.authority_scope).normalize('NFC').trim(),
    confirmed_plan_digest: plan.plan_digest
  };
  return {
    status: 'ready',
    semantic_source_digest: plan.semantic_source_digest, plan_digest: plan.plan_digest,
    semantic_result_digest: '0'.repeat(64), items,
    runner_case_ids: strings(plan.runner_case_ids),
    promoted_exploratory: records(plan.promoted_exploratory)
      .map((item) => promotionSemantic(item, sourcePack)),
    test_point_execution_coverage: structuredClone(plan.test_point_execution_coverage),
    summary: structuredClone(plan.summary),
    confirmation: {
      confirmed: true, confirmed_plan_digest: plan.plan_digest,
      actor: confirmationSemantic.actor, authority_scope: confirmationSemantic.authority_scope,
      confirmation_semantic_digest: digest(confirmationSemantic)
    }
  };
}

/** @param {any} bundle */
export function semanticResultDigest(bundle) {
  const projection = normalizeSemantic(structuredClone(bundle));
  if (projection?.execution_plan) delete projection.execution_plan.semantic_result_digest;
  return digest(projection);
}
