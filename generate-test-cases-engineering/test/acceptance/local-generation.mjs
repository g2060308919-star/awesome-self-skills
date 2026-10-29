import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
const root=fileURLToPath(new URL('../fixtures/remediation/',import.meta.url));
const runner=process.env.GTC_REMEDIATION_RUNNER ?? fileURLToPath(new URL('../../skill/generate-test-cases/scripts/test-compiler.mjs',import.meta.url));
const api=await import(pathToFileURL(runner));
const hash=(/** @type {string} */ text)=>'sha256:'+createHash('sha256').update(text).digest('hex');
const dimensions=['shared-entity','role','client','interface-event','time','concurrency','side-effect'];
const files={source_pack:'source-pack',evidence_claims:'evidence-claims',behavior_views:'behavior-views',case_drafts:'case-drafts'};

/** Build semantic fixtures from exact provided bytes and separately authored scenario data.
 * @param {string} sample @param {any[]} rows @param {string} runId @param {any} [options] @returns {Promise<any>} */
export async function prepareFixture(sample,rows,runId,options={}) {
 const content=options.content??await readFile(path.join(root,sample+'.md'),'utf8');
 const bytes=new TextEncoder().encode(content);
 const prepared=api.prepareV4Source({metadata:{source_id:'SRC-local',kind:'prd',version:'1',status:'effective',authority:'user supplied',domain:'business',scope:'configuration'},raw_response_bytes:bytes,capture_bytes:bytes,assets:[],acquisition:{},additional_units:[]});
 assert.equal(prepared.status,'prepared',JSON.stringify(prepared));
 const source=prepared.source;
 /** @type {any[]} */const segments=[];
 /** @type {any[]} */const locators=[];
 for(const unit of prepared.units){
  let offset=0;
  for(const text of unit.text.match(/[^。；;\n]+[。；;\n]?/gu)??[]){
   const start=Array.from(unit.text.slice(0,unit.text.indexOf(text,offset))).length;offset=unit.text.indexOf(text,offset)+text.length;
   if(!text.trim())continue;
   const n=segments.length,field='/rule';
   const locator={locator_id:'LOC-'+n,source_id:source.source_id,semantic_digest:source.semantic_digest,type:'text_block_range',unit_id:unit.unit_id,section_id:unit.section_id,range:{start,end:start+Array.from(text).length},excerpt:text,excerpt_digest:hash(text),domain:'business',field_path:field};
   locators.push(locator);segments.push({text,claim_id:'CLM-'+n,field_path:field,locator});
  }
 }
 const sourcePayload={run_scope:'configuration',delivery_intent:'case_document',output_language:'zh-CN',sources:[source],locators,source_reviews:[{source_id:source.source_id,semantic_digest:source.semantic_digest,units:prepared.review_units.map((/** @type {any} */ u)=>({...u,classification:'normative'}))}],source_policy:{rules:[{rule_id:'POL-local',source_ids:[source.source_id],scope:'configuration',authority:'user supplied',status:'effective',rule_internal_conflict_review:[]}]},decision_records:[],clarification_events:[],execution_events:[],source_assets:[],artifact_events:[]};
 const moduleLabel=content.match(/模块：([^。]+)/u)[1];
 const module='configuration';
 const claims=segments.map((s)=>({claim_id:s.claim_id,claim_form:'direct',level:'E3',kind:'requirement',scope:module,value:s.text,source_locator_ids:[s.locator.locator_id],source_id:source.source_id,domain:'business',field_path:s.field_path,document_level_claim:false,locator_roles:[],subject_descriptor:{scope_ref:module,module_id:module,entity_type:'configuration',entity_key:s.claim_id,field_path:s.field_path,condition:{}},semantic_value:{source_value:s.text,behavior_assertions:[]}}));
 const topologyOwner=/** @type {any} */ (claims[0].semantic_value);
 topologyOwner.topology_authorization={candidates:[{kind:'module_mention',label:moduleLabel,locator_ids:[locators[0].locator_id],disposition:'module',module_ref:module,role:'primary'}],reviewable_interaction_cells:dimensions.map(dimension=>({module_ids:[module],dimension}))};
 const topology=api.discoverV4Topology({...sourcePayload,schema_version:'4.3.3',source_revision:0,run_instance_id:runId},claims);
 /** Bind a selected exact source excerpt to every intersecting atomic source Claim.
  * @param {string[]} quotes */
 function refs(quotes){
  const ids=new Set();
  for(const q of quotes){
   assert.ok(content.includes(q),'quote absent: '+q);
   for(const s of segments){if(q.includes(s.text)||s.text.includes(q)||q.includes(s.text.replace(/[。；;\n]$/u,'')))ids.add(s.claim_id);}
  }
  assert.ok(ids.size,'missing quote binding');return [...ids].sort();
 }
 const topologyIds=[...new Set(topology.topology_candidates.flatMap((/** @type {any} */ c)=>c.locator_ids))];
 // Each topology authorization is bound to the actual discovered locator's Claim.
 for(const c of topology.topology_candidates){
  const owner=claims.find(x=>c.locator_ids.includes(x.source_locator_ids[0]));if(!owner)throw Error('Topology owner missing');
  const semantic=/** @type {any} */(owner.semantic_value);
  semantic.topology_authorization??={candidates:[],reviewable_interaction_cells:dimensions.map(dimension=>({module_ids:[module],dimension}))};
  if(!semantic.topology_authorization.candidates.some((/** @type {any} */ a)=>a.kind===c.kind&&a.label===c.label&&JSON.stringify(a.locator_ids)===JSON.stringify(c.locator_ids))) semantic.topology_authorization.candidates.push({kind:c.kind,label:c.label,locator_ids:c.locator_ids,disposition:'module',module_ref:module,role:'primary'});
 }
 const scopeClaimIds=claims.filter(x=>topologyIds.includes(x.source_locator_ids[0])).map(x=>x.claim_id).sort();
 const name=topology.topology_candidates.map((/** @type {any} */ c)=>c.label).sort()[0];
 const facts=rows.map((row,i)=>({fact_id:'FACT-'+row.key,statement:row.title,status:'active',acceptance_role:'primary_acceptance',claim_ids:refs(row.quotes),module_refs:[module],field_path:'/rule'}));
 const views=rows.map((row,i)=>{
  const fact=facts[i],condition={preconditions:row.preconditions,data:row.data,actions:row.steps};
  /** @type {any} */const element={element_id:'EL-'+row.key,kind:row.kind,business_outcome:row.title,fact_id:fact.fact_id,condition,expected:row.expected,evidence_bindings:['business_outcome','condition','expected'].map(field=>({field_path:'/'+field,claim_ids:fact.claim_ids}))};
  for(const id of fact.claim_ids){const claim=claims.find(x=>x.claim_id===id);if(!claim)throw Error('Claim missing');for(const field of ['business_outcome','condition','expected'])claim.semantic_value.behavior_assertions.push(/** @type {never} */({fact_id:fact.fact_id,field_path:'/'+field,value:element[field]}));}
  return {view_id:'VIEW-'+row.key,module_id:module,type:row.kind,scope:module,source_claim_ids:fact.claim_ids,elements:[element],relations:[]};
 });
 const evidencePayload={claims,fact_ledger:facts,semantic_gaps:[],topology_discovery:topology,topology_review:{...topology.scanned_units,unresolved_candidate_ids:[]},topology_dispositions:topology.topology_candidates.map((/** @type {any} */ c)=>({candidate_id:c.candidate_id,disposition:'module',module_ref:module,role:'primary',review_basis_claim_ids:claims.filter(x=>c.locator_ids.includes(x.source_locator_ids[0])).map(x=>x.claim_id)})),scope_manifest:{primary_surface:module,modules:[{module_id:module,name,role:'primary',claim_ids:scopeClaimIds}],boundaries:[]},interaction_review:dimensions.map(dimension=>({module_ids:[module],dimension,status:'checked-no-signal',reviewed_claim_ids:scopeClaimIds,review_basis:'单模块需求；角色/时间/重入已有模块内设计，无跨模块信号'})),acceptance_role_assignments:facts.map(f=>({entity_kind:'fact',entity_id:f.fact_id,scope_ref:module,acceptance_role:f.acceptance_role,parent_entity_ids:[],role_basis_claim_ids:f.claim_ids}))};
 const behaviorPayload={views,interaction_matrix:dimensions.map(dimension=>({module_ids:[module],dimension,status:'checked-no-signal'})),interaction_candidates:[],obligation_inputs:{view_contexts:[],terminal_fact_routes:[],custom_responsibilities:[],combination_requests:[]},design_assurance:{plan_revision:1,batches:[{batch_id:'BATCH-local',sequence:1,status:'complete',source_claim_ids:claims.map(c=>c.claim_id),rule_group_ids:rows.map(r=>'RULE-'+r.key)}],rule_groups:rows.map((row,i)=>({rule_group_id:'RULE-'+row.key,batch_id:'BATCH-local',source_claim_ids:facts[i].claim_ids,objective:row.title,method:row.kind==='state'?'state_transition':'scenario',candidate_ids:['CAND-'+row.key]})),candidate_responsibilities:rows.map((row,i)=>({candidate_id:'CAND-'+row.key,rule_group_id:'RULE-'+row.key,responsibility:row.title,source_claim_ids:facts[i].claim_ids})),candidate_dispositions:rows.map(row=>({candidate_id:'CAND-'+row.key,disposition:'retained',retained_element_ids:['EL-'+row.key],rationale:'独立来源支持的可判定结果'})),impacted_prior_batches:[]}};
 return {sourcePayload,evidencePayload,behaviorPayload,source,bytes,refs,facts};
}

