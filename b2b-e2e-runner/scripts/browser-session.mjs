#!/usr/bin/env node
import { readFile, mkdtemp, lstat, realpath } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { recordEvent, validateRun } from './run-artifacts.mjs';
import { browserConfigDigest, browserIdentity, selectOwnedTarget, recoveryPlan, verifyMcpPageMapping } from './lib/browser-session.mjs';
import { fetchCdpJson } from './lib/cdp-client.mjs';
async function current(runRoot) { await validateRun(runRoot,{checkReport:false}); return JSON.parse(await readFile(path.join(runRoot,'execution-log.json'),'utf8')); }
function error(message) { const e=new Error(message); e.code='BROWSER_SESSION'; throw e; }
function latest(log,context) { return log.events.filter(e=>e.type==='browser_session' && (!context || e.storage_context===context)).at(-1); }
function payload(session) { const {sequence,at,...event}=session; return event; }
export async function prepareBrowser({runRoot,storageContext,configuration={},hostCapability}) {
 const log=await current(runRoot);
 if(!storageContext?.trim()) error('必须登记从用例权限得出的存储身份，不得串用角色');
 const configHash=browserConfigDigest(configuration); const previous=latest(log,storageContext);
 if(previous && !['retired','unsupported'].includes(previous.phase)) {
  if(previous.config_sha256!==configHash) error('实质配置已变化；必须先核验并显式退出原代次，不自动新建浏览器');
  return {reused:true,session:previous,launch_allowed:false,next:'先 discover，恢复既有 Target 和 MCP 映射'};
 }
 const base={type:'browser_session',run_id:log.run.run_id,generation:crypto.randomUUID(),storage_context:storageContext,config_sha256:configHash};
 if(hostCapability!=='shared-loopback') {
  const event={...base,phase:'unsupported',shared_connection:'unavailable',reason:'当前宿主未提供可授权的共享 loopback 启动接口；不探测其他浏览器，独立真实测试可继续'};
  await recordEvent(runRoot,event); return {session:event,launch_allowed:false,mock_available:false};
 }
 const profile=await mkdtemp(path.join(os.tmpdir(),'runner-browser-'));
 const event={...base,phase:'prepared',shared_connection:'pending',profile_name:path.basename(profile),...(previous?{previous_session_ref:previous.sequence}:{})};
 await recordEvent(runRoot,event);
 return {session:event,launch_allowed:true,profile_path:profile,marker:`about:blank#runner-${base.generation}`,chrome_devtools_mcp_arguments:[`--userDataDir=${profile}`,'--chrome-arg=--remote-debugging-port=0','--no-usage-statistics','--no-performance-crux'],next:'由宿主公开启动接口使用这些参数启动一次专用未登录 Chrome；用 MCP 打开唯一空白标记，随后 bind。此步骤不启用 Fetch。'};
}
export async function discoverBrowser({runRoot,storageContext}) {
 const log=await current(runRoot); const session=latest(log,storageContext);
 if(!session?.profile_name || ['retired','unsupported'].includes(session.phase)) error('没有可发现的自有共享浏览器；不能扫描端口或接管其他 Run');
 const profile=path.join(os.tmpdir(),session.profile_name);
 if((await lstat(profile)).isSymbolicLink() || await realpath(profile)!==path.join(await realpath(os.tmpdir()),session.profile_name)) error('自有 profile 路径身份无效');
 const activeFile=path.join(profile,'DevToolsActivePort');
 if((await lstat(activeFile)).isSymbolicLink()) error('DevToolsActivePort 不得是符号链接');
 const [port,wsPath]= (await readFile(activeFile,'utf8')).trim().split(/\r?\n/);
 if(!/^\d+$/.test(port) || Number(port)<1 || Number(port)>65535 || !/^\/devtools\/browser\/[a-zA-Z0-9-]+$/.test(wsPath)) error('自有动态 endpoint 文件无效');
 const endpoint=`http://127.0.0.1:${port}`;
 const [version,targets]=await Promise.all([fetchCdpJson(endpoint,'/json/version'),fetchCdpJson(endpoint,'/json/list')]);
 const ws=new URL(version.webSocketDebuggerUrl);
 if(!['127.0.0.1','localhost','[::1]'].includes(ws.hostname) || ws.port!==port || ws.pathname!==wsPath || ws.username || ws.password || ws.search) error('共享浏览器实例与自有 profile 不一致');
 const identity=browserIdentity(wsPath);
 const bound=log.events.filter(e=>e.type==='browser_session' && e.generation===session.generation && e.phase==='bound').at(-1);
 return {session,endpoint,browser_identity:identity,targets,recovery:bound?recoveryPlan(bound,{browser_identity:identity,targets}):{action:'initial_mapping_required',business_allowed:false}};
}
export async function bindBrowser({runRoot,storageContext,mcpPageId,marker,mcpPages}) {
 const mappingEvidence=verifyMcpPageMapping(mcpPages,String(mcpPageId??''),marker);
 const discovered=await discoverBrowser({runRoot,storageContext});
 const target=selectOwnedTarget(discovered.targets,{marker});
 if(marker!==`about:blank#runner-${discovered.session.generation}`) error('唯一标记不属于本 Run 浏览器代次');
 const event={...payload(discovered.session),phase:'bound',shared_connection:'ready',target_id:target.id,mcp_page_id:String(mcpPageId??''),endpoint:discovered.endpoint,browser_identity:discovered.browser_identity,mapping_evidence:mappingEvidence,mapping_proof:discovered.recovery.action==='initial_mapping_required'?'unique_blank_marker':'reverified_marker'};
 await recordEvent(runRoot,event);
 const log=await current(runRoot);
 await recordEvent(runRoot,{type:'target_inventory',owned_target_ids:[...new Set([...log.browser.owned_target_ids,target.id])]});
 return {session:event,business_allowed:false,next:'重新获取当前语义快照、角色/覆盖上下文；业务动作前验证代理和通道。'};
}
if(process.argv[1] && import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href) {
 const [command,...args]=process.argv.slice(2); const opts={};
 for(let i=0;i<args.length;i+=2) { if(!args[i].startsWith('--') || args[i+1]===undefined) throw new Error('需要 --key value 参数'); opts[args[i].slice(2)]=args[i+1]; }
 try {
  const input={runRoot:path.resolve(opts.run??'.'),storageContext:opts['storage-context'],hostCapability:opts.host,mcpPageId:opts['page-id'],marker:opts.marker,mcpPages:opts['mcp-pages']?await readFile(opts['mcp-pages'],'utf8'):undefined,configuration:opts.config?JSON.parse(await readFile(opts.config,'utf8')):{}};
  const fn={prepare:prepareBrowser,discover:discoverBrowser,bind:bindBrowser}[command]; if(!fn) error('命令必须为 prepare、discover 或 bind');
  console.log(JSON.stringify(await fn(input),null,2));
 } catch(e) { console.error(JSON.stringify({code:e.code??'BROWSER_SESSION',message:e.message})); process.exitCode=1; }
}
