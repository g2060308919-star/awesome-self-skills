import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { assertNoSecrets, sanitizeUrl } from './redaction.mjs';
import { freshContext } from './execution-progress.mjs';
import { assertCurrentWorkflow } from './workflow-contract.mjs';

function check(ok, message) { if (!ok) throw Object.assign(new Error(message), { code: 'MOCK_DISCOVERY_INVALID' }); }
function exact(value, fields) { check(value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).every(key => fields.includes(key)), '发现配置包含未知字段'); }
function safeUrl(value) {
  try { const url = new URL(value); return ['http:','https:'].includes(url.protocol) && !url.username && !url.password && !url.hash; } catch { return false; }
}
export async function loadDiscoveryBinding(config) {
  if (!config.discovery) return null;
  check(!config.mock_scenario, '受控发现和正式 Mock 场景不能同时启用');
  const discovery = config.discovery;
  exact(discovery, ['discovery_id','checkpoint_ids','context_ref','safe_probe','passthrough']);
  check(typeof discovery.discovery_id === 'string' && discovery.discovery_id.trim(), '缺少 discovery_id');
  check(Array.isArray(discovery.checkpoint_ids) && discovery.checkpoint_ids.length && new Set(discovery.checkpoint_ids).size === discovery.checkpoint_ids.length, '发现缺少精确检查点范围');
  exact(discovery.safe_probe, ['url','method']);
  check(discovery.safe_probe.method === 'GET' && safeUrl(discovery.safe_probe.url), '发现需要已知安全 GET 探测；探测本身仍阻断');
  check(Array.isArray(discovery.passthrough), '发现 passthrough 必须显式声明');
  for (const rule of discovery.passthrough) {
    exact(rule, ['url','method','side_effect_free','basis_refs']);
    check(rule.method === 'GET' && safeUrl(rule.url) && rule.side_effect_free === true && Array.isArray(rule.basis_refs) && rule.basis_refs.length, '发现透传必须精确匹配且有无副作用依据');
  }
  assertNoSecrets(discovery);
  const logPath = path.join(config.run_root, 'execution-log.json');
  const targetId = config.target_id ?? config.targetId;
  let probeSeen = false;
  let context;
  const assertAuthorized = async () => {
    const log = JSON.parse(await readFile(logPath,'utf8')); assertCurrentWorkflow(log);
    check(log.run.run_id === (config.run_id ?? config.runId) && log.run.status === 'running', '发现必须绑定运行中 Run');
    check(log.events.filter(event => event.type === 'mock_policy').at(-1)?.decision === 'allowed', '受控发现需要已允许 Mock，不能推定授权');
    check(log.browser.owned_target_ids.includes(targetId), '发现只支持本 Run 自有 Target');
    context = log.events.filter(event => event.type === 'coverage_context' && event.context_ref === discovery.context_ref).at(-1);
    check(context?.target_id === targetId && freshContext(log,context), '发现缺少同 Target 新鲜真实身份上下文');
    const plan = log.events.filter(event => event.type === 'coverage_plan').at(-1);
    check(discovery.checkpoint_ids.every(id => plan?.items.some(item => item.checkpoint_id === id && item.scopes.some(scope => context.scope_ids.includes(scope.scope_id)))), '发现检查点不属于绑定上下文');
    for (const rule of discovery.passthrough) check(rule.basis_refs.every(ref => log.events.some(event => event.sequence === ref && ['network_observation','page_observation','assistance'].includes(event.type))), '安全透传缺少已知事实');
    return log;
  };
  await assertAuthorized();
  return {
    channelCoverage: { target_id: targetId }, assertAuthorized,
    async capture(request) {
      await assertAuthorized();
      const probe = request.method === discovery.safe_probe.method && request.url === discovery.safe_probe.url;
      // Before the blocked probe is observed no request is allowed upstream.
      const passthrough = !probe && probeSeen && discovery.passthrough.some(rule => rule.method === request.method && rule.url === request.url);
      return { probe, passthrough };
    },
    async record(request, outcome) {
      const { recordEvent } = await import('../run-artifacts.mjs');
      await recordEvent(config.run_root, { type: 'network_observation', kind: outcome.probe ? 'discovery_probe' : 'discovery_request',
        discovery_id: discovery.discovery_id, checkpoint_ids: discovery.checkpoint_ids, target_id: targetId, context_ref: discovery.context_ref,
        channel: 'page-http', url: sanitizeUrl(request.url), method: request.method,
        disposition: outcome.passthrough ? 'passthrough' : 'blocked',
        description: outcome.passthrough ? '已知无副作用请求精确透传；不是产品结论' : '同 Target Request 阶段已阻断；未向真实上游提交、未伪造成功' });
      if (outcome.probe) probeSeen = true;
    },
    assertProbed() { check(probeSeen, '受控发现尚未验证 Request 阶段安全探测，禁止业务操作'); }
  };
}
