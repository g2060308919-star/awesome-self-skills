import assert from 'node:assert/strict';
import test from 'node:test';
import { buildJourney, evaluateJourneyRevision } from '../helpers/run-journey.mjs';
import { completeSourcePack } from '../helpers/source-pack.mjs';
import { validateSourceIntegrity } from '../../src/decision-record.mjs';
import { validateEvidenceGraph } from '../../src/evidence.mjs';
import { sourceAssetReferences } from '../../src/source-audit.mjs';
import { validateAgainstSchema } from '../../src/schema-validator.mjs';
import sourceSchema from '../../skill/generate-test-cases/scripts/schemas/source-pack.schema.json' with { type: 'json' };
import evidenceSchema from '../../skill/generate-test-cases/scripts/schemas/evidence-claims.schema.json' with { type: 'json' };
import timingViews from '../fixtures/views/timing-obligations.json' with { type: 'json' };
import { compileObligations } from '../../src/obligations/compile-obligations.mjs';

test('required timing view compiles before/equal/after and rejects missing boundary binding', () => {
  const views = /** @type {any} */ (structuredClone(timingViews));
  const ids = views.views[0].source_claim_ids;
  views.obligation_inputs.view_contexts = [{ view_id: views.views[0].view_id,
    bindings: ['before', 'equal', 'after'].map((kind, i) => ({
      selector: { kind, element_id: 'timing_expiry' }, risk: 'medium',
      source_claim_ids: [ids[i]], required_oracle_refs: [ids[i]], required_capabilities: []
    }))
  }];
  const graph = {
    runScope: 'session.expiry',
    claimsById: new Map(ids.map((/** @type {string} */ claim_id) => [claim_id, { claim_id, kind: 'requirement', level: 'E3', scope: 'session.expiry' }])),
    factLedger: ids.slice(0, 3).map((/** @type {string} */ claim_id, /** @type {number} */ i) => ({
      fact_id: `fact_time_${i}`, claim_id, source_claim_ids: [claim_id], status: 'active',
      required_view_kinds: ['timing'], view_review_basis: 'Source defines the session expiry threshold.'
    }))
  };
  const result = compileObligations(graph, views);
  assert.ok(result.obligations.length >= 3);
  views.obligation_inputs.view_contexts[0].bindings = views.obligation_inputs.view_contexts[0].bindings.filter((/** @type {any} */ b) => b.selector.kind !== 'equal');
  assert.throws(() => compileObligations(graph, views), (/** @type {any} */ e) => e.status === 'need_revision');
});

function assetRevision(status = 'reviewed', classification = 'normative') {
  const revision = buildJourney('all-e3');
  const source = revision.source_pack.sources[0];
  const start = source.content.length + 1;
  source.content += '\n![layout](layout.png)';
  revision.source_pack.locators.push({
    locator_id: 'locator_asset', source_id: source.source_id, type: 'text-range',
    text_range: { start, end: source.content.length }, extraction_integrity: 'verified'
  });
  revision.source_pack.source_assets.push({
    asset_id: 'asset_layout', source_id: source.source_id, locator_id: 'locator_asset',
    uri: 'layout.png', status, classification,
    review_basis: { reviewer: 'fixture-author', method: 'visual inspection', evidence: 'Layout shows a checkout button.' }
  });
  revision.evidence_claims.claims.push({ ...revision.evidence_claims.claims[0],
    claim_id: 'claim_layout', value: 'Layout shows a checkout button.', source_locator_ids: ['locator_asset'] });
  completeSourcePack(revision.source_pack, revision.evidence_claims);
  return revision;
}

test('reviewed source asset supplies source-linked direct evidence', () => {
  const r = assetRevision();
  assert.deepEqual(validateAgainstSchema(r.source_pack, sourceSchema), []);
  assert.deepEqual(validateSourceIntegrity(r.source_pack), []);
  assert.deepEqual(validateEvidenceGraph(r.source_pack, r.evidence_claims).diagnostics, []);
  r.evidence_claims.claims.pop();
  assert.ok(validateEvidenceGraph(r.source_pack, r.evidence_claims).diagnostics.some(d => d.code === 'SOURCE_ASSET_UNCLAIMED'));
});

for (const status of ['unread', 'unavailable']) test(`${status} asset cannot be covered or excluded`, () => {
  for (const classification of ['normative', 'non_normative']) {
    const r = assetRevision(status, classification);
    assert.ok(validateSourceIntegrity(r.source_pack).some(d => d.code === 'SOURCE_ASSET_REVIEW_REQUIRED'));
  }
});

