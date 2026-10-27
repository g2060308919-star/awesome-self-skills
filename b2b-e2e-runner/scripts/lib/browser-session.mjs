import crypto from 'node:crypto';
import { assertNoSecrets } from './redaction.mjs';
const hash=value=>crypto.createHash('sha256').update(value).digest('hex');
function canonical(value) { if(Array.isArray(value)) return value.map(canonical); if(value && typeof value==='object') return Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])); return value; }
function requireValue(ok,message) { if(!ok) { const error=new Error(message); error.code='BROWSER_SESSION'; throw error; } }
// Call ids belong in a separate argument. No environment/configuration key is silently discarded.
export function browserConfigDigest(config,_callMetadata={}) { return hash(JSON.stringify(canonical(config))); }
export const browserIdentity = websocketUrl => hash(websocketUrl);
export function selectOwnedTarget(targets,{target_id,marker}) {
 if(target_id) { const target=targets.find(item=>item.type==='page' && item.id===target_id); requireValue(target,'原 Target 已失效，须登记新目标并重新核验，不能猜 URL'); return target; }
 requireValue(typeof marker==='string' && /^about:blank#runner-[a-zA-Z0-9-]+$/.test(marker),'初次 Target 映射必须使用本次 MCP 空白页唯一标记');
 const matches=targets.filter(item=>item.type==='page' && item.url===marker);
 requireValue(matches.length===1,'唯一空白标记未匹配一个实际 Target'); return matches[0];
}
export function validateBrowserSession(log,event) {
 const allowed=new Set(['type','phase','run_id','generation','storage_context','config_sha256','shared_connection','profile_name','target_id','mcp_page_id','endpoint','browser_identity','mapping_proof','mapping_evidence','reason','previous_session_ref','sequence','at']);
 requireValue(Object.keys(event).every(key=>allowed.has(key)),'browser_session 包含未知字段'); assertNoSecrets(event);
 requireValue(event.run_id===log.run.run_id,'浏览器 Run 所有权不一致');
 requireValue(['prepared','bound','disconnected','target_lost','retired','unsupported'].includes(event.phase),'浏览器阶段无效');
 requireValue(typeof event.generation==='string' && /^[a-zA-Z0-9-]+$/.test(event.generation) && typeof event.storage_context==='string' && event.storage_context.trim() && /^[a-f0-9]{64}$/.test(event.config_sha256),'浏览器代次、存储身份或配置摘要无效');
 requireValue(['ready','unavailable','pending'].includes(event.shared_connection),'共享连接能力状态无效');
 if(event.profile_name!==undefined) requireValue(/^runner-browser-[a-zA-Z0-9-]+$/.test(event.profile_name),'浏览器 profile 只能引用本工具专用名称');
 const previous=(log.events??[]).filter(item=>item.type==='browser_session' && item.storage_context===event.storage_context).at(-1);
 if(event.phase==='prepared') requireValue(!previous || previous.phase==='retired' || (previous.phase==='unsupported' && event.previous_session_ref===previous.sequence),'新代次前须显式退出旧浏览器登记');
 else if(event.phase!=='unsupported') {
  requireValue(previous && previous.generation===event.generation,'浏览器代次或存储身份未登记或已变化');
  requireValue(previous.config_sha256===event.config_sha256,'实质配置变化，原连接失效，须重新核验');
 }
 if(event.phase==='bound') {
  requireValue(typeof event.target_id==='string' && event.target_id && typeof event.mcp_page_id==='string' && event.mcp_page_id,'须分别登记实际 Target 和 MCP pageId');
  const sameGeneration=(log.events??[]).filter(item=>item.type==='browser_session' && item.generation===event.generation);
  requireValue(sameGeneration.every(item=>item.storage_context===event.storage_context),'浏览器存储身份不能串用');
  requireValue(['unique_blank_marker','host_target_metadata','reverified_marker'].includes(event.mapping_proof),'页面映射必须有可核验依据，不能凭 URL');
  const mapping = event.mapping_evidence;
  requireValue(mapping && mapping.page_id === event.mcp_page_id && (event.mapping_proof === 'host_target_metadata' ? mapping.target_id === event.target_id && mapping.source === 'host_target_metadata' : mapping.marker === `about:blank#runner-${event.generation}` && mapping.source === 'chrome-devtools-mcp:list_pages'), 'MCP pageId 与实际 Target 的同次页面清单证据不一致');
  requireValue(/^[a-f0-9]{64}$/.test(event.browser_identity),'浏览器实例身份摘要缺失');
  let endpoint; try {endpoint=new URL(event.endpoint);} catch {requireValue(false,'共享连接必须是 loopback origin');}
  requireValue(['http:','https:'].includes(endpoint.protocol) && ['127.0.0.1','localhost','[::1]'].includes(endpoint.hostname) && !endpoint.username && !endpoint.password && !endpoint.search && !endpoint.hash && endpoint.pathname==='/' ,'共享连接必须是无认证参数的 loopback origin');
  const prior=sameGeneration.filter(item=>item.phase==='bound').at(-1);
  if(prior) requireValue(prior.browser_identity===event.browser_identity,'浏览器实例改变，不得沿用旧代次和登录态');
 }
}
export function recoveryPlan(previous,discovery) {
 if(!previous || discovery.browser_identity!==previous.browser_identity) return {action:'ownership_unverified',business_allowed:false,launch_allowed:false};
 if(!discovery.targets.some(item=>item.type==='page' && item.id===previous.target_id)) return {action:'target_lost',business_allowed:false,launch_allowed:false};
 return {action:'rebind_existing',target_id:previous.target_id,business_allowed:false,launch_allowed:false,requires:['fresh MCP page mapping','semantic snapshot','role and coverage context','proxy and channel verification']};
}

export function verifyMcpPageMapping(pages,pageId,marker) {
 requireValue(typeof pages === 'string' && typeof pageId === 'string' && pageId.length > 0, '必须提供本次 MCP 页面清单和 pageId');
 const matches = pages.split(/\r?\n/).map(line => /^(\d+):\s+(\S+)(?:\s+.*)?$/.exec(line.trim())).filter(Boolean).filter(match => match[1] === pageId);
 requireValue(matches.length === 1 && matches[0][2] === marker, 'MCP pageId 未指向本次唯一标记；旧编号或另一页不可绑定');
 return {page_id:pageId,marker,source:'chrome-devtools-mcp:list_pages',observation_sha256:hash(pages)};
}
