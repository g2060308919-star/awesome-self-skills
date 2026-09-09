import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import migrationSchema from '../skill/generate-test-cases/scripts/schemas/migration-index.schema.json' with {type:'json'};
import runInstanceSchema from '../skill/generate-test-cases/scripts/schemas/run-instance.schema.json' with {type:'json'};
import sourceSchema from '../skill/generate-test-cases/scripts/schemas/source-pack.schema.json' with {type:'json'};
import evidenceSchema from '../skill/generate-test-cases/scripts/schemas/evidence-claims.schema.json' with {type:'json'};
import viewsSchema from '../skill/generate-test-cases/scripts/schemas/behavior-views.schema.json' with {type:'json'};
import casesSchema from '../skill/generate-test-cases/scripts/schemas/case-drafts.schema.json' with {type:'json'};
import bundleSchema from '../skill/generate-test-cases/scripts/schemas/test-bundle.schema.json' with {type:'json'};
import { canonicalStringify, digest } from './canonical.mjs';
import { validateAgainstSchema } from './schema-validator.mjs';
import { validateSourceIntegrity } from './decision-record.mjs';
import { validateEvidenceGraph } from './evidence.mjs';
import { acquireRunLock, atomicWriteJson, readJsonIfPresent, readTextIfPresent, STAGE_FILES, revisionName } from './run-store.mjs';

const PHASES=['reserved','sibling_created','report_committed','index_committed','complete'];
const OUTCOMES=['migrated','migration_review_required','migration_blocked_source_unavailable'];
const STAGE_SCHEMAS={source_pack:sourceSchema,evidence_claims:evidenceSchema,behavior_views:viewsSchema,case_drafts:casesSchema};
const INDEX_PATH='migrations/v4/index.json';
const { lstat, realpath } = /** @type {any} */ (await import('node:fs/promises'));
/** @param {any} value */const byteDigest=value=>'sha256:'+createHash('sha256').update(value).digest('hex');
/** @param {string} code */const fail=code=>{throw new TypeError(code);};
/** @param {string} a @param {string} b */
function compare(a,b) {
  const left=Array.from(a,character=>character.codePointAt(0)??0),right=Array.from(b,character=>character.codePointAt(0)??0);
  for(let index=0;index<Math.min(left.length,right.length);index+=1)if(left[index]!==right[index])return left[index]-right[index];
  return left.length-right.length;
}
/** @param {string} value */const ignored=value=>/^\.compiler-advance\.lock(?:\.|$)/u.test(value)||value==='.compiler-advance.transaction'||/^\..+\.tmp-[0-9]+-[0-9]+$/u.test(value);
/** @param {string} directory */
async function realDirectory(directory) {
  if(!path.isAbsolute(directory))fail('MIGRATION_ABSOLUTE_DIRECTORY_REQUIRED');
  const stat=await lstat(directory);
  if(stat.isSymbolicLink()||!stat.isDirectory())fail('MIGRATION_UNSAFE_DIRECTORY');
  return realpath(directory);
}
/** Snapshot raw regular files only. NFC path collisions and symlinks fail closed.
 * @param {string} directory */
async function snapshot(directory) {
  /** @type {any[]} */const entries=[];
  const paths=new Set();
  /** @param {string} target */async function visit(target) {
    for(const entry of await readdir(target,{withFileTypes:true})) {
      if(ignored(entry.name))continue;
      const full=path.join(target,entry.name);
      if(entry.isSymbolicLink())fail('MIGRATION_LEGACY_SYMLINK');
      if(entry.isDirectory())await visit(full);
      else {
        if(!entry.isFile())fail('MIGRATION_LEGACY_SPECIAL_FILE');
        const relative=path.relative(directory,full).split(path.sep).join('/').normalize('NFC');
        if(paths.has(relative))fail('MIGRATION_NFC_PATH_COLLISION');paths.add(relative);
        const bytes=await readFile(full);
        entries.push({path:relative,byte_length:bytes.length,byte_sha256:byteDigest(bytes)});
      }
    }
  }
  await visit(directory);entries.sort((a,b)=>compare(a.path,b.path));
  return {entries,digest:'sha256:'+digest(entries)};
}
/** @param {string} directory @param {string} relative */
async function json(directory,relative) {
  const file=await readJsonIfPresent(directory,path.join(directory,relative));
  return file?.value??null;
}
/** Malformed legacy work is retained in the raw snapshot, not repaired in place.
 * Catalog corruption still fails closed through the strict json reader.
 * @param {string} directory @param {string} relative */
