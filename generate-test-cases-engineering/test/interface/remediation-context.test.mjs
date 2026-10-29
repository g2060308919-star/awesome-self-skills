import {start} from '../helpers/remediation-stage-fixture.mjs';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import * as api from '../../src/entry.mjs';
import { STAGE_FILES } from '../../src/run-store.mjs';
import { v4GeneralQualityFixture } from '../helpers/v4-general-quality-fixture.mjs';

test('AT-01: public runner provides complete case context without any submitted cases', async (/** @type {any} */ t) => {
  const { dir, reply } = await start(t);
  assert.equal(reply.stage, 'case_drafts', JSON.stringify(reply));
  assert.ok(reply.case_context, 'missing compiler-owned case authoring context');
  assert.ok(reply.case_context.formal_test_points.length);
  for (const point of reply.case_context.formal_test_points) {
    const outcome = reply.case_context.outcomes.find((/** @type {any} */ o) => o.outcome_id === point.outcome_id);
    assert.equal(reply.case_context.facts.filter((/** @type {any} */ f) => f.fact_id === outcome.fact_id).length, 1);
    const owner = reply.case_context.fact_modules.find((/** @type {any} */ f) => f.fact_id === outcome.fact_id);
    assert.equal(reply.case_context.modules.filter((/** @type {any} */ m) => m.module_id === owner.module_id).length, 1);
  }
  assert.deepEqual(await api.advanceStrict(dir), reply);
  await assert.rejects(readFile(path.join(dir, 'accepted/r000/case-drafts.json')), { code: 'ENOENT' });
});

test('AT-08: public stage constructor is available', () => {
  assert.equal(typeof api.prepareStageArtifact, 'function');
});

/** @param {any} artifact */
function payload(artifact) {
  const { schema_version, source_revision, run_instance_id, case_context_digest, ...body } = artifact;
  return body;
}
/** @param {any} fixture */
function pending(fixture) {
  const review = fixture.artifacts.case_drafts.independent_review;
  return { protocol_version: review.protocol_version, status: 'pending', review_mode: review.review_mode,
    reviewer_identity: review.reviewer_identity, source_first_targets: review.source_first_targets.map((/** @type {any} */ {target_id,...t}) => t) };
}
/** @param {any} dir @param {any} fixture @param {any} reply */
async function preparedCase(dir, fixture, reply) {
  const body = payload(fixture.artifacts.case_drafts);
  body.independent_review = pending(fixture);
  return api.prepareStageArtifact(dir, reply, {stage:'case_drafts',payload:body});
}

test('AT-07/08/10: helper is read-only, binds pending drafts and rejects altered context and reserved fields', async (/** @type {any} */ t) => {
  const {dir, fixture, reply} = await start(t);
  const checkpoint = await readFile(path.join(dir,'checkpoint.json'),'utf8');
  const result = await preparedCase(dir, fixture, reply);
  assert.equal(result.status,'prepared',JSON.stringify(result));
  assert.equal(result.artifact.case_context_digest,reply.case_context.context_digest);
  assert.equal(result.artifact.independent_review.status,'pending');
  assert.equal(await readFile(path.join(dir,'checkpoint.json'),'utf8'),checkpoint);
  await assert.rejects(readFile(path.join(dir,'staging/case-drafts.json')),{code:'ENOENT'});
  for (const key of ['schema_version','source_revision','case_context_digest','unknown']) {
    const body = payload(fixture.artifacts.case_drafts);body[key]='forbidden';
    const bad = await api.prepareStageArtifact(dir,reply,{stage:'case_drafts',payload:body});
    assert.equal(bad.status,'invalid',key);assert.ok(bad.diagnostics.length);assert.equal(bad.artifact,undefined);
  }
  const changed = structuredClone(reply);changed.case_context.outcomes[0].expected='forged';
  const {digest} = await import('../../src/canonical.mjs');
  const {context_digest,...base}=changed.case_context;changed.case_context.context_digest='sha256:'+digest(base);
  const rejected=await preparedCase(dir,fixture,changed);
  assert.equal(rejected.status,'invalid');assert.equal(rejected.diagnostics[0].code,'CASE_CONTEXT_INVALID');
});

