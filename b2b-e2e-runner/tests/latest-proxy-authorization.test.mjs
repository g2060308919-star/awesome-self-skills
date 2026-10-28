import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { loadProxyAuthorization, proxyRulesDigest, validateProxyPolicy } from '../scripts/lib/proxy-authorization.mjs';
const rules = [{match:{protocol:'http:',hostname:'localhost',path_prefix:'/fixture-probe'},request:{headers:{set:{'x-fixture':'yes'}}}}];
async function setup() {
 const root=await mkdtemp(path.join(os.tmpdir(),'proxy-policy-'));
 const log={run:{run_id:'r'},browser:{owned_target_ids:['t']},events:[{type:'workflow_profile',profile:'b2b-e2e-current',sequence:1},{type:'proxy_policy',action:'initial',decision:'allowed',decision_source:'user',purpose:'environment_access',basis:'Fixture request header allowed',rules_sha256:proxyRulesDigest(rules),sequence:2}]};
 const save=()=>writeFile(path.join(root,'execution-log.json'),JSON.stringify(log)); await save();
 return {log,save,config:{run_root:root,run_id:'r',target_id:'t',rules,purpose:'environment_access'}};
}
test('ordinary rules require exact independent authorization and reread revocation',async()=>{
 const {log,save,config}=await setup(); const check=await loadProxyAuthorization(config); await check();
 log.events.push({...log.events.at(-1),action:'revoked',decision:'declined',previous_decision_ref:2,sequence:3}); await save(); await assert.rejects(check,/授权/);
});
test('environment authorization cannot grant case-Mock purpose or silently change confirmed body rules',async()=>{
 const {config}=await setup(); await assert.rejects(loadProxyAuthorization({...config,purpose:'case_mock',response_data_kind:'non_business'}),/场景|用途/);
 await assert.rejects(loadProxyAuthorization({...config,rules:[...rules,{match:{protocol:'http:',hostname:'localhost',path_prefix:'/bootstrap'},response:{body:{text:'record'}}}]}),/授权|摘要/);
 assert.equal(await loadProxyAuthorization({rules:[],mock_scenario:{}}),null);
});
test('policy decisions append and bind previous decision and rule hash',()=>{
 const first={type:'proxy_policy',action:'initial',decision:'declined',decision_source:'user',purpose:'environment_access',basis:'User declined',rules_sha256:proxyRulesDigest(rules),sequence:2};
 validateProxyPolicy({events:[]},first);
 assert.throws(()=>validateProxyPolicy({events:[]},{...first,purpose:'case_mock'}),/用途|Mock/);
 assert.throws(()=>validateProxyPolicy({events:[first]},{...first,action:'changed',decision:'allowed'}),/previous/);
 validateProxyPolicy({events:[first]},{...first,action:'changed',decision:'allowed',previous_decision_ref:2});
});