async function legacyJson(directory,relative) {
  try{return await json(directory,relative);}catch(error){if(error instanceof SyntaxError)return null;throw error;}
}
/** @param {any} index */
function validateIndex(index) {
  if(validateAgainstSchema(index,migrationSchema).length)fail('MIGRATION_INDEX_INVALID');
  const sourceIds=new Set(),txnIds=new Set(),siblingIds=new Set();
  for(const item of index.transactions) {
    if(sourceIds.has(item.v3_run_id)||txnIds.has(item.migration_txn_id)||item.v4_run_id&&siblingIds.has(item.v4_run_id))fail('MIGRATION_INDEX_DUPLICATE');
    sourceIds.add(item.v3_run_id);txnIds.add(item.migration_txn_id);if(item.v4_run_id)siblingIds.add(item.v4_run_id);
    if(item.migration_txn_id!=='MIG-'+digest({v3_run_id:item.v3_run_id,source_identity:item.source_identity}))fail('MIGRATION_IDENTITY_INVALID');
  }
  for(const row of index.source_mutations)if(!txnIds.has(row.migration_txn_id))fail('MIGRATION_INDEX_INVALID');
  return index;
}
/** @param {string} catalog */
async function indexAt(catalog) {
  return validateIndex(await json(catalog,INDEX_PATH)??{schema_version:'4.0.0',transactions:[],source_mutations:[]});
}
/** Validate a catalog compare-and-swap independently of filesystem lock ownership.
 * @param {any} prior @param {any} next */
export function validateMigrationTransition(prior,next) {
  const schema={$ref:'#/$defs/transaction',$defs:migrationSchema.$defs};
  if(validateAgainstSchema(prior,schema).length||validateAgainstSchema(next,schema).length)fail('MIGRATION_PHASE_INVALID');
  if(next.phase_version!==prior.phase_version+1||PHASES.indexOf(next.phase)!==PHASES.indexOf(prior.phase)+1)fail('MIGRATION_PHASE_CAS_FAILED');
  for(const key of ['migration_txn_id','v3_run_id','source_identity','source_snapshot_digest','legacy_run_directory','source_revision','legacy_status','created_at'])
    if(canonicalStringify(prior[key])!==canonicalStringify(next[key]))fail('MIGRATION_FROZEN_IDENTITY_CHANGED');
  if(prior.v4_run_id!==null&&next.v4_run_id!==prior.v4_run_id)fail('MIGRATION_SIBLING_CHANGED');
  if(prior.report!==null&&canonicalStringify(prior.report)!==canonicalStringify(next.report))fail('MIGRATION_REPORT_CHANGED');
  return true;
}
/** @param {string} catalog @param {any} old @param {any} next */
async function compareAndSwap(catalog,old,next) {
  validateMigrationTransition(old,next);
  const current=await indexAt(catalog),position=current.transactions.findIndex((/** @type {any} */ row)=>row.migration_txn_id===old.migration_txn_id);
  if(position<0||canonicalStringify(current.transactions[position])!==canonicalStringify(old))fail('MIGRATION_PHASE_CAS_FAILED');
  current.transactions[position]=next;
  await atomicWriteJson(catalog,path.join(catalog,INDEX_PATH),validateIndex(current));
}
/** Complete means all four schema-valid immutable v3 artifacts, not a checkpoint claiming finished.
 * @param {string} directory @param {any[]} entries @param {string} runId */
