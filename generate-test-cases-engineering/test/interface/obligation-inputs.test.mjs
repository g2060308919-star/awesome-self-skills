import assert from 'node:assert/strict';
import { readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { digest, stableId } from '../../src/canonical.mjs';
import { evaluateRevision } from '../../src/core.mjs';
import { compileObligationInputs } from '../../src/obligations/compile-obligation-inputs.mjs';
import {
  buildJourney, completeJourneyRevision, runInstalledRevision
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

/** @param {Record<string, unknown>} selector @param {string[]} sourceClaimIds @param {string} [risk] */
function binding(selector, sourceClaimIds, risk = 'high') {
  return {
    selector, risk, source_claim_ids: sourceClaimIds,
    required_oracle_refs: [], required_capabilities: []
  };
}

function fourViewRevision() {
  const claimIds = [
    'claim_input', 'claim_role', 'claim_role_aux', 'claim_timing', 'claim_timeout',
    'claim_integration', 'claim_invariant', 'claim_idempotency'
  ];
  return {
    source_pack: {
      schema_version: '2.0.0', source_revision: 0, run_instance_id: 'RUN-12345678-1234-4234-8234-123456789abc', run_scope: 'checkout',
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
      decision_records: [], clarification_events: [], execution_events: []
    },
    evidence_claims: {
      schema_version: '2.0.0', source_revision: 0,
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
      schema_version: '2.0.0', source_revision: 0,
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
          source_claim_ids: ['claim_role', 'claim_role_aux'], relations: [], elements: [{
            element_id: 'role_operator', kind: 'role-permission', role: 'operator',
            permissions: ['allow-submit', 'deny-refund'],
            source_claim_ids: ['claim_role', 'claim_role_aux'], model_refs: []
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
              binding({ kind: 'permission', element_id: 'role_operator', permission: 'allow-submit' }, ['claim_role', 'claim_role_aux'], 'critical'),
              binding({ kind: 'permission', element_id: 'role_operator', permission: 'deny-refund' }, ['claim_role_aux'], 'low')
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
  const byId = new Map(artifact.obligations.map(
    (/** @type {any} */ item) => [item.obligation_id, item]
  ));
  /** @param {string} obligationId @param {string} kind @param {string[]} claims @param {string} [risk] */
  const assertSemanticObligation = (obligationId, kind, claims, risk = 'high') => {
    const obligation = byId.get(obligationId);
    assert.ok(obligation, `${kind} selector must map to ${obligationId}`);
    assert.equal(obligation.kind, kind);
    assert.equal(obligation.risk, risk);
    assert.deepEqual(obligation.source_claim_ids, claims);
  };

  const inputExpectations = [
    stableId('obligation', {
      kind: 'input-domain', responsibility: 'equivalence-class', scope: 'checkout',
      domain: 'amount', class: { class_id: 'class_valid', label: 'valid' }
    }),
    stableId('obligation', {
      kind: 'input-domain', responsibility: 'equivalence-class', scope: 'checkout',
      domain: 'amount', class: { class_id: 'class_invalid', label: 'invalid' }
    }),
    stableId('obligation', {
      kind: 'input-domain', responsibility: 'boundary', scope: 'checkout',
      domain: 'amount', boundary: 'lower', value: 1, inclusive: true
    }),
    stableId('obligation', {
      kind: 'input-domain', responsibility: 'boundary', scope: 'checkout',
      domain: 'amount', boundary: 'upper', value: 100, inclusive: true
    })
  ];
  for (const obligationId of inputExpectations) {
    assertSemanticObligation(obligationId, 'input-domain', ['claim_input']);
  }

  const allowId = stableId('obligation', {
    kind: 'role', responsibility: 'permission', scope: 'checkout',
    role: 'operator', permission: 'allow-submit'
  });
  const denyId = stableId('obligation', {
    kind: 'role', responsibility: 'permission', scope: 'checkout',
    role: 'operator', permission: 'deny-refund'
  });
  assertSemanticObligation(allowId, 'role', ['claim_role', 'claim_role_aux'], 'critical');
  assertSemanticObligation(denyId, 'role', ['claim_role_aux'], 'low');

  for (const relation of ['before', 'equal', 'after']) {
    assertSemanticObligation(stableId('obligation', {
      kind: 'timing', responsibility: 'threshold', scope: 'checkout',
      timing_element_id: 'timing_payment', order: 0, timing_event: 'payment',
      threshold: 30, threshold_relation: relation
    }), 'timing', ['claim_timing']);
  }
  assertSemanticObligation(stableId('obligation', {
    kind: 'timing', responsibility: 'timeout', scope: 'checkout',
    timing_element_id: 'timing_payment', order: 0, timing_event: 'payment',
    threshold: 30, signal: 'claim_timeout'
  }), 'timing', ['claim_timeout']);

  const integrationSurfaces = /** @type {Array<[string, Record<string, string>]>} */ ([
    ['request', { target: 'payments', payload: 'charge' }],
    ['response', { status: 'accepted', body: 'payment' }],
    ['persistence', { operation: 'write', target: 'orders' }],
    ['event', { name: 'payment-settled', direction: 'publish' }],
    ['callback', { target: 'checkout', event: 'settled' }],
    ['compensation', { action: 'void', trigger: 'failure' }]
  ]);
  for (const [surface, contract] of integrationSurfaces) {
    assertSemanticObligation(stableId('obligation', {
      kind: 'integration', responsibility: surface, scope: 'checkout',
      contract_element_id: 'integration_payment', [surface]: contract
    }), 'integration', ['claim_integration']);
  }
  for (const sideEffect of [
    { kind: 'audit', target: 'audit-log' },
    { kind: 'notification', target: 'customer' }
  ]) {
    assertSemanticObligation(stableId('obligation', {
      kind: 'integration', responsibility: 'side-effect', scope: 'checkout',
      contract_element_id: 'integration_payment', side_effect: sideEffect
    }), 'integration', ['claim_integration']);
  }
  assertSemanticObligation(stableId('obligation', {
    kind: 'integration', responsibility: 'invariant', scope: 'checkout',
    contract_element_id: 'integration_payment', invariant: 'claim_invariant'
  }), 'integration', ['claim_invariant']);
  assertSemanticObligation(stableId('obligation', {
    kind: 'integration', responsibility: 'idempotency', scope: 'checkout',
    contract_element_id: 'integration_payment', signal: 'claim_idempotency'
  }), 'integration', ['claim_idempotency']);
});

test('installed terminal and custom diagnostics use only their owning public input paths', async () => {
  const revision = fourViewRevision();
  /** @type {any[]} */ (
    revision.behavior_views.obligation_inputs.terminal_fact_routes
  ).push({
    fact_id: 'fact_unknown', disposition: 'blocked',
    issue_intent: {
      missing_type: 'requirement', scope: 'checkout', answerable: true, risk: 'high',
      reasons: ['Unknown formal fact.'], evidence_refs: []
    }
  });
  /** @type {any[]} */ (
    revision.behavior_views.obligation_inputs.custom_responsibilities
  ).push({
    responsibility_type: 'cross-module-interaction', semantic_key: 'missing-claim-audit-label',
    owner: { kind: 'facts', fact_ids: ['fact_input'] }, scope: 'checkout', risk: 'low',
    source_claim_ids: ['claim_missing'], required_oracle_refs: [], required_capabilities: []
  });
  const run = await runInstalledRevision(revision, {
    stageNames: ['source_pack', 'evidence_claims', 'behavior_views']
  });
  try {
    assert.equal(run.reply.status, 'need_revision', JSON.stringify(run.reply));
    const routeDiagnostic = run.reply.diagnostics.find(
      (/** @type {any} */ item) => item.code === 'FACT_ROUTE_UNKNOWN'
    );
    const customDiagnostic = run.reply.diagnostics.find(
      (/** @type {any} */ item) => item.code === 'CUSTOM_OBLIGATION_CLAIM_DANGLING'
    );
    assert.equal(routeDiagnostic?.path,
      '/obligation_inputs/terminal_fact_routes/0/fact_id');
    assert.equal(customDiagnostic?.path,
      '/obligation_inputs/custom_responsibilities/0/source_claim_ids');
    assert.equal(run.reply.diagnostics.some((/** @type {any} */ item) => (
      item.path.startsWith('/obligationCompilation/')
    )), false, JSON.stringify(run.reply));
  } finally {
    await rm(run.runDirectory, { recursive: true, force: true });
  }
});

test('installed obligation input rejects missing duplicate unknown out-of-scope and compiler-derived contexts at behavior_views', async () => {
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
      code: 'OBLIGATION_SELECTOR_UNKNOWN',
      apply(/** @type {any} */ artifact) {
        artifact.obligation_inputs.view_contexts[2].bindings[0].selector = {
          kind: 'permission', element_id: 'timing_payment', permission: 'allow-submit'
        };
      }
    },
    ...['flow', 'decision', 'state'].map((type) => ({
      code: 'OBLIGATION_VIEW_CONTEXT_TYPE_FORBIDDEN',
      apply(/** @type {any} */ artifact) {
        artifact.views.push({
          view_id: `view_${type}`, type, scope: 'checkout',
          source_claim_ids: [], elements: [], relations: []
        });
        artifact.obligation_inputs.view_contexts.push({ view_id: `view_${type}`, bindings: [] });
      }
    })),
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

test('installed obligation input rejects malformed nonempty reserved arrays instead of erasing them', async () => {
  for (const field of ['terminal_fact_routes', 'custom_responsibilities', 'combination_requests']) {
    for (const malformed of [null, 42, 'not-an-object']) {
      const revision = fourViewRevision();
      /** @type {any} */ (revision.behavior_views.obligation_inputs)[field] = [malformed];
      const run = await runInstalledRevision(revision, {
        stageNames: ['source_pack', 'evidence_claims', 'behavior_views']
      });
      try {
        assert.equal(run.reply.status, 'need_revision', `${field}: ${String(malformed)}`);
        assert.equal(run.reply.stage, 'behavior_views', `${field}: ${String(malformed)}`);
        assert.equal(run.reply.diagnostics.some((/** @type {any} */ item) => (
          item.category === 'schema' && item.path.startsWith(`/obligation_inputs/${field}/0`)
        )), true, JSON.stringify(run.reply));
      } finally {
        await rm(run.runDirectory, { recursive: true, force: true });
      }
    }
  }
});

test('obligation input compiler ignores the removed hidden fifth input', () => {
  const artifact = {
    schema_version: '2.0.0', source_revision: 7, views: [], interaction_matrix: [],
    interaction_candidates: [], obligation_inputs: emptyObligationInputs()
  };
  const clean = compileObligationInputs({}, artifact);
  const injected = compileObligationInputs({
    obligationCompilation: {
      sourceRevision: 99, contextsByViewId: new Map([['forged', {}]]),
      factRoutes: [{ fact_id: 'forged', route_type: 'blocked' }],
      notApplicableReviews: [{ fact_id: 'forged' }], customObligations: [{ forged: true }]
    }
  }, artifact);
  assert.deepEqual(injected, clean);
  assert.equal(injected.sourceRevision, 7);
});

test('obligation input pure core accepts only four Agent artifacts and matches installed digest', async () => {
  const revision = buildJourney('all-e3');
  revision.behavior_views.obligation_inputs = emptyObligationInputs();
  revision.limits = ['Compilation is limited to the accepted immutable revision.'];
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
    workflowState: null,
    interactionPolicy: 'pause_for_clarification',
    limits: ['Compilation is limited to the accepted immutable revision.']
  };
  const awaiting = evaluateRevision(agentArtifacts, options);
  assert.equal(awaiting.status, 'need_user_answers', JSON.stringify(awaiting));
  const core = completeJourneyRevision(revision);
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