test('AT-05: invalid ordering prerequisite is fatal before accepting behavior', async (/** @type {any} */ t) => {
  const {compileCaseAuthoringContext} = await import('../../src/v4-pipeline.mjs');
  const fixture=v4GeneralQualityFixture('4.3.3');
  const {case_drafts,...upstream}=fixture.artifacts;
  fixture.system.ordering={invalid:true};
  const result=compileCaseAuthoringContext(upstream,fixture.system);
  assert.equal(result.status,'fatal');assert.ok(result.diagnostics.length);
});

test('AT-06/10/21/27: stale, malformed, wrong revision and broken reference stay distinct; pending review cannot publish', async (/** @type {any} */ t) => {
  const {dir,fixture,reply}=await start(t);
  const result=await preparedCase(dir,fixture,reply);
  assert.equal(result.status,'prepared',JSON.stringify(result));
  const stage=async (/** @type {any} */ artifact)=>{await writeFile(path.join(dir,'staging/case-drafts.json'),JSON.stringify(artifact));return api.advanceStrict(dir);};
  const stale=await stage({...result.artifact,case_context_digest:'sha256:'+'0'.repeat(64)});
  assert.equal(stale.incomplete_reason.code,'CASE_CONTEXT_STALE');assert.deepEqual(stale.case_context,reply.case_context);
  for (const value of [undefined,'bad']) {
    const malformed=await stage({...result.artifact,case_context_digest:value});
    assert.notEqual(malformed.incomplete_reason.code,'CASE_CONTEXT_STALE');assert.equal(malformed.status,'need_revision');
  }
  const revision=await stage({...result.artifact,source_revision:99});
  assert.equal(revision.incomplete_reason.code,'SOURCE_REVISION_MISMATCH');
  const bad=structuredClone(result.artifact);bad.cases[0].primary_test_point_id='TP-broken';
  const refs=await stage(bad);assert.equal(refs.status,'need_revision');assert.notEqual(refs.incomplete_reason.code,'CASE_CONTEXT_STALE');
  const review=await stage(result.artifact);assert.equal(review.incomplete_reason.code,'INDEPENDENT_REVIEW_REQUIRED');
  assert.deepEqual(review.case_context,reply.case_context);
  await assert.rejects(readFile(path.join(dir,'output/current.json')),{code:'ENOENT'});
});

test('AT-14: obsolete identity is rejected without upgrade guidance or file mutation', async (/** @type {any} */ t) => {
  const catalog=await mkdtemp(path.join(os.tmpdir(),'remediation-protocol-'));
  t.after(()=>rm(catalog,{recursive:true,force:true}));
  const run=await api.createV4RunDirectory(catalog,'case_document');
  const identityPath=path.join(run.run_directory,'run-instance.json');
  const identity=JSON.parse(await readFile(identityPath,'utf8'));
  identity.schema_version='4.3.2';identity.compiler_version='0.8.2';
  const bytes=JSON.stringify(identity);await writeFile(identityPath,bytes);
  const rejected=await api.advanceStrict(run.run_directory);
  assert.equal(rejected.status,'fatal');assert.equal(rejected.diagnostics[0].code,'CURRENT_PROTOCOL_REQUIRED');
  assert.equal(await readFile(identityPath,'utf8'),bytes);
  await assert.rejects(api.createV4RunDirectory(catalog,{parent_run_id:run.run_id,creation_reason:/** @type {any} */ ('version_upgrade')}),/V4_RUN_BOOTSTRAP_INPUT_INVALID/);
});

test('REQ-16 source fixture: semantic module discovery uses the public existing topology algorithm',()=>{
 const fixture=v4GeneralQualityFixture('4.3.3');
 const discovery=api.discoverV4Topology(fixture.artifacts.source_pack,fixture.artifacts.evidence_claims.claims);
 assert.deepEqual(discovery,fixture.artifacts.evidence_claims.topology_discovery);
});

