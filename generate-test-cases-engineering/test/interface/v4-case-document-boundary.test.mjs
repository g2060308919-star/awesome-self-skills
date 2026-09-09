import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import test from 'node:test';
import * as execution from '../../src/execution-plan.mjs';
import {
  deriveV4ExecutionReadinessTarget, verifyAndRecomputeV4ExecutionReadiness
} from '../../src/execution-events.mjs';
import * as core from '../../src/core.mjs';

test('core exposes the two v4 compilation boundaries without adding a public CLI', () => {
  assert.equal(core.compileCaseDocument, execution.compileCaseDocument);
  assert.equal(core.compileExecutionPlanFromCaseDocument, execution.compileExecutionPlanFromCaseDocument);
});
test('structurally invalid delivered documents and invalid bindings cannot gain runner eligibility', async () => {
  for (const change of [
    (/** @type {any} */ manifest) => {manifest.authority='legacy_read_only';},
    (/** @type {any} */ manifest) => {manifest.run_id='RUN-other';},
    (/** @type {any} */ manifest) => {manifest.case_count=2;},
    (/** @type {any} */ manifest) => {manifest.result_kind='blocked_only';}
  ]) {
    const {request,snapshot}=fixture();
    const manifest=JSON.parse(snapshot.manifest_bytes);change(manifest);
    snapshot.manifest_bytes=JSON.stringify(manifest);request.case_document_ref.manifest_digest=hash(snapshot.manifest_bytes);
    await assert.rejects(()=>execution.compileExecutionPlanFromCaseDocument(request,{resolve:()=>snapshot,bindings:[]}),/MANIFEST|STRUCTURE/);
  }
  const {request,snapshot}=fixture();
  for (const bindings of [
    [{case_id:'CASE-unknown',disposition:'execute',availability:'verified'}],
    [{case_id:'CASE-a',disposition:'execute',availability:'verified'},{case_id:'CASE-a',disposition:'execute',availability:'verified'}],
    [{case_id:'CASE-a',disposition:'execute',availability:'invented'}]
  ]) await assert.rejects(()=>execution.compileExecutionPlanFromCaseDocument(request,{resolve:()=>snapshot,bindings}),/BINDING/);
  const conditional=JSON.parse(snapshot.bundle_bytes);conditional.cases[0].semantic_status='Conditional';
  snapshot.bundle_bytes=JSON.stringify(conditional);request.case_document_ref.bundle_digest=hash(snapshot.bundle_bytes);
  const manifest=JSON.parse(snapshot.manifest_bytes);manifest.bundle.digest=request.case_document_ref.bundle_digest;
  snapshot.manifest_bytes=JSON.stringify(manifest);request.case_document_ref.manifest_digest=hash(snapshot.manifest_bytes);
  const result=await execution.compileExecutionPlanFromCaseDocument(request,{resolve:()=>snapshot,bindings:[verifiedBinding(request.case_document_ref,'CASE-a','execute')]});
  assert.equal(result.runner_ready,false);assert.deepEqual(result.runner_projection.case_ids,[]);
  assert.equal(result.items[0].semantic_status,'Conditional');
});
test('Case Document rejects an execution intent or contaminated semantic result', () => {
  assert.throws(()=>execution.compileCaseDocument({semantic_input:{}},{semantic_compiler:()=>({})}),/INTENT/);
  for(const field of ['execution_plan','runner_projection','runner_case_ids','runner_ready','resource_readiness','execution_disposition']){
    assert.throws(()=>execution.compileCaseDocument({delivery_intent:'case_document',semantic_input:{}},{semantic_compiler:()=>({[field]:null})}),/EXECUTION_FIELD/);
  }
});
const hash = (/** @type {string} */ text) => 'sha256:' + createHash('sha256').update(text).digest('hex');
function fixture() {
  // v4 execution inherits the canonical Case Document business order. The
  // reference fixture therefore carries the same required ordered-case ledger
  // as a real delivered bundle rather than relying on storage-array order.
  const bundle = {schema_version:'4.0.0',compiler_version:'0.5.0',delivery_intent:'case_document',source_revision:0,ordered_case_ids:['CASE-a'],cases:[{case_id:'CASE-a',semantic_status:'Grounded',title:'显示来源'}]};
  const bundle_bytes = JSON.stringify(bundle);
  const manifest = {run_id:'RUN-doc',revision:0,schema_version:'4.0.0',compiler_version:'0.5.0',delivery_intent:'case_document',authority:'canonical',result_kind:'delivered_cases',bundle:{path:'output/r000/test-bundle.json',digest:hash(bundle_bytes)},markdown:{path:'output/r000/test-cases.md',digest:hash('md')},execution_worksheet:{path:'output/r000/execution-worksheet.csv',digest:hash('csv'),format:'csv'},render_options:{include_audit_appendix:false},case_count:1,blocked_root_count:0,closed_for_delivery_root_count:0,not_applicable_count:0,exploratory_count:0,completed_at:'2026-09-09T00:00:00Z'};
  const manifest_bytes = JSON.stringify(manifest);
  return {bundle, snapshot:{manifest_bytes,bundle_bytes},request:{delivery_intent:'execution_plan',case_document_ref:{run_id:'RUN-doc',revision:0,manifest_digest:hash(manifest_bytes),bundle_digest:hash(bundle_bytes)}}};
}
test('resolver bytes are captured once before hashing and parsing', async () => {
  const {snapshot,request}=fixture();
  const changed=JSON.parse(snapshot.bundle_bytes);changed.cases[0].case_id='CASE-substituted';
  let reads=0;
  const result=await execution.compileExecutionPlanFromCaseDocument(request,{resolve:()=>({
    manifest_bytes:snapshot.manifest_bytes,
    get bundle_bytes(){return ++reads<=2?snapshot.bundle_bytes:JSON.stringify(changed);}
  }),bindings:[verifiedBinding(request.case_document_ref,'CASE-a','execute')]});
  assert.equal(reads,1);assert.deepEqual(result.runner_projection.case_ids,['CASE-a']);
});
test('case compilation passes semantic input only and never invokes execution dependencies', () => {
  assert.equal(typeof execution.compileCaseDocument,'function');
  const compile = execution.compileCaseDocument;
  const input = {delivery_intent:'case_document',semantic_input:{title:'业务事实'},execution_resources:{availability:'unknown'}};
  let calls=0;
  const result=compile(input,{semantic_compiler(value){calls++;assert.deepEqual(value,{title:'业务事实'});return {cases:[],semantic:true};},execution_compiler(){throw Error('execution invoked');}});
  assert.equal(calls,1);
  assert.deepEqual(result,{cases:[],semantic:true});
  assert.deepEqual(compile({...input,execution_resources:{availability:'verified'}},{semantic_compiler:()=>result}),result);
});
test('execution requires a canonical ref and validates both exact byte digests before binding', async () => {
  assert.equal(typeof execution.compileExecutionPlanFromCaseDocument,'function');
  const {request,snapshot}=fixture();
  for(const field of /** @type {const} */ (['manifest_digest','bundle_digest'])){
    const bad=structuredClone(request);bad.case_document_ref[field]='sha256:'+'0'.repeat(64);
    await assert.rejects(()=>execution.compileExecutionPlanFromCaseDocument(bad,{resolve:()=>snapshot,bindings:[]}),/DIGEST/);
  }
  await assert.rejects(()=>execution.compileExecutionPlanFromCaseDocument({delivery_intent:'execution_plan',cases:[]},{resolve(){throw Error('must not resolve');},bindings:[]}),/REFERENCE/);
});
test('resource availability changes only the plan and nonempty grounded selection gates readiness', async () => {
  assert.equal(typeof execution.compileExecutionPlanFromCaseDocument,'function');
  const {request,snapshot}=fixture();const original=JSON.stringify(snapshot);
  const run=(/** @type {string} */ availability)=>execution.compileExecutionPlanFromCaseDocument(request,{resolve:()=>snapshot,bindings:[availability==='verified'
    ? verifiedBinding(request.case_document_ref,'CASE-a','execute')
    : {case_id:'CASE-a',disposition:'execute',availability}]});
  const pending=await run('unknown');assert.equal(pending.runner_ready,false);assert.deepEqual(pending.runner_projection.case_ids,[]);
  const ready=await run('verified');assert.equal(ready.result_kind,'execution_ready');assert.equal(ready.runner_ready,true);assert.deepEqual(ready.runner_projection.case_ids,['CASE-a']);assert.equal(ready.runner_projection.case_ids_digest,hash('["CASE-a"]'));
  const dne=await execution.compileExecutionPlanFromCaseDocument(request,{resolve:()=>snapshot,bindings:[{case_id:'CASE-a',disposition:'do_not_execute',availability:'unknown'}]});
  assert.equal(dne.result_kind,'no_execution_selected');assert.equal(dne.runner_ready,false);assert.equal(dne.runner_projection.case_ids_digest,hash('[]'));
  assert.equal(JSON.stringify(snapshot),original);
});

