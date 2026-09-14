import test from 'node:test';
import assert from 'node:assert/strict';
import {compileObligations} from '../../src/obligations/compile-obligations.mjs';
import {classifyCaseDrafts} from '../../src/classify.mjs';
import {baseCase,classificationContext,refreshExecutionSignature,IDS} from '../helpers/classification-context.mjs';

/** @param {string} type @param {(artifact:any)=>void} [mutate] */
function compiled(type,mutate=()=>{}) {
 const c=classificationContext();
 const source={source_claim_ids:['claim_fact','claim_oracle'],model_refs:[]};
 const elements=type==='flow' ? [
  {...source,element_id:'start',kind:'flow-node',node_type:'start',label:'Ready'},
  {...source,element_id:'end',kind:'flow-node',node_type:'end',label:'Submitted'},
  {...source,element_id:'submit',kind:'flow-edge',from_element_id:'start',to_element_id:'end',condition:'ready',result:'accepted',sequence:0}
 ]:type==='state' ? [
  {...source,element_id:'ready',kind:'state',state:'ready'},
  {...source,element_id:'accepted',kind:'state',state:'accepted'},
  {...source,element_id:'submit',kind:'transition',from_state:'ready',to_state:'accepted',event:'submit',condition:'ready',transition_order:['submit']}
 ]:type==='input-domain' ? [{...source,element_id:'input',kind:'input-domain',domain:'cart class',bounds:{lower:0,upper:10,inclusive:true},classes:[{class_id:'a',label:'a'},{class_id:'b',label:'b'}]}]
 : [{...source,element_id:'time',kind:'timing-rule',timing_event:'submit',threshold:30,order:0}];
 const subjects=type==='input-domain' ? [...['a','b'].map(class_id=>({kind:'equivalence-class',element_id:'input',class_id})),...['lower','upper'].map(boundary=>({kind:'boundary',element_id:'input',boundary}))] : type==='timing' ? ['before','equal','after'].map(kind=>({kind,element_id:'time'})):[];
 const artifact={schema_version:'3.0.0',source_revision:c.sourceRevision,views:[{view_id:'view_checkout',type,scope:'checkout',source_claim_ids:['claim_fact','claim_oracle'],elements,relations:[]}],interaction_matrix:['shared-entity','role','client','interface-event','time','concurrency','side-effect'].map(dimension=>({module_ids:['checkout'],dimension,status:'checked-no-signal'})),interaction_candidates:[],obligation_inputs:{view_contexts:subjects.length?[{view_id:'view_checkout',bindings:subjects.map(selector=>({selector,risk:'high',source_claim_ids:['claim_fact','claim_oracle'],required_oracle_refs:['claim_oracle'],required_capabilities:[]}))}]:[],terminal_fact_routes:[],custom_responsibilities:[],combination_requests:[]}};
 c.evidence.factLedger[0].required_view_kinds=[type];c.evidence.factLedger[0].view_review_basis='The fixture explicitly models this behavior';
 mutate(artifact);
 c.obligations=compileObligations({...c.evidence,runScope:'checkout'},artifact);
 return c;
}
/** @param {any} c @param {boolean} combine */
function casesFor(c,combine) {
 const groups=combine?[c.obligations.obligations]:c.obligations.obligations.map((/** @type {any} */ o)=>[o]);
 c.caseDrafts.cases=groups.map((/** @type {any[]} */ obligations,/** @type {number} */ i)=>{
  const d=baseCase({case_id:`case_compiled_${i}`,obligation_ids:obligations.map(o=>o.obligation_id)});
  d.scenario.operation_ref=obligations[0].primary_operation_refs?.[0] ?? (obligations[0].view_element_refs.length>1?'view_checkout#submit':obligations[0].view_element_refs[0]);
  d.scenario.partition_id=obligations[0].scenario_partition_ref ?? 'valid-cart';d.data[0].partition_id=d.scenario.partition_id;
  d.steps[0].expectations=obligations.map((o,j)=>({...structuredClone(d.steps[0].expectations[0]),expectation_id:`expectation_${i}_${j}`,closes_obligation_id:o.obligation_id,oracle_evidence_refs:[...new Set(['claim_oracle',...o.required_oracle_refs])]}));
  return refreshExecutionSignature(d);
 });
 c.caseDrafts.obligation_dispositions=c.obligations.obligations.map((/** @type {any} */ o)=>({status:'case_candidate',obligation_id:o.obligation_id,case_ids:c.caseDrafts.cases.filter((/** @type {any} */ d)=>d.obligation_ids.includes(o.obligation_id)).map((/** @type {any} */ d)=>d.case_id)}));
 return c;
}
for(const type of ['flow','state']) test(`production compiled ${type} supports one operation plus from/to traceability`,()=>{
 const c=casesFor(compiled(type),false);const result=classifyCaseDrafts(c);
 assert.deepEqual(result.diagnostics,[]);assert.equal(result.grounded.length,c.obligations.obligations.length);
 assert(c.obligations.obligations.some((/** @type {any} */ o)=>o.view_element_refs.length===3));
});
for(const type of ['input-domain','timing']) test(`production compiled ${type} partitions cannot share one Case`,()=>{
 const c=casesFor(compiled(type),true);const result=classifyCaseDrafts(c);
 assert.equal(result.grounded.length,0);assert(result.diagnostics.some(e=>e.code==='CASE_PARTITION_REFERENCE_INVALID'));
 const separate=classifyCaseDrafts(casesFor(compiled(type),false));assert.deepEqual(separate.diagnostics,[]);
 assert.equal(separate.grounded.length,c.obligations.obligations.length);
});
for(const [operator,type,value] of [['contains','boolean',true],['within','string','ready']]) test(`setup rejects ${operator} with ${type} operand`,()=>{
 const c=classificationContext();c.caseDrafts.cases[0].preconditions[0].setup.completion={subject_ref:'cart.ready',operator,operand:{type,value}};
 refreshExecutionSignature(c.caseDrafts.cases[0]);const result=classifyCaseDrafts(c);
 assert.equal(result.grounded.length,0);assert(result.diagnostics.some(e=>e.code==='SETUP_PREDICATE_INVALID'));
});
test('real compiled flow still rejects merging independent primary operations',()=>{
 const c=casesFor(compiled('flow'),true);const result=classifyCaseDrafts(c);
 assert.equal(result.grounded.length,0);assert(result.diagnostics.some(e=>e.code==='CASE_OPERATION_REFERENCE_INVALID'));
});
test('compiler partition identity excludes source bindings, risk, and class prose labels',()=>{
 const original=compiled('input-domain').obligations.obligations.map((/** @type {any} */ o)=>o.scenario_partition_ref).sort();
 const changed=compiled('input-domain',a=>{
  a.views[0].elements[0].classes[0].label='A relabelled class';
  for(const b of a.obligation_inputs.view_contexts[0].bindings){b.risk='low';b.required_oracle_refs=['claim_fact','claim_oracle'];}
 }).obligations.obligations.map((/** @type {any} */ o)=>o.scenario_partition_ref).sort();
 assert.deepEqual(changed,original);
});
