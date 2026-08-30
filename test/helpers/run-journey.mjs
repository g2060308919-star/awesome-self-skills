import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { canonicalStringify, digest, stableId } from '../../src/canonical.mjs';
import { evaluateRevision } from '../../src/core.mjs';

export const JOURNEY_NAMES = Object.freeze([
  'all-e3',
  'e1-conditional',
  'partial-blocked',
  'risk-only-exploratory',
  'all-blocked',
  'all-not-applicable',
  'local-source-conflict',
  'multi-module-interaction',
  'clarification-conditional',
  'clarification-grounded'
]);

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const runnerPath = path.join(
  repositoryRoot, 'skill/generate-test-cases/scripts/test-compiler.mjs'
);
const repetitionHarnessPath = path.join(
  repositoryRoot, 'test/fixtures/journeys/repeat-installed-runner.mjs'
);
const stageFiles = Object.freeze({
  source_pack: 'source-pack.json',
  evidence_claims: 'evidence-claims.json',
  behavior_views: 'behavior-views.json',
  case_drafts: 'case-drafts.json'
});
const stages = Object.freeze(Object.keys(stageFiles));
const dimensions = Object.freeze([
  'shared-entity', 'role', 'client', 'interface-event',
  'time', 'concurrency', 'side-effect'
]);
const baseContentDigest = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const alternateContentDigest = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
const revisedContentDigest = 'cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc';

/** @param {string} name @returns {Promise<any>} */
export async function loadJourneySpec(name) {
  return JSON.parse(await readFile(path.join(
    repositoryRoot, `test/fixtures/journeys/${name}.json`
  ), 'utf8'));
}

/** @param {any} rule */
function obligationId(rule) {
  return stableId('obligation', {
    kind: 'decision', responsibility: 'rule', scope: rule.scope,
    rule: {
      conditions: [...rule.conditions].sort(), result: rule.result,
      priority: rule.priority
    }
  });
}

/** @param {number} sourceRevision @param {number} eventSequence */
function initialClarificationState(sourceRevision, eventSequence) {
  return {
    source_revision: sourceRevision,
    clarification_event_seq: eventSequence,
    asked_root_issue_ids: [],
    root_issue_dispositions: [],
    last_pending_root_issue_ids: [],
    last_question_set_digest: '',
    clarification_stop: null,
    semantic_snapshot: null,
    root_snapshot_ledger: []
  };
}

/** @param {string[]} modules @param {any|null} candidate */
function interactionArtifacts(modules, candidate = null) {
  /** @type {any[]} */
  const matrix = [];
  const moduleSets = modules.length <= 1
    ? [[modules[0] ?? 'checkout']]
    : modules.flatMap((left, leftIndex) => modules.slice(leftIndex + 1).map((right) => [left, right]));
  for (const moduleIds of moduleSets) for (const dimension of dimensions) matrix.push({
    module_ids: [...moduleIds], dimension,
    status: candidate && candidate.dimension === dimension
      && canonicalStringify(candidate.module_ids) === canonicalStringify(moduleIds)
      ? 'candidate' : 'checked-no-signal'
  });
  return { matrix, candidates: candidate ? [candidate] : [] };
}

/** @param {string} key @param {Record<string, unknown>} [overrides] */
export function journeyRule(key, overrides = {}) {
  return {
    key,
    claimId: `claim_${key}`,
    factId: `fact_${key}`,
    locatorId: `locator_${key}`,
    viewId: `view_${key}`,
    elementId: `rule_${key}`,
    conditions: [`${key} is ready`],
    result: `${key} accepted`,
    priority: 0,
    scope: key,
    risk: 'high',
    level: 'E3',
    mode: 'case',
    hasOracle: true,
    capabilityStatus: 'provided',
    ...overrides
  };
}

/** @param {any} rule */
function decisionRecord(rule) {
  const disposition = rule.decisionDisposition ?? (rule.level === 'E1' ? 'temporary' : null);
  if (!disposition) return null;
  return {
    decision_id: `decision_${rule.key}`,
    question_id: `question_${rule.key}`,
    root_issue_ids: [`root_answer_${rule.key}`],
    affected_obligation_ids: [obligationId(rule)],
    clarification_event_seq: 0,
    confirmer: 'owner',
    confirmed_at: '2026-08-30',
    question: `What is the ${rule.key} result?`,
    answer: rule.result,
    disposition,
    authority_scope: rule.scope,
    effective_scope: rule.scope,
    evidence_ref: rule.locatorId,
    evidence_level: disposition === 'final' ? 'E3' : 'E1'
  };
}

