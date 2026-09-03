import assert from 'node:assert/strict';
import test from 'node:test';
import { digest } from '../../src/canonical.mjs';
import { nextPreviewControl, processPreviewRequest } from '../../src/post-ready-preview.mjs';

const item = {
  item_kind: 'case', item_id: 'CASE-1', title: 'Pay invoice',
  item_semantic_digest: 'a'.repeat(64), execution_disposition: 'execute'
};
const ready = {
  run_instance_id: 'RUN-12345678-1234-4234-8234-123456789abc', source_revision: 2,
  bundle_digest: 'b'.repeat(64), plan_digest: 'c'.repeat(64),
  plan_change_head_seq: 7,
  confirmation_semantic_digest: 'd'.repeat(64), items: [item]
};

function initial() {
  return {
    preview_epoch: 0, preview_state: 'idle', active_preview_presentation: null,
    last_preview_request: null
  };
}

function openRequest(state = initial()) {
  const control = nextPreviewControl(ready, state, '0.2.0');
  return {
    operation: 'open_preview', request_instance_id: control.next_request_instance_id,
    expected_preview_epoch: control.expected_preview_epoch,
    run_instance_id: ready.run_instance_id, bound_source_revision: ready.source_revision,
    bound_bundle_digest: ready.bundle_digest, bound_plan_digest: ready.plan_digest,
    bound_confirmation_semantic_digest: ready.confirmation_semantic_digest,
    candidate_item_refs: [{
      item_kind: item.item_kind, item_id: item.item_id,
      item_semantic_digest: item.item_semantic_digest
    }],
    verbatim_user_request: 'Do not execute payment this time.',
    proposed_change: {
      kind: 'change_execution_disposition', disposition: 'do_not_execute',
      reason_code: 'scope_excluded_for_run', reason: 'Out of this run scope.'
    }
  };
}

test('open preview creates a bound post-ready presentation without changing ready state', () => {
  const request = openRequest();
  const result = processPreviewRequest({ request, state: initial(), ready, compilerVersion: '0.2.0' });
  assert.equal(result.kind, 'preview');
  assert.equal(result.state.preview_epoch, 1);
  assert.equal(result.state.preview_state, 'active');
  assert.equal(result.presentation.entry_context, 'post_ready_change');
  assert.equal(result.presentation.plan_change_head_seq, ready.plan_change_head_seq);
  assert.equal(result.presentation.post_ready_control.originating_request_instance_id, request.request_instance_id);
  assert.equal(result.presentation.groups[0].item_refs[0].item_id, item.item_id);
  assert.equal(result.ready_unchanged, true);
});

test('exact crash replay returns cached result but same request id with changed content is rejected', () => {
  const request = openRequest();
  const first = processPreviewRequest({ request, state: initial(), ready, compilerVersion: '0.2.0' });
  const replay = processPreviewRequest({ request, state: first.state, ready, compilerVersion: '0.2.0' });
  assert.equal(replay.kind, 'preview');
  assert.deepEqual(replay.presentation, first.presentation);
  const changed = structuredClone(request);
  changed.verbatim_user_request = 'Changed replay';
  const rejected = processPreviewRequest({ request: changed, state: first.state, ready, compilerVersion: '0.2.0' });
  assert.equal(rejected.kind, 'rejected');
  assert.equal(rejected.diagnostics[0].code, 'PREVIEW_REQUEST_REPLAY_INVALID');
});

test('replace invalidates the old presentation and cancel cannot be replayed to revive it', () => {
  const firstRequest = openRequest();
  const first = processPreviewRequest({ request: firstRequest, state: initial(), ready, compilerVersion: '0.2.0' });
  const replaceControl = nextPreviewControl(ready, first.state, '0.2.0');
  const replacementRequest = {
    ...openRequest(first.state), operation: 'replace_preview',
    request_instance_id: replaceControl.next_request_instance_id,
    expected_preview_epoch: replaceControl.expected_preview_epoch,
    replaces_presentation_id: first.presentation.presentation_id,
    verbatim_user_request: 'Actually keep it in the run.'
  };
  const replacement = processPreviewRequest({ request: replacementRequest, state: first.state, ready, compilerVersion: '0.2.0' });
  assert.equal(replacement.kind, 'preview');
  assert.notEqual(replacement.presentation.presentation_id, first.presentation.presentation_id);
  const replacedReplay = processPreviewRequest({
    request: firstRequest, state: replacement.state, ready, compilerVersion: '0.2.0'
  });
  assert.equal(replacedReplay.kind, 'rejected');

  const cancelControl = nextPreviewControl(ready, replacement.state, '0.2.0');
  const cancel = {
    operation: 'cancel_preview', request_instance_id: cancelControl.next_request_instance_id,
    expected_preview_epoch: cancelControl.expected_preview_epoch,
    run_instance_id: ready.run_instance_id, bound_source_revision: ready.source_revision,
    bound_bundle_digest: ready.bundle_digest, bound_plan_digest: ready.plan_digest,
    bound_confirmation_semantic_digest: ready.confirmation_semantic_digest,
    cancels_presentation_id: replacement.presentation.presentation_id
  };
  const closed = processPreviewRequest({ request: cancel, state: replacement.state, ready, compilerVersion: '0.2.0' });
  assert.equal(closed.kind, 'cancelled');
  assert.equal(closed.state.preview_state, 'closed');
  assert.equal(closed.state.active_preview_presentation, null);
  const staleReplay = processPreviewRequest({ request: firstRequest, state: closed.state, ready, compilerVersion: '0.2.0' });
  assert.equal(staleReplay.kind, 'rejected');

  const reopenedRequest = openRequest(closed.state);
  const reopened = processPreviewRequest({
    request: reopenedRequest, state: closed.state, ready, compilerVersion: '0.2.0'
  });
  assert.equal(reopened.kind, 'preview');
  assert.equal(reopened.state.preview_epoch, closed.state.preview_epoch + 1);
});

test('candidate semantic digest and all ready bindings are fail-closed', () => {
  const request = openRequest();
  request.candidate_item_refs[0].item_semantic_digest = digest('wrong');
  const result = processPreviewRequest({ request, state: initial(), ready, compilerVersion: '0.2.0' });
  assert.equal(result.kind, 'rejected');
  assert.equal(result.diagnostics[0].code, 'PREVIEW_BINDING_INVALID');
  assert.deepEqual(result.state, initial());
});
