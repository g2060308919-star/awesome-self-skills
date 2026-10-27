import test from 'node:test';
import assert from 'node:assert/strict';
import { validateExecutionFact, reduceActions, executionProvenance } from '../scripts/lib/execution-facts.mjs';
const cases={cases:[{case_id:'A',steps:[{step_id:'s',expected:[{oracle_id:'upload'},{oracle_id:'id'}]}]}]};
const log={events:[{sequence:1,type:'page_observation',checkpoint_ids:['A/s/id'],description:'Page accepts750x600'}]};
const adjustment={type:'preparation_adjustment',adjustment_id:'img',checkpoint_ids:['A/s/id'],classification:'preparation',original:{width:750,height:360},replacement:{width:750,height:600},basis_refs:[1],unchanged_goal_reason:'ID assertion independent of image dimensions',support_scope:'Save real record only',verification_refs:[1]};
test('preparation adjustment requires scoped visible facts, cannot replace core or mutate failed original',()=>{
 validateExecutionFact(cases,log,adjustment);
 assert.throws(()=>validateExecutionFact(cases,log,{...adjustment,classification:'core'}),/核心/);
 assert.throws(()=>validateExecutionFact(cases,log,{...adjustment,verification_refs:[99]}),/引用/);
 const ended={events:[{type:'checkpoint_result',checkpoint_id:'A/s/upload',result:'failed',status:'completed'}]};
 for(const type of ['checkpoint_result','checkpoint_started']) assert.throws(()=>validateExecutionFact(cases,ended,{type,checkpoint_id:'A/s/upload',result:'passed'}),/终结/);
});
test('one reducer prevents confirmed and uncertain writes from replay; observed non-submission can be retried',()=>{
 const events=[{type:'action_dispatched',action_id:'a',side_effect:true},{type:'effect_observed',action_id:'a',outcome:'confirmed_success'}, {type:'action_dispatched',action_id:'b',side_effect:true},{type:'action_planned',action_id:'c',side_effect:true}];
 assert.deepEqual([...reduceActions(events).values()].map(v=>[v.action_id,v.state,v.replay_allowed]),[['a','confirmed_success',false],['b','dispatched_unknown',false],['c','unissued',true]]);
 assert.throws(()=>validateExecutionFact(cases,{events},{type:'action_dispatched',action_id:'a',side_effect:true}),/重复/);
 assert.throws(()=>validateExecutionFact(cases,{events},{type:'effect_observed',action_id:'b',outcome:'not_submitted',description:'Maybe timeout'}),/依据/);
});
test('control stages distinguish fill, confirmation, visible readback and file/save',()=>{
 const base={type:'form_interaction',interaction_id:'date',checkpoint_ids:['A/s/id'],control_kind:'date',method:'component-confirm',description:'Date accepted'};
 const e={...base,stage:'tool_filled'}; validateExecutionFact(cases,log,e);
 assert.throws(()=>validateExecutionFact(cases,{events:[...log.events,e]},{...base,stage:'readback',actual_value:'2026-10-27',fact_refs:[1]}),/确认/);
 const confirmed={...base,stage:'confirmed',fact_refs:[1]}; validateExecutionFact(cases,{events:[...log.events,e]},confirmed);
 validateExecutionFact(cases,{events:[...log.events,e,confirmed]},{...base,stage:'readback',actual_value:'2026-10-27',fact_refs:[1]});
});
test('provenance keeps original failure and supplementary facts without extra result rows; rejects secrets and paths',()=>{
 const state={events:[adjustment,{type:'supplementary_attempt',attempt_id:'extra',checkpoint_ids:['A/s/upload'],phase:'result',result:'passed',description:'Different fixture accepted'}]};
 const p=executionProvenance(state,['A/s/upload','A/s/id']); assert.equal(p.adjustments.length,1); assert.equal(p.supplementary.length,1);
 assert.throws(()=>validateExecutionFact(cases,log,{...adjustment,replacement:{token:'private'}}),/秘密/);
 assert.throws(()=>validateExecutionFact(cases,log,{...adjustment,replacement:{path:'../outside.png'}}),/路径/);
});

test('A32/A38: stale or cross-action facts cannot prove not_submitted and reopen an uncertain write',()=>{
 const dispatched={type:'action_dispatched',action_id:'write',checkpoint_id:'A/s/id',side_effect:true,sequence:3};
 for(const fact of [
  {type:'page_observation',sequence:2,action_id:'write',checkpoint_ids:['A/s/id']},
  {type:'page_observation',sequence:4,action_id:'other',checkpoint_ids:['A/s/id']},
  {type:'page_observation',sequence:4,action_id:'write',checkpoint_ids:['A/s/upload']}
 ]) assert.throws(()=>validateExecutionFact(cases,{events:[dispatched,fact]},{type:'effect_observed',action_id:'write',outcome:'not_submitted',fact_refs:[fact.sequence],description:'Incorrect reuse'}),/本动作/);
});