/** @param {any} rule */
function evidenceClaim(rule) {
  const disposition = rule.decisionDisposition ?? (rule.level === 'E1' ? 'temporary' : null);
  if (disposition) return {
    claim_id: rule.claimId,
    claim_form: 'decision-record',
    level: disposition === 'final' ? 'E3' : 'E1',
    kind: disposition === 'final' ? 'requirement' : 'assumption',
    scope: rule.scope,
    value: rule.result,
    source_locator_ids: [rule.locatorId],
    decision_id: `decision_${rule.key}`,
    authority: rule.scope
  };
  return {
    claim_id: rule.claimId,
    claim_form: 'direct',
    level: 'E3',
    kind: rule.kind ?? 'requirement',
    scope: rule.scope,
    value: rule.result,
    source_locator_ids: [rule.locatorId],
    source_id: rule.sourceId ?? 'source_prd'
  };
}

/** @param {any} rule */
function behaviorView(rule) {
  return {
    view_id: rule.viewId,
    type: 'decision',
    scope: rule.scope,
    source_claim_ids: [rule.claimId],
    elements: [{
      element_id: rule.elementId,
      kind: 'decision-rule',
      conditions: [...rule.conditions],
      result: rule.result,
      priority: rule.priority,
      source_claim_ids: [rule.claimId],
      model_refs: []
    }],
    relations: []
  };
}

/** @param {any} rule */
function caseDraft(rule) {
  const id = obligationId(rule);
  const expectationId = `expectation_${rule.key}`;
  const precondition = canonicalStringify([{
    condition: rule.conditions[0], reachable_from: 'revision start'
  }]);
  const dataPartition = canonicalStringify([{
    name: 'scenario input', value: rule.key
  }]);
  /** @type {any} */
  const draft = {
    case_id: `case_${rule.key}`,
    title: `Verify ${rule.result}`,
    scope: rule.scope,
    risk: rule.risk,
    role: { value: 'tester', evidence_ref: rule.claimId, support_review: 'supported' },
    fact_ids: [rule.factId],
    obligation_ids: [id],
    source_claim_ids: [rule.claimId],
    preconditions: [{
      condition: rule.conditions[0],
      reachable_from: 'revision start',
      source_claim_ids: [rule.claimId],
      evidence_ref: rule.claimId,
      support_review: 'supported'
    }],
    data: [{
      name: 'scenario input', value: rule.key,
      provenance: { type: 'evidence', ref: rule.claimId },
      support_review: 'supported'
    }],
    steps: [{
      step_id: `step_${rule.key}`,
      action: `Exercise ${rule.key}`,
      action_evidence_ref: rule.claimId,
      support_review: 'supported',
      expectations: [{
        expectation_id: expectationId,
        business_assertion: rule.result,
        preceding_action_id: `step_${rule.key}`,
        observer: 'tester',
        observation_surface: 'UI',
        observation_target: 'result',
        oracle: { type: 'state', expected_state: rule.result, comparison: 'equals' },
        evidence_ref: rule.claimId,
        support_review: 'supported'
      }]
    }],
    testability_profile: {
      capabilities: [{
        capability: 'run-control', status: rule.capabilityStatus,
        ...(rule.capabilityStatus === 'unknown' ? {} : { provenance_ref: rule.claimId })
      }],
      observers: [{
        observer: 'tester', observation_target: 'result', status: 'verified',
        provenance_ref: rule.claimId
      }],
      controls: [{
        control: `exercise-${rule.key}`, status: 'provided', provenance_ref: rule.claimId
      }]
    },
    post_state: { state: rule.result, evidence_ref: rule.claimId, support_review: 'supported' },
    cleanup: {
      required: false,
      no_cleanup_reason: 'The scenario is isolated.',
      no_cleanup_evidence_ref: rule.claimId,
      support_review: 'supported'
    },
    evidence_refs: [rule.claimId],
    execution_signature: {
      role: 'tester',
      precondition_state: precondition,
      data_partition: dataPartition,
      action_path: [`Exercise ${rule.key}`],
      oracle_refs: [expectationId],
      test_point_ids: [id]
    }
  };
  if (rule.level === 'E1' || rule.capabilityStatus === 'approved-assumption') {
    draft.temporary_assumption = {
      claim_id: rule.claimId,
      invalidation_condition: 'A final rule replaces this temporary decision.'
    };
  }
  return draft;
}