test('AT-09/21: helper and final compiler reject every dangling Case reference and duplicate local ID',async (/** @type {any} */ t)=>{
 const {compileCaseAuthoringContext,compileCaseDocumentRevisionV4}=await import('../../src/v4-pipeline.mjs');
 const {dir,fixture,reply}=await start(t);
 const variants=/** @type {Array<[(c:any)=>void,string]>} */([
  [c=>c.oracles[0].observe_after_step_id='STEP-absent','ORACLE_STEP_UNRESOLVED'],
  [c=>c.fact_ids=['FACT-absent'],'CASE_FACT_UNRESOLVED'],
  [c=>c.supporting_observation_ids=['OBS-absent'],'CASE_OBSERVATION_UNRESOLVED'],
  [c=>c.ordering.business_flow_ref='FLOW-absent','ORDERING_CASE_REFERENCE_UNRESOLVED'],
  [c=>c.ordering.page_action_ref='ACTION-absent','ORDERING_CASE_REFERENCE_UNRESOLVED'],
  [c=>c.steps.push({...c.steps[0]}),'CASE_LOCAL_ID_DUPLICATE']
 ]);
 for(const [mutate,code] of variants){
  const copy={artifacts:structuredClone(fixture.artifacts),system:fixture.system};mutate(copy.artifacts.case_drafts.cases[0]);
  const candidate=await preparedCase(dir,copy,reply);
  assert.equal(candidate.status,'invalid',code);assert.ok(candidate.diagnostics.some((/** @type {any} */ d)=>(d.code===code||(code==='CASE_LOCAL_ID_DUPLICATE'&&d.code==='DUPLICATE_STABLE_ID'))),JSON.stringify(candidate.diagnostics));
  const compiled=compileCaseDocumentRevisionV4(copy.artifacts,copy.system);
  assert.equal(compiled.status,'need_revision',code);assert.ok(compiled.diagnostics.some((/** @type {any} */ d)=>(d.code===code||(code==='CASE_LOCAL_ID_DUPLICATE'&&d.code==='DUPLICATE_STABLE_ID'))),JSON.stringify(compiled.diagnostics));
 }
});