test('execution readiness accepts only a compiler-verifiable testability receipt bound to this Case and document', async () => {
  const {request,snapshot}=fixture();
  const run=(/** @type {any} */ capability_receipt)=>execution.compileExecutionPlanFromCaseDocument(request,{
    resolve:()=>snapshot,
    bindings:[{case_id:'CASE-a',disposition:'execute',availability:'verified',capability_receipt}]
  });
  await assert.rejects(()=>run(undefined),/BINDING/);
  const receipt=verifiedBinding(request.case_document_ref,'CASE-a','execute').capability_receipt;
  await assert.rejects(()=>run({...receipt,domain:'business_semantics'}),/BINDING/);
  const stale=structuredClone(receipt);stale.root_refs[0].root_version_digest='sha256:'+'f'.repeat(64);
  await assert.rejects(()=>run(stale),/BINDING/);
  const tampered=structuredClone(receipt);tampered.proof.value='verified_unavailable';
  await assert.rejects(()=>run(tampered),/BINDING/);
  await assert.rejects(()=>execution.compileExecutionPlanFromCaseDocument(request,{
    resolve:()=>snapshot,
    bindings:[{case_id:'CASE-a',disposition:'execute',availability:'unknown',capability_receipt:receipt}]
  }),/BINDING/);
  const accepted=await run(receipt);
  assert.equal(accepted.runner_ready,true);
  assert.deepEqual(accepted.runner_projection.case_ids,['CASE-a']);
});

/** @param {any} caseDocumentRef @param {string} caseId @param {string} disposition */
function verifiedBinding(caseDocumentRef,caseId,disposition){
  const target=deriveV4ExecutionReadinessTarget(caseDocumentRef,caseId);
  const result=verifyAndRecomputeV4ExecutionReadiness({
    root_refs:target.root_refs,case_ids:target.case_ids,
    proof:{type:target.proof_contract.type,value:'verified_available'},
    state:{case_document_ref:caseDocumentRef,execution_readiness_targets:[target]}
  });
  return {case_id:caseId,disposition,availability:'verified',capability_receipt:result.receipt};
}