async function lastComplete(directory,entries,runId) {
  for(const row of entries.filter(item=>/^accepted\/r[0-9]+\/(?:source-pack|evidence-claims|behavior-views|case-drafts)\.json$/u.test(item.path))) {
    if((await legacyJson(directory,row.path))?.schema_version==='4.0.0')fail('MIGRATION_MIXED_SCHEMA');
  }
  const revisions=[...new Set(entries.map(row=>/^accepted\/r([0-9]+)\//u.exec(row.path)?.[1]).filter(Boolean))]
    .map(Number).sort((a,b)=>b-a);
  for(const revision of revisions) {
    const prefix='accepted/'+revisionName(revision)+'/';
    const refs=Object.entries(STAGE_FILES).map(([stage,file])=>({stage,...entries.find(row=>row.path===prefix+file)}));
    if(refs.some(ref=>!ref.path))continue;
    const artifacts=Object.fromEntries(await Promise.all(refs.map(async ref=>[ref.stage,await legacyJson(directory,ref.path)])));
    let valid=true;
    for(const [stage,value] of Object.entries(artifacts))if(!value||value.schema_version!=='3.0.0'||value.source_revision!==revision
      ||validateAgainstSchema(value,/** @type {any} */(STAGE_SCHEMAS)[stage]).length)valid=false;
    if(!valid||artifacts.source_pack.run_instance_id!==runId)continue;
    return {revision,artifacts,refs,revision_digest:'sha256:'+digest(refs.map(({stage,...row})=>row).sort((a,b)=>compare(a.path,b.path)))};
  }
  return null;
}
/** @param {string} directory @param {any} complete @param {any} checkpoint */
async function legacyDelivery(directory,complete,checkpoint) {
  if(checkpoint?.stage!=='finished')return null;
  const wrapper={authority:'legacy_read_only',v3_run_id:checkpoint.run_instance_id,source_revision:checkpoint.source_revision};
  if(!complete||complete.revision!==checkpoint.source_revision)return {...wrapper,result_kind:'legacy_noncanonical'};
  const bundle=await legacyJson(directory,'output/'+revisionName(complete.revision)+'/test-bundle.json');
  const current=await legacyJson(directory,'output/current.json');
  if(!bundle||bundle.schema_version!=='3.0.0'||validateAgainstSchema(bundle,bundleSchema).length
    ||current?.status!=='ready'||current.source_revision!==complete.revision||current.run_instance_id!==checkpoint.run_instance_id
    ||current.bundle_digest!==digest(bundle)||checkpoint.accepted_artifact_digests?.test_bundle!==digest(bundle))return {...wrapper,result_kind:'legacy_noncanonical'};
  for(const [key,value] of Object.entries(complete.artifacts))if(checkpoint.accepted_artifact_digests?.[key]!==digest(value))return {...wrapper,result_kind:'legacy_noncanonical'};
  const source=complete.artifacts.source_pack;
  const evidence=validateEvidenceGraph(source,complete.artifacts.evidence_claims);
  if(validateSourceIntegrity(source).length||evidence.diagnostics.length)return {...wrapper,result_kind:'legacy_noncanonical'};
  const count=bundle.grounded.length+bundle.conditional.length,formal=bundle.coverage.formal;
  if(formal.total!==formal.entries.length||formal.covered!==formal.entries.filter((/** @type {any} */ row)=>['grounded','conditional'].includes(row.status)).length
    ||bundle.coverage.requirements.total!==bundle.coverage.requirements.entries.length
    ||bundle.coverage.requirements.accounted!==bundle.coverage.requirements.total)return {...wrapper,result_kind:'legacy_noncanonical'};
  if(!await verifyLegacyReplay(directory,complete,bundle))return {...wrapper,result_kind:'legacy_noncanonical'};
  if(count>0&&formal.entries.every((/** @type {any} */ row)=>['grounded','conditional','blocked','not_applicable'].includes(row.status))
    &&bundle.quality.compiler_version==='0.4.0')return {...wrapper,result_kind:'legacy_delivered_cases'};
  const nas=bundle.coverage.not_applicable;
  if(count===0&&bundle.blocked.length===0&&formal.total>0&&formal.entries.every((/** @type {any} */ row)=>row.status==='not_applicable')
    &&nas.length===formal.total&&nas.every((/** @type {any} */ row)=>{
      const claim=evidence.claimsById.get(row.exclusion_claim_id);
      return row.support_review==='supported'&&claim?.kind==='requirement'&&['E3','E2'].includes(String(claim.level));
    }))
    return {...wrapper,result_kind:'legacy_no_applicable_cases'};
  return {...wrapper,result_kind:'legacy_noncanonical'};
}
/** Recompute the old production chain, never trust a rehashed bundle alone.
 * @param {string} directory @param {any} complete @param {any} bundle */
async function verifyLegacyReplay(directory,complete,bundle) {
  const {evaluateRevision}=await import('./core.mjs');
  /** @type {any} */let state=null;
  /** @type {any} */let workflow=null;
  /** @type {any} */let previous=null;
  /** @type {any} */let result=null;
  for(let revision=0;revision<=complete.revision;revision+=1) {
    const artifacts=Object.fromEntries(await Promise.all(Object.entries(STAGE_FILES).map(async([stage,file])=>[stage,await json(directory,'accepted/'+revisionName(revision)+'/'+file)])));
    if(Object.values(artifacts).some(value=>!value))return false;
    const source=artifacts.source_pack;
    const empty={source_revision:revision,clarification_event_seq:0,asked_root_issue_ids:[],root_issue_dispositions:[],last_pending_root_issue_ids:[],last_question_set_digest:'',clarification_stop:null,semantic_snapshot:null,root_snapshot_ledger:[]};
    const append={decision_records:previous?source.decision_records.slice(previous.decision_records.length):[],clarification_events:previous?source.clarification_events.slice(previous.clarification_events.length):[]};
    result=/** @type {any} */ (evaluateRevision(artifacts,{systemLineage:{compiler_version:'0.4.0',lineage:{source_digest:digest(source),case_draft_digest:digest(artifacts.case_drafts)},expert_recall_limits:bundle.coverage.expert_recall.limits},
      clarificationState:{prior_state:state??empty,append_batch:append},workflowState:workflow,interactionPolicy:'record_only',limits:bundle.quality.limits}));
    if(!['finished','need_user_answers'].includes(result.status)||!result.clarification_state)return false;
    state=result.clarification_state;workflow=result.workflow_state??null;previous=source;
  }
  const markdown=await readTextIfPresent(directory,path.join(directory,'output',revisionName(complete.revision),'test-cases.md'));
  return result?.status==='finished'&&digest(result.bundle)===digest(bundle)&&markdown===result.markdown;
}
/** Migrate lifecycle intent without accepting old derived evidence as v4 truth.
 * The returned root is only a deterministic exact fact-subject mapping; the v4
 * reanalysis must still rebind its question/version before it may be answered.
 * @param {any} current @param {any[]} priorStates @param {any} source @param {any} evidence */
export function mapLegacyClarification(current,priorStates,source,evidence) {
  const diagnostics=new Set(),items=[],byId=new Map();
  for(const root of current?.root_snapshot_ledger??[]) {
    if(byId.has(root.root_issue_id))diagnostics.add('ROOT_MAPPING_AMBIGUOUS');
    byId.set(root.root_issue_id,root);
  }
  for(const disposition of current?.root_issue_dispositions??[]) {
    const root=byId.get(disposition.root_issue_id);
    if(!root){diagnostics.add('ROOT_MAPPING_AMBIGUOUS');continue;}
    if(root.answerable===false&&['testability','execution-preparation'].includes(root.missing_type)) {
      items.push({legacy_root_id:root.root_issue_id,root_issue_id:null,status:'execution_only',reason_code:'EXECUTION_RESOURCE_NOT_SEMANTIC'});continue;
    }
    const ids=new Set();let ambiguous=false;
    for(const ref of root.semantic_refs??[]) {
      let typed=null;try{typed=JSON.parse(ref);}catch{}
      if(typed?.kind==='facts'&&Array.isArray(typed.fact_ids)&&typed.fact_ids.length>0
        &&Object.keys(typed).every(key=>['kind','fact_ids'].includes(key))) {
        for(const id of typed.fact_ids) {
          if((evidence?.fact_ledger??[]).filter((/** @type {any} */ fact)=>fact.fact_id===id).length!==1)ambiguous=true;
          else ids.add(id);
        }
        continue;
      }
      const matches=(evidence?.fact_ledger??[]).filter((/** @type {any} */ fact)=>fact.fact_id===ref||fact.claim_id===ref);
      if(matches.length!==1){ambiguous=true;break;}ids.add(matches[0].fact_id);
    }
    const subject_fact_ids=[...ids].sort();
    if(ambiguous||subject_fact_ids.length===0)diagnostics.add('ROOT_MAPPING_AMBIGUOUS');
    let status=['open','asked'].includes(disposition.status)?'presented':disposition.status;
    let reason_code='LEGACY_PENDING_PRESERVED';
    const decisions=(source?.decision_records??[]).filter((/** @type {any} */ decision)=>decision.root_issue_ids?.includes(root.root_issue_id));
    const latest=decisions.at(-1);
    const delivery=(source?.clarification_events??[]).filter((/** @type {any} */ event)=>event.type==='request_delivery'&&event.root_issue_ids?.includes(root.root_issue_id)).at(-1);
    if(['resolved_final','resolved_temporary'].includes(status)
      &&latest?.disposition!==(status==='resolved_final'?'final':'temporary')) {
      status='presented';reason_code='RESOLUTION_CAUSE_UNPROVEN';diagnostics.add('LEGACY_RESOLUTION_CAUSE_UNPROVEN');
    }
    if(['suppressed_unknown','suppressed_deferred'].includes(status)) {
      if(delivery&&(!latest||delivery.clarification_event_seq>latest.clarification_event_seq)){status='closed_for_delivery';reason_code='EXPLICIT_REQUEST_DELIVERY';}
      else if(latest?.disposition==='deferred'){status='deferred_by_user';reason_code='EXPLICIT_DEFER';}
      else if(latest?.disposition==='unknown'){status='unknown_by_user';reason_code='EXPLICIT_UNKNOWN';}
      else {
        const asked=priorStates.filter(state=>state.last_pending_root_issue_ids?.includes(root.root_issue_id)).at(-1);
        const partial=asked&&(source?.decision_records??[]).some((/** @type {any} */ decision)=>decision.clarification_event_seq>(asked.clarification_event_seq??0)&&!decision.root_issue_ids?.includes(root.root_issue_id));
        status='presented';reason_code=partial?'REOPENED_PARTIAL_ANSWER_OMISSION':'SUPPRESSION_CAUSE_UNPROVEN';
        if(!partial)diagnostics.add('LEGACY_SUPPRESSION_CAUSE_UNPROVEN');
      }
    }
    if(!['presented','resolved_final','resolved_temporary','deferred_by_user','unknown_by_user','closed_for_delivery'].includes(status)) {
      status='presented';diagnostics.add('LEGACY_STATUS_UNPROVEN');
    }
    items.push({legacy_root_id:root.root_issue_id,root_issue_id:ambiguous||!subject_fact_ids.length?null:'ROOT-'+digest({subject_fact_ids,missing_aspect:root.missing_type,scope_ref:root.scope}),status,reason_code});
  }
  items.sort((a,b)=>compare(a.legacy_root_id,b.legacy_root_id));
  const targets=items.map(item=>item.root_issue_id).filter(Boolean);
  if(new Set(targets).size!==targets.length)diagnostics.add('ROOT_MAPPING_AMBIGUOUS');
  return {items,remaining_root_ids:items.filter(item=>item.status==='presented').map(item=>item.legacy_root_id),diagnostics:[...diagnostics].sort()};
}
/** @param {any[]} artifacts */
function detectLegacyHazards(artifacts) {
  const diagnostics=new Set();
  /** @param {any} value @param {string} key */function visit(value,key='') {
    if(typeof value==='string') {
      if(/^(?:placeholder|example|mock|fake|todo):\/\//iu.test(value)||/^https?:\/\/(?:example\.(?:com|test)|localhost)(?:[/:]|$)/iu.test(value))diagnostics.add('REQUIRES_SOURCE_REANALYSIS_PSEUDO_URI');
      if(/surface/iu.test(key)&&/^n\/?a$/iu.test(value.trim()))diagnostics.add('REQUIRES_SOURCE_REANALYSIS_NA_SURFACE');
      if(/post.?state|cleanup/iu.test(key)&&value.trim())diagnostics.add('REQUIRES_SOURCE_REANALYSIS_GENERIC_STATE_CLEANUP');
    } else if(Array.isArray(value))for(const item of value)visit(item,key);
    else if(value&&typeof value==='object')for(const [child,item] of Object.entries(value)) {
      if(['lower','upper'].includes(child))diagnostics.add('REQUIRES_SOURCE_REANALYSIS_BOUNDS');
      visit(item,child);
    }
  }
  artifacts.forEach(value=>visit(value));
  return [...diagnostics].sort();
}
/** @param {any} complete @param {any} record @param {any[]} entries */
async function analysis(complete,record,entries) {
  const diagnostics=[];
  if(!complete)diagnostics.push('LAST_COMPLETE_REVISION_MISSING');
  if(record.legacy_status==='cancelled')diagnostics.push('LEGACY_RUN_CANCELLED');
  if(record.legacy_status==='finished')diagnostics.push('LEGACY_FINISHED_NONCANONICAL');
  const accepted=await Promise.all(entries.filter(row=>/^accepted\/r[0-9]+\/.*\.json$/u.test(row.path)).map(row=>legacyJson(record.legacy_run_directory,row.path)));
  diagnostics.push(...detectLegacyHazards(accepted));
  const source=complete?.artifacts.source_pack??accepted.find(value=>Array.isArray(value?.sources));
  if(source&&(source.sources.length===0||validateSourceIntegrity(source).length))diagnostics.push('SOURCE_UNAVAILABLE');
  if(source) {
    // Legacy structured artifacts remain audit inputs only. They cannot supply
    // the required v4 field-level semantic bindings merely by changing version.
    diagnostics.push('REQUIRES_V4_SEMANTIC_REANALYSIS');
  }
  if(source?.source_assets?.some((/** @type {any} */ asset)=>['unread','unavailable'].includes(asset.status)))diagnostics.push('SOURCE_UNAVAILABLE');
  const states=(await Promise.all(entries.filter(row=>/^derived\/r[0-9]+\/clarification-state\.json$/u.test(row.path)).map(row=>legacyJson(record.legacy_run_directory,row.path)))).filter(Boolean);
  states.sort((a,b)=>a.source_revision-b.source_revision);
  const current=states.filter(state=>state.source_revision<=(complete?.revision??Infinity)).at(-1);
  const mapping=mapLegacyClarification(current,states.filter(state=>state.source_revision<(current?.source_revision??0)),source,complete?.artifacts.evidence_claims);
  diagnostics.push(...mapping.diagnostics);
  const uniqueDiagnostics=[...new Set(diagnostics)].sort();
  const outcome=uniqueDiagnostics.includes('SOURCE_UNAVAILABLE')
    ? 'migration_blocked_source_unavailable'
    : uniqueDiagnostics.some(code=>code!=='REQUIRES_V4_SEMANTIC_REANALYSIS'
      && !code.startsWith('REQUIRES_SOURCE_REANALYSIS_'))
      ? 'migration_review_required'
      : 'migrated';
  return {diagnostics:uniqueDiagnostics,mapping,outcome};
}
/** @param {any} row @param {string} catalog */
function siblingPath(row,catalog) {return path.join(catalog,'runs',row.v4_run_id);}
/** @param {any} row @param {any} complete @param {any} review */
function seedFor(row,complete,review) {
  return {schema_version:'4.0.0',authority:'migration_seed',migration_txn_id:row.migration_txn_id,run_id:row.v4_run_id,
    parent_run_id:row.v3_run_id,creation_reason:row.legacy_status==='cancelled'?'resume_cancelled':'migration_v3',
    legacy_run_directory:row.legacy_run_directory,source_identity:row.source_identity,source_snapshot_digest:row.source_snapshot_digest,
    source_revision:complete?.revision??null,replay_mode:'source_reanalysis',legacy_artifacts:complete?.refs??[],
    legacy_status:row.legacy_status,clarification_mapping:review.mapping.items,remaining_root_ids:review.mapping.remaining_root_ids,diagnostics:review.diagnostics,outcome:review.outcome};
}
/** @param {string} catalog @param {string} relative @param {unknown} value */
async function writeImmutable(catalog,relative,value) {
  const prior=await json(catalog,relative);
  if(prior!==null&&canonicalStringify(prior)!==canonicalStringify(value))fail('MIGRATION_ARTIFACT_CONFLICT');
  if(prior===null)await atomicWriteJson(catalog,path.join(catalog,relative),value);
}
/** @param {string} catalog @param {any} row */
async function reportAt(catalog,row) {
  if(!row.report)fail('MIGRATION_REPORT_MISSING');
  const bytes=await readFile(path.join(catalog,row.report.path));
  if(byteDigest(bytes)!==row.report.digest)fail('MIGRATION_REPORT_DIGEST_MISMATCH');
  const report=JSON.parse(bytes.toString('utf8'));
  if(validateAgainstSchema(report,{$ref:'#/$defs/report',$defs:migrationSchema.$defs}).length)fail('MIGRATION_REPORT_INVALID');
  if(report.migration_txn_id!==row.migration_txn_id||report.v3_run_id!==row.v3_run_id||report.v4_run_id!==row.v4_run_id
    ||canonicalStringify(report.source_identity)!==canonicalStringify(row.source_identity))fail('MIGRATION_REPORT_BINDING_INVALID');
  return report;
}
/** Read-only legacy decision followed by a durable catalog transaction; no old
 * directory is locked, repaired, reserialized or rewritten.
 * @param {string} catalogRoot @param {string} v3RunDirectory */
export async function migrateLegacyRun(catalogRoot,v3RunDirectory) {
  const catalog=await realDirectory(catalogRoot),legacy=await realDirectory(v3RunDirectory);
  if(catalog===legacy||catalog.startsWith(legacy+path.sep))fail('MIGRATION_CATALOG_INSIDE_LEGACY');
  const instance=await json(legacy,'run-instance.json');
  if(!instance||instance.schema_version!=='3.0.0'||typeof instance.run_instance_id!=='string')fail('MIGRATION_REQUIRES_V3');
  const release=await acquireRunLock(catalog);
  try {
    const index=await indexAt(catalog),captured=await snapshot(legacy);
    /** @type {any} */let row=index.transactions.find((/** @type {any} */ item)=>item.v3_run_id===instance.run_instance_id);
    if(row&&(row.legacy_run_directory!==legacy||row.source_snapshot_digest!==captured.digest)) {
      const mutation={migration_txn_id:row.migration_txn_id,code:'legacy_source_mutated',observed_snapshot_digest:captured.digest};
      if(!index.source_mutations.some((/** @type {any} */ item)=>canonicalStringify(item)===canonicalStringify(mutation))) {
        index.source_mutations.push(mutation);await atomicWriteJson(catalog,path.join(catalog,INDEX_PATH),index);
      }
      return {status:'legacy_source_mutated',migration_txn_id:row.migration_txn_id,v4_run_id:row.v4_run_id,user_next_steps:['Restore the frozen legacy bytes; continue only the existing sibling migration.']};
    }
    const checkpoint=await legacyJson(legacy,'checkpoint.json');
    const complete=await lastComplete(legacy,captured.entries,instance.run_instance_id);
    if(!row) {
      const delivered=await legacyDelivery(legacy,complete,checkpoint);
      if(delivered&&delivered.result_kind!=='legacy_noncanonical')return delivered;
      const source_identity=complete?{kind:'complete_revision',revision_digest:complete.revision_digest}:{kind:'raw_run_snapshot',snapshot_digest:captured.digest};
      const id='MIG-'+digest({v3_run_id:instance.run_instance_id,source_identity});
      const timestamp=new Date().toISOString(),hex=digest({migration_txn_id:id,role:'v4_sibling'}).slice(0,32);
      row={migration_txn_id:id,v3_run_id:instance.run_instance_id,source_identity,source_snapshot_digest:captured.digest,legacy_run_directory:legacy,
        source_revision:complete?.revision??null,legacy_status:checkpoint?.stage==='finished'?'finished':checkpoint?.stage==='cancelled'?'cancelled':'active',
        phase:'reserved',phase_version:1,outcome:null,v4_run_id:'RUN-'+[hex.slice(0,8),hex.slice(8,12),hex.slice(12,16),hex.slice(16,20),hex.slice(20)].join('-'),report:null,created_at:timestamp,updated_at:timestamp};
      index.transactions.push(row);index.transactions.sort((/** @type {any} */ a,/** @type {any} */ b)=>compare(a.v3_run_id,b.v3_run_id));
      await atomicWriteJson(catalog,path.join(catalog,INDEX_PATH),validateIndex(index));
    }
    const review=await analysis(complete,row,captured.entries),seed=seedFor(row,complete,review);
    const sibling=siblingPath(row,catalog),relative=path.relative(catalog,sibling);
    if(row.phase==='reserved') {
      const siblingInstance={schema_version:'4.0.0',compiler_version:'0.5.0',run_id:row.v4_run_id,
        delivery_intent:'case_document',created_at:row.created_at,
        lineage:{parent_run_id:row.v3_run_id,creation_reason:seed.creation_reason}};
      if(validateAgainstSchema(siblingInstance,runInstanceSchema).length)fail('MIGRATION_SIBLING_IDENTITY_INVALID');
      await writeImmutable(catalog,relative+'/run-instance.json',siblingInstance);
      await writeImmutable(catalog,relative+'/derived/migration-replay-seed.json',seed);
      const next={...row,phase:'sibling_created',phase_version:2,updated_at:new Date().toISOString()};await compareAndSwap(catalog,row,next);row=next;
    }
    if(row.phase==='sibling_created') {
      const report={schema_version:'4.0.0',migration_txn_id:row.migration_txn_id,v3_run_id:row.v3_run_id,v4_run_id:row.v4_run_id,
        source_identity:row.source_identity,outcome:review.outcome,legacy_status:row.legacy_status,
        result_kind:row.legacy_status==='finished'?'legacy_noncanonical':'migration_diagnostic',
        sibling_run_directory:sibling,seed_digest:byteDigest(canonicalStringify(seed)+'\n'),diagnostics:review.diagnostics,
        user_next_steps:row.legacy_status==='cancelled'?['The legacy run remains cancelled. Confirm a new sibling run before any source reanalysis.']:['Open the v4 sibling and reanalyse the frozen original sources; review migration diagnostics before accepting Evidence or Views.']};
      const relativeReport='migrations/v4/reports/'+row.migration_txn_id+'.json';
      await writeImmutable(catalog,relativeReport,report);
      const next={...row,phase:'report_committed',phase_version:3,report:{path:relativeReport,digest:byteDigest(canonicalStringify(report)+'\n')},updated_at:new Date().toISOString()};await compareAndSwap(catalog,row,next);row=next;
    }
    if(row.phase==='report_committed') {
      await reportAt(catalog,row);
      const next={...row,phase:'index_committed',phase_version:4,updated_at:new Date().toISOString()};await compareAndSwap(catalog,row,next);row=next;
    }
    if(row.phase==='index_committed') {
      const report=await reportAt(catalog,row);
      const next={...row,phase:'complete',phase_version:5,outcome:report.outcome,updated_at:new Date().toISOString()};await compareAndSwap(catalog,row,next);row=next;
    }
    const report=await reportAt(catalog,row);
    if(report.outcome!==row.outcome||!OUTCOMES.includes(row.outcome))fail('MIGRATION_OUTCOME_MISMATCH');
    await loadMigrationReplaySeed(catalog,sibling);
    return {...report,authority:'migration_diagnostic'};
  } finally {await release();}
}
/** @param {string} catalogRoot @param {string} runId */
export async function queryLegacyMigration(catalogRoot,runId) {
  const catalog=await realDirectory(catalogRoot),index=await indexAt(catalog);
  return index.transactions.find((/** @type {any} */ row)=>row.v3_run_id===runId||row.v4_run_id===runId)??null;
}
/** @param {string} catalogRoot @param {string} siblingDirectory */
export async function loadMigrationReplaySeed(catalogRoot,siblingDirectory) {
  const catalog=await realDirectory(catalogRoot),sibling=await realDirectory(siblingDirectory);
  const instance=await json(sibling,'run-instance.json');
  if(instance?.schema_version!=='4.0.0'||validateAgainstSchema(instance,runInstanceSchema).length
    ||!['migration_v3','resume_cancelled'].includes(instance.lineage?.creation_reason))fail('MIGRATION_SIBLING_VERSION_INVALID');
  const row=await queryLegacyMigration(catalog,instance.run_id);
  if(!row||row.phase!=='complete'||siblingPath(row,catalog)!==sibling)fail('MIGRATION_NOT_COMMITTED');
  if(instance.lineage.parent_run_id!==row.v3_run_id)fail('MIGRATION_SIBLING_LINEAGE_INVALID');
  const report=await reportAt(catalog,row);
  let seedBytes;try{seedBytes=await readFile(path.join(sibling,'derived/migration-replay-seed.json'));}catch{fail('MIGRATION_SEED_MISSING');}
  if(byteDigest(seedBytes)!==report.seed_digest)fail('MIGRATION_SEED_DIGEST_MISMATCH');
  if((await snapshot(row.legacy_run_directory)).digest!==row.source_snapshot_digest)fail('legacy_source_mutated');
  const seed=JSON.parse(seedBytes.toString('utf8'));
  if(validateAgainstSchema(seed,{$ref:'#/$defs/seed',$defs:migrationSchema.$defs}).length)fail('MIGRATION_SEED_INVALID');
  if(seed.run_id!==row.v4_run_id||seed.parent_run_id!==row.v3_run_id||seed.migration_txn_id!==row.migration_txn_id
    ||seed.creation_reason!==instance.lineage.creation_reason)fail('MIGRATION_SEED_BINDING_INVALID');
  const captured=await snapshot(row.legacy_run_directory),complete=await lastComplete(row.legacy_run_directory,captured.entries,row.v3_run_id);
  const review=await analysis(complete,row,captured.entries);
  if(canonicalStringify(seed)!==canonicalStringify(seedFor(row,complete,review)))fail('MIGRATION_SEED_REPLAY_MISMATCH');
  return seed;
}
