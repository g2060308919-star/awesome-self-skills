import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {initializeFixtureRun,recordFixtureEvent,fixtureState} from './test-helpers.mjs';
import {recordEvent,validateRun,generateReport,resumeCheck} from '../scripts/run-artifacts.mjs';
import {buildReportModel} from '../scripts/lib/report-model.mjs';
import {reproducibleFailure} from '../scripts/lib/failed-explanation.mjs';
import {renderChatTableMarkdown} from '../scripts/lib/report.mjs';
async function fixture(t) {
 const root=await mkdtemp(path.join(os.tmpdir(),'latest-results-')); t.after(()=>rm(root,{recursive:true,force:true}));
 const input=JSON.parse(await readFile(new URL('./fixtures/test-cases.json',import.meta.url),'utf8'));
 const first=input.cases[0]; first.case_id='COMBINED'; first.title='Upload acceptance and independent ID'; first.steps=[{step_id:'s',action:'Upload original image, then independently save using an accepted preparation baseline',expected:[{oracle_id:'upload',text:'Accept750x360 image and4MB'},{oracle_id:'id',text:'Real save produces new ID and UI detail shows it'}]}];
 input.cases.push({...structuredClone(first),case_id:'ID',title:'Independent real ID',steps:[{step_id:'s',action:'Save record with ordinary image baseline',expected:[{oracle_id:'id',text:'New ID is visible'}]}]});
 const inputPath=path.join(root,'input.json');await writeFile(inputPath,JSON.stringify(input));
 return initializeFixtureRun({workspaceRoot:root,casesPath:inputPath,runId:'preparation'});
}
test('A24–A27/A33: failed upload preserved, independent ID passes after scoped preparation; report shares exact rows and provenance',async t=>{
 const run=await fixture(t); const cp='COMBINED/s/upload';
 await recordFixtureEvent(run.runRoot,{type:'checkpoint_started',checkpoint_id:cp});
 await recordFixtureEvent(run.runRoot,{type:'checkpoint_result',checkpoint_id:cp,result:'failed',reason:reproducibleFailure({operations:'上传原图，失败发生在校验图片。',expected:'Accept750x360 image and4MB',actual:'页面拒绝了这两张图片，列表没有新记录',difference:'750x360100000-byte and4000000-byte images rejected'}),evidence_status:'missing'});
 const fact=await recordEvent(run.runRoot,{type:'page_observation',checkpoint_ids:['COMBINED/s/id','ID/s/id'],description:'Component fixture: accepted750x600100000-byte preparation is available; screenshot absent in this component test'});
 await recordEvent(run.runRoot,{type:'preparation_adjustment',adjustment_id:'image',checkpoint_ids:['COMBINED/s/id','ID/s/id'],classification:'preparation',original:{width:750,height:360,bytes:100000},replacement:{width:750,height:600,bytes:100000},basis_refs:[fact.sequence],unchanged_goal_reason:'Both ID assertions depend on real save, not image dimensions or fixed asset identity',support_scope:'ID checkpoints only; upload assertion remains failed',verification_refs:[fact.sequence]});
 for(const checkpoint_id of ['COMBINED/s/id','ID/s/id']) {
  await recordFixtureEvent(run.runRoot,{type:'checkpoint_started',checkpoint_id});
  await recordFixtureEvent(run.runRoot,{type:'checkpoint_result',checkpoint_id,result:'passed',reason:'Real save yielded REC-NEW with matching UI list/detail',evidence_status:'missing'});
 }
 const before=await readFile(path.join(run.runRoot,'execution-log.json'));
 await assert.rejects(recordEvent(run.runRoot,{type:'checkpoint_result',checkpoint_id:cp,result:'passed',reason:'Replacement accepted',evidence_status:'missing'}),/终结/);
 assert.deepEqual(await readFile(path.join(run.runRoot,'execution-log.json')),before);
 await recordEvent(run.runRoot,{type:'supplementary_attempt',attempt_id:'fixed-observation',checkpoint_ids:[cp],phase:'started',source:'real',description:'Observe alternative image without promoting original upload rule'});
 const observation=await recordEvent(run.runRoot,{type:'page_observation',checkpoint_ids:[cp],description:'Alternative accepted; original expected remains unchanged'});
 await recordEvent(run.runRoot,{type:'supplementary_attempt',attempt_id:'fixed-observation',checkpoint_ids:[cp],phase:'result',source:'real',result:'passed',description:'Only alternative image accepted',fact_refs:[observation.sequence]});
 await validateRun(run.runRoot);
 const {snapshot,log}=await fixtureState(run.runRoot); const model=buildReportModel(snapshot,log);
 assert.deepEqual(model.rows.map(row=>[row.case_id,row.result]),[['COMBINED','failed'],['ID','passed']]);
 assert.equal(model.case_details[0].provenance.adjustments.length,1); assert.equal(model.case_details[0].provenance.supplementary.length,2);
 assert.equal(model.case_details[0].steps[0].expected[0].result,'failed');
 const report=await generateReport(run.runRoot); const html=await readFile(report.htmlReportPath,'utf8');
 assert.match(html,/准备数据调整/); assert.match(html,/不覆盖原结果/); assert.match(renderChatTableMarkdown(model),/准备数据调整/);
 assert.equal((html.match(/class="case-row"/g)??[]).length,2);
});
test('R03/A32/A38: concurrent appends survive, effects observed share resume reducer; no uncertain or successful replay',async t=>{
 const run=await fixture(t);
 await Promise.all(Array.from({length:12},(_,i)=>recordEvent(run.runRoot,{type:'page_observation',description:`Concurrent fixture fact ${i}`,checkpoint_ids:['ID/s/id']})));
 let {log}=await fixtureState(run.runRoot); assert.equal(log.events.filter(e=>e.type==='page_observation').length,12);
 await recordEvent(run.runRoot,{type:'action_planned',action_id:'not-issued',checkpoint_id:'ID/s/id',side_effect:true});
 for(const action_id of ['confirmed','uncertain','not-submitted']) await recordEvent(run.runRoot,{type:'action_dispatched',action_id,side_effect:true,checkpoint_id:'ID/s/id'});
 for (const [action_id,outcome] of [['confirmed','confirmed_success'],['not-submitted','not_submitted']]) {
  const fact=await recordEvent(run.runRoot,{type:'page_observation',action_id,checkpoint_ids:['ID/s/id'],description:'Component fixture visible effect for this dispatched action'});
  await recordEvent(run.runRoot,{type:'effect_observed',action_id,outcome,fact_refs:[fact.sequence],description:'Verified effect for this action only'});
 }
 const resume=await resumeCheck(run.runRoot); assert.equal(resume.auto_replay_allowed,false);
 assert.deepEqual(resume.possibly_committed_actions.map(e=>e.action_id),['uncertain']);
 assert.deepEqual(resume.retryable_action_ids,['not-issued','not-submitted']);
 for(const action_id of ['confirmed','uncertain']) await assert.rejects(recordEvent(run.runRoot,{type:'action_dispatched',action_id,side_effect:true}),/重复/);
});

test('R03/R11: official ledger refuses unidentified writes and business dispatch while isolation is unknown',async t=>{
 const run=await fixture(t);
 await assert.rejects(recordEvent(run.runRoot,{type:'action_dispatched',checkpoint_id:'ID/s/id',side_effect:true}),/action_id/);
 await recordEvent(run.runRoot,{type:'proxy_state',proxy:{state:'isolation_unknown'}});
 await assert.rejects(recordEvent(run.runRoot,{type:'action_dispatched',action_id:'new-write',checkpoint_id:'ID/s/id',side_effect:true}),/停止业务/);
});
