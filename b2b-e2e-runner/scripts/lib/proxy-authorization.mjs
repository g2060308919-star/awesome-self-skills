import crypto from 'node:crypto';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { assertNoSecrets } from './redaction.mjs';
import { assertCurrentWorkflow } from './workflow-contract.mjs';
function fail(message) { const error=new Error(message); error.code='PROXY_AUTHORIZATION'; throw error; }
function canonical(value) {
 if(Array.isArray(value)) return value.map(canonical);
 if(value && typeof value==='object') return Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])]));
 return value;
}
export function proxyRulesDigest(rules) { assertNoSecrets(rules); return crypto.createHash('sha256').update(JSON.stringify(canonical(rules))).digest('hex'); }
export function validateProxyPolicy(log,event) {
 const allowed=new Set(['type','action','decision','decision_source','basis','rules_sha256','previous_decision_ref','sequence','at']);
 if(Object.keys(event).some(key=>!allowed.has(key))) fail('proxy_policy 包含未知字段');
 if(!['allowed','declined'].includes(event.decision) || event.decision_source!=='user' || typeof event.basis!=='string' || !event.basis.trim() || !/^[a-f0-9]{64}$/.test(event.rules_sha256)) fail('普通代理需要用户明确授权和规则摘要');
 const previous=(log.events??[]).filter(item=>item.type==='proxy_policy').at(-1);
 if(!previous) { if(event.action!=='initial' || event.previous_decision_ref!==undefined) fail('首次代理决定必须为 initial'); }
 else if(!['changed','revoked'].includes(event.action) || event.previous_decision_ref!==previous.sequence) fail('代理变更必须引用 previous_decision_ref，不能覆盖历史');
 if(event.action==='revoked' && (previous?.decision!=='allowed' || event.decision!=='declined')) fail('撤回必须从 allowed 变为 declined');
 assertNoSecrets(event);
}
export async function loadProxyAuthorization(config) {
 const rules=config.rules??[];
 if(!rules.some(rule=>rule.enabled!==false)) return null;
 if(config.response_data_kind==='synthetic_business') fail('合成业务数据必须使用授权的 Request 阶段完整 Mock 场景');
 if(rules.some(rule=>rule.response?.body && rule.response.body.mode!=='none') && config.response_data_kind!=='non_business') fail('响应 body 必须明确非业务数据；合成业务数据需要 Mock 场景');
 if(typeof config.run_root!=='string' || !path.isAbsolute(config.run_root)) fail('普通代理授权需要本 Run 的 run_root');
 const hash=proxyRulesDigest(rules);
 const check=async()=>{
  const log=JSON.parse(await readFile(path.join(config.run_root,'execution-log.json'),'utf8')); assertCurrentWorkflow(log);
  const target=config.target_id??config.targetId;
  if(log.run?.run_id!==(config.run_id??config.runId) || ![...(log.browser?.owned_target_ids??[]),...(log.browser?.attached_preexisting_target_ids??[])].includes(target)) fail('普通代理授权的 Run 或 Target 不一致');
  const policy=(log.events??[]).filter(event=>event.type==='proxy_policy').at(-1);
  if(policy?.decision!=='allowed' || policy.rules_sha256!==hash || policy.decision_source!=='user') fail('普通代理授权缺失、撤回或规则摘要不一致');
 };
 await check(); return check;
}
