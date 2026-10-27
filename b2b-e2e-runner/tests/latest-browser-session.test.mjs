import test from 'node:test';
import assert from 'node:assert/strict';
import { browserConfigDigest, selectOwnedTarget, validateBrowserSession, recoveryPlan, verifyMcpPageMapping } from '../scripts/lib/browser-session.mjs';
const prepared={type:'browser_session',phase:'prepared',run_id:'run',generation:'g',storage_context:'admin',config_sha256:'a'.repeat(64),shared_connection:'ready',profile_name:'runner-browser-fixture'};
test('meaningful config fingerprint stable across object ordering, call metadata kept separate',()=>{
 assert.equal(browserConfigDigest({env:{A:'x'},args:['x']},{call_id:'1'}),browserConfigDigest({args:['x'],env:{A:'x'}},{call_id:'2'}));
 assert.notEqual(browserConfigDigest({env:{A:'x'}}),browserConfigDigest({env:{A:'y'}}));
});
test('same URL never identifies owned Target, first binding needs unique MCP blank marker',()=>{
 const targets=[{id:'1',type:'page',url:'http://localhost/app'},{id:'2',type:'page',url:'http://localhost/app'}];
 assert.throws(()=>selectOwnedTarget(targets,{url:'http://localhost/app'}),/Target|标记/);
 assert.equal(selectOwnedTarget(targets,{target_id:'2'}).id,'2');
 assert.throws(()=>selectOwnedTarget(targets,{target_id:'gone'}),/失效/);
 assert.equal(selectOwnedTarget([{id:'a',type:'page',url:'about:blank#runner-g'}],{marker:'about:blank#runner-g'}).id,'a');
});
test('ledger binds run, generation, storage, actual target and MCP page separately; rejects foreign and implicit generations',()=>{
 const log={run:{run_id:'run'},events:[]}; validateBrowserSession(log,prepared);
 log.events.push(prepared);
 const bound={...prepared,phase:'bound',target_id:'target',mcp_page_id:'7',endpoint:'http://127.0.0.1:41234',browser_identity:'b'.repeat(64),mapping_proof:'unique_blank_marker',mapping_evidence:{page_id:'7',marker:'about:blank#runner-g',source:'chrome-devtools-mcp:list_pages'}};
 validateBrowserSession(log,bound); log.events.push(bound);
 assert.throws(()=>validateBrowserSession(log,{...bound,run_id:'foreign'}),/所有权/);
 assert.throws(()=>validateBrowserSession(log,{...bound,generation:'other'}),/代次/);
 assert.throws(()=>validateBrowserSession(log,{...bound,storage_context:'ordinary'}),/身份/);
 assert.throws(()=>validateBrowserSession(log,{...bound,endpoint:'http://example.com:9222'}),/loopback/);
});
test('reconnect plan preserves browser and Target, missing target pauses without fallback URL matching',()=>{
 const previous={...prepared,phase:'bound',target_id:'t',browser_identity:'b'};
 assert.equal(recoveryPlan(previous,{browser_identity:'b',targets:[{id:'t',type:'page'}]}).action,'rebind_existing');
 assert.equal(recoveryPlan(previous,{browser_identity:'b',targets:[]}).action,'target_lost');
 assert.equal(recoveryPlan(previous,{browser_identity:'other',targets:[{id:'t'}]}).action,'ownership_unverified');
});

test('official record/replay invoke session validation, and preparation reuses same configuration without a second profile',async(t)=>{
 const {mkdtemp,readFile,rm,writeFile}=await import('node:fs/promises'); const os=await import('node:os'); const path=await import('node:path');
 const {initializeRun,recordEvent,validateRun}=await import('../scripts/run-artifacts.mjs'); const {prepareBrowser}=await import('../scripts/browser-session.mjs');
 const root=await mkdtemp(path.join(os.tmpdir(),'session-api-')); t.after(()=>rm(root,{recursive:true,force:true}));
 const run=await initializeRun({workspaceRoot:root,casesPath:new URL('./fixtures/test-cases.json',import.meta.url).pathname,runId:'run'});
 await assert.rejects(recordEvent(run.runRoot,{...prepared,run_id:'foreign'}),/所有权/);
 const first=await prepareBrowser({runRoot:run.runRoot,storageContext:'admin',configuration:{args:['--isolated'],env:{MEANINGFUL:'one'}},hostCapability:'shared-loopback'});
 t.after(()=>rm(first.profile_path,{recursive:true,force:true}));
 const second=await prepareBrowser({runRoot:run.runRoot,storageContext:'admin',configuration:{env:{MEANINGFUL:'one'},args:['--isolated']},hostCapability:'shared-loopback'});
 assert.equal(second.reused,true); assert.equal(second.session.generation,first.session.generation);
 await assert.rejects(prepareBrowser({runRoot:run.runRoot,storageContext:'admin',configuration:{env:{MEANINGFUL:'two'}},hostCapability:'shared-loopback'}),/配置/);
 const file=path.join(run.runRoot,'execution-log.json'); const log=JSON.parse(await readFile(file,'utf8')); log.events.at(-1).run_id='foreign'; await writeFile(file,JSON.stringify(log));
 await assert.rejects(validateRun(run.runRoot),/所有权/);
});

test('MCP page mapping rejects wrong or stale page ID even when a CDP marker exists',()=>{
 const pages='1: about:blank#runner-g [selected]\n2: http://localhost/app';
 assert.throws(()=>verifyMcpPageMapping(pages,'2','about:blank#runner-g'),/pageId/);
 assert.throws(()=>verifyMcpPageMapping(pages,'99','about:blank#runner-g'),/pageId/);
 assert.equal(verifyMcpPageMapping(pages,'1','about:blank#runner-g').page_id,'1');
});

test('A10: unsupported shared connection records a scoped limitation without discovery, profile creation, or blocking independent real facts',async(t)=>{
 const {mkdtemp,readFile,rm}=await import('node:fs/promises'); const os=await import('node:os'); const path=await import('node:path');
 const {initializeRun,recordEvent}=await import('../scripts/run-artifacts.mjs'); const {prepareBrowser,discoverBrowser}=await import('../scripts/browser-session.mjs');
 const root=await mkdtemp(path.join(os.tmpdir(),'unsupported-host-')); t.after(()=>rm(root,{recursive:true,force:true}));
 const run=await initializeRun({workspaceRoot:root,casesPath:new URL('./fixtures/test-cases.json',import.meta.url).pathname});
 const prepared=await prepareBrowser({runRoot:run.runRoot,storageContext:'real-only',hostCapability:'pipe-only'});
 assert.equal(prepared.launch_allowed,false); assert.equal(prepared.mock_available,false);
 assert.equal(prepared.profile_path,undefined); assert.equal(prepared.session.phase,'unsupported');
 await assert.rejects(discoverBrowser({runRoot:run.runRoot,storageContext:'real-only'}),/不能扫描端口/);
 await recordEvent(run.runRoot,{type:'permission_plan',version:'1.0',groups:[],role_independent_case_ids:['CASE-原始-01']});
 await recordEvent(run.runRoot,{type:'page_observation',description:'Independent real-only fixture observation remains recordable'});
 const log=JSON.parse(await readFile(path.join(run.runRoot,'execution-log.json'),'utf8'));
 assert.equal(log.events.some(event=>event.type==='proxy_state'),false);
 assert.equal(log.events.at(-1).type,'page_observation');
});
