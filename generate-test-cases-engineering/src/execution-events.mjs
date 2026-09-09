import { canonicalStringify, digest } from './canonical.mjs';
import sourcePackSchema from '../skill/generate-test-cases/scripts/schemas/source-pack.schema.json' with { type: 'json' };
import replySchema from '../skill/generate-test-cases/scripts/schemas/reply.schema.json' with { type: 'json' };
import { validateAgainstSchema } from './schema-validator.mjs';
import { scopeContains } from './decision-record.mjs';
/** @typedef {{semantic_reopen_handler?:(event:any)=>any, verify_and_recompute_readiness?:(input:any)=>Promise<{verified:boolean,ready:boolean,receipt:any}>|{verified:boolean,ready:boolean,receipt:any}}} V4ExecutionServices */

const CAPABILITY_PROOF_POLICY = Object.freeze({
  type: 'testability_availability',
  policy_id: 'compiler.testability-availability',
  policy_version: '1.0.0',
  allowed_values: Object.freeze(['verified_available', 'verified_unavailable'])
});

/** @param {unknown} value @returns {value is Record<string,any>} */
function record(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Execution-readiness roots are compiler-owned and deliberately disjoint from
 * Case Document semantic-gap roots. The stable root follows the Case identity;
 * its version binds the complete immutable Case Document reference and proof
 * policy, so a receipt cannot be replayed across document revisions.
 * @param {any} caseDocumentRef @param {string} caseId
 */
export function deriveV4ExecutionReadinessTarget(caseDocumentRef, caseId) {
  if (!record(caseDocumentRef) || typeof caseId !== 'string' || !caseId) {
    throw new TypeError('EXECUTION_READINESS_TARGET_INVALID');
  }
  const rootIssueId = `EXECROOT-${digest({
    kind: 'case_execution_readiness',
    case_document_run_id: caseDocumentRef.run_id,
    case_id: caseId
  })}`;
  const rootRef = {
    root_issue_id: rootIssueId,
    root_version_digest: `sha256:${digest({
      root_issue_id: rootIssueId,
      case_document_ref: caseDocumentRef,
      case_id: caseId,
      proof_policy: {
        policy_id: CAPABILITY_PROOF_POLICY.policy_id,
        policy_version: CAPABILITY_PROOF_POLICY.policy_version
      }
    })}`
  };
  return {
    case_ids: [caseId],
    root_refs: [rootRef],
    proof_contract: {
      type: CAPABILITY_PROOF_POLICY.type,
      allowed_values: [...CAPABILITY_PROOF_POLICY.allowed_values]
    }
  };
}

/** @param {any} proof */
function capabilityReadiness(proof) {
  if (!record(proof) || Object.keys(proof).length !== 2
    || typeof proof.type !== 'string' || !proof.type
    || typeof proof.value !== 'string' || !proof.value) {
    throw new TypeError('EXECUTION_PROOF_INVALID');
  }
  if (proof.type !== CAPABILITY_PROOF_POLICY.type) {
    throw new TypeError('EXECUTION_PROOF_TYPE_UNSUPPORTED');
  }
  if (!CAPABILITY_PROOF_POLICY.allowed_values.includes(proof.value)) {
    throw new TypeError('EXECUTION_PROOF_VALUE_UNSUPPORTED');
  }
  return proof.value === 'verified_available';
}

/**
 * Validate a compiler-issued capability receipt and independently recompute its
 * readiness. The receipt is operational testability provenance only: no field
 * can alter semantic status, Case content, or an Oracle.
 * @param {any} receipt @param {{case_document_ref?:any,case_id?:string,root_refs?:any[]}} [expected]
 */
export function validateV4CapabilityReceipt(receipt, expected = {}) {
  const keys = [
    'domain', 'verification_policy', 'case_document_ref', 'case_ids', 'root_refs',
    'proof', 'ready', 'receipt_digest'
  ];
  if (!record(receipt) || Object.keys(receipt).length !== keys.length
    || keys.some((key) => !Object.hasOwn(receipt, key))
    || receipt.domain !== 'testability'
    || !record(receipt.verification_policy)
    || canonicalStringify(receipt.verification_policy) !== canonicalStringify({
      policy_id: CAPABILITY_PROOF_POLICY.policy_id,
      policy_version: CAPABILITY_PROOF_POLICY.policy_version
    })
    || !Array.isArray(receipt.case_ids) || receipt.case_ids.length !== 1
    || typeof receipt.case_ids[0] !== 'string' || !receipt.case_ids[0]
    || !Array.isArray(receipt.root_refs) || receipt.root_refs.length !== 1
    || typeof receipt.ready !== 'boolean'
    || !/^sha256:[0-9a-f]{64}$/.test(receipt.receipt_digest)) {
    throw new TypeError('EXECUTION_CAPABILITY_RECEIPT_INVALID');
  }
  const caseId = receipt.case_ids[0];
  const target = deriveV4ExecutionReadinessTarget(receipt.case_document_ref, caseId);
  if (canonicalStringify(target.root_refs) !== canonicalStringify(receipt.root_refs)
    || (expected.case_document_ref !== undefined
      && canonicalStringify(expected.case_document_ref) !== canonicalStringify(receipt.case_document_ref))
    || (expected.case_id !== undefined && expected.case_id !== caseId)
    || (expected.root_refs !== undefined
      && canonicalStringify(expected.root_refs) !== canonicalStringify(receipt.root_refs))) {
    throw new TypeError('EXECUTION_CAPABILITY_RECEIPT_BINDING_INVALID');
  }
  const ready = capabilityReadiness(receipt.proof);
  const body = structuredClone(receipt);
  delete body.receipt_digest;
  if (receipt.ready !== ready || receipt.receipt_digest !== `sha256:${digest(body)}`) {
    throw new TypeError('EXECUTION_CAPABILITY_RECEIPT_DIGEST_INVALID');
  }
  return structuredClone(receipt);
}

/**
 * Built-in production verifier. Accepted proof semantics live in this private,
 * versioned registry rather than the public event schema. Only the exact
 * compiler-derived execution target can produce a receipt.
 * @param {{root_refs:any[],case_ids:string[],proof:any,state:any}} input
 */
export function verifyAndRecomputeV4ExecutionReadiness(input) {
  const targets = Array.isArray(input?.state?.execution_readiness_targets)
    ? input.state.execution_readiness_targets : [];
  const target = targets.find((/** @type {any} */ candidate) => (
    canonicalStringify(candidate?.root_refs) === canonicalStringify(input?.root_refs)
    && canonicalStringify(candidate?.case_ids) === canonicalStringify(input?.case_ids)
  ));
  if (!target || canonicalStringify(target.proof_contract) !== canonicalStringify({
    type: CAPABILITY_PROOF_POLICY.type,
    allowed_values: [...CAPABILITY_PROOF_POLICY.allowed_values]
  })) throw new TypeError('EXECUTION_PROOF_TARGET_INVALID');
  const ready = capabilityReadiness(input.proof);
  const body = {
    domain: 'testability',
    verification_policy: {
      policy_id: CAPABILITY_PROOF_POLICY.policy_id,
      policy_version: CAPABILITY_PROOF_POLICY.policy_version
    },
    case_document_ref: structuredClone(input.state.case_document_ref),
    case_ids: structuredClone(input.case_ids),
    root_refs: structuredClone(input.root_refs),
    proof: structuredClone(input.proof),
    ready
  };
  const receipt = { ...body, receipt_digest: `sha256:${digest(body)}` };
  validateV4CapabilityReceipt(receipt, {
    case_document_ref: input.state.case_document_ref,
    case_id: input.case_ids[0],
    root_refs: input.root_refs
  });
  return { verified: true, ready, receipt };
}
/** @param {any} state @returns {any} */
function v4ExecutionContext(state) {
  const value = Object.fromEntries(['run_id','presentation_id','case_document_ref','case_ids','root_refs'].map(key=>[key,structuredClone(state[key])]));
  if (validateAgainstSchema(value, {$defs:sourcePackSchema.$defs,$ref:'#/$defs/v4ExecutionContext'}).length) {
    throw new TypeError('EXECUTION_CONTEXT_INVALID');
  }
  return value;
}

/** Pure presentation projection; no execution or semantic parent mutation.
 * @param {any} state @param {V4ExecutionServices} services
 */
export function createV4ExecutionPresentation(state, services) {
  if (state.delivery_intent !== 'execution_plan') throw new TypeError('EXECUTION_INTENT_REQUIRED');
  if (state.phase !== 'execution_closure') throw new TypeError('EXECUTION_PHASE_REQUIRED');
  const context = v4ExecutionContext(state);
  /** @type {any[]} */ const items = [];
  /** @param {string} action @param {string[]} case_ids @param {any[]} root_refs @param {string} why @param {string} decision_impact @param {string} unresolved_outcome */
  const add = (action, case_ids, root_refs, why, decision_impact, unresolved_outcome, proofContract = null) => {
    const action_context = {...context,case_ids,root_refs};
    if (action === 'reopen_semantic_question') action_context.reopen_event_id = 'EVENT-' + digest(action_context);
    items.push({case_ids,root_refs,case_document_ref:context.case_document_ref,
      available_actions:[action],action_context,why,decision_impact,unresolved_outcome,
      ...(proofContract ? { proof_contract: structuredClone(proofContract) } : {})});
  };
  for (const id of context.case_ids) add('set_execution_disposition',[id],[],
    '需要确认这条用例是否纳入本次执行。','仅更新这条用例的执行选择，不修改业务用例。','未选择时保持待处理，不进入执行队列。');
  if (typeof services.verify_and_recompute_readiness === 'function') {
    for (const target of Array.isArray(state.execution_readiness_targets)
      ? state.execution_readiness_targets : []) {
      const expectedTarget = deriveV4ExecutionReadinessTarget(
        context.case_document_ref, target?.case_ids?.[0]
      );
      if (!context.case_ids.includes(target?.case_ids?.[0])
        || canonicalStringify(target) !== canonicalStringify(expectedTarget)) {
        throw new TypeError('EXECUTION_READINESS_TARGET_INVALID');
      }
      add(
        'provide_capability_proof', target.case_ids, target.root_refs,
        '需要核验这项执行准备的证明。','核验后仅重算这项准备状态，不改变业务分类。','未通过核验时保持待处理。',
        target.proof_contract
      );
    }
  }
  for (const root of context.root_refs) {
    if (typeof services.semantic_reopen_handler === 'function') add('reopen_semantic_question',[],[root],
      '需要在新的用例文档运行中重新确认这项业务问题。','通过独立运行处理目标问题，不直接修改父文档。','未重开时保留当前业务结论。');
  }
  add('pause_execution',[],[],'本次执行准备可以暂停。','暂停不会修改业务用例或执行选择。','执行继续保持待处理。');
  return {
    phase:'execution_closure',run_id:context.run_id,presentation_id:context.presentation_id,
    run_actions:['cancel_run'],
    cancel_context:{
      run_id:context.run_id,phase:'execution_closure',
      phase_version:Number.isSafeInteger(state.source_revision) ? state.source_revision : 0
    },
    items
  };
}

/** @param {Record<string,unknown>} body */
function identifiedV4RunEvent(body) {
  return { event_id:`EVENT-${digest(body)}`, ...structuredClone(body) };
}

/**
 * Build the compiler-owned final-confirmation snapshot from the exact plan that
 * was returned to the operator. Its action context is the complete public
 * payload needed to confirm that same source revision and plan.
 * @param {{run_id:string,source_revision:number,case_document_ref:any,result_kind:string,runner_projection:any,plan_digest:string}} input
 */
export function createV4FinalConfirmationPresentation(input) {
  const signature = {
    run_id:input.run_id,phase:'final_confirmation',source_revision:input.source_revision,
    case_document_ref:structuredClone(input.case_document_ref),
    result_kind:input.result_kind,runner_projection:structuredClone(input.runner_projection),
    presented_plan_digest:input.plan_digest
  };
  const presentationId = `PRES-${digest(signature)}`;
  const actionContext = {
    run_id:input.run_id,phase:'final_confirmation',phase_version:input.source_revision,
    presented_presentation_id:presentationId,presented_plan_digest:input.plan_digest,
    presented_source_revision:input.source_revision
  };
  const presentation = {
    phase:'final_confirmation',run_id:input.run_id,presentation_id:presentationId,
    source_revision:input.source_revision,case_document_ref:structuredClone(input.case_document_ref),
    presented_plan_digest:input.plan_digest,
    runner_projection:structuredClone(input.runner_projection),result_kind:input.result_kind,
    available_actions:['confirm_execution_plan'],action_context:actionContext,
    run_actions:['cancel_run'],
    cancel_context:{run_id:input.run_id,phase:'final_confirmation',phase_version:input.source_revision},
    why:'发布前必须确认这一版实际展示的完整执行清单。',
    decision_impact:'确认后才会生成执行计划交付与 runner Case 投影；不会自动启动 E2E。',
    unresolved_outcome:'未确认或确认已过期时保持未交付状态。'
  };
  if (validateAgainstSchema(presentation, {
    $defs:replySchema.$defs,$ref:'#/$defs/v4FinalConfirmationPresentation'
  }).length) throw new TypeError('FINAL_CONFIRMATION_PRESENTATION_INVALID');
  return presentation;
}

/** Construct either advertised run-level event from its exact displayed context.
 * @param {any} presentation @param {'confirm_execution_plan'|'cancel_run'} eventType
 */
export function constructV4ExecutionRunEvent(presentation, eventType) {
  if (eventType === 'confirm_execution_plan') {
    if (presentation?.phase !== 'final_confirmation'
      || !presentation.available_actions?.includes(eventType)) {
      throw new TypeError('EXECUTION_ACTION_NOT_ADVERTISED');
    }
    return identifiedV4RunEvent({event_type:eventType,...structuredClone(presentation.action_context)});
  }
  if (eventType === 'cancel_run' && presentation?.run_actions?.includes(eventType)) {
    return identifiedV4RunEvent({event_type:eventType,...structuredClone(presentation.cancel_context)});
  }
  throw new TypeError('EXECUTION_ACTION_NOT_ADVERTISED');
}

/** @param {any} presentation @param {any} event */
export function validateV4FinalConfirmationEvent(presentation, event) {
  if (validateAgainstSchema(event, {
    $defs:sourcePackSchema.$defs,$ref:'#/$defs/v4ExecutionEvent'
  }).length || event?.event_type !== 'confirm_execution_plan') {
    throw new TypeError('FINAL_CONFIRMATION_EVENT_INVALID');
  }
  const body = structuredClone(event); delete body.event_id;
  if (canonicalStringify(event) !== canonicalStringify(identifiedV4RunEvent(body))
    || canonicalStringify(body) !== canonicalStringify({
      event_type:'confirm_execution_plan',...structuredClone(presentation?.action_context)
    })) throw new TypeError('FINAL_CONFIRMATION_STALE');
  return structuredClone(event);
}

/**
 * Validate the exact displayed context before routing. Proofs are recorded, not
 * trusted as readiness; the execution binding layer must independently verify.
 * T10 owns durable semantic reopen, including idempotency and sibling creation.
 * @param {any} state @param {any} presentation @param {any} event
 * @param {V4ExecutionServices} services
 * @returns {Promise<any>}
 */
export async function applyV4ExecutionAction(state, presentation, event, services) {
  const expected = createV4ExecutionPresentation(state,services);
  const snapshot = structuredClone(event);
  if (validateAgainstSchema(snapshot, {$defs:sourcePackSchema.$defs,$ref:'#/$defs/v4ExecutionEvent'}).length) {
    throw new TypeError('EXECUTION_ACTION_INVALID');
  }
  const eventContext = v4ExecutionContext(snapshot);
  if (snapshot.reopen_event_id !== undefined) eventContext.reopen_event_id = snapshot.reopen_event_id;
  const target = expected.items.find(item => canonicalStringify(item.action_context) === canonicalStringify(eventContext));
  if (canonicalStringify(presentation) !== canonicalStringify(expected)
    || !target) {
    throw new TypeError('EXECUTION_ACTION_STALE');
  }
  if (!target.available_actions.includes(snapshot.event_type)) throw new TypeError('EXECUTION_ACTION_UNAVAILABLE');
  if (snapshot.event_type === 'reopen_semantic_question') {
    return await services.semantic_reopen_handler?.(structuredClone(snapshot));
  }
  const next = structuredClone(state);
  // A pause applies to the revision that records it.  The next accepted
  // execution decision is an explicit resumption, so it must not leave the
  // execution plan permanently pending.
  next.paused = snapshot.event_type === 'pause_execution';
  if (snapshot.event_type === 'set_execution_disposition') {
    next.dispositions = {...next.dispositions};
    for (const id of snapshot.case_ids) next.dispositions[id] = snapshot.disposition;
  }
  if (snapshot.event_type === 'provide_capability_proof') {
    const verified = await services.verify_and_recompute_readiness?.(structuredClone({
      root_refs:snapshot.root_refs,case_ids:snapshot.case_ids,proof:snapshot.proof,state
    }));
    if (verified?.verified !== true || typeof verified.ready !== 'boolean' || !verified.receipt) {
      throw new TypeError('EXECUTION_PROOF_UNVERIFIED');
    }
    const receipt = validateV4CapabilityReceipt(verified.receipt, {
      case_document_ref: state.case_document_ref,
      case_id: snapshot.case_ids[0],
      root_refs: snapshot.root_refs
    });
    if (receipt.ready !== verified.ready) throw new TypeError('EXECUTION_PROOF_UNVERIFIED');
    next.readiness = {...next.readiness,[snapshot.root_refs[0].root_issue_id]:verified.ready};
    next.capability_receipts = [...(next.capability_receipts ?? []), receipt];
  }
  return {state:next};
}

/** @param {string} code @param {string} path @param {string} message */
function diagnostic(code, path, message) {
  return { category: 'classification', code, path, message };
}

/** @param {unknown} value @returns {any[]} */
function records(value) {
  return Array.isArray(value) ? value.filter((item) => item && typeof item === 'object' && !Array.isArray(item)) : [];
}

/** @param {unknown} value */
function strings(value) {
  return Array.isArray(value)
    ? [...new Set(value.filter((item) => typeof item === 'string'))].sort() : [];
}

/** @param {any} item */
function itemKey(item) {
  return `${item.item_kind}\0${item.item_id}`;
}

/** @param {unknown} items */
function sortedItemRefs(items) {
  return records(items).map((item) => ({
    item_kind: String(item.item_kind ?? ''), item_id: String(item.item_id ?? ''),
    title: String(item.title ?? ''), item_semantic_digest: String(item.item_semantic_digest ?? ''),
    item_semantic_change_head_seq: Number(item.item_semantic_change_head_seq ?? 0)
  })).sort((left, right) => itemKey(left).localeCompare(itemKey(right), 'en'));
}

/** @param {any} input @returns {any} */
export function createPresentationSnapshot(input) {
  const postReadyControl = input.entryContext === 'post_ready_change'
    ? input.postReadyControl : null;
  const groups = records(input.groups).map((group) => {
    const itemRefs = sortedItemRefs(group.items);
    const options = records(group.allowedOptions).map((option) => ({
      option_code: String(option.option_code ?? ''), label: String(option.label ?? ''),
      meaning: String(option.meaning ?? '')
    })).sort((left, right) => left.option_code.localeCompare(right.option_code, 'en'));
    const signature = {
      run_instance_id: input.runInstanceId, purpose: input.purpose,
      entry_context: input.entryContext, post_ready_control: postReadyControl,
      source_revision: input.sourceRevision, plan_digest: input.planDigest,
      plan_change_head_seq: input.planChangeHeadSeq, question: group.question,
      item_refs: itemRefs, allowed_options: options, answer_example: group.answerExample,
      proposed_change: group.proposedChange ?? null
    };
    return {
      group_id: `GROUP-${digest(signature).slice(0, 24)}`,
      question_id: `QUESTION-${digest({ ...signature, kind: 'question' }).slice(0, 24)}`,
      question: String(group.question ?? ''), item_refs: itemRefs,
      allowed_options: options, answer_example: String(group.answerExample ?? ''),
      proposed_change: group.proposedChange ?? null
    };
  }).sort((left, right) => left.group_id.localeCompare(right.group_id, 'en'));
  const base = {
    purpose: input.purpose, entry_context: input.entryContext,
    post_ready_control: postReadyControl, run_instance_id: input.runInstanceId,
    source_revision: input.sourceRevision, plan_digest: input.planDigest,
    plan_change_head_seq: input.planChangeHeadSeq, groups
  };
  return {
    presentation_id: `PRESENTATION-${digest(base).slice(0, 24)}`,
    ...base
  };
}

/** @param {any} sourcePack */
function workflowEvents(sourcePack) {
  /** @type {any[]} */
  const output = [];
  let invalidCollectionOrder = false;
  for (const [collection, values] of [
    ['decision_records', sourcePack?.decision_records],
    ['clarification_events', sourcePack?.clarification_events],
    ['execution_events', sourcePack?.execution_events]
  ]) {
    let prior = 0;
    for (let index = 0; index < records(values).length; index += 1) {
      const event = records(values)[index];
      const seq = Number(event.clarification_event_seq);
      output.push({ collection, index, seq, event });
      if (!Number.isSafeInteger(seq) || seq <= prior) invalidCollectionOrder = true;
      prior = seq;
    }
  }
  return { events: output.sort((left, right) => left.seq - right.seq), invalidCollectionOrder };
}

/** @param {any} presentation */
function allPresentedItems(presentation) {
  const byKey = new Map();
  for (const group of records(presentation?.groups)) for (const item of records(group.item_refs)) {
    byKey.set(itemKey(item), { item, group });
  }
  return byKey;
}

/** @param {any} record @param {any} input @param {any[]} diagnostics @param {string} path @param {string|null} optionCode @param {any[]} [itemRefs] */
function validPresentedRecord(record, input, diagnostics, path, optionCode, itemRefs = []) {
  const shown = input.currentPresentation;
  const groups = records(shown?.groups);
  const groupIds = new Set(groups.map((group) => group.group_id));
  const selectedIds = Array.isArray(record.decision_group_ids) ? record.decision_group_ids : [];
  let valid = Boolean(shown) && record.presentation_id === shown.presentation_id
    && selectedIds.length > 0 && selectedIds.every((/** @type {unknown} */ id) => groupIds.has(id));
  const selectedGroups = groups.filter((group) => selectedIds.includes(group.group_id));
  if (optionCode && !selectedGroups.every((group) => records(group.allowed_options)
    .some((option) => option.option_code === optionCode))) valid = false;
  const presented = new Set(selectedGroups.flatMap((group) => records(group.item_refs).map(itemKey)));
  if (itemRefs.some((ref) => !presented.has(itemKey(ref)))) valid = false;
  if (!valid) diagnostics.push(diagnostic(
    'PRESENTATION_BINDING_INVALID', path,
    'User records must bind the current displayed presentation, groups, items, and allowed option.'
  ));
  return valid;
}

/** @param {any} record @param {any} input */
function selectedProposedChange(record, input) {
  if (input.currentPresentation?.entry_context !== 'post_ready_change') return null;
  const selectedIds = Array.isArray(record.decision_group_ids)
    ? record.decision_group_ids.filter((/** @type {unknown} */ id) => typeof id === 'string') : [];
  const selected = records(input.currentPresentation?.groups).filter(
    (group) => selectedIds.includes(group.group_id)
  );
  if (selected.length === 0) return undefined;
  const proposals = selected.map((group) => group.proposed_change);
  return proposals.every((proposal) => canonicalStringify(proposal) === canonicalStringify(proposals[0]))
    ? proposals[0] : undefined;
}

/** @param {boolean} valid @param {any[]} diagnostics @param {string} path */
function validateProposedChange(valid, diagnostics, path) {
  if (!valid) diagnostics.push(diagnostic(
    'POST_READY_PROPOSED_CHANGE_MISMATCH', path,
    'The applied record must exactly implement the proposed change shown in the current preview.'
  ));
  return valid;
}

/** @param {any} event @param {any} input @param {any[]} diagnostics @param {string} path */
function eventBindingValid(event, input, diagnostics, path) {
  let valid = true;
  if (event.run_instance_id !== input.runInstanceId || event.run_identity_digest !== input.runIdentityDigest) {
    diagnostics.push(diagnostic('RUN_INTEGRITY_ERROR', path, 'Execution event run identity does not match this run.'));
    valid = false;
  }
  if (typeof event.authority_scope !== 'string' || !scopeContains(event.authority_scope, input.executionScope ?? 'checkout')) {
    diagnostics.push(diagnostic('EXECUTION_AUTHORITY_INVALID', `${path}/authority_scope`, 'Actor authority must contain the execution scope.'));
    valid = false;
  }
  return valid;
}

const DNE_REASONS_BY_STATUS = Object.freeze({
  grounded: new Set(['user_deferred', 'scope_excluded_for_run', 'other_explicit']),
  conditional: new Set(['temporary_rule_unconfirmed', 'authority_missing', 'user_deferred', 'scope_excluded_for_run', 'other_explicit']),
  blocked: new Set(['business_rule_missing', 'authority_missing', 'capability_unavailable', 'user_deferred', 'scope_excluded_for_run', 'other_explicit']),
  exploratory: new Set(['risk_not_adopted', 'user_deferred', 'scope_excluded_for_run', 'other_explicit'])
});

/** @param {any} event @param {any} input @param {Map<string,any>} itemsByKey @param {any[]} diagnostics @param {string} path */
function validateSetEvent(event, input, itemsByKey, diagnostics, path) {
  let valid = eventBindingValid(event, input, diagnostics, path);
  const presentation = input.currentPresentation;
  if (!presentation || event.presented_presentation_id !== presentation.presentation_id
    || event.presented_plan_digest !== input.planDigest) {
    diagnostics.push(diagnostic('PRESENTATION_BINDING_INVALID', path, 'Execution decision must bind the current presented plan.'));
    return false;
  }
  const groupIds = new Set(records(presentation.groups).map((group) => group.group_id));
  if (!Array.isArray(event.decision_group_ids) || event.decision_group_ids.length === 0
    || event.decision_group_ids.some((/** @type {string} */ id) => !groupIds.has(id))) {
    diagnostics.push(diagnostic('PRESENTATION_GROUP_INVALID', `${path}/decision_group_ids`, 'Decision group must be one of the displayed groups.'));
    valid = false;
  }
  const presented = allPresentedItems(presentation);
  const seen = new Set();
  for (let index = 0; index < records(event.decisions).length; index += 1) {
    const decision = records(event.decisions)[index];
    const key = itemKey(decision);
    const decisionPath = `${path}/decisions/${index}`;
    if (seen.has(key)) {
      diagnostics.push(diagnostic('EXECUTION_BATCH_DUPLICATE', decisionPath, 'One append batch cannot modify an item twice.'));
      valid = false;
    }
    seen.add(key);
    const current = itemsByKey.get(key);
    const shown = presented.get(key)?.item;
    if (!current || !shown || shown.item_semantic_digest !== current.item_semantic_digest
      || shown.item_semantic_change_head_seq !== current.item_semantic_change_head_seq
      || decision.item_semantic_digest !== current.item_semantic_digest
      || decision.item_semantic_change_head_seq !== current.item_semantic_change_head_seq) {
      diagnostics.push(diagnostic('PRESENTED_ITEM_VERSION_INVALID', decisionPath, 'Decision must bind the current displayed item digest and change head.'));
      valid = false;
      continue;
    }
    const group = presented.get(key).group;
    const postReadyChange = presentation.entry_context === 'post_ready_change'
      ? group.proposed_change : null;
    const optionValid = postReadyChange?.kind === 'change_execution_disposition'
      ? records(group.allowed_options).some((option) => option.option_code === 'apply')
        && decision.execution_disposition === postReadyChange.disposition
        && decision.reason_code === postReadyChange.reason_code
        && decision.reason === postReadyChange.reason
      : records(group.allowed_options).some((option) => option.option_code === decision.execution_disposition);
    if (!event.decision_group_ids.includes(group.group_id) || !optionValid) {
      diagnostics.push(diagnostic('PRESENTATION_OPTION_INVALID', decisionPath, 'Decision option must be allowed by the displayed group.'));
      valid = false;
    }
    if (decision.execution_disposition === 'execute' && (current.item_kind !== 'case' || current.semantic_status !== 'grounded'
      || decision.reason_code !== 'selected_for_run')) {
      diagnostics.push(diagnostic('EXECUTION_STATUS_INVALID', decisionPath, 'Only a Grounded Case may be Execute.'));
      valid = false;
    }
    if (decision.execution_disposition === 'do_not_execute'
      && (typeof decision.reason !== 'string' || decision.reason.trim().length === 0
        || decision.reason_code === 'not_applicable')) {
      diagnostics.push(diagnostic('EXECUTION_REASON_INVALID', decisionPath, 'User DoNotExecute requires a nonempty non-NotApplicable reason.'));
      valid = false;
    }
    const statusReasons = DNE_REASONS_BY_STATUS[/** @type {keyof typeof DNE_REASONS_BY_STATUS} */ (current.semantic_status)];
    if (decision.execution_disposition === 'do_not_execute'
      && !statusReasons?.has(decision.reason_code)) {
      diagnostics.push(diagnostic(
        'EXECUTION_REASON_STATUS_MISMATCH', `${decisionPath}/reason_code`,
        'DoNotExecute reason code does not match the item semantic status.'
      ));
      valid = false;
    }
  }
  return valid;
}

/** @param {any} event @param {any} input @param {any[]} diagnostics @param {string} path */
function validPause(event, input, diagnostics, path) {
  let valid = eventBindingValid(event, input, diagnostics, path);
  if (!input.currentPresentation || event.presented_presentation_id !== input.currentPresentation.presentation_id
    || event.presented_plan_digest !== input.planDigest) {
    diagnostics.push(diagnostic('PRESENTATION_BINDING_INVALID', path, 'Pause must bind the current presentation and plan.'));
    valid = false;
  }
  const expectedPending = [...allPresentedItems(input.currentPresentation).values()]
    .map((entry) => entry.item)
    .filter((item) => input.itemsByKey?.get(itemKey(item))?.execution_disposition === 'pending')
    .map(itemKey).sort();
  const submittedPending = records(event.pending_item_refs).map(itemKey).sort();
  if (canonicalStringify(submittedPending) !== canonicalStringify(expectedPending)) {
    diagnostics.push(diagnostic(
      'PAUSE_PENDING_SET_INVALID', `${path}/pending_item_refs`,
      'Pause must bind the exact pending item set displayed by the current presentation.'
    ));
    valid = false;
  }
  const expectedTarget = input.currentPresentation?.purpose === 'final_confirmation'
    ? 'final_confirmation' : 'execution_closure';
  if (event.resume_target !== expectedTarget) {
    diagnostics.push(diagnostic(
      'PAUSE_RESUME_TARGET_INVALID', `${path}/resume_target`,
      'Pause resume target must match the displayed workflow purpose.'
    ));
    valid = false;
  }
  return valid;
}

/** @param {any} event @param {any} input @param {any[]} diagnostics @param {string} path */
function validConfirmation(event, input, diagnostics, path) {
  let valid = eventBindingValid(event, input, diagnostics, path);
  const shown = input.currentPresentation;
  if (!shown || shown.purpose !== 'final_confirmation'
    || event.presented_prompt_id !== shown.presentation_id) {
    diagnostics.push(diagnostic('CONFIRMATION_PRESENTATION_INVALID', path, 'Confirmation must bind the latest final-confirmation presentation.'));
    valid = false;
  }
  if (event.presented_plan_digest !== input.planDigest
    || event.presented_plan_change_head_seq !== input.planChangeHeadSeq
    || event.presented_source_revision !== input.sourceRevision) {
    diagnostics.push(diagnostic('CONFIRMATION_VERSION_INVALID', path, 'Confirmation must bind the current revision, plan digest, and change head.'));
    valid = false;
  }
  return valid;
}

/** @param {any} event @param {any} input @param {Map<string,any>} itemsByKey @param {any[]} diagnostics @param {string} path */
function validReanalysis(event, input, itemsByKey, diagnostics, path) {
  const optionCode = input.currentPresentation?.entry_context === 'post_ready_change'
    ? 'apply' : 'request_reanalysis';
  let valid = validPresentedRecord(event, input, diagnostics, path, optionCode, records(event.affected_items));
  const proposed = selectedProposedChange(event, input);
  if (proposed && !validateProposedChange(
    proposed.kind === 'request_reanalysis'
      && canonicalStringify(strings(event.source_locator_ids)) === canonicalStringify(strings(proposed.source_locator_ids))
      && event.reason === proposed.reason,
    diagnostics, path
  )) valid = false;
  const locatorIds = new Set(records(input.sourcePack?.locators).map((locator) => locator.locator_id));
  if (!Array.isArray(event.source_locator_ids) || event.source_locator_ids.length === 0
    || event.source_locator_ids.some((/** @type {string} */ id) => !locatorIds.has(id))) {
    diagnostics.push(diagnostic(
      'REANALYSIS_LOCATOR_INVALID', `${path}/source_locator_ids`,
      'Reanalysis must name existing locators from the immutable source set.'
    ));
    valid = false;
  }
  const seen = new Set();
  for (let index = 0; index < records(event.affected_items).length; index += 1) {
    const ref = records(event.affected_items)[index];
    const key = itemKey(ref);
    const current = itemsByKey.get(key);
    if (seen.has(key) || !current
      || ref.item_semantic_digest !== current.item_semantic_digest
      || ref.item_semantic_change_head_seq !== current.item_semantic_change_head_seq) {
      diagnostics.push(diagnostic(
        'REANALYSIS_ITEM_VERSION_INVALID', `${path}/affected_items/${index}`,
        'Reanalysis must bind each current item version exactly once.'
      ));
      valid = false;
    }
    seen.add(key);
  }
  return valid;
}

/** @param {any} decision @param {any} input @param {Map<string,any>} itemsByKey @param {any[]} diagnostics @param {string} path */
function validExploratoryAdoption(decision, input, itemsByKey, diagnostics, path) {
  let valid = validPresentedRecord(
    decision, input, diagnostics, path,
    input.currentPresentation?.entry_context === 'post_ready_change' ? 'apply' : 'adopt',
    [{ item_kind: 'exploratory', item_id: decision.exploratory_id }]
  );
  const shown = input.currentPresentation;
  const proposed = selectedProposedChange(decision, input);
  if (proposed && !validateProposedChange(
    proposed.kind === 'supplement_business_rule' && decision.business_rule === proposed.text,
    diagnostics, path
  )) valid = false;
  const key = `exploratory\0${decision.exploratory_id}`;
  const item = itemsByKey.get(key);
  const presented = shown ? allPresentedItems(shown).get(key) : null;
  const groupIds = new Set(records(shown?.groups).map((group) => group.group_id));
  if (!shown || decision.presentation_id !== shown.presentation_id
    || !Array.isArray(decision.decision_group_ids) || decision.decision_group_ids.length === 0
    || decision.decision_group_ids.some((/** @type {string} */ id) => !groupIds.has(id))) valid = false;
  if (!item || item.semantic_status !== 'exploratory' || !presented
    || !decision.decision_group_ids.includes(presented.group.group_id)
    || decision.item_semantic_digest !== item.item_semantic_digest
    || decision.item_semantic_change_head_seq !== item.item_semantic_change_head_seq) {
    diagnostics.push(diagnostic('ADOPTION_ITEM_VERSION_INVALID', path, 'Exploratory adoption must bind the current displayed risk version.'));
    valid = false;
  }
  const locatorIds = new Set(records(input.sourcePack?.locators).map((locator) => locator.locator_id));
  if (!locatorIds.has(decision.evidence_ref) || decision.evidence_level !== 'E3'
    || !scopeContains(decision.authority_scope, decision.effective_scope)) {
    diagnostics.push(diagnostic('ADOPTION_AUTHORITY_INVALID', path, 'Exploratory adoption requires an E3 locator and authority covering its effective scope.'));
    valid = false;
  }
  return valid;
}

/** @param {any} decision @param {any} sourcePack @param {any[]} diagnostics @param {string} path */
function validDecisionSupersession(decision, sourcePack, diagnostics, path) {
  if (decision.disposition !== 'final') return true;
  const prior = records(sourcePack?.decision_records).filter((candidate) => (
    candidate.clarification_event_seq < decision.clarification_event_seq
  ));
  const decisionRoots = Array.isArray(decision.root_issue_ids) ? decision.root_issue_ids : [];
  const temporaryForRoots = prior.filter((candidate) => candidate.disposition === 'temporary'
    && (Array.isArray(candidate.root_issue_ids) ? candidate.root_issue_ids : [])
      .some((/** @type {unknown} */ root) => decisionRoots.includes(root)));
  const supplied = Array.isArray(decision.supersedes_decision_ids)
    ? decision.supersedes_decision_ids : [];
  let valid = true;
  for (const id of supplied) {
    const target = prior.find((candidate) => candidate.decision_id === id);
    if (!target || target.disposition !== 'temporary') {
      diagnostics.push(diagnostic('DECISION_SUPERSESSION_INVALID', `${path}/supersedes_decision_ids`, 'A final Decision may supersede only a retained temporary Decision.'));
      valid = false;
    }
  }
  if (temporaryForRoots.some((candidate) => !supplied.includes(candidate.decision_id))) {
    diagnostics.push(diagnostic('DECISION_SUPERSESSION_REQUIRED', `${path}/supersedes_decision_ids`, 'A final Decision for a temporary root must explicitly append its supersession link.'));
    valid = false;
  }
  return valid;
}

/** @param {any} input */
export function replayWorkflowHistory(input) {
  /** @type {any[]} */
  const diagnostics = [];
  const items = structuredClone(records(input.items));
  const itemsByKey = new Map(items.map((entry) => [itemKey(entry), entry]));
  const history = workflowEvents(input.sourcePack ?? {});
  const events = history.events;
  if (history.invalidCollectionOrder || events.some((entry, index) => entry.seq !== index + 1)) diagnostics.push(diagnostic(
    'WORKFLOW_EVENT_SEQUENCE_INVALID', '/', 'All workflow records must share one continuous globally unique sequence beginning at one.'
  ));
  const eventDigest = digest(events.map((entry) => ({
    collection: entry.collection, content: entry.event
  })));
  let planChangeHeadSeq = Number(input.planChangeHeadSeq ?? 0);
  const originalPlanChangeHeadSeq = planChangeHeadSeq;
  let activePause = input.priorActivePause ? structuredClone(input.priorActivePause) : null;
  const resumedPauseIds = new Set();
  let confirmation = input.priorConfirmation ? structuredClone(input.priorConfirmation) : null;
  let executionValid = diagnostics.length === 0;
  const batchSubjects = new Set();
  let batchHasPlanMutation = false;
  let batchHasConfirmation = false;
  for (const entry of events) {
    if (entry.seq <= Number(input.priorWorkflowEventHeadSeq ?? 0)) continue;
    /** @type {string[]} */
    let subjects = [];
    if (entry.collection === 'execution_events' && entry.event.type === 'set_dispositions') {
      subjects = records(entry.event.decisions).map((decision) => `item:${itemKey(decision)}`);
      batchHasPlanMutation = true;
    } else if (entry.collection === 'clarification_events' && entry.event.type === 'request_reanalysis') {
      subjects = records(entry.event.affected_items).map((ref) => `item:${itemKey(ref)}`);
      batchHasPlanMutation = true;
    } else if (entry.collection === 'decision_records' && entry.event.decision_type === 'exploratory_adoption') {
      subjects = [`item:exploratory\0${entry.event.exploratory_id}`];
      batchHasPlanMutation = true;
    } else if (entry.collection === 'decision_records') {
      subjects = (Array.isArray(entry.event.root_issue_ids) ? entry.event.root_issue_ids : [])
        .map((/** @type {unknown} */ root) => `root:${root}`);
      batchHasPlanMutation = true;
    } else if (entry.collection === 'clarification_events') {
      subjects = (Array.isArray(entry.event.root_issue_ids) ? entry.event.root_issue_ids : [])
        .map((/** @type {unknown} */ root) => `root:${root}`);
      batchHasPlanMutation = true;
    } else if (entry.collection === 'execution_events' && entry.event.type === 'confirm_execution_plan') {
      batchHasConfirmation = true;
    }
    for (const subject of subjects) {
      if (batchSubjects.has(subject)) {
        diagnostics.push(diagnostic(
          'WORKFLOW_BATCH_SUBJECT_DUPLICATE', '/',
          'One append batch cannot modify the same business decision object more than once.'
        ));
        executionValid = false;
      }
      batchSubjects.add(subject);
    }
  }
  if (batchHasPlanMutation && batchHasConfirmation) {
    diagnostics.push(diagnostic(
      'CONFIRMATION_BATCH_CONFLICT', '/',
      'A plan-changing reply must be recompiled and displayed before it can be confirmed.'
    ));
    executionValid = false;
  }
  for (const entry of events) {
    if (entry.seq <= Number(input.priorWorkflowEventHeadSeq ?? 0)) continue;
    if (entry.collection === 'clarification_events' && entry.event.type === 'request_reanalysis') {
      const beforeDiagnostics = diagnostics.length;
      if (!validReanalysis(entry.event, input, itemsByKey, diagnostics, `/clarification_events/${entry.index}`)
        || diagnostics.length !== beforeDiagnostics) {
        executionValid = false;
        continue;
      }
      planChangeHeadSeq = Math.max(planChangeHeadSeq, entry.seq);
      confirmation = null;
      continue;
    }
    if (entry.collection === 'clarification_events' && entry.event.type === 'reopen_root_issues') {
      if (!validPresentedRecord(
        entry.event, input, diagnostics, `/clarification_events/${entry.index}`,
        input.currentPresentation?.entry_context === 'post_ready_change' ? 'apply' : 'reopen_root_issues'
      )) {
        executionValid = false;
        continue;
      }
      const proposed = selectedProposedChange(entry.event, input);
      if (proposed && !validateProposedChange(
        proposed.kind === 'reopen_root_issues'
          && canonicalStringify(strings(entry.event.root_issue_ids)) === canonicalStringify(strings(proposed.root_issue_ids)),
        diagnostics, `/clarification_events/${entry.index}`
      )) {
        executionValid = false;
        continue;
      }
      planChangeHeadSeq = Math.max(planChangeHeadSeq, entry.seq);
      confirmation = null;
      continue;
    }
    if (entry.collection === 'clarification_events' && entry.event.type === 'request_delivery') {
      if (!validPresentedRecord(
        entry.event, input, diagnostics, `/clarification_events/${entry.index}`, 'request_delivery'
      )) executionValid = false;
      else {
        planChangeHeadSeq = Math.max(planChangeHeadSeq, entry.seq);
        confirmation = null;
      }
      continue;
    }
    if (entry.collection === 'decision_records') {
      if (entry.event.decision_type === 'exploratory_adoption') {
        if (!validExploratoryAdoption(
          entry.event, input, itemsByKey, diagnostics, `/decision_records/${entry.index}`
        )) {
          executionValid = false;
          continue;
        }
        planChangeHeadSeq = Math.max(planChangeHeadSeq, entry.seq);
        confirmation = null;
      } else if (['final', 'temporary', 'unknown', 'deferred'].includes(entry.event.disposition)) {
        const selectedItems = (Array.isArray(entry.event.affected_obligation_ids)
          ? entry.event.affected_obligation_ids : []).map((/** @type {unknown} */ itemId) => ({ item_kind: 'formal_test_point', item_id: itemId }));
        if (!validPresentedRecord(
          entry.event, input, diagnostics, `/decision_records/${entry.index}`,
          input.currentPresentation?.entry_context === 'post_ready_change' ? 'apply' : entry.event.disposition,
          selectedItems
        ) || !validDecisionSupersession(
          entry.event, input.sourcePack, diagnostics, `/decision_records/${entry.index}`
        )) {
          executionValid = false;
          continue;
        }
        const proposed = selectedProposedChange(entry.event, input);
        if (proposed && !validateProposedChange(
          proposed.kind === 'supplement_business_rule' && entry.event.answer === proposed.text,
          diagnostics, `/decision_records/${entry.index}`
        )) {
          executionValid = false;
          continue;
        }
        planChangeHeadSeq = Math.max(planChangeHeadSeq, entry.seq);
        confirmation = null;
      }
      continue;
    }
    if (entry.collection !== 'execution_events') continue;
    const path = `/execution_events/${entry.index}`;
    if (entry.event.type === 'set_dispositions') {
      const beforeDiagnostics = diagnostics.length;
      const valid = validateSetEvent(entry.event, input, itemsByKey, diagnostics, path);
      if (!valid || diagnostics.length !== beforeDiagnostics) {
        executionValid = false;
        continue;
      }
      let changed = false;
      for (const decision of records(entry.event.decisions)) {
        const current = itemsByKey.get(itemKey(decision));
        if (current.execution_disposition !== decision.execution_disposition
          || current.reason_code !== decision.reason_code || current.reason !== decision.reason
          || current.basis?.execution_event_id !== entry.event.event_id) changed = true;
        Object.assign(current, {
          execution_disposition: decision.execution_disposition,
          reason_code: decision.reason_code, reason: decision.reason,
          basis: { origin: 'user_execution_decision', execution_event_id: entry.event.event_id }
        });
      }
      if (changed) {
        planChangeHeadSeq = Math.max(planChangeHeadSeq, entry.seq);
        confirmation = null;
      }
    } else if (entry.event.type === 'pause_execution_closure') {
      if (validPause(entry.event, { ...input, itemsByKey }, diagnostics, path) && !activePause) activePause = entry.event;
      else {
        diagnostics.push(diagnostic('PAUSE_EVENT_INVALID', path, 'Only one current valid pause may be active.'));
        executionValid = false;
      }
    } else if (entry.event.type === 'resume_execution_closure') {
      if (!eventBindingValid(entry.event, input, diagnostics, path) || !activePause
        || activePause.event_id !== entry.event.pause_event_id || resumedPauseIds.has(entry.event.pause_event_id)) {
        diagnostics.push(diagnostic('PAUSE_RESUME_INVALID', path, 'Resume must reference the one current unmatched pause.'));
        executionValid = false;
      } else {
        resumedPauseIds.add(entry.event.pause_event_id);
        activePause = null;
      }
    } else if (entry.event.type === 'confirm_execution_plan') {
      if (validConfirmation(entry.event, { ...input, planChangeHeadSeq }, diagnostics, path)) confirmation = {
        confirmation_event_id: entry.event.event_id,
        confirmation_event_seq: entry.seq,
        presented_source_revision: entry.event.presented_source_revision,
        presented_prompt_id: entry.event.presented_prompt_id,
        confirmed_plan_digest: entry.event.presented_plan_digest,
        confirmed_plan_change_head_seq: entry.event.presented_plan_change_head_seq,
        actor: entry.event.actor, confirmed_at: entry.event.event_at,
        authority_scope: entry.event.authority_scope
      };
      else executionValid = false;
    } else {
      diagnostics.push(diagnostic('EXECUTION_EVENT_TYPE_INVALID', path, 'Unknown execution event type.'));
      executionValid = false;
    }
  }
  if (!executionValid) {
    for (let index = 0; index < items.length; index += 1) items[index] = structuredClone(input.items[index]);
    confirmation = null;
    planChangeHeadSeq = originalPlanChangeHeadSeq;
    activePause = input.priorActivePause ? structuredClone(input.priorActivePause) : null;
  }
  return {
    items,
    workflow_event_head_seq: events.length ? events[events.length - 1].seq : 0,
    workflow_event_log_digest: eventDigest,
    plan_change_head_seq: planChangeHeadSeq,
    active_pause: activePause ? structuredClone(activePause) : null,
    confirmation,
    diagnostics
  };
}
