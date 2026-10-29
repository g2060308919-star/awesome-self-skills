import assert from 'node:assert/strict';
import {readFile,writeFile,rm} from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {start} from '../helpers/remediation-stage-fixture.mjs';
const runner=fileURLToPath(new URL('../../skill/generate-test-cases/scripts/test-compiler.mjs',import.meta.url));
const api=await import(pathToFileURL(runner));
/** @type {Array<()=>Promise<any>>} */const cleanup=[];
try{
 const {dir,fixture,reply}=await start({after:/** @param {()=>Promise<any>} f */f=>cleanup.push(f)},{api});
 const {schema_version,source_revision,case_context_digest,...payload}=fixture.artifacts.case_drafts;
 const prepared=await api.prepareStageArtifact(dir,reply,{stage:'case_drafts',payload});assert.equal(prepared.status,'prepared');
 prepared.artifact.cases[0].oracles=[];
 const before=await readFile(path.join(dir,'checkpoint.json'),'utf8');
 /** @type {any[]} */const attempts=[];let lastKey='',sameRoot=0,stop=null;
 for(let attempt=1;attempt<=4;attempt++){
  await writeFile(path.join(dir,'staging/case-drafts.json'),JSON.stringify(prepared.artifact));
  const observed=await api.advanceStrict(dir);assert.equal(observed.status,'need_revision');
  const key=observed.stage+':'+observed.incomplete_reason.code;
  sameRoot=key===lastKey?sameRoot+1:1;lastKey=key;
  attempts.push({attempt,runner_status:observed.status,stage:observed.stage,diagnostics:observed.diagnostics});
  if(sameRoot===4){stop={layer:'Agent/Adapter',code:'PIPELINE_NO_PROGRESS',same_root_count:sameRoot};break;}
 }
 assert.ok(stop);assert.equal(await readFile(path.join(dir,'checkpoint.json'),'utf8'),before);
 await writeFile('docs/remediation-2026-10-28/no-progress-evidence.json',JSON.stringify({run_id:reply.run_id,attempts,stop,accepted_checkpoint_unchanged:true,checkpoint_bytes_sha256:createHash('sha256').update(before).digest('hex'),new_run_created_for_retry:false},null,2));
 console.log(JSON.stringify(stop));
}finally{for(const f of cleanup)await f();}
