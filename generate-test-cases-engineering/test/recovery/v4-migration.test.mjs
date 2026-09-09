import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import test from 'node:test';
import * as store from '../../src/run-store.mjs';
import { advanceStrict } from '../../src/advance-strict.mjs';
import runInstanceSchema from '../../skill/generate-test-cases/scripts/schemas/run-instance.schema.json' with {type:'json'};
import { canonicalStringify, digest } from '../../src/canonical.mjs';
import { validateAgainstSchema } from '../../src/schema-validator.mjs';
import { buildJourney, evaluateJourneyRevision } from '../helpers/run-journey.mjs';

const migration = /** @type {any} */ (store);
const byteDigest = (/** @type {any} */ bytes) => 'sha256:' + createHash('sha256').update(bytes).digest('hex');
const files = {source_pack:'source-pack.json',evidence_claims:'evidence-claims.json',behavior_views:'behavior-views.json',case_drafts:'case-drafts.json'};

/** Real v3 source/core output persisted in the old runner directory layout. */
async function fixture(name='all-e3',finished=true) {
  const root=await mkdtemp(path.join(os.tmpdir(),'gtc-v4-migrate-'));
  const legacy=path.join(root,'legacy'),catalog=path.join(root,'catalog');
  await mkdir(legacy);await mkdir(catalog);
  const input=buildJourney(name);input.source_pack.delivery_intent='case_document';
  const result=/** @type {any} */ (evaluateJourneyRevision(input,finished?'record_only':'pause_for_clarification'));
  assert.ok(['finished','need_user_answers'].includes(result.status),JSON.stringify(result));
  const runId=input.source_pack.run_instance_id;
  const instance={schema_version:'3.0.0',run_instance_id:runId,created_at:'2026-09-01T00:00:00.000Z'};
  await writeFile(path.join(legacy,'run-instance.json'),JSON.stringify(instance)+'\n');
  await mkdir(path.join(legacy,'accepted/r000'),{recursive:true});
  for(const [key,file] of Object.entries(files)) await writeFile(path.join(legacy,'accepted/r000',file),JSON.stringify(input[key])+'\n');
  await mkdir(path.join(legacy,'derived/r000'),{recursive:true});
  await writeFile(path.join(legacy,'derived/r000/clarification-state.json'),JSON.stringify(result.clarification_state)+'\n');
  const checkpoint={schema_version:'3.0.0',compiler_version:'0.4.0',run_instance_id:runId,source_revision:0,stage:finished?'finished':'clarification',accepted_artifact_digests:Object.fromEntries(Object.keys(files).map(key=>[key,digest(input[key])]))};
  if(finished) {
    await mkdir(path.join(legacy,'output/r000'),{recursive:true});
    await writeFile(path.join(legacy,'output/r000/test-bundle.json'),JSON.stringify(result.bundle)+'\n');
    await writeFile(path.join(legacy,'output/r000/test-cases.md'),result.markdown);
    checkpoint.accepted_artifact_digests.test_bundle=digest(result.bundle);
    await writeFile(path.join(legacy,'output/current.json'),JSON.stringify({status:'ready',run_instance_id:runId,source_revision:0,bundle_path:path.join(legacy,'output/r000/test-bundle.json'),bundle_digest:digest(result.bundle),plan_digest:digest(result.bundle)})+'\n');
  }
  await writeFile(path.join(legacy,'checkpoint.json'),JSON.stringify(checkpoint)+'\n');
  return {root,legacy,catalog,input,result,runId};
}
/** @param {string} directory */
async function bytesSnapshot(directory) {
  /** @type {any[]} */const rows=[];
  /** @param {string} dir */async function visit(dir) {
    for(const item of await readdir(dir,{withFileTypes:true})) {
      const target=path.join(dir,item.name);
      if(item.isDirectory())await visit(target);
      else {const bytes=await readFile(target);rows.push({path:path.relative(directory,target),byte_length:bytes.length,byte_sha256:byteDigest(bytes)});}
    }
  }
  await visit(directory);return rows.sort((a,b)=>a.path<b.path?-1:a.path>b.path?1:0);
}
/** @param {any} f @param {(f:any)=>Promise<void>} run */
async function use(f,run) {try{await run(f);}finally{await rm(f.root,{recursive:true,force:true});}}