test('AT-02/03/07/08/09/10/31: restart, run binding, unsupported action, local identity and bounded no-progress',async (/** @type {any} */ t)=>{
 const {spawnSync}=await import('node:child_process');
 const {fileURLToPath}=await import('node:url');
 const {dir,fixture,reply}=await start(t),other=await start(t);
 const candidate=await preparedCase(dir,fixture,reply);assert.equal(candidate.status,'prepared');
 const checkpoint=await readFile(path.join(dir,'checkpoint.json'),'utf8');
 // A new CLI process recovers the context using only accepted artifacts.
 const cli=spawnSync(process.execPath,[fileURLToPath(new URL('../../skill/generate-test-cases/scripts/test-compiler.mjs',import.meta.url)),dir],{encoding:'utf8'});
 assert.equal(cli.status,0,cli.stderr);assert.deepEqual(JSON.parse(cli.stdout).case_context,reply.case_context);
 const cross=await preparedCase(other.dir,other.fixture,reply);assert.equal(cross.status,'invalid');
 await writeFile(path.join(other.dir,'staging/case-drafts.json'),JSON.stringify(candidate.artifact));
 const rejected=await api.advanceStrict(other.dir);assert.equal(rejected.incomplete_reason.code,'CASE_CONTEXT_STALE');
 const noAction={status:'fatal',diagnostics:[{category:'reference',code:'CONTROLLED_STOP',message:'Stopped'}]};
 const unsupported=await api.prepareStageArtifact(dir,noAction,{stage:'case_drafts',payload:payload(candidate.artifact)});
 assert.equal(unsupported.status,'invalid');assert.equal(unsupported.diagnostics[0].code,'STAGE_NOT_WRITABLE');
 const duplicate=payload(candidate.artifact);duplicate.cases.push(structuredClone(duplicate.cases[0]));
 const duplicates=await api.prepareStageArtifact(dir,reply,{stage:'case_drafts',payload:duplicate});assert.equal(duplicates.status,'invalid');assert.ok(duplicates.diagnostics.some((/** @type {any} */ d)=>d.code==='DUPLICATE_STABLE_ID'));
 const noOracle=structuredClone(candidate.artifact);noOracle.cases[0].oracles=[];
 const observations=[];
 // Agent/Adapter retry policy: three repair attempts, the fourth unchanged
 // root stops orchestration. Runner state is neither extended nor reset.
 for(let attempt=1;attempt<=4;attempt++){
  await writeFile(path.join(dir,'staging/case-drafts.json'),JSON.stringify(noOracle));
  const result=await api.advanceStrict(dir);
  assert.equal(result.status,'need_revision');assert.notEqual(result.incomplete_reason.code,'CASE_CONTEXT_STALE');
  observations.push({attempt,stage:result.stage,root:result.incomplete_reason.code,runner_status:result.status});
 }
 assert.equal(new Set(observations.map(o=>o.stage+':'+o.root)).size,1);
 const adapterStop={code:'PIPELINE_NO_PROGRESS',layer:'Agent/Adapter',attempts:observations};
 assert.equal(adapterStop.attempts.length,4);
 assert.equal(await readFile(path.join(dir,'checkpoint.json'),'utf8'),checkpoint);
 const policy=await readFile(new URL('../../skill/generate-test-cases/SKILL.md',import.meta.url),'utf8');assert.match(policy,/PIPELINE_NO_PROGRESS/u);
 const {compileCaseDocumentRevisionV4}=await import('../../src/v4-pipeline.mjs');
 const a=compileCaseDocumentRevisionV4(fixture.artifacts,fixture.system),b=compileCaseDocumentRevisionV4(structuredClone(fixture.artifacts),fixture.system);
 assert.equal(a.status,'compiled');assert.deepEqual(a.bundle.ordered_case_ids,b.bundle.ordered_case_ids);
 assert.deepEqual(a.obligations.formal_test_points,reply.case_context.formal_test_points);
 assert.deepEqual(a.obligations.outcomes,reply.case_context.outcomes);
 assert.deepEqual(a.obligations.supporting_observations,reply.case_context.supporting_observations);
 const {compileCaseAuthoringContext}=await import('../../src/v4-pipeline.mjs');
 const {case_drafts,...upstream}=fixture.artifacts;
 assert.deepEqual(compileCaseAuthoringContext(upstream,fixture.system).orderingRegistry,reply.case_context.ordering_registry);
});

test('current source protocol rejects malformed artifact_repairs rather than silently ignoring the invalid recipe',()=>{
 const fixture=v4GeneralQualityFixture('4.3.3');
 fixture.artifacts.source_pack.artifact_repairs=[{repair_id:'unhandled'}];
 const checked=api.validateV4SourcePackBeforeStaging(fixture.artifacts.source_pack);
 assert.equal(checked.status,'invalid');assert.ok(checked.diagnostics.length);
});
test('AT-04: invalid behavior evidence or missing design responsibility never commits behavior or exposes context',async (/** @type {any} */ t)=>{
 for(const variant of ['evidence','design']){
  const {dir,fixture}=await start(t,{stopBeforeBehavior:true});
  const before=await readFile(path.join(dir,'checkpoint.json'),'utf8');
  const candidate=structuredClone(fixture.artifacts.behavior_views);
  if(variant==='evidence')candidate.views[0].elements[0].evidence_bindings[0].claim_ids=['CLM-missing'];
  else candidate.design_assurance.candidate_dispositions=[];
  await writeFile(path.join(dir,'staging/behavior-views.json'),JSON.stringify(candidate));
  const rejected=await api.advanceStrict(dir);
  assert.equal(rejected.status,'need_revision',JSON.stringify(rejected));assert.equal(rejected.stage,'behavior_views');
  assert.equal(rejected.case_context,undefined);assert.ok(rejected.diagnostics.length);
  assert.equal(await readFile(path.join(dir,'checkpoint.json'),'utf8'),before);
  await assert.rejects(readFile(path.join(dir,'accepted/r000/behavior-views.json')),{code:'ENOENT'});
 }
});

