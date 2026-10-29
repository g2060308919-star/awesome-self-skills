import assert from 'node:assert/strict';
import {cp,mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import test from 'node:test';
import {start} from '../helpers/remediation-stage-fixture.mjs';
const root=fileURLToPath(new URL('../..',import.meta.url));

for(const fault of ['throw','unknown'])test(`AT-05: real Runner stops before accepting behavior on ${fault} compiler result`,async (/** @type {any} */ t)=>{
 const temp=await mkdtemp(path.join(os.tmpdir(),'gtc-fault-'));t.after(()=>rm(temp,{recursive:true,force:true}));
 await cp(path.join(root,'skill/generate-test-cases/scripts/schemas'),path.join(temp,'schemas'),{recursive:true});
 await cp(path.join(root,'skill/generate-test-cases/scripts/schema-manifest.json'),path.join(temp,'schema-manifest.json'));
 const outfile=path.join(temp,'test-compiler.mjs');
 await build({entryPoints:[path.join(root,'src/entry.mjs')],outfile,bundle:true,platform:'node',format:'esm',target:'node20',define:{__SCHEMA_DIRECTORY__:JSON.stringify('schemas')},plugins:[{name:'test-only-compiler-fault',setup(b){b.onLoad({filter:/case-context-v4\.mjs$/},async args=>{
  const text=await readFile(args.path,'utf8');
  const signature='export function compileBoundCaseContext(artifacts, system, runId) {';
  assert.ok(text.includes(signature));
  const injection=fault==='throw'?"throw new Error('controlled authoring exception');":"return {status:'unexpected_compiler_status',diagnostics:[{code:'CONTROLLED_UNKNOWN',path:'/behavior_views/views/0',message:'controlled unknown result'}]};";
  return {contents:text.replace(signature,signature+injection),loader:'js'};
 });}}]});
 const api=await import(pathToFileURL(outfile));
 const {dir,fixture}=await start(t,{api,stopBeforeBehavior:true});
 const before=await readFile(path.join(dir,'checkpoint.json'),'utf8');
 await writeFile(path.join(dir,'staging/behavior-views.json'),JSON.stringify(fixture.artifacts.behavior_views));
 const reply=await api.advanceStrict(dir);
 assert.equal(reply.status,'fatal',JSON.stringify(reply));assert.equal(reply.phase,'case_design');assert.equal(reply.case_context,undefined);
 assert.match(reply.incomplete_reason.summary,/behavior_views/u);
 assert.match(reply.incomplete_reason.summary,fault==='throw'?/controlled authoring exception/:/CONTROLLED_UNKNOWN.*\/behavior_views\/views\/0/u);
 assert.match(reply.recovery.description,/未提交|not committed|No candidate/u);
 assert.equal(await readFile(path.join(dir,'checkpoint.json'),'utf8'),before);
 for(const file of ['accepted/r000/behavior-views.json','output/current.json'])await assert.rejects(readFile(path.join(dir,file)),{code:'ENOENT'});
});