/** @param {any} rule */
function blockerRootId(rule) {
  return stableId('root', {
    missing_type: 'oracle',
    semantic_refs: [rule.claimId, `${rule.viewId}#${rule.elementId}`].sort(),
    scope: rule.scope
  });
}

/**
 * Build an independently authored complete core revision. The helper uses only
 * the frozen stable-ID primitive to bind Case references to Test Points.
 * @param {any[]} rules
 * @param {{sourceRevision?:number,modules?:string[],interaction?:any,extraClaims?:any[],extraLocators?:any[],extraSources?:any[],extraPolicyRules?:any[],decisions?:any[]}} [options]
 */
export function revisionFromRules(rules, options = {}) {
  const pendingDecisions = options.decisions ?? rules.map(decisionRecord).filter(Boolean);
  const decisions = pendingDecisions.map((decision, index) => ({
    ...decision, clarification_event_seq: index + 1
  }));
  const sourceRevision = options.sourceRevision ?? (decisions.length > 0 ? 1 : 0);
  const baseSource = {
    source_id: 'source_prd', kind: 'prd', version: '1', status: 'effective',
    authority: 'owner', content: 'Frozen journey requirements.',
    content_digest: baseContentDigest, scope: '*'
  };
  const sources = [baseSource, ...(options.extraSources ?? [])];
  const locators = rules.map((rule, index) => ({
    locator_id: rule.locatorId,
    source_id: rule.sourceId ?? 'source_prd',
    type: 'text-range',
    text_range: { start: index, end: index + 1 },
    content_digest: rule.digest ?? baseContentDigest,
    extraction_integrity: 'verified'
  }));
  locators.push(...(options.extraLocators ?? []));
  const policyRules = [{
    rule_id: 'policy_prd', source_ids: ['source_prd'], scope: '*',
    authority: 'owner', status: 'effective'
  }, ...(options.extraPolicyRules ?? [])];
  const modules = options.modules ?? [...new Set(rules.map((rule) => rule.scope))];
  const interaction = options.interaction ?? interactionArtifacts(modules);
  const contexts = Object.fromEntries(rules.map((rule) => [rule.viewId, {
    riskByElementId: { [rule.elementId]: rule.risk },
    requiredOracleRefsByElementId: {
      [rule.elementId]: rule.hasOracle === false ? [] : [rule.claimId]
    },
    requiredCapabilitiesByElementId: {
      [rule.elementId]: rule.mode === 'not_applicable' ? [] : ['run-control']
    }
  }]));
  const claims = [...rules.map(evidenceClaim), ...(options.extraClaims ?? [])];
  const facts = rules.map((rule) => ({
    fact_id: rule.factId,
    claim_id: rule.claimId,
    status: 'active',
    source_claim_ids: [rule.claimId]
  }));
  const cases = rules.filter((rule) => rule.mode === 'case').map(caseDraft);
  const dispositions = rules.map((rule) => {
    const id = obligationId(rule);
    if (rule.mode === 'blocker') return {
      obligation_id: id,
      status: 'blocker',
      blocker_root_issue_id: blockerRootId(rule),
      evidence_refs: [rule.claimId]
    };
    if (rule.mode === 'not_applicable') return {
      obligation_id: id,
      status: 'not_applicable',
      exclusion_claim_id: 'claim_exclusion',
      scope: rule.scope,
      support_review: 'supported'
    };
    return { obligation_id: id, status: 'case_candidate', case_ids: [`case_${rule.key}`] };
  });
  return {
    schema_version: '1.0.0',
    source_revision: sourceRevision,
    compiler_version: '0.1.0',
    lineage: { source_digest: alternateContentDigest, case_draft_digest: revisedContentDigest },
    source_pack: {
      schema_version: '1.0.0', source_revision: sourceRevision, run_scope: '*',
      sources, locators, source_policy: { rules: policyRules },
      decision_records: decisions, clarification_events: []
    },
    evidence_claims: {
      schema_version: '1.0.0', source_revision: sourceRevision,
      claims, fact_ledger: facts
    },
    behavior_views: {
      schema_version: '1.0.0', source_revision: sourceRevision,
      views: rules.map(behaviorView),
      interaction_matrix: interaction.matrix,
      interaction_candidates: interaction.candidates
    },
    obligation_compilation: {
      contexts_by_view_id: contexts,
      fact_routes: [],
      not_applicable_reviews: [],
      custom_obligations: []
    },
    case_drafts: {
      schema_version: '1.0.0', source_revision: sourceRevision,
      cases, obligation_dispositions: dispositions, exploratory_candidates: []
    },
    clarification: {
      prior_state: initialClarificationState(sourceRevision, decisions.length),
      append_batch: { decision_records: [], clarification_events: [] }
    },
    limits: ['Compilation is limited to the supplied revision.'],
    expert_recall_limits: ['Expert recall is benchmark-only.']
  };
}