/** @param {string} sample @param {string} catalog @param {any} [options] @returns {Promise<any>} */
export async function generate(sample,catalog,options={}){
 await mkdir(catalog,{recursive:true});
 /** @type {any[]} */const rows=options.rows??JSON.parse(await readFile(path.join(root,sample+'-scenarios.json'),'utf8'));
 const run=await api.createV4RunDirectory(catalog,'case_document'),dir=run.run_directory;
 const fixture=await prepareFixture(sample,rows,run.run_id,options);
 if(options.prepare)options.prepare(fixture);
 let reply=await api.advanceStrict(dir);
 await api.stageV4PrdCollectionObservation(dir,reply,{version:'1.0.0',scope:{mode:'provided_materials',root_ref:'provided:local-'+sample,source_version:'1',collection_window:{started_at:'2026-10-28T00:00:00Z',ended_at:'2026-10-28T00:00:01Z'}},channels:[{channel:'body',enumeration_status:'exhausted',page_count:1,terminal_page_observed:true,diagnostic_code:null},...['table','image','comment','reply'].map(channel=>({channel,enumeration_status:'not_applicable',page_count:0,terminal_page_observed:false,diagnostic_code:null}))],items:[{item_id:'local-body',parent_item_id:null,channel:'body',source_id:fixture.source.source_id,asset_id:null,unit_ids:fixture.source.semantic_projection.structure.map((/** @type {any} */ u)=>u.unit_id),acquisition_status:'acquired',review_status:'reviewed',unavailable_reason:null}]},[{item_id:'local-body',raw_response_bytes:fixture.bytes,capture_bytes:fixture.bytes}]);
 /** @param {keyof typeof files} stage @param {any} payload */
 async function stage(stage,payload){
  const prepared=await api.prepareStageArtifact(dir,reply,{stage,payload});
  assert.equal(prepared.status,'prepared',JSON.stringify(prepared).slice(0,9000));
  await mkdir(path.join(dir,'staging'),{recursive:true});await writeFile(path.join(dir,'staging',files[stage]+'.json'),JSON.stringify(prepared.artifact,null,2));
  reply=await api.advanceStrict(dir);await writeFile(path.join(dir,'reply-'+stage+'.json'),JSON.stringify(reply,null,2));
  return prepared.artifact;
 }
 await stage('source_pack',fixture.sourcePayload);await stage('evidence_claims',fixture.evidencePayload);
 if(options.expectClarification){
  assert.equal(reply.status,'need_user_answers',JSON.stringify(reply));
  await writeFile(path.join(catalog,sample+'-run.json'),JSON.stringify(run,null,2));
  return {run,reply};
 }
 await stage('behavior_views',fixture.behaviorPayload);
 assert.ok(reply.case_context,JSON.stringify(reply));
 const targets=JSON.parse(await readFile(path.join(root,'independent-targets.json'),'utf8'))[sample];
 const cases=rows.map((row,i)=>{
  const fact=fixture.facts[i],context=reply.case_context;
  const outcome=context.outcomes.find((/** @type {any} */ o)=>o.fact_id===fact.fact_id);
  const point=context.formal_test_points.find((/** @type {any} */ p)=>p.outcome_id===outcome.outcome_id);
  return {case_id:'LOCAL-'+row.key,title:row.title,module_id:'configuration',priority:'P1',ordering:{business_flow_ref:null,page_action_ref:null},acceptance_role:'primary_acceptance',fact_ids:[fact.fact_id],primary_test_point_id:point.formal_test_point_id,supporting_observation_ids:[],business_preconditions:row.preconditions.map((/** @type {string} */ description,/** @type {number} */ j)=>({precondition_id:'PRE-'+j,description})),data_conditions:row.data.map((/** @type {string} */ description,/** @type {number} */ j)=>({condition_id:'DATA-'+j,description})),steps:row.steps.map((/** @type {string} */ action,/** @type {number} */ j)=>({step_id:'STEP-'+j,action})),oracles:(row.oracles??[{after:row.steps.length-1,expected:row.expected}]).map((/** @type {any} */ o,/** @type {number} */ j)=>({oracle_id:'ORACLE-'+j,observe_after_step_id:'STEP-'+o.after,surface:'ui',expected:o.expected,claim_ids:fact.claim_ids}))};
 });
 const artifact=await stage('case_drafts',{cases,independent_review:{protocol_version:'1.0.0',status:'pending',review_mode:'independent_source_first',reviewer_identity:{identity_class:'independent_context',separation_basis:'独立上下文 /root/source_first_review 先读取两个本地源文档并提交独立检查清单，再接收此编译器投影审阅；见 independent-checklist.md'},source_first_targets:targets.map((/** @type {any} */ t)=>({target_kind:t.target_kind,acceptance_role:'primary_acceptance',objective:t.objective,source_claim_ids:fixture.refs(t.quotes),decision_ids:[]}))}});
 assert.equal(reply.incomplete_reason?.code,'INDEPENDENT_REVIEW_REQUIRED',JSON.stringify(reply).slice(0,2000));
 await writeFile(path.join(catalog,sample+'-run.json'),JSON.stringify(run,null,2));
 return {run,reply,artifact};
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
 const sample=process.argv[2]??'comprehensive',catalog=path.resolve(process.argv[3]??'docs/remediation-2026-10-28/acceptance');
 console.log(JSON.stringify((await generate(sample,catalog)).run));
}
