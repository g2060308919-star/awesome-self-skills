/** Opt-in real native MCP acceptance assets. Uses only a fresh profile and the local fixture. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { initializeRun, recordEvent, archiveScreenshot, validateRun, generateReport, deliverReport } from '../../scripts/run-artifacts.mjs';
import { prepareBrowser, bindBrowser, discoverBrowser } from '../../scripts/browser-session.mjs';
import { deriveExecutionProgress } from '../../scripts/lib/execution-progress.mjs';
import { proxyRulesDigest } from '../../scripts/lib/proxy-authorization.mjs';
import { createProxyListener } from '../../scripts/cdp-fetch-proxy.mjs';
import { mkdir, mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { LocalMcp } from './latest-mcp-smoke.mjs';
import { locateChromeMcpCli } from './local-mcp-cli.mjs';
import { startLatestWorkflowFixture } from './latest-workflow-server.mjs';

export async function exerciseIntegrationFixture({ output, cli } = {}) {
  output ||= await mkdtemp(path.join(os.tmpdir(), 'runner-mock-integration-fixture-'));
  await mkdir(output, { recursive: true });
  const profile = await mkdtemp(path.join(os.tmpdir(), 'runner-mock-integration-profile-'));
  const fixture = await startLatestWorkflowFixture();
  const mcp = new LocalMcp({ cli: cli || await locateChromeMcpCli(), profile, output, extraArgs: ['--redactNetworkHeaders'] });
  const result = { kind: 'Real MCP fixture contract verification; not a completed Run or final acceptance', assertions: [] };
  try {
    await mcp.start();
    await mcp.tool('new_page', { url: fixture.url + '/?environment=required' });
    await mcp.tool('wait_for', { text: ['Environment access blocked'], timeout: 5000 });
    assert.equal(fixture.snapshot().counts['GET /environment-config'], 1);
    result.assertions.push('Unproxied environment access blocks login before a fixture session exists');
    await mcp.tool('navigate_page', { url: fixture.url });
    const snapshot = () => mcp.tool('take_snapshot');
    const uid = async (role, label) => {
      const text = await snapshot(); const line = text.split('\n').find(line => line.includes(` ${role} "${label}"`));
      assert.ok(line, `Missing ${role} ${label}`); return /uid=([^ ]+)/.exec(line)[1];
    };
    const click = async label => mcp.tool('click', { uid: await uid('button', label) });
    const wait = async text => mcp.tool('wait_for', { text: [text], timeout: 5000 });
    await click('Enter fixture'); await wait('Signed in: admin');
    await click('Load frontend permissions'); await wait('Frontend approve permission: unavailable');
    assert.match(await snapshot(), /Signed in: admin/);
    assert.doesNotMatch(await snapshot(), /button "Approve frontend item"/);
    result.assertions.push('Actual admin identity and absent frontend approve permission are separate fixture inputs');
    const before = fixture.snapshot();
    await click('Submit conditional request'); await wait('Conditional action 1 complete: Name is required; no request dispatched');
    const network = await mcp.tool('list_network_requests');
    assert.doesNotMatch(network, /\/api\/conditional/);
    assert.equal(fixture.snapshot().counts['POST /api/conditional'] || 0, before.counts['POST /api/conditional'] || 0);
    await writeFile(path.join(output, 'no-request-network.txt'), network);
    result.assertions.push('Empty-name submit reaches synchronous validation completion, with no observed request or upstream increment');
    await mcp.tool('take_screenshot', { filePath: path.join(output, 'fixture-contract.png'), fullPage: true });
    await writeFile(path.join(output, 'fixture-snapshot.txt'), await snapshot());
    return { output, ...result };
  } catch (error) { result.failure = { message: error.message, stack: error.stack }; throw error; }
  finally {
    await mcp.stop(); await rm(profile, { recursive: true, force: true });
    await writeFile(path.join(output, 'upstream-final.json'), JSON.stringify(fixture.snapshot(), null, 2));
    await fixture.close(); await writeFile(path.join(output, 'fixture-verification.json'), JSON.stringify(result, null, 2));
    process.stdout.write(`Fixture evidence: ${output}\n`);
  }
}
const hash = value => createHash('sha256').update(value).digest('hex');
async function sourceProvenance() {
  const cwd = fileURLToPath(new URL('../../', import.meta.url));
  const git = args => execFileSync('git', args, { cwd, encoding: 'utf8' });
  const head = git(['rev-parse', 'HEAD']).trim();
  const trackedDiffSha256 = hash(git(['diff', '--binary', 'HEAD', '--', '.']));
  const untracked = {};
  for (const filename of git(['ls-files', '-z', '--others', '--exclude-standard', '--', '.']).split('\0').filter(Boolean).sort()) untracked[filename] = hash(await readFile(path.join(cwd, filename)));
  const worktreeDigest = hash(JSON.stringify({ trackedDiffSha256, untracked }));
  return { head, trackedDiffSha256, untracked, worktreeDigest };
}

export function environmentRules(url) {
  const parsed = new URL(url);
  return [{ rule_id: 'environment-bootstrap', match: { protocol: parsed.protocol, hostname: parsed.hostname, path_prefix: '/environment-config', methods: ['GET'] },
    request: { headers: { set: { 'x-fixture-access': 'local-approved' } } },
    response: { headers: { set: { 'x-fixture-response': 'ready' } }, body: { mode: 'json_patch', operations: [{ op: 'set', path: '/loginEnabled', value: true }, { op: 'set', path: '/deployment', value: 'local-approved' }] } } }];
}

/** Official Run + own browser binding + pre-login ordinary proxy. Full rounds extend this harness. */
export async function runIntegrationRound({ output, cli, mode = 'allowed', baseOnly = false, discoveryOnly = false } = {}) {
  output ||= await mkdtemp(path.join(os.tmpdir(), `runner-mock-integration-${mode}-`));
  await mkdir(output, { recursive: true });
  cli ||= await locateChromeMcpCli();
  const sourceStart = await sourceProvenance();
  await writeFile(path.join(output, 'source-start.json'), JSON.stringify(sourceStart, null, 2));
  const fixture = await startLatestWorkflowFixture();
  let prepared, mcp, listener, run;
  const summary = { mode, host: 'Standalone native Chrome DevTools MCP CLI; not desktop managed browser', final: false, assertions: [] };
  try {
    const definitions = [
      { id: 'REAL', group: 'real', title: 'Real list and empty-name validation', expected: 'A nonempty conditional name sends exactly one POST /api/conditional; real list displays Expired seed; submitting an empty conditional name shows Name is required and sends no conditional request', scenarios: [{ id: 'valid-name-missing-request', kind: 'request_behavior' }, { id: 'real-list', kind: 'ui' }, { id: 'empty-name', kind: 'request_behavior' }] },
      { id: 'DATA', group: 'real', title: 'Render the exact supplied sample', expected: 'Read response displays ID SYNTHETIC-001, name Mock draft and status draft in the frontend', scenarios: [{ id: 'data', kind: 'response_consumption' }] },
      ...(mode === 'allowed' ? [{ id: 'PERMISSION', group: 'approve', title: 'Frontend permission input', expected: 'When supplied frontend canApprove input is true, Approve frontend item is visible while Signed in: admin identity remains unchanged', scenarios: [{ id: 'permission', kind: 'response_consumption' }] }] : [])
    ];
    const ids = definitions.map(item => `${item.id}/observe/result`);
    const casesInput = { schema_version: '2.0', suite: { name: `Local Mock integration ${mode}`, target_urls: [fixture.url] }, cases: definitions.map(item => ({ case_id: item.id, module: 'Local non-production frontend', title: item.title, preconditions: item.id === 'DATA' ? ['Exact supplied example SYNTHETIC-001 is required; real UI cannot select an ID'] : [], steps: [{ step_id: 'observe', action: item.id === 'REAL' ? 'Submit a valid conditional name, refresh real records, then submit the empty conditional name' : item.id === 'DATA' ? 'Click Read mock-contract record' : 'Load frontend permissions', expected: [{ oracle_id: 'result', text: item.expected }] }] })) };
    run = await initializeRun({ workspaceRoot: output, casesInput, workflowProfile: 'b2b-e2e-current', mockFallback: mode });
    const event = async input => ({ ...input, ...await recordEvent(run.runRoot, input) });
    const log = async () => JSON.parse(await readFile(path.join(run.runRoot, 'execution-log.json'), 'utf8'));
    await mkdir(path.join(run.runRoot, 'observations'));
    const plan = await event({ type: 'permission_plan', version: '1.0', role_independent_case_ids: [], groups: [
      { group_id: 'real', role_text: 'Fixture administrator', permissions: ['Read real records and use declared fixture controls'], case_ids: ['REAL', 'DATA'], checkpoint_ids: ids.slice(0, 2), availability: 'ready', account_ref: 'fixture-admin', preparation_owner: null, declaration: 'Local fixture owner provides Administrator identity for ordinary fixture controls' },
      ...(mode === 'allowed' ? [{ group_id: 'approve', role_text: 'Frontend approver input', permissions: ['Frontend approve input'], case_ids: ['PERMISSION'], checkpoint_ids: [ids[2]], availability: 'unavailable', account_ref: null, preparation_owner: 'user', declaration: 'Local fixture owner cannot provide real approve permission; fixture server explicitly always denies it' }] : [])
    ] });
    for (const checkpoint_id of ids) await event({ type: 'checkpoint_semantics', checkpoint_id, assertion_domain: 'frontend', condition_kind: 'fixed', basis: 'Immutable local input only claims actual frontend behavior, not real backend persistence or server permission' });
    await event({ type: 'coverage_plan', action: 'initial', revision: 1, snapshot_hash: (await log()).test_cases.sha256, source: 'Immutable local frontend cases and explicit branches', items: definitions.map((item, index) => ({ checkpoint_id: ids[index], dependencies: [], scopes: [{ scope_id: item.id.toLowerCase(), group_ids: [item.group], location_ref: fixture.url, location_status: 'known', step_refs: [`${item.id}/observe`], source_refs: [`snapshot:${item.id}/observe`], ...(item.scenarios.length > 1 ? { scenario_requirements: item.scenarios.map(scenario => ({ scenario_id: scenario.id, step_refs: [`${item.id}/observe`], source_refs: [`snapshot:${item.id}/observe`], preconditions: [], assertion_kind: scenario.kind, assertion_domain: 'frontend', chain_id: null })) } : { assertion_kind: item.scenarios[0].kind, assertion_domain: 'frontend' }) }] })) });
    const rules = environmentRules(fixture.url);
    await event({ type: 'proxy_policy', action: 'initial', decision: 'allowed', decision_source: 'user', purpose: 'environment_access', basis: 'Local fixture environment bootstrap needs exact request header, response header and login-enabled environment configuration; no business test data is generated by these rules', rules_sha256: proxyRulesDigest(rules) });
    prepared = await prepareBrowser({ runRoot: run.runRoot, storageContext: 'fixture-admin', hostCapability: 'shared-loopback', configuration: { host: 'native-local-cli', cli, dynamic_port: true, ordinary_proxy_rules: rules } });
    mcp = new LocalMcp({ cli, profile: prepared.profile_path, output, extraArgs: ['--redactNetworkHeaders'] });
    await mcp.start();
    const pageText = await mcp.tool('new_page', { url: prepared.marker });
    const pageId = Number(/^(\d+):.*\[selected\]/m.exec(pageText)?.[1]); assert.ok(pageId);
    const bound = await bindBrowser({ runRoot: run.runRoot, storageContext: 'fixture-admin', mcpPageId: pageId, marker: prepared.marker, mcpPages: await mcp.tool('list_pages') });
    const discovered = await discoverBrowser({ runRoot: run.runRoot, storageContext: 'fixture-admin' });
    const targetId = bound.session.target_id;
    const baseConfig = { environment: 'test', endpoint: discovered.endpoint, run_root: run.runRoot, run_id: run.runId, target_id: targetId, lock_root: path.join(output, 'locks'), purpose: 'environment_access', rules,
      prepareOwnedTargetForCleanup: async () => { await mcp.tool('select_page', { pageId }); await mcp.tool('navigate_page', { url: 'about:blank' }); } };
    listener = await createProxyListener(baseConfig); await listener.start();
    assert.equal(fixture.snapshot().counts['POST /fixture-session'] || 0, 0);
    await mcp.tool('navigate_page', { url: fixture.url + '/?environment=required' });
    const snapshot = () => mcp.tool('take_snapshot');
    const uid = async (role, label) => { const text = await snapshot(); const line = text.split('\n').find(line => line.includes(` ${role} "${label}"`)); assert.ok(line, `Missing ${role} ${label}`); return /uid=([^ ]+)/.exec(line)[1]; };
    const click = async label => mcp.tool('click', { uid: await uid('button', label) });
    const wait = async text => mcp.tool('wait_for', { text: [text], timeout: 10000 });
    await wait('Environment access ready: request header, response header and body accepted');
    assert.equal(fixture.snapshot().environmentRequests.at(-1).requestHeaderAccepted, true);
    assert.equal(fixture.snapshot().counts['POST /fixture-session'] || 0, 0);
    await writeFile(path.join(output, 'base-before-login.txt'), await snapshot());
    await mcp.tool('take_screenshot', { filePath: path.join(output, 'base-before-login.png'), fullPage: true });
    const listing = await mcp.tool('list_network_requests');
    const environmentReq = Number(/reqid=(\d+)/.exec(listing.split('\n').filter(line => line.includes('/environment-config ')).at(-1))?.[1]);
    assert.ok(environmentReq); const environmentDetail = await mcp.tool('get_network_request', { reqid: environmentReq });
    await writeFile(path.join(output, 'base-environment-network.txt'), environmentDetail);
    assert.match(environmentDetail, /x-fixture-response:/i); assert.match(environmentDetail, /"loginEnabled":true/);
    summary.assertions.push('AC01 official purpose-authorized base proxy rewrites request header, response header and response body before login; real upstream observed accepted request header');
    await click('Enter fixture'); await wait('Signed in: admin');
    if (baseOnly) return { output, ...summary };
    await event({ type: 'mcp_preflight', status: 'available', description: 'Actual native MCP list/snapshot/navigation/click worked on dedicated local fixture Target' });
    const observe = async (name, checkpoint_ids, description, extra = {}) => {
      const text = await snapshot(); const relative = `observations/${name}.txt`;
      await writeFile(path.join(run.runRoot, relative), text);
      return event({ type: 'page_observation', checkpoint_ids, description, target_id: targetId, context_ref: 'fixture-admin-context', snapshot_path: relative, snapshot_sha256: hash(text), ...extra });
    };
    const capture = async (name, checkpoint_ids) => {
      const sourcePath = path.join(output, name + '.png'); await mcp.tool('take_screenshot', { filePath: sourcePath, fullPage: true });
      await archiveScreenshot(run.runRoot, { sourcePath, allowedSourceRoot: output, event: { type: 'evidence_capture', capture_kind: 'screenshot', outcome: 'captured', checkpoint_ids, description: 'Actual native MCP local fixture screenshot', attempts: ['Native MCP take_screenshot'], evidence: [{ evidence_id: name, kind: 'screenshot', at: new Date().toISOString(), checkpoint_ids, path: `evidence/${name}.png`, description: name }] } }); return name;
    };
    const network = async (name, checkpoint_id, pathname, extra = {}) => {
      const listing = await mcp.tool('list_network_requests');
      const line = listing.split('\n').filter(line => line.includes(pathname + ' ')).at(-1); assert.ok(line, `No native Network observation for ${pathname}`);
      const reqid = Number(/reqid=(\d+)/.exec(line)?.[1]); const detail = await mcp.tool('get_network_request', { reqid });
      const relative = `observations/${name}.txt`; await writeFile(path.join(run.runRoot, relative), detail);
      return event({ type: 'network_observation', checkpoint_ids: [checkpoint_id], target_id: targetId, context_ref: 'fixture-admin-context', channel: 'page-http', route_id: pathname.split('/').at(-1), url: fixture.url + pathname, method: 'GET', response_status: Number(/^Status:\s*(\d+)/m.exec(detail)?.[1]), description: `Actual native MCP request ${reqid}: ${name}`, request_detail_path: relative, request_detail_sha256: hash(detail), ...extra });
    };
    const closures = new Map();
    const review = async (purpose, checkpoint_ids, refs, closureKind = 'observed') => {
      const selected = definitions.filter(item => checkpoint_ids.includes(`${item.id}/observe/result`));
      const current = await log(); const progress = deriveExecutionProgress(casesInput, current);
      const pendingScopes = selected.filter(item => !progress.checkpoints.find(cp => cp.checkpoint_id === `${item.id}/observe/result`)?.complete).map(item => item.id.toLowerCase());
      const close = purpose === 'checkpoint_close' ? checkpoint_ids.map(checkpoint_id => ({ checkpoint_id, closure_kind: closureKind, basis_refs: refs })) : purpose === 'final' ? [...closures.values()] : [];
      const result = await event({ type: 'coverage_review', review_id: `review-${(await log()).events.length}`, purpose, plan_revision: 1, based_on_sequence: (await log()).events.length,
        scope_ids: selected.map(item => item.id.toLowerCase()), checkpoint_ids, fact_refs: refs, assistance_refs: [], ready_scope_ids: pendingScopes, preparable_scope_ids: [], blocked_scope_ids: [], closures: close,
        choice: purpose === 'final' ? 'finish' : 'close', reason: 'Actual MCP page/request evidence reviewed against all original planned frontend scenarios' });
      for (const closure of close) closures.set(closure.checkpoint_id, closure); return result;
    };
    const identityPage = await observe('identity', ids, 'Actual dedicated fixture browser displays Signed in: admin');
    const identity = await event({ type: 'identity_observation', account_ref: 'fixture-admin', observed_account_ref: 'fixture-admin', target_id: targetId, context_ref: 'fixture-admin-context', environment_ref: 'local-fixture', observed_url: fixture.url, verification: 'verified', fact_refs: [identityPage.sequence] });
    const role = await event({ type: 'role_observation', observation: { group_id: 'real', account_ref: 'fixture-admin', observed_account_ref: 'fixture-admin', verification_scope: 'execution_context', target_id: targetId, context_ref: 'fixture-admin-context', environment_ref: 'local-fixture', switch_status: 'not_required', verification: 'verified', description: 'Actual admin fixture identity confirmed; ordinary local controls available; no simulated approve permission is claimed' } });
    const makeContext = async (scope_ids, simulated) => event({ type: 'coverage_context', scope_ids, account_ref: 'fixture-admin', observed_account_ref: 'fixture-admin', target_id: targetId, context_ref: 'fixture-admin-context', environment_ref: 'local-fixture', observed_url: fixture.url, verification: 'verified', switch_status: 'not_required', fact_refs: [identityPage.sequence], identity_ref: identity.sequence, verification_stage: 'identity', ...(simulated ? { simulated_permission_ref: simulated.sequence } : { role_observation_refs: [role.sequence] }) });
    const realContext = await makeContext(['real', 'data']);
    await event({ type: 'control_effect', checkpoint_ids: ids, attempt_id: 'environment-bootstrap', target_id: targetId, phase: 'response', match: 'GET /environment-config', description: 'Actual pre-login request header accepted; response header and environment loginEnabled/deployment body modified. No business scenario data constructed by base proxy.' });
    await event({ type: 'run_state', status: 'running' });
    if (discoveryOnly) {
      assert.equal((await log()).events.some(item => ['mock_candidate', 'mock_attempt', 'mock_channel_coverage'].includes(item.type)), false);
      await listener.stop(); listener = null;
      listener = await createProxyListener({ ...baseConfig, discovery: { discovery_id: 'native-discovery', checkpoint_ids: [ids[0]], context_ref: 'fixture-admin-context', safe_probe: { url: fixture.url + '/fixture-probe?channel=page', method: 'GET' }, passthrough: [] } });
      await listener.start();
      const before = fixture.snapshot();
      await click('Safe page channel probe'); await wait('Failed to fetch');
      await listener.assertReadyForBusiness();
      await click('Create mock-contract record'); await wait('Failed to fetch');
      await click('Send unclassified GET route'); await wait('unsafe-get: Failed to fetch');
      const after = fixture.snapshot();
      for (const key of ['GET /fixture-probe', 'POST /api/mock/create', 'GET /api/mock/unsafe-get']) assert.equal(after.counts[key] || 0, before.counts[key] || 0, `Controlled discovery upstream changed: ${key}`);
      const discoveryFacts = (await log()).events.filter(item => item.discovery_id === 'native-discovery');
      assert.equal(discoveryFacts.filter(item => item.kind === 'discovery_probe' && item.disposition === 'blocked').length, 1);
      assert.equal(discoveryFacts.filter(item => item.kind === 'discovery_request' && item.disposition === 'blocked').length, 2);
      assert.equal((await log()).events.some(item => ['mock_observation', 'mock_checkpoint', 'checkpoint_result'].includes(item.type)), false);
      await writeFile(path.join(output, 'discovery-protected-network.txt'), await mcp.tool('list_network_requests'));
      await mcp.tool('take_screenshot', { filePath: path.join(output, 'discovery-protected.png'), fullPage: true });
      const second = await mcp.tool('new_page', { url: fixture.url });
      const secondPageId = Number(/^(\d+):.*\[selected\]/m.exec(second)?.[1]); assert.ok(secondPageId && secondPageId !== pageId);
      await wait('Signed in: admin'); await click('Safe page channel probe'); await wait('"source": "real-fixture"');
      await click('Read mock-contract record'); await wait('404: No record');
      assert.equal(fixture.snapshot().counts['GET /fixture-probe'], (before.counts['GET /fixture-probe'] || 0) + 1);
      assert.equal(fixture.snapshot().counts['GET /api/mock/read'], (before.counts['GET /api/mock/read'] || 0) + 1);
      await writeFile(path.join(output, 'discovery-independent-network.txt'), await mcp.tool('list_network_requests'));
      await mcp.tool('take_screenshot', { filePath: path.join(output, 'discovery-independent.png'), fullPage: true });
      await mcp.tool('select_page', { pageId });
      await mcp.tool('close_page', { pageId: secondPageId });
      const stopped = await listener.stop(); assert.equal(stopped.cleanup.page_isolated, true); listener = null;
      listener = await createProxyListener(baseConfig); await listener.start();
      await mcp.tool('navigate_page', { url: fixture.url + '/?environment=required' }); await wait('Environment access ready'); await wait('Signed in: admin');
      await click('Safe page channel probe'); await wait('"source": "real-fixture"');
      assert.equal(fixture.snapshot().counts['GET /fixture-probe'], (before.counts['GET /fixture-probe'] || 0) + 2);
      await observe('discovery-restored', ids, 'Controlled discovery exited through safe MCP blank before Fetch detach; ordinary environment rules, login and real safe probe restored');
      await writeFile(path.join(output, 'discovery-counter-comparison.json'), JSON.stringify({ before, protectedAfter: after, restored: fixture.snapshot() }, null, 2));
      await validateRun(run.runRoot, { checkReport: false });
      summary.assertions.push('AC16 native official discovery: Request-stage safe probe blocked, unknown POST and unclassified GET blocked with all upstream deltas zero; no candidate/hash/attempt needed; independent Target real GET unaffected; safe blank restores base/login and real probe');
      summary.kind = 'Controlled discovery only; no product results or final completion claimed';
      return { output, ...summary };
    }
    await event({ type: 'permission_batch', group_id: 'real', phase: 'started', description: 'Start fixed real permissions batch' });
    await event({ type: 'case_started', case_id: 'REAL' });
    const start = async ({ checkpoint_id, scenario_id, execution_id, context = realContext, batch_id = 'real', facts = [identityPage.sequence], mock }) => {
      const prep = await event({ type: 'scenario_preparation', checkpoint_id, scenario_id, execution_id, batch_id, context_refs: [context.sequence], fact_refs: facts, data_source: mock ? 'mock' : 'real', permission_source: mock?.permission ? 'mock' : 'real', ...(mock ? { attempt_id: mock.attempt_id, scenario_hash: mock.hash, state_version: 0, ...(mock.permission ? { simulated_permission_ref: mock.permission.sequence } : {}) } : {}) });
      await event({ type: mock ? 'mock_checkpoint' : 'checkpoint_started', ...(mock ? { attempt_id: mock.attempt_id, action: 'started' } : {}), checkpoint_id, scenario_id, execution_id, preparation_ref: prep.sequence, scope_ids: [checkpoint_id.split('/')[0].toLowerCase()], context_refs: [context.sequence] });
      return event({ type: 'action_dispatched', action_id: execution_id, checkpoint_id, scenario_id, execution_id, ...(mock ? { attempt_id: mock.attempt_id } : {}), side_effect: false, description: 'Dispatch original frontend action through actual native MCP semantic control' });
    };
    const completeReal = async (scenario, action, page, networkFact, result = 'passed') => {
      const evidence = await capture(scenario, [ids[0]]);
      await event({ type: 'action_confirmed', action_id: scenario, outcome: 'confirmed_success', fact_refs: [page.sequence], description: 'Native MCP page confirms original control completed' });
      const refs = [page.sequence, ...(networkFact ? [networkFact.sequence] : [])]; const checked = await review('checkpoint_close', [ids[0]], refs);
      return event({ type: 'checkpoint_result', checkpoint_id: ids[0], scenario_id: scenario, execution_id: scenario, result, reason: result === 'failed' ? 'Prepared valid input reached actual frontend handler completion but required request was not dispatched; controlled local fixture defect is preserved' : 'Actual local frontend behavior matches immutable scenario', observation: page.description, evidence_status: 'complete', evidence_refs: [evidence], execution_refs: refs, coverage_review_ref: checked.sequence });
    };
    await mcp.tool('fill', { uid: await uid('textbox', 'Conditional name'), value: 'Prepared valid name' });
    await mcp.tool('click', { uid: await uid('checkbox', 'Simulate missing submit dispatch') });
    await wait('Missing-dispatch defect enabled');
    const validInput = await observe('valid-input-prepared', [ids[0]], 'Actual text control contains nonempty Prepared valid name; local fixture missing-dispatch fault explicitly enabled; no product success required for preparation');
    let action = await start({ checkpoint_id: ids[0], scenario_id: 'valid-name-missing-request', execution_id: 'valid-name-missing-request', facts: [validInput.sequence] });
    await click('Submit conditional request'); await wait('Conditional action 1 complete: Valid name accepted; handler ended without dispatch');
    const missingPage = await observe('missing-request', [ids[0]], 'Actual valid-name action reached terminal completion but required request was not dispatched', { scenario_id: 'valid-name-missing-request', execution_id: 'valid-name-missing-request', action_id: 'valid-name-missing-request' });
    const missingListing = await mcp.tool('list_network_requests'); assert.doesNotMatch(missingListing, /\/api\/conditional/);
    await writeFile(path.join(run.runRoot, 'observations/missing-request-window.txt'), missingListing);
    const missingNetwork = await event({ type: 'network_observation', checkpoint_ids: [ids[0]], target_id: targetId, context_ref: 'fixture-admin-context', channel: 'page-http', route_id: 'conditional', url: fixture.url + '/api/conditional', method: 'POST', description: 'Native Network confirms required request absent after actual handler terminal completion; fixture declared branch is synchronous', scenario_id: 'valid-name-missing-request', execution_id: 'valid-name-missing-request', request_detail_path: 'observations/missing-request-window.txt', request_detail_sha256: hash(missingListing), request_window: { action_ref: action.sequence, completion_ref: missingPage.sequence, completion_basis: 'Actual valid-input handler completion marker; explicit local missing-dispatch defect returns synchronously', request_count: 0 } });
    await completeReal('valid-name-missing-request', action, missingPage, missingNetwork, 'failed');
    await mcp.tool('click', { uid: await uid('checkbox', 'Simulate missing submit dispatch') });
    await mcp.tool('fill', { uid: await uid('textbox', 'Conditional name'), value: '' });
    action = await start({ checkpoint_id: ids[0], scenario_id: 'real-list', execution_id: 'real-list' });
    await click('Refresh real records'); await wait('Expired seed');
    const realPage = await observe('real-list', [ids[0]], 'Real list displays Expired seed after native Refresh click', { scenario_id: 'real-list', execution_id: 'real-list', action_id: 'real-list' });
    await completeReal('real-list', action, realPage);
    const noRequestBefore = fixture.snapshot().counts['POST /api/conditional'] || 0;
    action = await start({ checkpoint_id: ids[0], scenario_id: 'empty-name', execution_id: 'empty-name' });
    await click('Submit conditional request'); await wait('Conditional action 2 complete: Name is required; no request dispatched');
    const emptyPage = await observe('empty-name', [ids[0]], 'Empty-name validation reaches synchronous terminal action marker and displays Name is required', { scenario_id: 'empty-name', execution_id: 'empty-name', action_id: 'empty-name' });
    const nativeNetwork = await mcp.tool('list_network_requests'); assert.doesNotMatch(nativeNetwork, /\/api\/conditional/);
    assert.equal(fixture.snapshot().counts['POST /api/conditional'] || 0, noRequestBefore);
    await writeFile(path.join(run.runRoot, 'observations/empty-request-window.txt'), nativeNetwork);
    const emptyNetwork = await event({ type: 'network_observation', checkpoint_ids: [ids[0]], target_id: targetId, context_ref: 'fixture-admin-context', channel: 'page-http', route_id: 'conditional', url: fixture.url + '/api/conditional', method: 'POST', description: 'Actual native Network list contains zero conditional requests through synchronous terminal validation marker; upstream counter unchanged', scenario_id: 'empty-name', execution_id: 'empty-name', request_detail_path: 'observations/empty-request-window.txt', request_detail_sha256: hash(nativeNetwork), request_window: { action_ref: action.sequence, completion_ref: emptyPage.sequence, completion_basis: 'Fixture synchronous validation branch completed and rendered unique action 2 terminal marker; no timer or deferred dispatch in declared fixture contract', request_count: 0 } });
    await completeReal('empty-name', action, emptyPage, emptyNetwork);
    summary.assertions.push('AC03/09/10 prepared valid-name missing-request frontend defect failed; remaining real-list and empty-name checks still passed in the same original case. No-request judgments use action completion plus native Network and upstream count');
    await event({ type: 'case_started', case_id: 'DATA' });
    await click('Read mock-contract record'); await wait('404: No record');
    const readNetwork = await network('real-empty-read', ids[1], '/api/mock/read');
    const readPage = await observe('real-empty-read', [ids[1]], 'Actual GET /api/mock/read returned 404 No record; supplied ID SYNTHETIC-001 cannot be chosen by real UI');
    const explorationSummary = { checkpoint_ids: [ids[1]], missing_fact: 'SYNTHETIC-001', known_facts: ['Observed real 404', 'Provided fixture create generates IDs'], attempts: [{ action: 'Read existing fixture sample using visible UI', observation: '404 No record' }], cannot_continue_reason: 'Exact fixed ID unavailable through real UI' };
    const dataBlocker = await event({ type: 'blocker', checkpoint_ids: [ids[1]], description: readPage.description, exploration_summary: explorationSummary });
    const dataGap = await event({ type: 'data_gap', gap_id: 'fixed-data-gap', checkpoint_ids: [ids[1]], real_blocker_refs: [dataBlocker.sequence], exploration_refs: [dataBlocker.sequence, readPage.sequence, readNetwork.sequence], missing_conditions: ['Exact supplied SYNTHETIC-001 record'], known_request_facts: ['Actual GET /api/mock/read returned 404', 'Declared fixture create assigns real-mock random ID; no ID selection, so no pointless real write preparation'], not_started_dependencies: ['Exact supplied sample needed to judge original frontend assertion'] });
    const gapEvidence = await capture('data-real-gap', [ids[1]]);
    const gapReview = await review('checkpoint_close', [ids[1]], [readPage.sequence, dataGap.sequence], 'exploration_insufficient');
    await event({ type: 'checkpoint_result', checkpoint_id: ids[1], scenario_id: 'data', result: 'undetermined', reason: 'Real sample unavailable after actual read; no preparation operation can choose the exact immutable ID', observation: readPage.description, evidence_status: 'complete', evidence_refs: [gapEvidence], execution_refs: [readPage.sequence], data_gap_ref: dataGap.sequence, exploration_ref: dataBlocker.sequence, not_attempted_reason: 'Exact required fixed ID is absent; original frontend sample cannot be triggered in real mode', coverage_review_ref: gapReview.sequence });
    if (mode === 'allowed') {
      // The declared fixture contract and real read Network establish the GET-only scene; no real write is used for discovery.
      async function mockRead({ checkpoint_id, scenario_id, scope, batch, context, gap, route, routeId, body, clickLabel, expected, permission }) {
        const candidateId = 'candidate-' + scenario_id, attempt_id = 'attempt-' + scenario_id;
        await event({ type: 'mock_candidate', candidate_id: candidateId, case_id: checkpoint_id.split('/')[0], checkpoint_ids: [checkpoint_id], gap_ids: [gap.gap_id], assertion_domain: 'frontend', assertion_basis: 'Immutable original input asserts frontend rendering only', purpose: 'Supply the known local fixture frontend input for the exact missing condition' });
        const provenance = { source_refs: [`event:${route.sequence}`], synthetic_values: [JSON.stringify(body)] };
        const definition = { schema_version: 'mock-scenario-v1', scenario_id: 'scene-' + scenario_id, revision: 1, run_id: run.runId, case_id: checkpoint_id.split('/')[0], attempt_id, candidate_checkpoint_ids: [checkpoint_id], supporting_checkpoint_ids: [], initial_state: {}, provenance,
          routes: [{ route_id: routeId, match: { origin: fixture.url, pathname: new URL(route.url).pathname, method: 'GET', query: {}, body: { rules: [], allowed_extra_pointers: [] } }, effect: [], response: { status: 200, headers: { 'x-fixture-response': 'ready' }, body }, provenance }], passthrough: [] };
        const encoded = JSON.stringify(definition), scenarioHash = hash(encoded); await mkdir(path.join(run.runRoot, 'mock'), { recursive: true }); await writeFile(path.join(run.runRoot, `mock/${scenario_id}.json`), encoded);
        const channel = await event({ type: 'mock_channel_coverage', target_id: targetId, context_ref: 'fixture-admin-context', scenario_hash: scenarioHash, covered_route_ids: [routeId], request_refs: [route.sequence], uncovered_channels: [], channels: [{ kind: 'page-http', target_id: targetId, request_refs: [route.sequence] }] });
        const attempt = { type: 'mock_attempt', attempt_id, candidate_ids: [candidateId], case_id: checkpoint_id.split('/')[0], scenario_revision: 1, scenario_hash: scenarioHash, context_refs: [context.sequence], proxy_cycle_refs: ['cycle-' + scenario_id] };
        await event({ ...attempt, action: 'started', state_version: 0, candidate_checkpoint_ids: [checkpoint_id], supporting_checkpoint_ids: [] });
        // Base-only listener stop does not need to isolate synthetic state; it has not served any case Mock.
        await listener.stop(); listener = null;
        listener = await createProxyListener({ ...baseConfig, proxy_cycle_id: 'cycle-' + scenario_id, mock_channel_coverage_ref: channel.sequence, mock_scenario: { path: `mock/${scenario_id}.json`, sha256: scenarioHash, attempt_id, state_path: `mock/${scenario_id}-state.json`, receipts_path: `mock/${scenario_id}-receipts.json` } }); await listener.start();
        const before = fixture.snapshot();
        const dispatched = await start({ checkpoint_id, scenario_id, execution_id: scenario_id, context, batch_id: batch, facts: [route.sequence], mock: { attempt_id, hash: scenarioHash, permission } });
        await listener.assertReadyForBusiness(); await click(clickLabel); await wait(expected);
        const mockedNetwork = await network('mock-' + scenario_id, checkpoint_id, new URL(route.url).pathname, { scenario_id, execution_id: scenario_id, attempt_id });
        const page = await observe('mock-' + scenario_id, [checkpoint_id], `Actual native MCP frontend rendered expected ${expected}; actual Signed in: admin unchanged`, { scenario_id, execution_id: scenario_id, action_id: scenario_id, attempt_id });
        assert.match(await snapshot(), /Signed in: admin/);
        assert.equal(fixture.snapshot().counts['GET ' + new URL(route.url).pathname], before.counts['GET ' + new URL(route.url).pathname]);
        const receipts = (await log()).events.filter(item => item.type === 'mock_observation' && item.attempt_id === attempt_id); assert.equal(receipts.length, 1);
        const evidence = await capture('mock-' + scenario_id, [checkpoint_id]);
        await event({ type: 'action_confirmed', action_id: scenario_id, outcome: 'confirmed_success', fact_refs: [page.sequence], description: 'Actual native MCP page consumed response and completed original action' });
        const reviewed = await review('checkpoint_close', [checkpoint_id], [mockedNetwork.sequence, page.sequence, ...receipts.map(item => item.sequence)]);
        const result = await event({ type: 'mock_checkpoint', action: 'result', attempt_id, checkpoint_id, scenario_id, execution_id: scenario_id, result: 'passed', observation: page.description, reason: 'Exact original frontend assertion verified; real backend and server permission remain unproved', evidence_refs: [evidence], request_refs: receipts.map(item => item.receipt_id), execution_refs: [mockedNetwork.sequence, ...receipts.map(item => item.sequence)], page_observation_refs: [page.sequence], coverage_review_ref: reviewed.sequence });
        const finished = await event({ ...attempt, action: 'finished', state_version: receipts.at(-1).state_after_version });
        await event({ type: 'mock_disposition', candidate_id: candidateId, outcome: 'supplemented', attempt_id, basis_refs: [result.sequence, finished.sequence] });
        const stopped = await listener.stop(); assert.equal(stopped.cleanup.page_isolated, true); listener = null;
        listener = await createProxyListener(baseConfig); await listener.start();
        await mcp.tool('navigate_page', { url: fixture.url + '/?environment=required' }); await wait('Environment access ready'); await wait('Signed in: admin');
        await click(clickLabel); await wait(permission ? 'Frontend approve permission: unavailable' : '404: No record');
        await observe('restored-' + scenario_id, [checkpoint_id], 'After safe blank and Mock detach, base configuration restored before navigation; real endpoint returns original unavailable state and login persists');
        assert.equal(fixture.snapshot().counts['GET ' + new URL(route.url).pathname], before.counts['GET ' + new URL(route.url).pathname] + 1);
        return result;
      }
      await mockRead({ checkpoint_id: ids[1], scenario_id: 'data', scope: 'data', batch: 'real', context: realContext, gap: dataGap, route: readNetwork, routeId: 'read', body: { id: 'SYNTHETIC-001', name: 'Mock draft', status: 'draft' }, clickLabel: 'Read mock-contract record', expected: 'SYNTHETIC-001' });
      const endReal = await review('batch_end', ids.slice(0, 2), [(await log()).events.at(-1).sequence]);
      await event({ type: 'permission_batch', group_id: 'real', phase: 'drained', coverage_review_ref: endReal.sequence, description: 'All real configuration scenarios actually executed including data-only mock' });
      await click('Load frontend permissions'); await wait('Frontend approve permission: unavailable');
      const permissionNetwork = await network('real-permission', ids[2], '/api/frontend-permissions');
      const permissionPage = await observe('real-permission', [ids[2]], 'Actual admin remains signed in; real frontend canApprove=false and no approve button');
      const permissionGap = await event({ type: 'data_gap', gap_id: 'frontend-permission-gap', gap_kind: 'permission_unavailable', group_id: 'approve', identity_ref: identity.sequence, resource_statement_ref: plan.sequence, checkpoint_ids: [ids[2]], real_blocker_refs: [permissionPage.sequence], exploration_refs: [permissionNetwork.sequence, permissionPage.sequence], missing_conditions: ['Frontend canApprove=true input unavailable in real fixture'], known_request_facts: ['Provided contract GET /api/frontend-permissions has boolean canApprove controlling button visibility; real endpoint returned false'], not_started_dependencies: ['Original scenario requires true frontend permission input, not real server grant'] });
      const simulated = await event({ type: 'simulated_permission', group_id: 'approve', identity_ref: identity.sequence, gap_ref: permissionGap.sequence, contract_refs: [permissionNetwork.sequence, permissionPage.sequence], input_description: 'Provided frontend canApprove=true controls only button visibility; no real account/server permission change' });
      const permissionContext = await makeContext(['permission'], simulated);
      await event({ type: 'permission_batch', group_id: 'approve', phase: 'started', description: 'Begin fixed unavailable frontend permission configuration with same real identity' });
      await event({ type: 'case_started', case_id: 'PERMISSION' });
      await mockRead({ checkpoint_id: ids[2], scenario_id: 'permission', scope: 'permission', batch: 'approve', context: permissionContext, gap: permissionGap, route: permissionNetwork, routeId: 'frontend-permissions', body: { canApprove: true, source: 'synthetic-frontend-permission' }, clickLabel: 'Load frontend permissions', expected: 'Frontend approve permission: available', permission: simulated });
      const endPermission = await review('batch_end', [ids[2]], [(await log()).events.at(-1).sequence]);
      await event({ type: 'permission_batch', group_id: 'approve', phase: 'drained', coverage_review_ref: endPermission.sequence, description: 'All frontend permission configuration scenarios executed; real unavailable resource preserved' });
      summary.assertions.push('AC04/14/18 data-only Mock and unavailable frontend permission Mock executed in fixed batches; actual admin identity retained; strict final responses consumed; real reads and pre-login base config restored after each safe exit');
    } else {
      const endReal = await review('batch_end', ids, [(await log()).events.at(-1).sequence]);
      await event({ type: 'permission_batch', group_id: 'real', phase: 'drained', coverage_review_ref: endReal.sequence, description: 'All real executable work completed; precise fixed-data gap remains under explicit declined Mock policy' });
      assert.equal((await log()).events.some(item => item.type === 'mock_attempt'), false);
    }
    await listener.stop(); listener = null;
    await event({ type: 'cleanup_state', cleanup: { attempted: true, completed: true, items: ['Each synthetic page safely isolated before Fetch detach', 'Base environment rules restored and actual real unavailable reads verified between scenes', 'Owned final base proxy stopped after all work'] } });
    const finalReview = await review('final', ids, [...closures.values()].flatMap(item => item.basis_refs));
    await event({ type: 'run_state', status: 'completed', coverage_review_ref: finalReview.sequence });
    await validateRun(run.runRoot, { checkReport: false });
    const report = await generateReport(run.runRoot); const delivery = await deliverReport(run.runRoot);
    assert.equal(report.delivery.kind, 'final'); assert.equal(delivery.deliverable, true); assert.equal(delivery.delivery.kind, 'final');
    assert.equal(report.counts.passed, mode === 'allowed' ? 2 : 0); assert.equal(report.counts.failed, 1); assert.equal(report.counts.undetermined, mode === 'allowed' ? 0 : 1);
    const html = await readFile(report.htmlReportPath, 'utf8'); assert.match(html, /SYNTHETIC-001/);
    await writeFile(path.join(output, 'final-delivery.json'), JSON.stringify(delivery, null, 2));
    await writeFile(path.join(output, 'final-chat-table.md'), delivery.chatTableMarkdown);
    summary.final = true; summary.reportPath = report.htmlReportPath; summary.counts = report.counts;
    return { output, ...summary };
  } catch (error) { summary.failure = { code: error.code || null, message: error.message, stack: error.stack }; throw error; }
  finally {
    if (listener) await listener.stop().catch(error => { summary.cleanupError = error.message; });
    if (mcp) await mcp.stop();
    if (prepared?.profile_path) await rm(prepared.profile_path, { recursive: true, force: true });
    await writeFile(path.join(output, 'upstream-final.json'), JSON.stringify(fixture.snapshot(), null, 2)); await fixture.close();
    if (run) summary.runRoot = run.runRoot;
    const sourceEnd = await sourceProvenance();
    await writeFile(path.join(output, 'source-end.json'), JSON.stringify(sourceEnd, null, 2));
    summary.sourceStable = sourceStart.head === sourceEnd.head && sourceStart.worktreeDigest === sourceEnd.worktreeDigest;
    summary.source = sourceStart;
    await writeFile(path.join(output, 'integration-summary.json'), JSON.stringify(summary, null, 2));
    process.stdout.write(`Integration evidence: ${output}\n`);
  }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const output = process.argv.find(arg => arg.startsWith('--output='))?.slice('--output='.length);
  const mode = process.argv.find(arg => arg.startsWith('--mode='))?.slice('--mode='.length) || 'allowed';
  const run = process.argv.includes('--fixture-only') ? exerciseIntegrationFixture : runIntegrationRound;
  run({ output, mode, baseOnly: process.argv.includes('--base-only'), discoveryOnly: process.argv.includes('--discovery-only') }).then(value => console.log(JSON.stringify(value, null, 2))).catch(error => { console.error(error.stack); process.exitCode = 1; });
}