function notApplicableRevision() {
  const exclusion = {
    claim_id: 'claim_exclusion', claim_form: 'direct', level: 'E3',
    kind: 'requirement', scope: 'legacy', value: 'This scenario is excluded.',
    source_locator_ids: ['locator_exclusion'], source_id: 'source_prd'
  };
  return revisionFromRules([
    journeyRule('legacy', { mode: 'not_applicable', risk: 'low' })
  ], {
    extraClaims: [exclusion],
    extraLocators: [{
      locator_id: 'locator_exclusion', source_id: 'source_prd', type: 'text-range',
      text_range: { start: 100, end: 101 }, content_digest: baseContentDigest,
      extraction_integrity: 'verified'
    }]
  });
}

function conflictRevision() {
  const shipping = journeyRule('shipping', {
    sourceId: 'source_shipping', locatorId: 'locator_shipping',
    scope: 'checkout.shipping', result: 'shipping confirmed'
  });
  const payment = journeyRule('payment', {
    level: 'E1', decisionDisposition: 'temporary',
    sourceId: 'source_payment_new', locatorId: 'locator_payment_new',
    scope: 'checkout.payment', result: 'payment settles in two days', risk: 'critical'
  });
  const input = revisionFromRules([shipping, payment], {
    sourceRevision: 1,
    modules: ['checkout.shipping', 'checkout.payment'],
    extraSources: [
      {
        source_id: 'source_shipping', kind: 'prd', version: '1', status: 'effective',
        authority: 'shipping-owner', content: 'Shipping confirmation is shown.',
        content_digest: alternateContentDigest, scope: 'checkout.shipping'
      },
      {
        source_id: 'source_payment_old', kind: 'formal-rule', version: '1',
        status: 'effective', authority: 'payments-owner',
        content: 'Payments settle in one day.', content_digest: baseContentDigest,
        scope: 'checkout.payment'
      },
      {
        source_id: 'source_payment_new', kind: 'formal-rule', version: '2',
        status: 'effective', authority: 'payments-owner',
        content: 'Payments settle in two days.', content_digest: revisedContentDigest,
        scope: 'checkout.payment'
      }
    ],
    extraPolicyRules: [
      {
        rule_id: 'policy_shipping', source_ids: ['source_shipping'],
        scope: 'checkout.shipping', authority: 'shipping-owner', status: 'effective'
      },
      {
        rule_id: 'policy_payment_old', source_ids: ['source_payment_old'],
        scope: 'checkout.payment', authority: 'payments-owner', status: 'effective'
      },
      {
        rule_id: 'policy_payment_new', source_ids: ['source_payment_new'],
        scope: 'checkout.payment', authority: 'payments-owner', status: 'effective'
      }
    ]
  });
  input.source_pack.source_policy.rules = input.source_pack.source_policy.rules.filter(
    (/** @type {any} */ rule) => rule.rule_id !== 'policy_prd'
  );
  return input;
}

/** @param {any} input */
export function addExploratory(input) {
  const next = structuredClone(input);
  next.source_pack.locators.push({
    locator_id: 'locator_latency', source_id: 'source_prd', type: 'text-range',
    text_range: { start: 200, end: 201 }, content_digest: baseContentDigest,
    extraction_integrity: 'verified'
  });
  next.evidence_claims.claims.push({
    claim_id: 'claim_latency', claim_form: 'direct', level: 'E3',
    kind: 'description', scope: 'checkout', value: 'Latency is an investigation signal.',
    source_locator_ids: ['locator_latency'], source_id: 'source_prd'
  });
  const cell = next.behavior_views.interaction_matrix.find(
    (/** @type {any} */ item) => item.dimension === 'time'
  );
  cell.status = 'candidate';
  next.behavior_views.interaction_candidates.push({
    candidate_id: 'candidate_latency', module_ids: [...cell.module_ids], dimension: 'time',
    disposition: 'exploratory', exploratory_id: 'exploratory_latency'
  });
  next.case_drafts.exploratory_candidates.push({
    exploratory_id: 'exploratory_latency', title: 'Explore latency', scope: 'checkout',
    risk: 'medium', source_claim_ids: ['claim_latency']
  });
  return next;
}