test('non-normative text and reviewed decoration require auditable dispositions', () => {
  const r = assetRevision('reviewed', 'non_normative');
  r.evidence_claims.claims.pop();
  completeSourcePack(r.source_pack, r.evidence_claims);
  assert.deepEqual(validateSourceIntegrity(r.source_pack), []);
  assert.deepEqual(validateEvidenceGraph(r.source_pack, r.evidence_claims).diagnostics, []);
  r.source_pack.source_reviews[0].spans.pop();
  assert.ok(validateSourceIntegrity(r.source_pack).some(d => d.code === 'SOURCE_REVIEW_COVERAGE_GAP'));
});

test('explicit reference images and HTML assets enter the syntactic inventory', () => {
  assert.equal(sourceAssetReferences('![a][diagram]\n![shortcut]\n<img src="a.png">').length, 3);
});

test('required matching decision view remains compilable', () => {
  const r = buildJourney('all-e3');
  r.evidence_claims.fact_ledger[0].required_view_kinds = ['decision'];
  const result = evaluateJourneyRevision(r);
  assert.notEqual(result.status, 'need_revision', JSON.stringify(result.diagnostics));
});

test('another fact cannot borrow the required view via supporting source claims', () => {
  const r = buildJourney('all-e3');
  r.evidence_claims.claims.push({ ...r.evidence_claims.claims[0], claim_id: 'claim_other', value: 'A separate approval decision.' });
  r.evidence_claims.fact_ledger.push({
    fact_id: 'fact_other', claim_id: 'claim_other', status: 'active',
    source_claim_ids: ['claim_other', 'claim_checkout'], required_view_kinds: ['decision'],
    view_review_basis: 'Independent approval decision requires its own modeled result.'
  });
  const result = evaluateJourneyRevision(r);
  assert.equal(result.status, 'need_revision');
  assert.ok(result.diagnostics.some((/** @type {any} */ d) => d.code === 'FACT_REQUIRED_VIEW_MISSING'));
});

test('new source/evidence JSON requires closed audit metadata', () => {
  const r = buildJourney('all-e3');
  delete r.source_pack.source_assets;
  assert.ok(validateAgainstSchema(r.source_pack, sourceSchema).some(d => d.path === '/source_assets'));
  delete r.evidence_claims.fact_ledger[0].required_view_kinds;
  assert.ok(validateAgainstSchema(r.evidence_claims, evidenceSchema).some(d => d.path.endsWith('/required_view_kinds')));
  r.source_pack.source_reviews[0].spans[0].review_basis.hidden = true;
  assert.ok(validateAgainstSchema(r.source_pack, sourceSchema).some(d => d.code === 'ADDITIONAL_PROPERTY'));
});

test('source image reference cannot disappear inside a non-normative span', () => {
  const revision = buildJourney('all-e3');
  revision.source_pack.sources[0].content += '\n![required layout](layout.png)';
  completeSourcePack(revision.source_pack, revision.evidence_claims);
  assert.ok(validateSourceIntegrity(revision.source_pack).some(d => d.code === 'SOURCE_ASSET_UNACCOUNTED'));
});

test('source span disposition requires review evidence', () => {
  const revision = buildJourney('all-e3');
  delete revision.source_pack.source_reviews[0].spans[0].review_basis;
  assert.ok(validateSourceIntegrity(revision.source_pack).some(d => d.code === 'SOURCE_REVIEW_BASIS_INVALID'));
});

for (const kind of ['state', 'input-domain', 'timing', 'integration']) test(`fact ${kind} requirement cannot be relabelled as a decision custom responsibility`, () => {
  const revision = buildJourney('all-e3');
  revision.evidence_claims.fact_ledger[0].required_view_kinds = [kind];
  revision.evidence_claims.fact_ledger[0].view_review_basis = 'Requirement defines an elapsed-time threshold.';
  revision.behavior_views.obligation_inputs.custom_responsibilities.push({
    responsibility_type: 'decision-outcome', semantic_key: 'relabeled-specialist',
    owner: { kind: 'facts', fact_ids: ['fact_checkout'] }, scope: 'checkout', risk: 'medium',
    source_claim_ids: ['claim_checkout'], required_oracle_refs: [], required_capabilities: []
  });
  const result = evaluateJourneyRevision(revision);
  assert.equal(result.status, 'need_revision');
  assert.ok(result.diagnostics.some((/** @type {any} */ d) => d.code === 'FACT_REQUIRED_VIEW_MISSING'), JSON.stringify(result.diagnostics));
});
