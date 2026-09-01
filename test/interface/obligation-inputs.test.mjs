import assert from 'node:assert/strict';
import { readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { digest } from '../../src/canonical.mjs';
import { evaluateRevision } from '../../src/core.mjs';
import {
  buildJourney, runInstalledRevision
} from '../helpers/run-journey.mjs';

const dimensions = [
  'shared-entity', 'role', 'client', 'interface-event',
  'time', 'concurrency', 'side-effect'
];
const sourceDigest = 'd'.repeat(64);

function emptyObligationInputs() {
  return {
    view_contexts: [], terminal_fact_routes: [],
    custom_responsibilities: [], combination_requests: []
  };
}

/** @param {Record<string, unknown>} selector @param {string[]} sourceClaimIds */
function binding(selector, sourceClaimIds) {
  return {
    selector, risk: 'high', source_claim_ids: sourceClaimIds,
    required_oracle_refs: [], required_capabilities: []
  };
}

function fourViewRevision() {
  const claimIds = [
    'claim_input', 'claim_role', 'claim_timing', 'claim_timeout',
    'claim_integration', 'claim_invariant', 'claim_idempotency'
  ];
  return {
    source_pack: {
      schema_version: '1.0.0', source_revision: 0, run_scope: 'checkout',
      sources: [{
        source_id: 'source_prd', kind: 'prd', version: '1', status: 'effective',
        authority: 'owner', content: 'Four view responsibilities.',
        content_digest: sourceDigest, scope: 'checkout'
      }],
      locators: [{
        locator_id: 'locator_prd', source_id: 'source_prd', type: 'text-range',
        text_range: { start: 0, end: 27 }, content_digest: sourceDigest,
        extraction_integrity: 'verified'
      }],
      source_policy: { rules: [{
        rule_id: 'policy_prd', source_ids: ['source_prd'], scope: 'checkout',
        authority: 'owner', status: 'effective'
      }] },
      decision_records: [], clarification_events: []
    },
    evidence_claims: {
      schema_version: '1.0.0', source_revision: 0,
      claims: claimIds.map((claimId) => ({
        claim_id: claimId, claim_form: 'direct', level: 'E3', kind: 'requirement',
        scope: 'checkout', value: claimId, source_locator_ids: ['locator_prd'],
        source_id: 'source_prd'
      })),
      fact_ledger: claimIds.map((claimId) => ({
        fact_id: `fact_${claimId.slice('claim_'.length)}`, claim_id: claimId,
        status: 'active', source_claim_ids: [claimId]
      }))
    },
    behavior_views: {
      schema_version: '1.0.0', source_revision: 0,
      views: [
        {
          view_id: 'view_input', type: 'input-domain', scope: 'checkout',
          source_claim_ids: ['claim_input'], relations: [], elements: [{
            element_id: 'input_amount', kind: 'input-domain', domain: 'amount',
            classes: [
              { class_id: 'class_valid', label: 'valid' },
              { class_id: 'class_invalid', label: 'invalid' }
            ],
            bounds: { lower: 1, upper: 100, inclusive: true },
            source_claim_ids: ['claim_input'], model_refs: []
          }]
        },
        {
          view_id: 'view_role', type: 'role', scope: 'checkout',
          source_claim_ids: ['claim_role'], relations: [], elements: [{
            element_id: 'role_operator', kind: 'role-permission', role: 'operator',
            permissions: ['allow-submit', 'deny-refund'],
            source_claim_ids: ['claim_role'], model_refs: []
          }]
        },
        {
          view_id: 'view_timing', type: 'timing', scope: 'checkout',
          source_claim_ids: ['claim_timing', 'claim_timeout'], relations: [], elements: [{
            element_id: 'timing_payment', kind: 'timing-rule', timing_event: 'payment',
            threshold: 30, order: 0,
            source_claim_ids: ['claim_timing', 'claim_timeout'], model_refs: []
          }]
        },
        {
          view_id: 'view_integration', type: 'integration', scope: 'checkout',
          source_claim_ids: [
            'claim_integration', 'claim_invariant', 'claim_idempotency'
          ],
          relations: [], elements: [{
            element_id: 'integration_payment', kind: 'integration-contract',
            request: { target: 'payments', payload: 'charge' },
            response: { status: 'accepted', body: 'payment' },
            persistence: { operation: 'write', target: 'orders' },
            event: { name: 'payment-settled', direction: 'publish' },
            callback: { target: 'checkout', event: 'settled' },
            compensation: { action: 'void', trigger: 'failure' },
            side_effects: [
              { kind: 'audit', target: 'audit-log' },
              { kind: 'notification', target: 'customer' }
            ],
            source_claim_ids: [
              'claim_integration', 'claim_invariant', 'claim_idempotency'
            ],
            model_refs: []
          }]
        }
      ],
      interaction_matrix: dimensions.map((dimension) => ({
        module_ids: ['checkout'], dimension, status: 'checked-no-signal'
      })),
      interaction_candidates: [],
      obligation_inputs: {
        view_contexts: [
          {
            view_id: 'view_input', bindings: [
              binding({ kind: 'equivalence-class', element_id: 'input_amount', class_id: 'class_valid' }, ['claim_input']),
              binding({ kind: 'equivalence-class', element_id: 'input_amount', class_id: 'class_invalid' }, ['claim_input']),
              binding({ kind: 'boundary', element_id: 'input_amount', boundary: 'lower' }, ['claim_input']),
              binding({ kind: 'boundary', element_id: 'input_amount', boundary: 'upper' }, ['claim_input'])
            ]
          },
          {
            view_id: 'view_role', bindings: [
              binding({ kind: 'permission', element_id: 'role_operator', permission: 'allow-submit' }, ['claim_role']),
              binding({ kind: 'permission', element_id: 'role_operator', permission: 'deny-refund' }, ['claim_role'])
            ]
          },
          {
            view_id: 'view_timing', bindings: [
              binding({ kind: 'before', element_id: 'timing_payment' }, ['claim_timing']),
              binding({ kind: 'equal', element_id: 'timing_payment' }, ['claim_timing']),
              binding({ kind: 'after', element_id: 'timing_payment' }, ['claim_timing']),
              binding({ kind: 'timeout', element_id: 'timing_payment', signal_claim_id: 'claim_timeout' }, ['claim_timeout'])
            ]
          },
          {
            view_id: 'view_integration', bindings: [
              ...['request', 'response', 'persistence', 'event', 'callback', 'compensation']
                .map((kind) => binding({ kind, element_id: 'integration_payment' }, ['claim_integration'])),
              binding({
                kind: 'side-effect', element_id: 'integration_payment',
                side_effect_kind: 'audit', target: 'audit-log'
              }, ['claim_integration']),
              binding({
                kind: 'side-effect', element_id: 'integration_payment',
                side_effect_kind: 'notification', target: 'customer'
              }, ['claim_integration']),
              binding({
                kind: 'invariant', element_id: 'integration_payment',
                signal_claim_id: 'claim_invariant'
              }, ['claim_invariant']),
              binding({
                kind: 'idempotency', element_id: 'integration_payment',
                signal_claim_id: 'claim_idempotency'
              }, ['claim_idempotency'])
            ]
          }
        ],
        terminal_fact_routes: [], custom_responsibilities: [], combination_requests: []
      }
    }
  };
}

/** @param {any} revision */
async function installedObligations(revision) {
  const run = await runInstalledRevision(revision, {
    stageNames: ['source_pack', 'evidence_claims', 'behavior_views']
  });
  try {
    assert.equal(run.reply.status, 'need_artifact', JSON.stringify(run.reply));
    assert.equal(run.reply.stage, 'case_drafts', JSON.stringify(run.reply));
    return JSON.parse(await readFile(
      path.join(run.runDirectory, 'derived/r000/test-obligations.json'), 'utf8'
    ));
  } finally {
    await rm(run.runDirectory, { recursive: true, force: true });
  }
}

test('installed obligation input compiles exact input role and timing integration counts with empty prebindings', async () => {
  const artifact = await installedObligations(fourViewRevision());
  const count = (/** @type {string} */ kind) => artifact.obligations.filter(
    (/** @type {any} */ item) => item.kind === kind
  ).length;
  assert.equal(count('input-domain'), 4);
  assert.equal(count('role'), 2);
  assert.equal(count('timing'), 4);
  assert.equal(count('integration'), 10);
  assert.equal(artifact.obligations.every((/** @type {any} */ item) => (
    item.required_oracle_refs.length === 0 && item.required_capabilities.length === 0
  )), true);
});

test('installed obligation input rejects missing duplicate unknown and flow selectors at behavior_views', async () => {
  const mutations = [
    {
      code: 'OBLIGATION_BINDING_MISSING',
      apply(/** @type {any} */ artifact) { artifact.obligation_inputs.view_contexts[0].bindings.pop(); }
    },
    {
      code: 'OBLIGATION_BINDING_DUPLICATE',
      apply(/** @type {any} */ artifact) {
        artifact.obligation_inputs.view_contexts[1].bindings.push(
          structuredClone(artifact.obligation_inputs.view_contexts[1].bindings[0])
        );
      }
    },
    {
      code: 'OBLIGATION_SELECTOR_UNKNOWN',
      apply(/** @type {any} */ artifact) {
        artifact.obligation_inputs.view_contexts[2].bindings[0].selector.element_id = 'timing_unknown';
      }
    },
    {
      code: 'OBLIGATION_VIEW_CONTEXT_TYPE_FORBIDDEN',
      apply(/** @type {any} */ artifact) {
        artifact.views.push({
          view_id: 'view_flow', type: 'flow', scope: 'checkout',
          source_claim_ids: [], elements: [], relations: []
        });
        artifact.obligation_inputs.view_contexts.push({ view_id: 'view_flow', bindings: [] });
      }
    },
    {
      code: 'OBLIGATION_SIDE_EFFECT_DUPLICATE',
      apply(/** @type {any} */ artifact) {
        artifact.views[3].elements[0].side_effects.push(
          structuredClone(artifact.views[3].elements[0].side_effects[0])
        );
      }
    }
  ];
  for (const mutation of mutations) {
    const revision = fourViewRevision();
    mutation.apply(revision.behavior_views);
    const run = await runInstalledRevision(revision, {
      stageNames: ['source_pack', 'evidence_claims', 'behavior_views']
    });
    try {
      assert.equal(run.reply.status, 'need_revision', mutation.code);
      assert.equal(run.reply.stage, 'behavior_views', mutation.code);
      assert.equal(run.reply.diagnostics.some((/** @type {any} */ item) => item.code === mutation.code), true,
        JSON.stringify(run.reply));
    } finally {
      await rm(run.runDirectory, { recursive: true, force: true });
    }
  }
});

test('obligation input binding claim and side-effect reorder preserves IDs counts and digest', async () => {
  const first = fourViewRevision();
  const second = structuredClone(first);
  second.behavior_views.obligation_inputs.view_contexts.reverse();
  for (const context of second.behavior_views.obligation_inputs.view_contexts) {
    context.bindings.reverse();
    for (const item of context.bindings) item.source_claim_ids.reverse();
  }
  /** @type {any} */ (second.behavior_views.views[3].elements[0]).side_effects.reverse();
  const [left, right] = await Promise.all([
    installedObligations(first), installedObligations(second)
  ]);
  assert.equal(left.obligations.length, 20);
  assert.equal(right.obligations.length, 20);
  assert.deepEqual(
    left.obligations.map((/** @type {any} */ item) => item.obligation_id),
    right.obligations.map((/** @type {any} */ item) => item.obligation_id)
  );
  assert.equal(digest(left), digest(right));
});

test('obligation input pure core accepts only four Agent artifacts and matches installed digest', async () => {
  const revision = buildJourney('all-e3');
  revision.behavior_views.obligation_inputs = emptyObligationInputs();
  const agentArtifacts = {
    source_pack: revision.source_pack,
    evidence_claims: revision.evidence_claims,
    behavior_views: revision.behavior_views,
    case_drafts: revision.case_drafts
  };
  const options = {
    systemLineage: {
      compiler_version: revision.compiler_version,
      lineage: {
        source_digest: digest(revision.source_pack),
        case_draft_digest: digest(revision.case_drafts)
      },
      expert_recall_limits: revision.expert_recall_limits
    },
    clarificationState: revision.clarification,
    interactionPolicy: 'pause_for_clarification',
    limits: ['Compilation is limited to the accepted immutable revision.']
  };
  const core = evaluateRevision(agentArtifacts, options);
  assert.equal(core.status, 'finished', JSON.stringify(core));
  const installed = await runInstalledRevision(revision);
  try {
    assert.equal(installed.reply.status, 'finished', JSON.stringify(installed.reply));
    assert.equal(/** @type {any} */ (core).bundle_digest, installed.reply.bundle_digest);
  } finally {
    await rm(installed.runDirectory, { recursive: true, force: true });
  }

  const injected = evaluateRevision({
    ...agentArtifacts, obligation_compilation: {}
  }, options);
  assert.equal(injected.status, 'need_revision');
  assert.equal(/** @type {any} */ (injected).stage, 'schema');
});
