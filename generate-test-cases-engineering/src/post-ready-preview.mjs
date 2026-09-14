import { canonicalStringify, digest } from './canonical.mjs';
import { createPresentationSnapshot } from './execution-events.mjs';

/** @param {string} code @param {string} path @param {string} message */
function diagnostic(code, path, message) {
  return { category: 'classification', code, path, message };
}

/** @param {unknown} value @returns {any[]} */
function records(value) {
  return Array.isArray(value) ? value.filter((item) => item && typeof item === 'object' && !Array.isArray(item)) : [];
}

/** @param {any} request */
function requestDigest(request) {
  return digest(request);
}

/** @param {any} ready @param {any} state @param {string} compilerVersion */
export function nextPreviewControl(ready, state, compilerVersion) {
  const expectedPreviewEpoch = Number(state?.preview_epoch ?? 0);
  return {
    expected_preview_epoch: expectedPreviewEpoch,
    next_request_instance_id: `PREVIEW-${digest({
      run_instance_id: ready.run_instance_id,
      source_revision: ready.source_revision,
      bundle_digest: ready.bundle_digest,
      plan_digest: ready.plan_digest,
      confirmation_semantic_digest: ready.confirmation_semantic_digest,
      preview_epoch: expectedPreviewEpoch,
      compiler_version: compilerVersion
    }).slice(0, 32)}`
  };
}

/** @param {any} request @param {any} ready @param {any} control */
function bindingsValid(request, ready, control) {
  return request.request_instance_id === control.next_request_instance_id
    && request.expected_preview_epoch === control.expected_preview_epoch
    && request.run_instance_id === ready.run_instance_id
    && request.bound_source_revision === ready.source_revision
    && request.bound_bundle_digest === ready.bundle_digest
    && request.bound_plan_digest === ready.plan_digest
    && request.bound_confirmation_semantic_digest === ready.confirmation_semantic_digest;
}

/** @param {any} request @param {any} ready */
function candidates(request, ready) {
  const byKey = new Map(records(ready.items).map((item) => [`${item.item_kind}\0${item.item_id}`, item]));
  const refs = records(request.candidate_item_refs);
  if (refs.length === 0) return null;
  const output = [];
  const seen = new Set();
  for (const ref of refs) {
    const key = `${ref.item_kind}\0${ref.item_id}`;
    const item = byKey.get(key);
    if (seen.has(key) || !item || item.item_semantic_digest !== ref.item_semantic_digest) return null;
    seen.add(key);
    output.push(item);
  }
  return output.sort((left, right) => `${left.item_kind}\0${left.item_id}`.localeCompare(`${right.item_kind}\0${right.item_id}`, 'en'));
}

/** @param {any} state @param {string} code @param {string} message @returns {any} */
function rejected(state, code, message) {
  return { kind: 'rejected', state: structuredClone(state), presentation: null, ready_unchanged: true, diagnostics: [diagnostic(code, '/', message)] };
}

