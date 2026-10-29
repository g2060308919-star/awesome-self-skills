import assert from 'node:assert/strict';
import * as sourceApi from '../../src/entry.mjs';
/** Prepare fixed test semantics against the actual accepted prefix. Does not
 * manufacture or complete review; protocol review fixtures stay explicit.
 * @param {string} directory @param {any} draft @param {any} [api] */
export async function prepareCaseFixture(directory,draft,api=sourceApi){
 const reply=await api.advanceStrict(directory);
 const {schema_version,source_revision,case_context_digest,...payload}=draft;
 const prepared=await api.prepareStageArtifact(directory,reply,{stage:'case_drafts',payload});
 assert.equal(prepared.status,'prepared',JSON.stringify(prepared).slice(0,3000));
 return prepared.artifact;
}

/** Explicit protocol simulator for transport/recovery tests ONLY. It does not
 * establish source-first semantic correctness; real sample attestations live
 * in test/fixtures/remediation and never call this helper.
 * @param {string} directory @param {any} reply @param {any} draft @param {any} [api] */
export async function completeProtocolReviewFixture(directory,reply,draft,api=sourceApi){
 const {writeFile}=await import('node:fs/promises');
 const {default:path}=await import('node:path');
 const request=reply.review_request;assert.ok(request);
 const completed=structuredClone(draft);
 completed.independent_review=api.constructIndependentReviewCompletionV4(reply,{
  target_assessments:request.source_first_targets.map((/** @type {any} */ target)=>({
   target_id:target.target_id,disposition:'verified',source_claim_ids:target.source_claim_ids,decision_ids:target.decision_ids,
   affected_items:[{item_kind:'formal_test_point',item_id:request.review_target_projection.formal_test_points[0].formal_test_point_id}],
   rationale:'Protocol simulation only; no real semantic review asserted.',
   required_recheck:{status:'passed',affected_items:[{item_kind:'formal_test_point',item_id:request.review_target_projection.formal_test_points[0].formal_test_point_id}]}
  })),findings:[]
 });
 const candidate=await prepareCaseFixture(directory,completed,api);
 await writeFile(path.join(directory,'staging/case-drafts.json'),JSON.stringify(candidate));
 return api.advanceStrict(directory);
}