/** @param {string} name */
export function buildJourney(name) {
  if (name === 'all-e3') return revisionFromRules([
    journeyRule('checkout', { scope: 'checkout' })
  ]);
  if (name === 'e1-conditional') {
    return revisionFromRules([journeyRule('checkout', {
      scope: 'checkout', level: 'E1', decisionDisposition: 'temporary'
    })]);
  }
  if (name === 'clarification-conditional' || name === 'clarification-grounded') {
    return revisionFromRules([journeyRule('checkout', { scope: 'checkout', hasOracle: false })]);
  }
  if (name === 'partial-blocked') return revisionFromRules([
    journeyRule('checkout', { scope: 'checkout' }),
    journeyRule('refund', { scope: 'refund', capabilityStatus: 'unknown', risk: 'critical' })
  ], { modules: ['checkout', 'refund'] });
  if (name === 'all-blocked') return revisionFromRules([
    journeyRule('refund', { scope: 'refund', capabilityStatus: 'unknown' })
  ]);
  if (name === 'all-not-applicable') return notApplicableRevision();
  if (name === 'risk-only-exploratory') return addExploratory(revisionFromRules([]));
  if (name === 'local-source-conflict') return conflictRevision();
  if (name === 'multi-module-interaction') {
    const candidate = {
      candidate_id: 'candidate_orders_payments',
      module_ids: ['orders', 'payments'],
      dimension: 'interface-event',
      disposition: 'formal-view',
      source_claim_ids: ['claim_checkout'],
      formal_view_id: 'view_checkout'
    };
    return revisionFromRules([journeyRule('checkout', { scope: 'checkout' })], {
      modules: ['orders', 'payments'],
      interaction: interactionArtifacts(['orders', 'payments'], candidate)
    });
  }
  throw new Error(`unknown Task 14 journey ${name}`);
}

/** @param {any} input @param {'pause_for_clarification'|'record_only'} [interactionPolicy] @returns {any} */
export function evaluateJourneyRevision(input, interactionPolicy = 'pause_for_clarification') {
  return evaluateRevision(input, { interactionPolicy });
}

/** @param {'clarification-conditional'|'clarification-grounded'} name */
export async function runClarificationJourney(name) {
  const fixtureName = name === 'clarification-conditional' ? 'to-conditional' : 'to-grounded';
  const specification = JSON.parse(await readFile(path.join(
    repositoryRoot, `test/fixtures/clarification/${fixtureName}.json`
  ), 'utf8'));
  if (specification.scenario !== name) throw new Error(`${fixtureName}: scenario mismatch`);
  const initial = buildJourney(name);
  const pending = evaluateJourneyRevision(initial);
  if (pending.status !== 'need_user_answers' || pending.pending_root_issues.length !== 1) {
    throw new Error(`${name}: expected one clarification root`);
  }
  const root = pending.pending_root_issues[0];
  const resolved = revisionFromRules([journeyRule('checkout', {
    scope: 'checkout',
    level: specification.decision.evidence_level,
    decisionDisposition: specification.decision.disposition
  })]);
  const decision = resolved.source_pack.decision_records[0];
  decision.root_issue_ids = [root.root_issue_id];
  decision.question_id = stableId('question', { root_issue_ids: decision.root_issue_ids });
  decision.affected_obligation_ids = [...root.affected_obligation_ids];
  decision.question = root.question;
  resolved.clarification.prior_state = pending.clarification_state;
  /** @type {any} */ (resolved.clarification.append_batch).decision_records = [
    structuredClone(decision)
  ];
  return { specification, initial, pending, resolved, result: evaluateJourneyRevision(resolved) };
}

/** @param {string} name @param {'pause_for_clarification'|'record_only'} [interactionPolicy] @returns {Promise<any>} */
export async function evaluateJourney(name, interactionPolicy) {
  if (name === 'clarification-conditional' || name === 'clarification-grounded') {
    return (await runClarificationJourney(name)).result;
  }
  const policy = interactionPolicy ?? (
    name === 'partial-blocked' || name === 'all-blocked' || name === 'local-source-conflict'
      ? 'record_only' : 'pause_for_clarification'
  );
  return evaluateJourneyRevision(buildJourney(name), policy);
}

