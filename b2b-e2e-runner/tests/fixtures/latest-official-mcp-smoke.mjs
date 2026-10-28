/** Opt-in real MCP smoke through public Run/browser/proxy/report entry points.
 * The only product is the local non-production fixture. No existing Run/profile is used.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { LocalMcp } from './latest-mcp-smoke.mjs';
import { locateChromeMcpCli } from './local-mcp-cli.mjs';
import { startLatestWorkflowFixture } from './latest-workflow-server.mjs';
import { initializeRun, recordEvent, archiveScreenshot, validateRun, generateReport } from '../../scripts/run-artifacts.mjs';
import { prepareBrowser, bindBrowser, discoverBrowser } from '../../scripts/browser-session.mjs';
import { proxyRulesDigest } from '../../scripts/lib/proxy-authorization.mjs';
import { createProxyListener } from '../../scripts/cdp-fetch-proxy.mjs';
import { CdpClient } from '../../scripts/lib/cdp-client.mjs';

const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const cp = 'FRONTEND/show/name';
const scopeId = 'fixture-front-end';
export async function runOfficialSmoke({ output, cli } = {}) {
  cli ??= await locateChromeMcpCli();
  output ||= await mkdtemp(path.join(os.tmpdir(), 'runner-official-real-mcp-'));
  await mkdir(output, { recursive: true });
  let mcp, fixture, listener, ownedCdp, prepared, run;
  const summary = { host: 'Standalone local Chrome DevTools MCP public CLI, not desktop managed host', kind: 'Official entry integration with real page actions; stage report only', assertions: [] };
  const note = fact => { summary.assertions.push(fact); process.stdout.write(fact + '\n'); };
  try {
    fixture = await startLatestWorkflowFixture();
    const casesPath = path.join(output, 'input-cases.json');
    await writeFile(casesPath, JSON.stringify({ schema_version: '2.0', suite: { name: 'Local frontend supplied-contract example', target_urls: [fixture.url] }, cases: [{ case_id: 'FRONTEND', module: 'Local fixture only', title: 'Display the supplied synthetic contract example', preconditions: ['Exact supplied sample ID SYNTHETIC-001 is required; this asserts frontend rendering only, not backend persistence or permission'], steps: [{ step_id: 'show', action: 'Use the declared-contract create and read buttons', expected: [{ oracle_id: 'name', text: 'UI displays ID SYNTHETIC-001, name Mock draft and status draft for the supplied contract example' }] }] }] }, null, 2));
    run = await initializeRun({ workspaceRoot: output, casesPath, workflowProfile: 'b2b-e2e-current', mockFallback: 'allowed' });
    const event = input => recordEvent(run.runRoot, input);
    const log = async () => JSON.parse(await readFile(path.join(run.runRoot, 'execution-log.json'), 'utf8'));
    await mkdir(path.join(run.runRoot, 'observations'));
    await event({ type: 'permission_plan', version: '1.0', groups: [], role_independent_case_ids: ['FRONTEND'] });
    await event({ type: 'proxy_policy', purpose: 'environment_access', action: 'initial', decision: 'declined', decision_source: 'user', basis: 'Authorized local fixture mock acceptance only; no ordinary request or response rewrite rules', rules_sha256: proxyRulesDigest([]) });
    await event({ type: 'checkpoint_semantics', checkpoint_id: cp, assertion_domain: 'frontend', condition_kind: 'fixed', basis: 'Immutable input explicitly asserts rendering of the supplied example and excludes real backend/permission claims' });
    await event({ type: 'coverage_plan', action: 'initial', revision: 1, snapshot_hash: (await log()).test_cases.sha256, source: 'Immutable local acceptance case', items: [{ checkpoint_id: cp, dependencies: [], scopes: [{ scope_id: scopeId, group_ids: [], location_ref: fixture.url, location_status: 'known', step_refs: ['FRONTEND/show'], source_refs: ['snapshot:FRONTEND/show'] }] }] });
    prepared = await prepareBrowser({ runRoot: run.runRoot, storageContext: 'fixture-admin-storage', hostCapability: 'shared-loopback', configuration: { host: 'standalone-native-cli', cli, dynamic_port: true, ordinary_proxy_rules: [] } });
    assert.equal(prepared.launch_allowed, true);
    await writeFile(path.join(output, 'browser-preparation.json'), JSON.stringify(prepared, null, 2));
    mcp = new LocalMcp({ cli, profile: prepared.profile_path, output, extraArgs: ['--redactNetworkHeaders'] });
    await mcp.start();
    const pageText = await mcp.tool('new_page', { url: prepared.marker });
    const pageId = Number(/^(\d+):.*\[selected\]/m.exec(pageText)?.[1]);
    assert.ok(pageId);
    const mcpPages = await mcp.tool('list_pages');
    const bound = await bindBrowser({ runRoot: run.runRoot, storageContext: 'fixture-admin-storage', mcpPageId: pageId, marker: prepared.marker, mcpPages });
    const discovered = await discoverBrowser({ runRoot: run.runRoot, storageContext: 'fixture-admin-storage' });
    const targetId = bound.session.target_id;
    const version = await fetch(discovered.endpoint + '/json/version').then(response => response.json());
    ownedCdp = await CdpClient.connect(version.webSocketDebuggerUrl);
    await writeFile(path.join(output, 'browser-bound.json'), JSON.stringify(bound, null, 2));
    note('prepareBrowser + actual owned Chrome + MCP blank-marker list + bindBrowser + discoverBrowser succeeded before login and before Fetch');
    await mcp.tool('navigate_page', { url: fixture.url });
    const snapshot = () => mcp.tool('take_snapshot');
    const uid = async (role, label) => { const text = await snapshot(); const line = text.split('\n').find(line => line.includes(` ${role} "${label}"`)); assert.ok(line, `Missing ${role} ${label}`); return /uid=([^ ]+)/.exec(line)[1]; };
    const click = async label => mcp.tool('click', { uid: await uid('button', label) });
    const wait = async text => mcp.tool('wait_for', { text: [text], timeout: 10000 });
    async function observe(name, description, extra = {}) {
      const text = await snapshot();
      const relative = `observations/${name}.txt`;
      await writeFile(path.join(run.runRoot, relative), text);
      return event({ type: 'page_observation', checkpoint_ids: [cp], description, snapshot_path: relative, snapshot_sha256: hash(text), ...extra });
    }
    async function capture(name, description) {
      const image = path.join(output, name + '.png');
      await mcp.tool('take_screenshot', { filePath: image, fullPage: true });
      return archiveScreenshot(run.runRoot, { sourcePath: image, allowedSourceRoot: output, event: { type: 'evidence_capture', capture_kind: 'screenshot', outcome: 'captured', checkpoint_ids: [cp], description, attempts: ['Actual native MCP take_screenshot fullPage output'], evidence: [{ evidence_id: name, kind: 'screenshot', at: new Date().toISOString(), checkpoint_ids: [cp], path: `evidence/${name}.png`, description }] } });
    }
    async function review(id, refs, kind) {
      return event({ type: 'coverage_review', review_id: id, purpose: 'checkpoint_close', plan_revision: 1, based_on_sequence: (await log()).events.length, scope_ids: [scopeId], checkpoint_ids: [cp], fact_refs: refs, assistance_refs: [], ready_scope_ids: [scopeId], preparable_scope_ids: [], blocked_scope_ids: [], closures: [{ checkpoint_id: cp, closure_kind: kind, basis_refs: refs }], choice: 'close', reason: 'Checked current actual page and request facts against the immutable frontend-only oracle' });
    }
    await click('Enter fixture'); await wait('Signed in: admin');
    await event({ type: 'mcp_preflight', status: 'available', description: 'Native MCP new_page/list_pages/snapshot/click worked on this owned Target' });
    const identity = await observe('signed-in', 'Actual UI shows Signed in: admin on the fixture URL; account identity is non-secret local role selection');
    const context = await event({ type: 'coverage_context', scope_ids: [scopeId], account_ref: null, observed_account_ref: null, target_id: targetId, context_ref: 'fixture-context', environment_ref: 'local-non-production', observed_url: fixture.url, verification: 'verified', switch_status: 'not_required', fact_refs: [identity.sequence] });
    await event({ type: 'run_state', status: 'running' });
    await event({ type: 'case_started', case_id: 'FRONTEND' });
    const networkRefs = [];
    for (const [route, label, expected, method] of [['create', 'Create mock-contract record', '"name": "Mock draft"', 'POST'], ['read', 'Read mock-contract record', '"name": "Mock draft"', 'GET'], ['update', 'Update mock-contract record', '"name": "Mock updated"', 'POST']]) {
      await click(label); await wait(expected);
      const listing = await mcp.tool('list_network_requests');
      const line = listing.split('\n').filter(line => line.includes(`/api/mock/${route} `)).at(-1);
      assert.ok(line, `Native MCP network list missing ${route}`);
      const reqid = Number(/reqid=(\d+)/.exec(line)?.[1]); assert.ok(reqid);
      const detail = await mcp.tool('get_network_request', { reqid });
      assert.ok(detail.includes(fixture.url + '/api/mock/' + route));
      const relative = `observations/network-real-${route}.txt`;
      await writeFile(path.join(run.runRoot, relative), detail);
      const recorded = await event({ type: 'network_observation', checkpoint_ids: [cp], target_id: targetId, context_ref: 'fixture-context', channel: 'page-http', route_id: route, url: fixture.url + '/api/mock/' + route, method, description: `Actual MCP Network reqid=${reqid}; fixture visible UI consumed the real ${route} response`, request_detail_path: relative, request_detail_sha256: hash(detail) });
      networkRefs.push(recorded.sequence);
    }
    const realState = fixture.snapshot();
    assert.ok(realState.mockRecord.id.startsWith('real-mock-'));
    assert.equal(realState.counts['POST /api/mock/create'], 1); assert.equal(realState.counts['POST /api/mock/update'], 1);
    const realObservation = await observe('real-sample-missing', `Actual record ID ${realState.mockRecord.id} is real-mock generated and name is Mock updated. Required fixed synthetic sample SYNTHETIC-001 is absent; real preparation cannot choose a fixed ID.`);
    await capture('real-contract-discovery', 'Real fixture record and current visible response before mock; not the requested synthetic sample');
    const blocker = await event({ type: 'blocker', checkpoint_ids: [cp], description: 'Actual UI and Network show a generated real-mock ID; fixed SYNTHETIC-001 sample remains absent', exploration_summary: { checkpoint_ids: [cp], missing_fact: 'Exact SYNTHETIC-001 sample', known_facts: ['Real create/read/update succeeded with generated real-mock ID'], attempts: [{ action: 'UI create/read/update and actual MCP Network inspection', observation: 'No user-selected ID field; exact supplied sample unavailable' }], cannot_continue_reason: 'Original fixed example cannot be obtained by the observed real UI contract' } });
    const gap = await event({ type: 'data_gap', gap_id: 'specified-example-gap', checkpoint_ids: [cp], real_blocker_refs: [blocker.sequence], exploration_refs: [blocker.sequence, realObservation.sequence, ...networkRefs], missing_conditions: ['Specified SYNTHETIC-001 contract sample; real fixture UI generates different real-mock IDs'], known_request_facts: ['Actual MCP UI create/read/update returned observed fields id/name/status', 'No parameter in observed create request selects the required example ID'], not_started_dependencies: ['Rendering the exact supplied example requires that example response'] });
    const realReview = await review('real-sample-closure', [realObservation.sequence, gap.sequence], 'exploration_insufficient');
    await event({ type: 'checkpoint_result', checkpoint_id: cp, result: 'undetermined', reason: 'Exact required contract example is unavailable in the real fixture; no real-backend conclusion is asserted', observation: 'UI real record uses a generated real-mock ID', evidence_status: 'complete', evidence_refs: ['real-contract-discovery'], data_gap_ref: gap.sequence, not_attempted_reason: 'Exact fixed input is absent; exploratory real UI actions do not execute the required synthetic sample assertion', exploration_ref: blocker.sequence, execution_refs: [realObservation.sequence], coverage_review_ref: realReview.sequence });
    await event({ type: 'mock_candidate', candidate_id: 'frontend-example', case_id: 'FRONTEND', checkpoint_ids: [cp], gap_ids: ['specified-example-gap'], assertion_domain: 'frontend', assertion_basis: 'Original immutable oracle explicitly requires supplied example rendering only', purpose: 'Supply the fixed example to verify frontend display without a backend persistence claim' });
    const provenance = { source_refs: networkRefs.map(ref => `event:${ref}`), synthetic_values: ['SYNTHETIC-001'] };
    const match = (pathname, method = 'GET', name) => ({ origin: fixture.url, pathname, method, query: {}, body: { rules: name === undefined ? [] : [{ pointer: '/name', presence: 'required', type: 'string', value: name }], allowed_extra_pointers: [] } });
    const definition = { schema_version: 'mock-scenario-v1', scenario_id: 'official-ui-example', revision: 1, run_id: run.runId, case_id: 'FRONTEND', attempt_id: 'official-attempt', candidate_checkpoint_ids: [cp], supporting_checkpoint_ids: [], initial_state: { record: null }, provenance,
      routes: [
        { route_id: 'create', match: match('/api/mock/create', 'POST', 'Mock draft'), effect: [{ op: 'set', path: '/record', value: { id: 'SYNTHETIC-001', name: { $request: '/body/name' }, status: 'draft' } }], response: { status: 201, headers: {}, body: { $state: '/record' } }, provenance },
        { route_id: 'read', match: match('/api/mock/read'), effect: [], response: { status: 200, headers: {}, body: { $state: '/record' } }, provenance },
        { route_id: 'update', match: match('/api/mock/update', 'POST', 'Mock updated'), effect: [{ op: 'set', path: '/record/name', value: { $request: '/body/name' } }], response: { status: 200, headers: {}, body: { $state: '/record' } }, provenance }
      ], passthrough: [] };
    const encoded = JSON.stringify(definition); const scenarioHash = hash(encoded);
    await mkdir(path.join(run.runRoot, 'mock')); await writeFile(path.join(run.runRoot, 'mock/scenario.json'), encoded);
    const channel = await event({ type: 'mock_channel_coverage', target_id: targetId, context_ref: 'fixture-context', scenario_hash: scenarioHash, covered_route_ids: ['create', 'read', 'update'], request_refs: networkRefs, uncovered_channels: [], channels: [{ kind: 'page-http', target_id: targetId, request_refs: networkRefs }] });
    const attemptBase = { type: 'mock_attempt', attempt_id: 'official-attempt', candidate_ids: ['frontend-example'], case_id: 'FRONTEND', scenario_revision: 1, scenario_hash: scenarioHash, context_refs: [context.sequence], proxy_cycle_refs: ['official-cycle'] };
    await event({ ...attemptBase, action: 'started', state_version: 0, candidate_checkpoint_ids: [cp], supporting_checkpoint_ids: [] });
    const config = { environment: 'test', endpoint: discovered.endpoint, run_root: run.runRoot, run_id: run.runId, target_id: targetId, lock_root: path.join(output, 'locks'), rules: [], proxy_cycle_id: 'official-cycle', mock_channel_coverage_ref: channel.sequence,
      mock_scenario: { path: 'mock/scenario.json', sha256: scenarioHash, attempt_id: 'official-attempt', state_path: 'mock/state.json', receipts_path: 'mock/receipts.json' },
      prepareOwnedTargetForCleanup: async () => { await mcp.tool('select_page', { pageId }); await mcp.tool('navigate_page', { url: 'about:blank' }); } };
    listener = await createProxyListener(config); await listener.start();
    const execution = { checkpoint_id: cp, scenario_id: scopeId, execution_id: 'official-render-execution', attempt_id: 'official-attempt' };
    const preparation = await event({ type: 'scenario_preparation', ...execution, batch_id: 'general', context_refs: [context.sequence], fact_refs: [identity.sequence, ...networkRefs], data_source: 'mock', permission_source: 'real', scenario_hash: scenarioHash, state_version: 0 });
    await event({ type: 'mock_checkpoint', ...execution, action: 'started', scope_ids: [scopeId], context_refs: [context.sequence], preparation_ref: preparation.sequence });
    const action = { ...execution, action_id: 'official-create-input', side_effect: true, description: 'Actual native MCP clicks the supplied-contract create button with the authorized Request guard ready' };
    await event({ type: 'action_planned', ...action });
    await event({ type: 'action_dispatched', ...action });
    await writeFile(path.join(output, 'upstream-before-official-mock.json'), JSON.stringify(realState, null, 2));
    await listener.assertReadyForBusiness(); await click('Create mock-contract record'); await wait('SYNTHETIC-001');
    await listener.assertReadyForBusiness(); await click('Read mock-contract record'); await wait('"name": "Mock draft"');
    const after = fixture.snapshot();
    assert.equal(after.counts['POST /api/mock/create'], realState.counts['POST /api/mock/create']);
    assert.equal(after.counts['POST /api/mock/update'], realState.counts['POST /api/mock/update']);
    assert.equal(after.counts['GET /api/mock/read'], realState.counts['GET /api/mock/read']);
    await writeFile(path.join(output, 'upstream-after-official-mock.json'), JSON.stringify(after, null, 2));
    const receipts = (await log()).events.filter(item => item.type === 'mock_observation');
    assert.deepEqual(receipts.map(item => item.route_id), ['create', 'read']);
    const visible = await snapshot(); assert.ok(visible.includes('SYNTHETIC-001') && visible.includes('Mock draft') && visible.includes('draft'));
    const pageObservation = await observe('mock-example-rendered', 'Actual native MCP snapshot shows returned ID SYNTHETIC-001, name Mock draft and status draft after mock create/read', { ...execution });
    await capture('official-mock-rendered', 'Actual page rendering consumed authorized mock create/read responses; frontend proof only');
    const mockReview = await review('mock-example-closure', [pageObservation.sequence, ...receipts.map(item => item.sequence)], 'observed');
    const result = await event({ type: 'mock_checkpoint', ...execution, action: 'result', result: 'passed', observation: 'Actual page displays the supplied example fields as required', reason: 'Only original frontend rendering assertion is satisfied; backend persistence/permission are not proved', evidence_refs: ['official-mock-rendered'], request_refs: receipts.map(item => item.receipt_id), execution_refs: receipts.map(item => item.sequence), page_observation_refs: [pageObservation.sequence], coverage_review_ref: mockReview.sequence });
    const finished = await event({ ...attemptBase, action: 'finished', state_version: 2 });
    await event({ type: 'mock_disposition', candidate_id: 'frontend-example', outcome: 'supplemented', attempt_id: 'official-attempt', basis_refs: [result.sequence, finished.sequence] });
    note('Official createProxyListener verified actual Run/browser/channel binding; create/read receipts automatically entered original event log before page confirmation; mock upstream deltas all zero');
    const stopped = await listener.stop(); assert.equal(stopped.cleanup.page_isolated, true); assert.equal(stopped.cleanup.lock_released, true);
    await writeFile(path.join(output, 'official-proxy-stop.json'), JSON.stringify(stopped, null, 2)); listener = null;
    await mcp.tool('navigate_page', { url: fixture.url }); await wait('Signed in: admin'); await click('Read mock-contract record'); await wait('"name": "Mock updated"');
    assert.equal(fixture.snapshot().counts['GET /api/mock/read'], realState.counts['GET /api/mock/read'] + 1);
    await observe('real-response-restored', 'After safe blank/detach, page real read returned prior real-mock record and name Mock updated, with upstream read incremented exactly once');
    await event({ type: 'cleanup_state', cleanup: { attempted: true, completed: true, items: ['Owned mock page exited safely through MCP before Fetch disable', 'Proxy detached and own lock released', 'Actual page real read restored after cleanup'] } });
    const report = await generateReport(run.runRoot); const validation = await validateRun(run.runRoot);
    assert.equal(report.delivery.kind, 'stage'); assert.equal((await log()).run.status, 'running');
    const html = await readFile(report.htmlReportPath, 'utf8'); assert.match(html, /SYNTHETIC-001/);
    await writeFile(path.join(output, 'official-report-result.json'), JSON.stringify({ report, validation }, null, 2));
    summary.runRoot = run.runRoot; summary.reportPath = report.htmlReportPath; summary.delivery = report.delivery; summary.counts = report.counts;
    note('Original result retained undetermined; finished frontend-only mock attempt has passed with real MCP screenshot/page observation; validateRun and stage HTML generation succeeded, Run remains running');
    return { output, ...summary };
  } catch (error) {
    summary.failure = { code: error.code || null, message: error.message, stack: error.stack };
    throw error;
  } finally {
    if (listener) await listener.stop().catch(() => {});
    if (ownedCdp) { await ownedCdp.command('Browser.close').catch(() => {}); ownedCdp.close(); }
    if (mcp) await mcp.stop();
    if (prepared?.profile_path) await rm(prepared.profile_path, { recursive: true, force: true });
    if (fixture) { await writeFile(path.join(output, 'upstream-final.json'), JSON.stringify(fixture.snapshot(), null, 2)); await fixture.close(); }
    if (run) summary.runRoot = run.runRoot;
    await writeFile(path.join(output, 'official-acceptance.json'), JSON.stringify(summary, null, 2));
    process.stdout.write(`Official evidence: ${output}\n`);
  }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const output = process.argv.find(arg => arg.startsWith('--output='))?.slice('--output='.length);
  runOfficialSmoke({ output }).then(result => console.log(JSON.stringify(result, null, 2))).catch(error => { console.error(error.stack); process.exitCode = 1; });
}
