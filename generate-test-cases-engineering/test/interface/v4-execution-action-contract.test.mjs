import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import * as actions from '../../src/execution-events.mjs';
import * as executionRun from '../../src/execution-run-v4.mjs';
import {validateAgainstSchema} from '../../src/schema-validator.mjs';
import {buildJourney} from '../helpers/run-journey.mjs';
import {sourceBoundaryFixture} from '../helpers/v4-source-boundary.mjs';
const context = () => ({run_id:'RUN-exec',presentation_id:'PRES-exec',
  case_document_ref:{run_id:'RUN-doc',revision:0,manifest_digest:'sha256:'+'1'.repeat(64),bundle_digest:'sha256:'+'2'.repeat(64)},
  case_ids:['CASE-a'],root_refs:[{root_issue_id:'ROOT-a',root_version_digest:'sha256:'+'3'.repeat(64)}]});
const active = () => ({...context(),delivery_intent:'execution_plan',phase:'execution_closure',
  execution_readiness_targets:[actions.deriveV4ExecutionReadinessTarget(context().case_document_ref,'CASE-a')]});
test('[BR-16][BR-17] pending next steps are derived from the displayed actions and never invent capability proof for Conditional-only Cases', () => {
  const state = {...active(), execution_readiness_targets: []};
  const presentation = actions.createV4ExecutionPresentation(state, {
    verify_and_recompute_readiness: actions.verifyAndRecomputeV4ExecutionReadiness
  });
  assert.equal(typeof executionRun.createV4ExecutionPendingReply, 'function');
  const reply = executionRun.createV4ExecutionPendingReply(state.run_id, presentation);
  const advertised = [...new Set([
    ...presentation.items.flatMap((/** @type {any} */ item) => item.available_actions),
    ...presentation.run_actions
  ])];
  assert.deepEqual(reply.user_next_steps.map((/** @type {any} */ item) => item.action), advertised);
  assert.equal(advertised.includes('provide_capability_proof'), false);
});
test('intent and phase are checked independently on presentation and submission', async () => {
  const state=active();const presentation=actions.createV4ExecutionPresentation(state,{});
  for(const change of [{delivery_intent:'case_document'},{phase:'requirements_analysis'}]){
    assert.throws(()=>actions.createV4ExecutionPresentation({...state,...change},{}),/PHASE|INTENT/);
    await assert.rejects(()=>actions.applyV4ExecutionAction({...state,...change},presentation,{...presentation.items[0].action_context,event_type:'pause_execution'},{}),/PHASE|INTENT/);
  }
});
test('proof is hidden without verifier and verified recomputation is isolated to one root', async () => {
  const targetA=actions.deriveV4ExecutionReadinessTarget(context().case_document_ref,'CASE-a');
  const targetB=actions.deriveV4ExecutionReadinessTarget(context().case_document_ref,'CASE-b');
  const state={...active(),case_ids:['CASE-a','CASE-b'],execution_readiness_targets:[targetA,targetB],
    readiness:{[targetA.root_refs[0].root_issue_id]:false,[targetB.root_refs[0].root_issue_id]:false}};
  assert.equal(actions.createV4ExecutionPresentation(state,{}).items.some(item=>item.available_actions.includes('provide_capability_proof')),false);
  let calls=0;
  const services={verify_and_recompute_readiness:async (/** @type {any} */ input)=>{
    calls++;assert.deepEqual(input.root_refs,targetA.root_refs);
    return actions.verifyAndRecomputeV4ExecutionReadiness(input);
  }};
  const p=actions.createV4ExecutionPresentation(state,services);
  const item=p.items.find(item=>item.available_actions.includes('provide_capability_proof')&&item.root_refs[0].root_issue_id===targetA.root_refs[0].root_issue_id);
  const event={...item.action_context,event_type:'provide_capability_proof',proof:{type:item.proof_contract.type,value:'verified_available'}};
  const result=await actions.applyV4ExecutionAction(state,p,event,services);
  assert.equal(calls,1);assert.deepEqual(result.state.readiness,{[targetA.root_refs[0].root_issue_id]:true,[targetB.root_refs[0].root_issue_id]:false});assert.equal(state.readiness[targetA.root_refs[0].root_issue_id],false);
  assert.equal(result.state.capability_receipts[0].domain,'testability');
  assert.deepEqual(result.state.capability_receipts[0].case_ids,['CASE-a']);
  assert.equal(result.state.capability_receipts[0].ready,true);
  const unavailable=await actions.applyV4ExecutionAction(state,p,{
    ...event,proof:{type:item.proof_contract.type,value:'verified_unavailable'}
  },services);
  assert.equal(unavailable.state.readiness[targetA.root_refs[0].root_issue_id],false);
  assert.equal(unavailable.state.capability_receipts[0].domain,'testability');
  assert.equal(unavailable.state.capability_receipts[0].ready,false);
  await assert.rejects(()=>actions.applyV4ExecutionAction(state,p,{...event,proof:{type:item.proof_contract.type,value:'false'}},services),/PROOF/);
});
test('Case targets are independent and reopen has a stable schema-valid identity', async () => {
  const state={...active(),case_ids:['CASE-a','CASE-b']};
  /** @type {any} */ let seen;
  const services={semantic_reopen_handler:async (/** @type {any} */ event)=>{seen=event;return {sibling_run_id:'child'};}};
  const p=actions.createV4ExecutionPresentation(state,services);
  const item=p.items.find(item=>item.available_actions.includes('set_execution_disposition')&&item.case_ids[0]==='CASE-a');
  const result=await actions.applyV4ExecutionAction(state,p,{...item.action_context,event_type:'set_execution_disposition',disposition:'do_not_execute'},services);
  assert.deepEqual(result.state.dispositions,{'CASE-a':'do_not_execute'});
  const reopen=p.items.find(item=>item.available_actions.includes('reopen_semantic_question'));
  assert.equal(typeof reopen.action_context.reopen_event_id,'string');
  assert.deepEqual(actions.createV4ExecutionPresentation(state,services),p);
  await actions.applyV4ExecutionAction(state,p,{...reopen.action_context,event_type:'reopen_semantic_question'},services);
  assert.equal(seen.reopen_event_id,reopen.action_context.reopen_event_id);
});
test('each execution item requires business-readable rationale and outcomes', async () => {
  const schema=JSON.parse(await readFile(new URL('../../skill/generate-test-cases/scripts/schemas/reply.schema.json',import.meta.url),'utf8'));
  const p=actions.createV4ExecutionPresentation(active(),{});
  for(const item of p.items)for(const field of ['why','decision_impact','unresolved_outcome'])assert.ok(item[field]?.trim());
  for(const field of ['why','decision_impact','unresolved_outcome']){
    const bad=structuredClone(p);delete bad.items[0][field];
    assert.notDeepEqual(validateAgainstSchema(bad,{$defs:schema.$defs,$ref:'#/$defs/v4ExecutionPresentation'}),[]);
  }
});
test('reopen identity and business fields are enforced by the closed public schemas', async () => {
  const source=JSON.parse(await readFile(new URL('../../skill/generate-test-cases/scripts/schemas/source-pack.schema.json',import.meta.url),'utf8'));
  const reply=JSON.parse(await readFile(new URL('../../skill/generate-test-cases/scripts/schemas/reply.schema.json',import.meta.url),'utf8'));
  const p=actions.createV4ExecutionPresentation(active(),{semantic_reopen_handler:async()=>({})});
  const item=p.items.find(item=>item.available_actions.includes('reopen_semantic_question'));
  const event={...item.action_context,event_type:'reopen_semantic_question'};
  assert.deepEqual(validateAgainstSchema(event,{$defs:source.$defs,$ref:'#/$defs/v4ExecutionEvent'}),[]);
  delete event.reopen_event_id;
  assert.notDeepEqual(validateAgainstSchema(event,{$defs:source.$defs,$ref:'#/$defs/v4ExecutionEvent'}),[]);
  for(const field of ['why','decision_impact','unresolved_outcome']){
    const bad=structuredClone(p);delete bad.items[0][field];
    assert.notDeepEqual(validateAgainstSchema(bad,{$defs:reply.$defs,$ref:'#/$defs/v4ExecutionPresentation'}),[]);
  }
});
test('[P-06][BR-16][BR-17] every advertised v4 execution action constructs a schema-valid event and routes without mutating parents', async () => {
  assert.equal(typeof actions.createV4ExecutionPresentation,'function');
  const parent={...active(),bindings:[],paused:false};const before=structuredClone(parent);
  let reopened=0;
  /** @type {any} */ let delivered;
  const services={verify_and_recompute_readiness:actions.verifyAndRecomputeV4ExecutionReadiness,semantic_reopen_handler:async (/** @type {any} */ event)=>{reopened++;delivered=event;return {sibling_run_id:'RUN-child'};}};
  const presentation=actions.createV4ExecutionPresentation(parent,services);
  const replySchema=JSON.parse(await readFile(new URL('../../skill/generate-test-cases/scripts/schemas/reply.schema.json',import.meta.url),'utf8'));
  const reply={status:'need_user_answers',phase:'execution_closure',run_id:parent.run_id,
    produced_artifacts:[],incomplete_reason:{code:'EXECUTION_PENDING',summary:'执行准备待处理'},
    user_next_steps:[{action:'pause_execution',description:'暂停执行'}],recovery:{mode:'append',description:'提交展示动作'},
    non_blocking_diagnostics:[],execution_presentation:presentation};
  assert.deepEqual(validateAgainstSchema(reply,replySchema),[]);
  assert.notDeepEqual(validateAgainstSchema({...reply,phase:'requirements_analysis'},replySchema),[]);
  const schema=JSON.parse(await readFile(new URL('../../skill/generate-test-cases/scripts/schemas/source-pack.schema.json',import.meta.url),'utf8'));
  const eventSchema={$defs:schema.$defs,$ref:'#/$defs/v4ExecutionEvent'};
  for(const item of presentation.items)for(const action of item.available_actions){
    const event={event_type:action,...item.action_context};
    if(action==='provide_capability_proof') event.proof={type:item.proof_contract.type,value:'verified_available'};
    if(action==='set_execution_disposition') event.disposition='do_not_execute';
    assert.deepEqual(validateAgainstSchema(event,eventSchema),[]);
    const result=await actions.applyV4ExecutionAction(parent,presentation,event,services);
    if(action==='pause_execution') assert.equal(result.state.paused,true);
    if(action==='set_execution_disposition') assert.deepEqual(result.state.dispositions,{'CASE-a':'do_not_execute'});
    if(action==='provide_capability_proof') {
      assert.deepEqual(result.state.capability_receipts[0].proof,event.proof);
      assert.equal(result.state.capability_receipts[0].domain,'testability');
    }
    if(action==='reopen_semantic_question') assert.equal(result.sibling_run_id,'RUN-child');
  }
  assert.equal(reopened,1);assert.deepEqual(delivered.case_document_ref,parent.case_document_ref);
  assert.deepEqual(delivered.root_refs,parent.root_refs);assert.equal(delivered.run_id,parent.run_id);
  assert.deepEqual(parent,before);
});
test('unimplemented reopen is not advertised and stale or phase-inappropriate events fail before handlers', async () => {
  assert.equal(typeof actions.createV4ExecutionPresentation,'function');
  const parent={...active(),bindings:[]};const presentation=actions.createV4ExecutionPresentation(parent,{});
  assert.equal(presentation.items[0].available_actions.includes('reopen_semantic_question'),false);
  const event={event_type:'pause_execution',...presentation.items[0].action_context};
  await assert.rejects(()=>actions.applyV4ExecutionAction(parent,presentation,{...event,presentation_id:'PRES-stale'},{}),/STALE/);
  await assert.rejects(()=>actions.applyV4ExecutionAction(parent,presentation,{...event,event_type:'answer_question_part'},{}),/ACTION/);
});

test('v4 execution events pass the full Source Pack discriminator but cannot enter v3 or Case Document', async () => {
  const schema=JSON.parse(await readFile(new URL('../../skill/generate-test-cases/scripts/schemas/source-pack.schema.json',import.meta.url),'utf8'));
  assert.deepEqual(validateAgainstSchema(buildJourney('all-e3').source_pack,schema),[]);
  const source=sourceBoundaryFixture().pack;
  source.delivery_intent='execution_plan';
  source.case_document_ref=context().case_document_ref;
  source.execution_events=[{event_type:'pause_execution',...context()}];
  assert.deepEqual(validateAgainstSchema(source,schema),[]);
  source.schema_version='3.0.0';assert.notDeepEqual(validateAgainstSchema(source,schema),[]);
  source.schema_version='4.0.0';source.delivery_intent='case_document';delete source.case_document_ref;
  assert.notDeepEqual(validateAgainstSchema(source,schema),[]);
});