/** @param {any} input @param {number} sourceRevision */
export function setSourceRevision(input, sourceRevision) {
  input.source_revision = sourceRevision;
  for (const artifact of [
    input.source_pack, input.evidence_claims, input.behavior_views, input.case_drafts
  ]) artifact.source_revision = sourceRevision;
  input.clarification.prior_state.source_revision = sourceRevision;
  if (input.clarification.prior_state.clarification_stop) {
    input.clarification.prior_state.clarification_stop.source_revision = sourceRevision;
  }
  return input;
}

/** @param {string} runDirectory @param {any} artifact @param {keyof typeof stageFiles} stage */
async function stageArtifact(runDirectory, artifact, stage) {
  const staging = path.join(runDirectory, 'staging');
  await mkdir(staging, { recursive: true });
  await writeFile(path.join(staging, stageFiles[stage]), `${JSON.stringify(artifact)}\n`, 'utf8');
}

/** @param {string[]} args @param {string} label */
function invokeNodeJson(args, label) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, {
      stdio: ['ignore', 'pipe', 'pipe']
    });
    if (child.pid) {
      try { os.setPriority(child.pid, 19); } catch {}
    }
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (/** @type {string} */ chunk) => { stdout += chunk; });
    child.stderr.on('data', (/** @type {string} */ chunk) => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', (/** @type {number|null} */ code) => {
      if (code !== 0) reject(new Error(`${label} exited ${code}: ${stderr}`));
      else {
        const lines = stdout.trimEnd().split('\n');
        if (lines.length !== 1) reject(new Error(`${label} emitted ${lines.length} lines`));
        else resolve(JSON.parse(lines[0]));
      }
    });
  });
}

/** @param {string} runDirectory @param {string[]} extraArgs */
function invokeRunner(runDirectory, extraArgs) {
  return invokeNodeJson([runnerPath, runDirectory, ...extraArgs], 'installed runner');
}

/**
 * Run a complete revision through the built, installed-shape script. Passing
 * null replays an existing run directory without staging new input.
 * @param {any|null} revision
 * @param {{runDirectory?:string,extraArgs?:string[],stageNames?:string[]}} [options]
 * @returns {Promise<any>}
 */
export async function runInstalledRevision(revision, options = {}) {
  const runDirectory = options.runDirectory ?? await mkdtemp(
    path.join(os.tmpdir(), 'generate-test-cases-journey-')
  );
  const extraArgs = options.extraArgs ?? [];
  const selectedStages = options.stageNames ?? stages;
  /** @type {any[]} */
  const replies = [];
  if (revision) {
    for (const stage of selectedStages) {
      await stageArtifact(runDirectory, revision[stage], /** @type {keyof typeof stageFiles} */ (stage));
      replies.push(await invokeRunner(runDirectory, extraArgs));
      if (replies.at(-1).status === 'need_revision'
        || replies.at(-1).status === 'need_user_answers'
        || replies.at(-1).status === 'fatal') break;
    }
  } else replies.push(await invokeRunner(runDirectory, extraArgs));
  const reply = replies.at(-1);
  let bundle = null;
  let bundleText = '';
  let markdown = '';
  if (reply.status === 'finished') {
    bundleText = await readFile(reply.bundle_path, 'utf8');
    bundle = JSON.parse(bundleText);
    markdown = await readFile(reply.markdown_path, 'utf8');
  }
  return {
    runDirectory, replies, reply, bundle, bundleText, markdown,
    bundleDigest: bundle ? digest(bundle) : '',
    markdownDigest: markdown ? digest(markdown) : ''
  };
}

/** @param {string} name */
export function runInstalledJourney(name) {
  return runInstalledRevision(buildJourney(name));
}

/**
 * Load the exact packaged entry script in one low-priority Node child while
 * giving every repetition a fresh ESM instance and run directory. This keeps
 * the installed entry shape (including its top-level main) under test without
 * creating 100 competing processes during the repository-wide parallel suite.
 * @param {string} name
 * @param {number} repetitions
 * @returns {Promise<any>}
 */
export async function runInstalledAcceptedRepetitions(name, repetitions) {
  const revision = buildJourney(name);
  const runRoot = await mkdtemp(
    path.join(os.tmpdir(), 'generate-test-cases-repetition-root-')
  );
  const revisionPath = path.join(runRoot, 'revision.json');
  await writeFile(revisionPath, `${JSON.stringify(revision)}\n`, 'utf8');
  try {
    return await invokeNodeJson([
      repetitionHarnessPath, runnerPath, revisionPath, String(repetitions), runRoot
    ], 'repetition harness');
  } finally {
    await rm(runRoot, { recursive: true, force: true });
  }
}