/** @param {{request:any,state:any,ready:any,compilerVersion:string}} input @returns {any} */
export function processPreviewRequest({ request, state, ready, compilerVersion }) {
  const requestHash = requestDigest(request);
  const last = state?.last_preview_request;
  if (last?.request_instance_id === request?.request_instance_id) {
    if (last.request_digest === requestHash
      && state.preview_epoch === last.result_epoch
      && state.preview_state === last.result_state) return {
        kind: last.result_kind,
        state: structuredClone(state),
        presentation: last.cached_presentation ? structuredClone(last.cached_presentation) : null,
        ready_unchanged: true,
        diagnostics: []
      };
    return rejected(state, 'PREVIEW_REQUEST_REPLAY_INVALID', 'A preview request ID cannot be reused with changed content or after its result generation advanced.');
  }
  const control = nextPreviewControl(ready, state, compilerVersion);
  if (!bindingsValid(request, ready, control)) return rejected(
    state, 'PREVIEW_BINDING_INVALID', `Preview request does not bind the current ready result and compiler-issued epoch: ${canonicalStringify({
      expected_request_instance_id: control.next_request_instance_id,
      received_request_instance_id: request?.request_instance_id,
      expected_preview_epoch: control.expected_preview_epoch,
      received_preview_epoch: request?.expected_preview_epoch,
      expected_source_revision: ready.source_revision,
      received_source_revision: request?.bound_source_revision,
      expected_run_instance_id: ready.run_instance_id,
      received_run_instance_id: request?.run_instance_id,
      expected_bundle_digest: ready.bundle_digest,
      received_bundle_digest: request?.bound_bundle_digest,
      expected_plan_digest: ready.plan_digest,
      received_plan_digest: request?.bound_plan_digest,
      expected_confirmation_semantic_digest: ready.confirmation_semantic_digest,
      received_confirmation_semantic_digest: request?.bound_confirmation_semantic_digest,
      compiler_version: compilerVersion
    })}`
  );
  if (request.operation === 'cancel_preview') {
    if (state.preview_state !== 'active'
      || request.cancels_presentation_id !== state.active_preview_presentation?.presentation_id) return rejected(
      state, 'PREVIEW_STATE_INVALID', 'Cancel must bind the one active post-ready presentation.'
    );
    const next = {
      ...structuredClone(state), preview_epoch: state.preview_epoch + 1,
      preview_state: 'closed', active_preview_presentation: null
    };
    next.last_preview_request = {
      request_instance_id: request.request_instance_id, request_digest: requestHash,
      result_epoch: next.preview_epoch, result_state: next.preview_state,
      result_kind: 'cancelled', cached_presentation: null
    };
    return { kind: 'cancelled', state: next, presentation: null, ready_unchanged: true, diagnostics: [] };
  }
  const selected = candidates(request, ready);
  if (!selected) return rejected(
    state, 'PREVIEW_BINDING_INVALID', 'Every preview candidate must uniquely match a current ready-plan item and semantic digest.'
  );
  if (request.operation === 'open_preview') {
    if (!['idle', 'closed', 'consumed'].includes(state.preview_state)
      || state.active_preview_presentation) return rejected(
      state, 'PREVIEW_STATE_INVALID', 'Open preview requires an idle, closed, or consumed generation.'
    );
  } else if (request.operation === 'replace_preview') {
    if (state.preview_state !== 'active'
      || request.replaces_presentation_id !== state.active_preview_presentation?.presentation_id) return rejected(
      state, 'PREVIEW_STATE_INVALID', 'Replacement must bind the one active post-ready presentation.'
    );
  } else return rejected(state, 'PREVIEW_OPERATION_INVALID', 'Unknown preview operation.');

  const nextEpoch = state.preview_epoch + 1;
  const purpose = request.proposed_change?.kind === 'change_execution_disposition'
    ? 'execution_closure' : 'semantic_clarification';
  const presentation = createPresentationSnapshot({
    purpose, entryContext: 'post_ready_change',
    postReadyControl: {
      preview_epoch: nextEpoch,
      originating_request_instance_id: request.request_instance_id
    },
    runInstanceId: ready.run_instance_id,
    sourceRevision: ready.source_revision,
    planDigest: ready.plan_digest,
    planChangeHeadSeq: Number(ready.plan_change_head_seq ?? 0),
    groups: [{
      question: `Review this proposed change before applying it: ${request.verbatim_user_request}`,
      items: selected,
      allowedOptions: [
        { option_code: 'apply', label: 'Apply', meaning: 'Append the proposed change and recompile.' },
        { option_code: 'modify', label: 'Modify', meaning: 'Replace this preview without changing the ready result.' },
        { option_code: 'cancel', label: 'Cancel', meaning: 'Close the preview and retain the ready result.' }
      ],
      answerExample: `Apply ${canonicalStringify(request.proposed_change)}`,
      proposedChange: structuredClone(request.proposed_change)
    }]
  });
  const next = {
    ...structuredClone(state), preview_epoch: nextEpoch,
    preview_state: 'active', active_preview_presentation: presentation
  };
  next.last_preview_request = {
    request_instance_id: request.request_instance_id, request_digest: requestHash,
    result_epoch: next.preview_epoch, result_state: next.preview_state,
    result_kind: 'preview', cached_presentation: presentation
  };
  return { kind: 'preview', state: next, presentation, ready_unchanged: true, diagnostics: [] };
}