test('AT-15: material scope change preserves the parent and links a fresh compiler-issued run through the Adapter catalog',async (/** @type {any} */ t)=>{
 const {dir,fixture,reply}=await start(t);
 const before=await readFile(path.join(dir,'checkpoint.json'),'utf8');
 const sourceBytes=await readFile(path.join(dir,'accepted/r000/source-pack.json'),'utf8');
 const changed=JSON.parse(sourceBytes);changed.source_revision=1;changed.run_scope='changed-material-scope';
 await writeFile(path.join(dir,'staging/source-pack.json'),JSON.stringify(changed));
 const rejected=await api.advanceStrict(dir);
 assert.equal(rejected.status,'need_revision');
 assert.ok(rejected.diagnostics.some((/** @type {any} */ d)=>d.code==='NEW_RUN_REQUIRED'&&d.path==='/run_scope'),JSON.stringify(rejected));
 assert.equal(await readFile(path.join(dir,'checkpoint.json'),'utf8'),before);
 assert.equal(await readFile(path.join(dir,'accepted/r000/source-pack.json'),'utf8'),sourceBytes);
 await assert.rejects(readFile(path.join(dir,'accepted/r001/source-pack.json')),{code:'ENOENT'});
 for(const variant of ['bytes','authority']){
  const candidate=JSON.parse(sourceBytes);candidate.source_revision=1;
  if(variant==='bytes')candidate.sources[0].content+=' changed original source bytes';
  else candidate.sources.push({...structuredClone(candidate.sources[0]),source_id:'SRC-new-authority'});
  await writeFile(path.join(dir,'staging/source-pack.json'),JSON.stringify(candidate));
  const response=await api.advanceStrict(dir);
  assert.ok(response.diagnostics.some((/** @type {any} */ d)=>d.code==='NEW_RUN_REQUIRED'),variant+JSON.stringify(response));
  assert.equal(await readFile(path.join(dir,'checkpoint.json'),'utf8'),before);
 }
 const catalog=path.dirname(path.dirname(dir));
 const sibling=await api.createV4RunDirectory(catalog,'case_document');
 assert.notEqual(sibling.run_id,reply.run_id);
 const initial=await api.advanceStrict(sibling.run_directory);assert.equal(initial.stage,'source_pack');
 // Existing Adapter relationship index: never author a compiler run identity.
 const {digest}=await import('../../src/canonical.mjs');
 const {validateAgainstSchema}=await import('../../src/schema-validator.mjs');
 const schema=JSON.parse(await readFile(new URL('../../skill/generate-test-cases/scripts/schemas/run-catalog.schema.json',import.meta.url),'utf8'));
 const row={source_content_digest:digest(fixture.artifacts.source_pack.sources),last_reply_kind:'need_revision',error_codes:[],supersedes:null,superseded_by:null};
 const index={catalog_version:1,active_run_directory:sibling.run_directory,runs:[
  {...row,run_instance_id:reply.run_id,run_directory:dir,scope:fixture.artifacts.source_pack.run_scope,status:'superseded',superseded_by:sibling.run_id},
  {...row,run_instance_id:sibling.run_id,run_directory:sibling.run_directory,scope:changed.run_scope,status:'active',supersedes:reply.run_id}
 ],events:[{sequence:1,run_instance_id:sibling.run_id,status:'active',reason:'NEW_RUN_REQUIRED: material scope change'}]};
 assert.deepEqual(validateAgainstSchema(index,schema),[]);
 const {rename}=/** @type {any} */ (await import('node:fs/promises'));
 await writeFile(path.join(catalog,'run-catalog.tmp'),JSON.stringify(index));
 await rename(path.join(catalog,'run-catalog.tmp'),path.join(catalog,'run-catalog.json'));
 assert.deepEqual(JSON.parse(await readFile(path.join(catalog,'run-catalog.json'),'utf8')),index);
 assert.equal(await readFile(path.join(dir,'checkpoint.json'),'utf8'),before);
});