test('T13 verified nonzero and all-inapplicable v3 deliveries are immutable read-only wrappers',async()=>{
  assert.equal(typeof migration.migrateLegacyRun,'function');
  for(const [name,kind] of [['all-e3','legacy_delivered_cases'],['all-not-applicable','legacy_no_applicable_cases']])await use(await fixture(name),async f=>{
    const before=await bytesSnapshot(f.legacy);
    const result=await migration.migrateLegacyRun(f.catalog,f.legacy);
    assert.equal(result.authority,'legacy_read_only');assert.equal(result.result_kind,kind);
    assert.deepEqual(await bytesSnapshot(f.legacy),before);
    assert.deepEqual(await readdir(f.catalog),[]);
  });
});
test('T13 blocked-only, unproved zero and bad digests cannot gain a canonical v4 success',async()=>{
  assert.equal(typeof migration.migrateLegacyRun,'function');
  for(const mode of ['blocked','zero','tampered'])await use(await fixture(mode==='blocked'?'all-blocked':'all-e3'),async f=>{
    if(mode!=='blocked'){
      const target=path.join(f.legacy,'output/r000/test-bundle.json');const bundle=JSON.parse(await readFile(target,'utf8'));
      if(mode==='zero'){bundle.grounded=[];bundle.conditional=[];}else bundle.quality.lineage.semantic_source_digest='0'.repeat(64);
      await writeFile(target,JSON.stringify(bundle)+'\n');
    }
    const before=await bytesSnapshot(f.legacy);const result=await migration.migrateLegacyRun(f.catalog,f.legacy);
    assert.equal(result.outcome,'migration_review_required');assert.equal(result.result_kind,'legacy_noncanonical');
    assert.deepEqual(await bytesSnapshot(f.legacy),before);
    await assert.rejects(()=>readFile(path.join(result.sibling_run_directory,'output/current.json')), {code:'ENOENT'});
  });
});
test('T13 active complete v3 run creates one bound sibling seed and bidirectional index',async()=>{
  assert.equal(typeof migration.migrateLegacyRun,'function');
  await use(await fixture('all-e3',false),async f=>{
    const before=await bytesSnapshot(f.legacy);
    const first=await migration.migrateLegacyRun(f.catalog,f.legacy);
    const second=await migration.migrateLegacyRun(f.catalog,f.legacy);
    assert.deepEqual(second,first);assert.notEqual(first.v4_run_id,f.runId);
    assert.equal(first.outcome,'migrated',JSON.stringify(first));
    const index=JSON.parse(await readFile(path.join(f.catalog,'migrations/v4/index.json'),'utf8'));
    assert.equal(index.transactions.length,1);assert.equal(index.transactions[0].v3_run_id,f.runId);
    assert.equal(index.transactions[0].phase,'complete');assert.equal(index.transactions[0].phase_version,5);
    assert.equal(index.transactions[0].v4_run_id,first.v4_run_id);
    const siblingInstance=JSON.parse(await readFile(path.join(first.sibling_run_directory,'run-instance.json'),'utf8'));
    assert.deepEqual(validateAgainstSchema(siblingInstance,runInstanceSchema),[]);
    assert.equal(siblingInstance.run_id,first.v4_run_id);assert.equal(siblingInstance.delivery_intent,'case_document');
    assert.deepEqual(siblingInstance.lineage,{parent_run_id:f.runId,creation_reason:'migration_v3'});
    const seed=JSON.parse(await readFile(path.join(first.sibling_run_directory,'derived/migration-replay-seed.json'),'utf8'));
    assert.equal(seed.schema_version,'4.0.0');assert.equal(seed.parent_run_id,f.runId);
    assert.equal(seed.source_revision,0);assert.equal(seed.replay_mode,'source_reanalysis');
    assert.equal(seed.legacy_artifacts.length,4);assert.equal(seed.authority,'migration_seed');
    assert.equal(Object.hasOwn(seed,'evidence_claims'),false);
    assert.deepEqual(await bytesSnapshot(f.legacy),before);
    assert.deepEqual(await migration.queryLegacyMigration(f.catalog,first.v4_run_id),await migration.queryLegacyMigration(f.catalog,f.runId));
  });
});
test('T13 a review-required migration sibling cannot produce a canonical v4 manifest',async()=>{
  await use(await fixture('all-e3',false),async f=>{
    await rm(path.join(f.legacy,'accepted'),{recursive:true});
    await rm(path.join(f.legacy,'derived'),{recursive:true});
    const migrated=await migration.migrateLegacyRun(f.catalog,f.legacy);
    assert.equal(migrated.outcome,'migration_review_required');
    const reply=await advanceStrict(migrated.sibling_run_directory);
    assert.equal(reply.status,'fatal');
    assert.match(JSON.stringify(reply),/MIGRATION_REVIEW_REQUIRED/u);
    await assert.rejects(()=>readFile(path.join(migrated.sibling_run_directory,'output/current.json')), {code:'ENOENT'});
  });
});
test('T13 no complete revision freezes raw snapshot and converges concurrent/replayed migration',async()=>{
  assert.equal(typeof migration.migrateLegacyRun,'function');
  await use(await fixture('all-e3',false),async f=>{
    await rm(path.join(f.legacy,'accepted'),{recursive:true});await rm(path.join(f.legacy,'derived'),{recursive:true});
    const before=await bytesSnapshot(f.legacy);
    const [a,b]=await Promise.all([migration.migrateLegacyRun(f.catalog,f.legacy),migration.migrateLegacyRun(f.catalog,f.legacy)]);
    assert.deepEqual(a,b);assert.equal(a.outcome,'migration_review_required');
    assert.equal(a.source_identity.kind,'raw_run_snapshot');assert.match(a.migration_txn_id,/^MIG-[a-f0-9]{64}$/u);
    assert.ok(a.diagnostics.includes('LAST_COMPLETE_REVISION_MISSING'));assert.ok(a.user_next_steps.length>0);
    assert.deepEqual(await bytesSnapshot(f.legacy),before);
    await writeFile(path.join(f.legacy,'extra.txt'),'a later mutation');
    const mutated=await migration.migrateLegacyRun(f.catalog,f.legacy);
    assert.equal(mutated.status,'legacy_source_mutated');assert.equal(mutated.migration_txn_id,a.migration_txn_id);
    const index=JSON.parse(await readFile(path.join(f.catalog,'migrations/v4/index.json'),'utf8'));assert.equal(index.transactions.length,1);
  });
});
test('T13 a v4 run cannot use migration to fall back to the v3 compiler',async()=>{
  assert.equal(typeof migration.migrateLegacyRun,'function');
  await use(await fixture(),async f=>{
    const file=path.join(f.legacy,'run-instance.json');const value=JSON.parse(await readFile(file,'utf8'));value.schema_version='4.0.0';await writeFile(file,JSON.stringify(value));
    const before=await bytesSnapshot(f.legacy);
    await assert.rejects(()=>migration.migrateLegacyRun(f.catalog,f.legacy),/MIGRATION_REQUIRES_V3/u);
    assert.deepEqual(await bytesSnapshot(f.legacy),before);assert.deepEqual(await readdir(f.catalog),[]);
  });
});
test('T13 legacy pending/partial-answer suppression reopens only omitted roots and preserves explicit user intent',async()=>{
  const api=await import('../../src/migrate-v3-run.mjs');
  assert.equal(typeof api.mapLegacyClarification,'function');
  const makeRoot=(/** @type {string} */ id)=>({root_issue_id:'root_'+id,root_issue_key:canonicalStringify({missing_type:'oracle',semantic_refs:['claim_'+id],scope:'refund'}),missing_type:'oracle',semantic_refs:['claim_'+id],scope:'refund',answerable:true,question:'Which refund result?',current:true,affected_obligation_ids:['obligation_'+id]});
  const roots=['a','b','c','d','e'].map(makeRoot);
  const evidence={claims:roots.map((_,i)=>({claim_id:'claim_'+['a','b','c','d','e'][i]})),fact_ledger:['a','b','c','d','e'].map(id=>({fact_id:'fact_'+id,claim_id:'claim_'+id,source_claim_ids:['claim_'+id]}))};
  const prior={source_revision:0,last_pending_root_issue_ids:roots.map(r=>r.root_issue_id),root_snapshot_ledger:roots,root_issue_dispositions:roots.map(r=>({root_issue_id:r.root_issue_id,status:'asked'}))};
  const current={...prior,source_revision:1,last_pending_root_issue_ids:[],root_issue_dispositions:roots.map((r,i)=>({root_issue_id:r.root_issue_id,status:i===0?'resolved_temporary':i===3?'suppressed_unknown':'suppressed_deferred'}))};
  const source={decision_records:[{root_issue_ids:['root_a'],disposition:'temporary',clarification_event_seq:1},{root_issue_ids:['root_c'],disposition:'deferred',clarification_event_seq:2},{root_issue_ids:['root_d'],disposition:'unknown',clarification_event_seq:3}],clarification_events:[{type:'request_delivery',root_issue_ids:['root_e'],clarification_event_seq:4}]};
  const result=api.mapLegacyClarification(current,[prior],source,evidence);
  assert.deepEqual(result.items.map(i=>[i.legacy_root_id,i.status]),[['root_a','resolved_temporary'],['root_b','presented'],['root_c','deferred_by_user'],['root_d','unknown_by_user'],['root_e','closed_for_delivery']]);
  assert.deepEqual(result.remaining_root_ids,['root_b']);
  assert.equal(result.items[1].reason_code,'REOPENED_PARTIAL_ANSWER_OMISSION');
  assert.equal(result.items[1].root_issue_id,'ROOT-'+digest({subject_fact_ids:['fact_b'],missing_aspect:'oracle',scope_ref:'refund'}));
  const unknown=api.mapLegacyClarification(current,[],{decision_records:[],clarification_events:[]},evidence);
  assert.ok(unknown.diagnostics.includes('LEGACY_SUPPRESSION_CAUSE_UNPROVEN'));
  const ambiguous=structuredClone(evidence);ambiguous.fact_ledger.push({fact_id:'fact_b_other',claim_id:'claim_b',source_claim_ids:['claim_b']});
  assert.ok(api.mapLegacyClarification(current,[prior],source,ambiguous).diagnostics.includes('ROOT_MAPPING_AMBIGUOUS'));
});
test('T13 persisted pending state reaches the sibling mapping, while hazards require source reanalysis',async()=>{
  await use(await fixture('all-e3',false),async f=>{
    const state=JSON.parse(await readFile(path.join(f.legacy,'derived/r000/clarification-state.json'),'utf8'));
    const key={missing_type:'oracle',semantic_refs:['claim_login'],scope:'login'};
    state.root_snapshot_ledger=[{root_issue_id:'root_pending',root_issue_key:canonicalStringify(key),...key,question:'What result is expected?',answerable:true,current:true,affected_obligation_ids:[]}];
    state.root_issue_dispositions=[{root_issue_id:'root_pending',status:'asked'}];state.last_pending_root_issue_ids=['root_pending'];
    await writeFile(path.join(f.legacy,'derived/r000/clarification-state.json'),JSON.stringify(state));
    const sourceFile=path.join(f.legacy,'accepted/r000/source-pack.json');
    const source=JSON.parse(await readFile(sourceFile,'utf8'));source.source_assets.push({asset_id:'legacy_fake',source_id:source.sources[0].source_id,uri:'placeholder://screenshot',status:'unavailable',reason:'unavailable'});
    // The invalid historical asset remains audit evidence; it cannot be silently upgraded.
    await writeFile(sourceFile,JSON.stringify(source));
    const result=await migration.migrateLegacyRun(f.catalog,f.legacy);
    assert.ok(result.diagnostics.includes('REQUIRES_SOURCE_REANALYSIS_PSEUDO_URI'));
    assert.equal(result.outcome,'migration_blocked_source_unavailable');
  });
});
test('T13 completed checksums cannot launder a changed expected result into a verified legacy delivery',async()=>{
  await use(await fixture(),async f=>{
    const target=path.join(f.legacy,'output/r000/test-bundle.json');const bundle=JSON.parse(await readFile(target,'utf8'));
    bundle.grounded[0].title='A forged different business result';
    await writeFile(target,JSON.stringify(bundle));
    const currentFile=path.join(f.legacy,'output/current.json'),checkpointFile=path.join(f.legacy,'checkpoint.json');
    const current=JSON.parse(await readFile(currentFile,'utf8'));current.bundle_digest=digest(bundle);await writeFile(currentFile,JSON.stringify(current));
    const checkpoint=JSON.parse(await readFile(checkpointFile,'utf8'));checkpoint.accepted_artifact_digests.test_bundle=digest(bundle);await writeFile(checkpointFile,JSON.stringify(checkpoint));
    const result=await migration.migrateLegacyRun(f.catalog,f.legacy);
    assert.equal(result.result_kind,'legacy_noncanonical');assert.equal(result.outcome,'migration_review_required');
  });
});
test('T13 replay verifies seed, report, phase semantics and every old byte before consuming migration data',async()=>{
  await use(await fixture('all-e3',false),async f=>{
    const result=await migration.migrateLegacyRun(f.catalog,f.legacy);
    const seed=await migration.loadMigrationReplaySeed(f.catalog,result.sibling_run_directory);
    assert.equal(seed.parent_run_id,f.runId);
    const target=path.join(result.sibling_run_directory,'derived/migration-replay-seed.json');
    const changed={...seed,untrusted_success:true};await writeFile(target,canonicalStringify(changed)+'\n');
    // Even a fully rehashed report/index cannot authorize an open seed contract.
    const reportFile=path.join(f.catalog,'migrations/v4/reports',result.migration_txn_id+'.json');
    const report=JSON.parse(await readFile(reportFile,'utf8'));report.seed_digest=byteDigest(canonicalStringify(changed)+'\n');await writeFile(reportFile,canonicalStringify(report)+'\n');
    const indexFile=path.join(f.catalog,'migrations/v4/index.json');const index=JSON.parse(await readFile(indexFile,'utf8'));
    index.transactions[0].report.digest=byteDigest(canonicalStringify(report)+'\n');await writeFile(indexFile,canonicalStringify(index)+'\n');
    await assert.rejects(()=>migration.loadMigrationReplaySeed(f.catalog,result.sibling_run_directory),/MIGRATION_SEED_INVALID/u);
  });
});
test('T13 committed migration cannot hide a deleted or replaced sibling seed during idempotent replay',async()=>{
  await use(await fixture('all-e3',false),async f=>{
    const result=await migration.migrateLegacyRun(f.catalog,f.legacy);
    await rm(path.join(result.sibling_run_directory,'derived/migration-replay-seed.json'));
    await assert.rejects(()=>migration.migrateLegacyRun(f.catalog,f.legacy),/MIGRATION_SEED/u);
  });
});
test('T13 trapped malformed metadata still reserves a stable raw snapshot and cancelled history is never resumed in place',async()=>{
  for(const mode of ['malformed','cancelled'])await use(await fixture('all-e3',false),async f=>{
    if(mode==='malformed'){
      await rm(path.join(f.legacy,'accepted'),{recursive:true});await writeFile(path.join(f.legacy,'checkpoint.json'),'{');
    }else{
      const target=path.join(f.legacy,'checkpoint.json'),checkpoint=JSON.parse(await readFile(target,'utf8'));checkpoint.stage='cancelled';await writeFile(target,JSON.stringify(checkpoint));
    }
    const before=await bytesSnapshot(f.legacy),result=await migration.migrateLegacyRun(f.catalog,f.legacy);
    assert.equal(result.outcome,'migration_review_required');assert.deepEqual(await bytesSnapshot(f.legacy),before);
    const seed=await migration.loadMigrationReplaySeed(f.catalog,result.sibling_run_directory);
    assert.equal(seed.creation_reason,mode==='cancelled'?'resume_cancelled':'migration_v3');
    assert.equal(result.diagnostics.includes(mode==='cancelled'?'LEGACY_RUN_CANCELLED':'LAST_COMPLETE_REVISION_MISSING'),true);
  });
});
test('T13 migration phase schema and CAS reject open shapes, skipped phases, stale versions and early outcomes',async()=>{
  const {validateAgainstSchema}=await import('../../src/schema-validator.mjs');
  const schema=(await import('../../skill/generate-test-cases/scripts/schemas/migration-index.schema.json',{with:{type:'json'}})).default;
  const api=await import('../../src/migrate-v3-run.mjs');
  await use(await fixture('all-e3',false),async f=>{
    const result=await migration.migrateLegacyRun(f.catalog,f.legacy),row=await migration.queryLegacyMigration(f.catalog,result.v4_run_id);
    const reserved={...row,phase:'reserved',phase_version:1,report:null,outcome:null};
    const second={...reserved,phase:'sibling_created',phase_version:2};
    assert.equal(api.validateMigrationTransition(reserved,second),true);
    for(const edit of [{phase:'complete',phase_version:5,outcome:'migrated'},{phase:'sibling_created',phase_version:1},{outcome:'migrated'},{v4_run_id:null},{extra:true}]){
      const changed={...second,...edit};
      assert.throws(()=>api.validateMigrationTransition(reserved,changed),/MIGRATION_/u);
    }
    for(const edit of [{source_identity:{kind:'complete_revision',revision_digest:row.source_identity.revision_digest,snapshot_digest:row.source_snapshot_digest}},{outcome:null},{report:null},{v4_run_id:null},{phase_version:4}]){
      const changed={schema_version:'4.0.0',transactions:[{...row,...edit}],source_mutations:[]};
      assert.notDeepEqual(validateAgainstSchema(changed,schema),[]);
    }
    const indexFile=path.join(f.catalog,'migrations/v4/index.json');
    const duplicate={schema_version:'4.0.0',transactions:[row,row],source_mutations:[]};await writeFile(indexFile,JSON.stringify(duplicate));
    await assert.rejects(()=>migration.queryLegacyMigration(f.catalog,f.runId),/MIGRATION_INDEX_DUPLICATE/u);
  });
});
test('T13 every catalog phase survives before/after process crashes without new siblings or old-byte writes',async()=>{
  const {spawn}=await import('node:child_process');
  for(const phase of ['reserved','sibling_created','report_committed','index_committed'])for(const edge of ['before','after'])await use(await fixture('all-e3',false),async f=>{
    const before=await bytesSnapshot(f.legacy);
    const crashed=await new Promise(resolve=>{
      const child=spawn(process.execPath,[new URL('../fixtures/v4/migration-crash-driver.mjs',import.meta.url).pathname,f.catalog,f.legacy,phase,edge],{stdio:['ignore','pipe','pipe']});
      let stderr='';child.stderr.on('data',(/** @type {any} */ bytes)=>{stderr+=bytes;});
      child.on('close',(/** @type {any} */ code,/** @type {any} */ signal)=>resolve({code,signal,stderr}));
    });
    assert.equal(crashed.signal,'SIGKILL',JSON.stringify(crashed));
    let prior=null;try{prior=JSON.parse(await readFile(path.join(f.catalog,'migrations/v4/index.json'),'utf8')).transactions[0];}catch{}
    if(prior){assert.equal(prior.outcome,null);assert.ok(prior.phase_version<=4);}
    const first=await migration.migrateLegacyRun(f.catalog,f.legacy),second=await migration.migrateLegacyRun(f.catalog,f.legacy);
    assert.deepEqual(first,second);if(prior)assert.equal(first.migration_txn_id,prior.migration_txn_id);
    const final=await migration.queryLegacyMigration(f.catalog,f.runId);assert.equal(final.phase,'complete');assert.equal(final.phase_version,5);
    assert.equal((await readdir(path.join(f.catalog,'runs'))).length,1);
    assert.deepEqual(await bytesSnapshot(f.legacy),before);
  });
});
test('T13 resolved legacy statuses require their explicit Decision and typed fact refs map without guessing',async()=>{
  const api=await import('../../src/migrate-v3-run.mjs');
  const reference=canonicalStringify({kind:'facts',fact_ids:['fact_one']});
  const root={root_issue_id:'root_one',missing_type:'oracle',scope:'refund',semantic_refs:[reference],answerable:true};
  const state={root_snapshot_ledger:[root],root_issue_dispositions:[{root_issue_id:'root_one',status:'resolved_final'}]};
  const evidence={fact_ledger:[{fact_id:'fact_one',claim_id:'claim_one',source_claim_ids:['claim_one']}]};
  const mapped=api.mapLegacyClarification(state,[],{decision_records:[],clarification_events:[]},evidence);
  assert.ok(mapped.diagnostics.includes('LEGACY_RESOLUTION_CAUSE_UNPROVEN'));
  assert.equal(mapped.items[0].status,'presented');
  assert.equal(mapped.items[0].root_issue_id,'ROOT-'+digest({subject_fact_ids:['fact_one'],missing_aspect:'oracle',scope_ref:'refund'}));
});
test('T13 a mixed higher v4 accepted revision never falls back to the older v3 revision',async()=>{
  await use(await fixture('all-e3',false),async f=>{
    await mkdir(path.join(f.legacy,'accepted/r001'),{recursive:true});
    for(const [key,file] of Object.entries(files))await writeFile(path.join(f.legacy,'accepted/r001',file),JSON.stringify({...f.input[key],schema_version:'4.0.0',source_revision:1}));
    const before=await bytesSnapshot(f.legacy);
    await assert.rejects(()=>migration.migrateLegacyRun(f.catalog,f.legacy),/MIGRATION_MIXED_SCHEMA/u);
    assert.deepEqual(await bytesSnapshot(f.legacy),before);assert.deepEqual(await readdir(f.catalog),[]);
  });
});
test('T13 persisted semantic pending roots survive in sibling presented/remaining instead of becoming resolved',async()=>{
  await use(await fixture('all-e3',false),async f=>{
    const fact=f.input.evidence_claims.fact_ledger[0],statePath=path.join(f.legacy,'derived/r000/clarification-state.json');
    const state=JSON.parse(await readFile(statePath,'utf8'));
    state.root_snapshot_ledger=[{root_issue_id:'root_pending',root_issue_key:'legacy-pending',missing_type:'oracle',semantic_refs:[fact.claim_id],scope:'refund',question:'What is the expected refund?',answerable:true,current:true}];
    state.root_issue_dispositions=[{root_issue_id:'root_pending',status:'asked'}];state.last_pending_root_issue_ids=['root_pending'];
    await writeFile(statePath,JSON.stringify(state));
    const result=await migration.migrateLegacyRun(f.catalog,f.legacy),seed=await migration.loadMigrationReplaySeed(f.catalog,result.sibling_run_directory);
    assert.deepEqual(seed.remaining_root_ids,['root_pending']);assert.equal(seed.clarification_mapping[0].status,'presented');
    assert.equal(seed.clarification_mapping[0].root_issue_id,'ROOT-'+digest({subject_fact_ids:[fact.fact_id],missing_aspect:'oracle',scope_ref:'refund'}));
  });
});
test('T13 v3 pseudo bounds, N/A integration and generic state/cleanup remain explicit reanalysis diagnostics',async()=>{
  await use(await fixture('all-e3',false),async f=>{
    const file=path.join(f.legacy,'accepted/r000/behavior-views.json');
    const artifact=JSON.parse(await readFile(file,'utf8'));
    artifact.views[0].elements[0].lower=0;artifact.views[0].elements[0].upper=100;
    artifact.views[0].elements[0].surface='N/A';artifact.views[0].elements[0].cleanup={description:'Restore all original state'};
    await writeFile(file,JSON.stringify(artifact));
    const result=await migration.migrateLegacyRun(f.catalog,f.legacy);
    for(const code of ['BOUNDS','NA_SURFACE','GENERIC_STATE_CLEANUP'])assert.ok(result.diagnostics.includes('REQUIRES_SOURCE_REANALYSIS_'+code),code);
    assert.equal(result.outcome,'migration_review_required');
  });
});
test('T13 finished malformed JSON or divergent Markdown must be reviewed without touching historical bytes',async()=>{
  for(const mode of ['json','markdown'])await use(await fixture(),async f=>{
    await writeFile(path.join(f.legacy,'output/r000',mode==='json'?'test-bundle.json':'test-cases.md'),mode==='json'?'{':'A different final plan');
    const before=await bytesSnapshot(f.legacy),result=await migration.migrateLegacyRun(f.catalog,f.legacy);
    assert.equal(result.result_kind,'legacy_noncanonical');assert.equal(result.outcome,'migration_review_required');
    assert.deepEqual(await bytesSnapshot(f.legacy),before);
  });
});
test('T13 raw snapshot identity uses NFC Unicode-scalar path order and is stable across 100 replays of root mapping',async()=>{
  await use(await fixture('all-e3',false),async f=>{
    await rm(path.join(f.legacy,'accepted'),{recursive:true});await rm(path.join(f.legacy,'derived'),{recursive:true});
    await writeFile(path.join(f.legacy,'\uE000.txt'),'one');await writeFile(path.join(f.legacy,'\u{10000}.txt'),'two');
    const rows=await bytesSnapshot(f.legacy);
    const ordered=[...rows.filter(row=>!['\uE000.txt','\u{10000}.txt'].includes(row.path)),rows.find(row=>row.path==='\uE000.txt'),rows.find(row=>row.path==='\u{10000}.txt')];
    const result=await migration.migrateLegacyRun(f.catalog,f.legacy);
    assert.equal(result.source_identity.snapshot_digest,'sha256:'+digest(ordered));
    const api=await import('../../src/migrate-v3-run.mjs');
    const state={root_snapshot_ledger:[{root_issue_id:'root_a',missing_type:'oracle',scope:'refund',semantic_refs:['claim_a'],answerable:true}],root_issue_dispositions:[{root_issue_id:'root_a',status:'asked'}]};
    const evidence={fact_ledger:[{fact_id:'fact_a',claim_id:'claim_a'}]};
    const expected=canonicalStringify({items:[{legacy_root_id:'root_a',root_issue_id:'ROOT-'+digest({subject_fact_ids:['fact_a'],missing_aspect:'oracle',scope_ref:'refund'}),status:'presented',reason_code:'LEGACY_PENDING_PRESERVED'}],remaining_root_ids:['root_a'],diagnostics:[]});
    for(let i=0;i<100;i+=1)assert.equal(canonicalStringify(api.mapLegacyClarification(state,[],{decision_records:[],clarification_events:[]},evidence)),expected);
  });
});
