/** Reproducible, opt-in real Chrome DevTools MCP acceptance; never uses an existing browser/profile. */
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, writeFile, appendFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import sharp from 'sharp';
import { randomUUID } from 'node:crypto';
import { ProxyListener } from '../../scripts/cdp-fetch-proxy.mjs';
import { MockScenarioEngine, compileMockScenario } from '../../scripts/lib/mock-scenario.mjs';
import { CdpClient } from '../../scripts/lib/cdp-client.mjs';
import { createInterface } from 'node:readline';
import { startLatestWorkflowFixture } from './latest-workflow-server.mjs';

import { locateChromeMcpCli } from './local-mcp-cli.mjs';
export class LocalMcp {
  constructor({ cli, profile, output, endpoint = null, extraArgs = [] }) { Object.assign(this, { cli, profile, output, endpoint, extraArgs }); this.pending = new Map(); this.sequence = 0; this.calls = 0; }
  async start() {
    const connectionArgs = this.endpoint ? ['--browserUrl', this.endpoint] : ['--userDataDir', this.profile, '--chrome-arg=--remote-debugging-port=0'];
    this.process = spawn(process.execPath, [this.cli, ...connectionArgs, '--no-usage-statistics', '--no-performance-crux', ...this.extraArgs], { stdio: ['pipe', 'pipe', 'pipe'] });
    this.exited = new Promise(resolve => this.process.once('exit', resolve));
    this.process.stderr.on('data', data => appendFile(path.join(this.output, 'mcp-stderr.log'), data).catch(() => {}));
    createInterface({ input: this.process.stdout }).on('line', line => {
      let message; try { message = JSON.parse(line); } catch { return; }
      if (message.method === 'roots/list') { this.process.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: message.id, result: { roots: [{ uri: pathToFileURL(this.output).href, name: 'Owned acceptance artifacts' }] } }) + '\n'); return; }
      const pending = this.pending.get(message.id);
      if (pending) { this.pending.delete(message.id); clearTimeout(pending.timeout); message.error ? pending.reject(new Error(JSON.stringify(message.error))) : pending.resolve(message.result); }
    });
    this.process.once('exit', code => { for (const pending of this.pending.values()) { clearTimeout(pending.timeout); pending.reject(new Error(`MCP exited ${code}`)); } this.pending.clear(); });
    await this.rpc('initialize', { protocolVersion: '2024-11-05', capabilities: { roots: { listChanged: false } }, clientInfo: { name: 'runner-local-acceptance', version: '1.0' } });
    this.process.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');
    const tools = await this.rpc('tools/list');
    await writeFile(path.join(this.output, 'mcp-tools.json'), JSON.stringify(tools, null, 2));
    return tools;
  }
  rpc(method, params) {
    const id = ++this.sequence;
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => { this.pending.delete(id); reject(new Error(`MCP timeout ${method}`)); }, 45000);
      this.pending.set(id, { resolve, reject, timeout });
      this.process.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
    });
  }
  async tool(name, args = {}) {
    const call = ++this.calls;
    const result = await this.rpc('tools/call', { name, arguments: args });
    await appendFile(path.join(this.output, 'mcp-transcript.jsonl'), JSON.stringify({ call, name, args, result }) + '\n');
    if (result.isError) throw new Error(`${name}: ${JSON.stringify(result)}`);
    return result.content?.filter(item => item.type === 'text').map(item => item.text).join('\n') || '';
  }
  async stop() { if (this.process && this.process.exitCode === null) this.process.kill('SIGTERM'); await this.exited; }
}

export async function runSmoke({ cli, output, discoverOnly = false } = {}) {
  cli ??= await locateChromeMcpCli();
  output ||= await mkdtemp(path.join(os.tmpdir(), 'runner-latest-real-mcp-'));
  await mkdir(output, { recursive: true });
  const profile = path.join(output, 'owned-profile');
  const mcp = new LocalMcp({ cli, profile, output });
  let fixture, ownedCdp, listener;
  const evidence = { host: 'standalone CLI Chrome DevTools MCP, not desktop managed host', assertions: [], gaps: [] };
  const note = (id, fact) => { evidence.assertions.push({ id, fact }); process.stdout.write(`${id}: ${fact}\n`); };
  try {
    const tools = await mcp.start();
    if (discoverOnly) return { output, tools: tools.tools.map(tool => ({ name: tool.name, inputSchema: tool.inputSchema })) };
    fixture = await startLatestWorkflowFixture();
    await writeFile(path.join(output, 'fixture.json'), JSON.stringify({ url: fixture.url, observationFile: fixture.observationFile, host: 'standalone local CLI MCP; not desktop managed host' }, null, 2));
    const marker = fixture.url + '/#owned-primary-' + randomUUID();
    const page = await mcp.tool('new_page', { url: marker });
    const pageId = Number(/^(\d+):.*\[selected\]/m.exec(page)?.[1]);
    assert.ok(pageId);
    const active = (await readFile(path.join(profile, 'DevToolsActivePort'), 'utf8')).trim().split('\n');
    const endpoint = `http://127.0.0.1:${active[0]}`;
    const version = await fetch(endpoint + '/json/version').then(r => r.json());
    ownedCdp = await CdpClient.connect(version.webSocketDebuggerUrl);
    const targets = () => ownedCdp.command('Target.getTargets');
    const targetId = (await targets()).targetInfos.find(target => target.url === marker)?.targetId;
    assert.ok(targetId);
    const initialPid = execFileSync('ps', ['-axo', 'pid=,ppid=,command='], { encoding: 'utf8' }).split('\n').filter(line => line.includes(profile) && line.includes('Google Chrome') && !line.includes('--type='));
    await writeFile(path.join(output, 'owned-browser.json'), JSON.stringify({ endpoint, profile, mcpPid: mcp.process.pid, browser: version.Browser, targetId, pageId, initialPid }, null, 2));
    await mcp.tool('navigate_page', { url: fixture.url });
    const snapshot = () => mcp.tool('take_snapshot');
    const uid = async (role, label) => {
      const text = await snapshot();
      const line = text.split('\n').find(line => line.includes(` ${role} "${label}"`));
      assert.ok(line, `Missing semantic control ${role} ${label}: ${text}`);
      return /uid=([^ ]+)/.exec(line)[1];
    };
    const click = async label => mcp.tool('click', { uid: await uid('button', label) });
    const fill = async (label, value) => mcp.tool('fill', { uid: await uid('textbox', label), value });
    const wait = async text => mcp.tool('wait_for', { text: [text], timeout: 10000 });
    const shot = async name => mcp.tool('take_screenshot', { filePath: path.join(output, name + '.png'), fullPage: true });
    await click('Enter fixture'); await wait('Signed in: admin');
    for (let i = 0; i < 3; i++) {
      await snapshot(); await mcp.tool('list_pages');
      assert.ok((await targets()).targetInfos.some(target => target.targetId === targetId));
      assert.equal((await readFile(path.join(profile, 'DevToolsActivePort'), 'utf8')).trim().split('\n')[0], active[0]);
    }
    const afterPid = execFileSync('ps', ['-axo', 'pid=,ppid=,command='], { encoding: 'utf8' }).split('\n').filter(line => line.includes(profile) && line.includes('Google Chrome') && !line.includes('--type='));
    assert.deepEqual(afterPid, initialPid);
    note('A04', 'Three MCP call rounds reused exact owned Chrome process, endpoint and actual Target');
    await fill('Record name (commits on blur)', 'Independent ID acceptance');
    await fill('Record date YYYY-MM-DD (explicit confirmation required)', '2030-10-27');
    await click('Refresh real records');
    assert.match(await snapshot(), /Not confirmed/);
    await fill('Record date YYYY-MM-DD (explicit confirmation required)', '2030-10-27');
    await click('Confirm date'); await wait('2030-10-27');
    await shot('01-confirmed-form');
    note('A30', 'Unconfirmed date reverted on blur; semantic Confirm date committed it with visible readback');
    for (const [name, width, height, size] of [['wrong-dimensions',750,360,100000],['oversized',750,600,4000000],['accepted-baseline',750,600,100000]]) {
      const image = await sharp({ create: { width, height, channels: 3, background: '#3780a0' } }).png().toBuffer();
      await writeFile(path.join(output, name + '.png'), Buffer.concat([image, Buffer.alloc(size - image.length)]), { flag: 'wx' });
    }
    const upload = async file => mcp.tool('upload_file', { uid: await uid('button', 'Preparation image'), filePath: path.join(output, file + '.png') });
    await upload('wrong-dimensions'); await click('Upload selected image'); await wait('PNG dimensions must be 750×600'); await shot('02-upload-dimension-failure');
    await upload('oversized'); await click('Upload selected image'); await wait('PNG must be at most 200000 bytes'); await shot('03-upload-size-failure');
    note('A23', '750×360 100000-byte valid PNG and 750×600 4000000-byte valid PNG were rejected by actual UI/server');
    await upload('accepted-baseline'); await wait('100000 bytes; not uploaded');
    assert.equal(fixture.snapshot().counts['POST /api/records'] || 0, 0);
    await shot('04-selected-not-uploaded');
    await click('Upload selected image'); await wait('Uploaded: 750×600, 100000 bytes; not saved');
    assert.equal(fixture.snapshot().counts['POST /api/records'] || 0, 0);
    await shot('05-uploaded-not-saved');
    await click('Save real record'); await wait('Saved real record ID: real-');
    const saved = fixture.snapshot().records.find(record => record.name === 'Independent ID acceptance');
    assert.ok(saved);
    await click(`Open ${saved.id} ${saved.name}`); await wait('"status": "saved"');
    const detail = await snapshot(); assert.ok(detail.includes(saved.id)); assert.ok(detail.includes('Independent ID acceptance'));
    await shot('06-real-id-detail');
    note('A24/A31', 'Accepted baseline selection/upload/save were separate UI stages; one real save created unique ID, list/detail reread matched it');
    await mcp.tool('fill', { uid: await uid('combobox', 'Fixture failure mode'), value: 'Reject valid confirmed date' });
    await click('Apply fixture failure mode'); await wait('fail-date');
    await fill('Record date YYYY-MM-DD (explicit confirmation required)', '2031-10-27');
    await click('Confirm date'); await wait('422: Controlled fixture failure');
    await shot('06b-valid-date-rejected');
    await mcp.tool('fill', { uid: await uid('combobox', 'Fixture failure mode'), value: 'Normal' });
    await click('Apply fixture failure mode');
    note('A30-product-rejection', 'Correct explicit confirmation of valid new date reached server and produced controlled rejection; old confirmed date remained');
    const recoveryMarker = fixture.url + '/#owned-reconnect-' + randomUUID();
    await mcp.tool('navigate_page', { url: recoveryMarker }); await wait('Signed in: admin');
    const connectionEvidence = [];
    for (let generation = 1; generation <= 2; generation++) {
      const connectionOutput = path.join(output, 'connected-mcp-' + generation);
      await mkdir(connectionOutput);
      const connected = new LocalMcp({ cli, profile, output: connectionOutput, endpoint });
      try {
        await connected.start();
        const pages = await connected.tool('list_pages');
        const line = pages.split('\n').find(line => line.includes(recoveryMarker));
        assert.ok(line, 'Owned unique marker must identify the new MCP page mapping');
        const restoredPageId = Number(/^(\d+):/.exec(line)[1]);
        await connected.tool('select_page', { pageId: restoredPageId });
        assert.match(await connected.tool('take_snapshot'), /Signed in: admin/);
        assert.equal((await targets()).targetInfos.find(target => target.url === recoveryMarker)?.targetId, targetId);
        connectionEvidence.push({ generation, mcpPid: connected.process.pid, pageId: restoredPageId, actualTarget: targetId });
      } finally { await connected.stop(); }
      assert.ok((await targets()).targetInfos.some(target => target.targetId === targetId));
    }
    await writeFile(path.join(output, 'reconnected-mcp-mapping.json'), JSON.stringify(connectionEvidence, null, 2));
    await mcp.tool('navigate_page', { url: fixture.url }); await wait('Signed in: admin');
    note('A05', 'Public browserUrl connected MCP stopped and reconnected twice while original owned launcher stayed alive; marker mapping/Target/login preserved, no business write replay');
    const secondMarker = fixture.url + '/#owned-second-' + randomUUID();
    const second = await mcp.tool('new_page', { url: secondMarker });
    const secondPageId = Number(/^(\d+):.*\[selected\]/m.exec(second)?.[1]);
    const secondTargetId = (await targets()).targetInfos.find(target => target.url === secondMarker)?.targetId;
    assert.ok(secondTargetId && secondTargetId !== targetId);
    await mcp.tool('navigate_page', { url: fixture.url }); await wait('Signed in: admin');
    await mcp.tool('select_page', { pageId });
    note('A07', 'Two same-URL pages map to different observed actual Target IDs using initial owned unique markers');
    await click('Safe page channel probe'); await wait('real-fixture');
    assert.equal(fixture.snapshot().counts['GET /fixture-probe'], 1);
    note('A08', 'Shared endpoint was ready before login and no proxy/Fetch was enabled; page safe probe reached real upstream');
    await writeFile(path.join(output, 'identity-mapping.json'), JSON.stringify({ pageId, targetId, secondPageId, secondTargetId }, null, 2));
    await writeFile(path.join(output, 'upstream-before-mock.json'), JSON.stringify(fixture.snapshot(), null, 2));
    const provenance = { source_refs: ['local-fixture-declared-contract'], synthetic_values: ['SYNTHETIC-001'] };
    const match = (pathname, method = 'GET', name) => ({ origin: fixture.url, pathname, method, query: {}, body: { rules: name === undefined ? [] : [{ pointer: '/name', presence: 'required', type: 'string', value: name }], allowed_extra_pointers: [] } });
    const scenario = compileMockScenario({
      schema_version: 'mock-scenario-v1', scenario_id: 'local-real-browser', revision: 1, run_id: 'LOCAL-CLI-SMOKE', case_id: 'CASE-1', attempt_id: 'ATTEMPT-1',
      candidate_checkpoint_ids: ['CASE-1/s/o'], supporting_checkpoint_ids: [], initial_state: { record: null }, provenance,
      routes: [
        { route_id: 'create', match: match('/api/mock/create', 'POST', 'Mock draft'), effect: [{ op: 'set', path: '/record', value: { id: 'SYNTHETIC-001', name: { $request: '/body/name' }, status: 'draft' } }], response: { status: 201, headers: {}, body: { $state: '/record' } }, provenance },
        { route_id: 'read', match: match('/api/mock/read'), effect: [], response: { status: 200, headers: {}, body: { $state: '/record' } }, provenance },
        { route_id: 'update', match: match('/api/mock/update', 'POST', 'Mock updated'), effect: [{ op: 'set', path: '/record/name', value: { $request: '/body/name' } }], response: { status: 200, headers: {}, body: { $state: '/record' } }, provenance }
      ],
      passthrough: ['/', '/latest-client.js', '/favicon.ico', '/fixture-session'].map((pathname, index) => ({ passthrough_id: 'safe-static-' + index, match: match(pathname), basis_refs: ['local-fixture-static-or-session-read-only'] }))
    });
    await writeFile(path.join(output, 'mock-scenario.json'), JSON.stringify(scenario, null, 2));
    const engine = new MockScenarioEngine(scenario, { persist: async transaction => { await writeFile(path.join(output, 'mock-state.json'), JSON.stringify(transaction.runtime, null, 2)); await appendFile(path.join(output, 'persisted-receipts.jsonl'), JSON.stringify(transaction.receipt) + '\n'); } });
    const receiptList = [];
    const makeListener = extra => new ProxyListener({ endpoint, browserWebSocketUrl: version.webSocketDebuggerUrl, targetId, rules: [], lockRoot: path.join(output, 'locks'), runId: 'LOCAL-CLI-SMOKE', mockScenarioEngine: engine, mockProxyCycleId: 'cycle-1', mockChannelCoverage: { target_id: targetId },
      mockReceiptSink: async receipt => { receiptList.push(receipt); await appendFile(path.join(output, 'proxy-receipts.jsonl'), JSON.stringify(receipt) + '\n'); },
      prepareOwnedTargetForCleanup: async () => { await mcp.tool('select_page', { pageId }); await mcp.tool('navigate_page', { url: 'about:blank' }); }, ...extra });
    listener = makeListener();
    await listener.start();
    assert.ok((await targets()).targetInfos.some(target => target.targetId === targetId));
    assert.match(await snapshot(), /Signed in: admin/);
    assert.equal((await readFile(path.join(profile, 'DevToolsActivePort'), 'utf8')).trim().split('\n')[0], active[0]);
    note('A09', 'After login, direct existing ProxyListener enabled on the same browser/Target/context without restart or login; component integration, not formal Run binding');
    const mockAction = async (label, expected) => { await listener.assertReadyForBusiness(); await click(label); await wait(expected); };
    await mockAction('Create mock-contract record', 'SYNTHETIC-001');
    await mockAction('Read mock-contract record', 'Mock draft');
    await mockAction('Update mock-contract record', 'Mock updated');
    await mockAction('Read mock-contract record', 'Mock updated');
    assert.equal(fixture.snapshot().counts['POST /api/mock/create'] || 0, 0);
    assert.equal(fixture.snapshot().counts['POST /api/mock/update'] || 0, 0);
    assert.equal(fixture.snapshot().counts['GET /api/mock/read'] || 0, 0);
    await shot('07-mock-write-read');
    await writeFile(path.join(output, 'upstream-after-mock.json'), JSON.stringify(fixture.snapshot(), null, 2));
    note('A14', 'Actual page consumed mock create/read/update/read; server create/update/read counters all zero; durable engine receipts recorded');
    await mockAction('Send unknown business route', 'Failed to fetch');
    await mockAction('Send undeclared extra field', 'Failed to fetch');
    await mockAction('Send wrong name type', 'Failed to fetch');
    assert.equal(fixture.snapshot().counts['POST /api/mock/unknown'] || 0, 0);
    assert.equal(fixture.snapshot().counts['POST /api/mock/create'] || 0, 0);
    await shot('08-unknown-request-blocked');
    note('A15', 'Unknown route, extra field and wrong type failed in page and never reached upstream');
    const beforeDouble = receiptList.length;
    await mockAction('Create twice (two requests)', '"second"');
    assert.equal(receiptList.length - beforeDouble, 2);
    const lastTwo = receiptList.slice(-2);
    assert.notEqual(lastTwo[0].receipt_id, lastTwo[1].receipt_id);
    note('A16-partial', 'Two distinct browser requests produced two distinct receipts; same-request delivery replay remains covered by component tests');
    await mcp.tool('select_page', { pageId: secondPageId });
    await click('Read mock-contract record'); await wait('404: No record');
    assert.equal(fixture.snapshot().counts['GET /api/mock/read'], 1);
    await shot('09-second-target-real');
    await mcp.tool('select_page', { pageId });
    await mcp.tool('navigate_page', { type: 'reload' }); await wait('Signed in: admin');
    await mockAction('Read mock-contract record', 'SYNTHETIC-001');
    assert.equal(fixture.snapshot().counts['GET /api/mock/read'], 1);
    await shot('10-bound-target-after-reload');
    note('A20', 'Same-URL second Target read real upstream; bound Target remained mocked after reload with preserved login');
    await mcp.tool('list_network_requests', { includePreservedRequests: true });
    await writeFile(path.join(output, 'proxy-before-stop.json'), JSON.stringify(listener.status(), null, 2));
    const stopped = await listener.stop();
    assert.equal(stopped.cleanup.page_isolated, true);
    assert.equal(stopped.cleanup.interception_disabled, true);
    assert.equal(stopped.cleanup.lock_released, true);
    await writeFile(path.join(output, 'proxy-after-stop.json'), JSON.stringify(stopped, null, 2));
    listener = null;
    assert.equal((await targets()).targetInfos.find(target => target.targetId === targetId).url, 'about:blank');
    assert.equal((await targets()).targetInfos.find(target => target.targetId === secondTargetId).url, fixture.url + '/');
    await mcp.tool('navigate_page', { url: fixture.url }); await wait('Signed in: admin');
    await click('Read mock-contract record'); await wait('404: No record');
    assert.equal(fixture.snapshot().counts['GET /api/mock/read'], 2);
    await shot('11-real-read-after-stop');
    note('A21', 'MCP safely navigated owned Target blank before Fetch detach/lock release; then real read restored; second Target unchanged');
    let socket;
    listener = makeListener({ mockProxyCycleId: 'cycle-disconnect', clientFactory: async url => { socket = new WebSocket(url); await new Promise((resolve,reject) => { socket.addEventListener('open',resolve,{once:true}); socket.addEventListener('error',reject,{once:true}); }); return new CdpClient(socket); } });
    await listener.start();
    const closed = new Promise(resolve => socket.addEventListener('close', resolve, { once: true }));
    socket.close(); await closed;
    await listener.stop();
    assert.equal(listener.status().isolation, 'isolation_unknown');
    await assert.rejects(listener.assertReadyForBusiness());
    await writeFile(path.join(output, 'proxy-disconnected.json'), JSON.stringify(listener.status(), null, 2));
    await mcp.tool('navigate_page', { url: 'about:blank' });
    const recovered = await listener.recoverIsolation({ client: await CdpClient.connect(version.webSocketDebuggerUrl) });
    assert.equal(recovered.cleanup.lock_released, true);
    await writeFile(path.join(output, 'proxy-recovered-isolation.json'), JSON.stringify(recovered, null, 2));
    listener = null;
    note('A22', 'Actual proxy WebSocket disconnected; isolation became unknown and readiness blocked; no subsequent business action; MCP safely exited page');
    await mcp.tool('close_page', { pageId: secondPageId });
    await assert.rejects(mcp.tool('select_page', { pageId: secondPageId }), /No page|not found|does not exist|page/i);
    assert.ok(!(await targets()).targetInfos.some(target => target.targetId === secondTargetId));
    const replacementMarker = fixture.url + '/#owned-replacement-' + randomUUID();
    const replacementPage = await mcp.tool('new_page', { url: replacementMarker });
    const replacementPageId = Number(/^(\d+):.*\[selected\]/m.exec(replacementPage)?.[1]);
    const replacementTargetId = (await targets()).targetInfos.find(target => target.url === replacementMarker)?.targetId;
    assert.ok(replacementTargetId && replacementTargetId !== secondTargetId);
    await writeFile(path.join(output, 'removed-page-replacement.json'), JSON.stringify({ removed: { pageId: secondPageId, targetId: secondTargetId }, replacement: { pageId: replacementPageId, targetId: replacementTargetId }, proxyVerified: false }, null, 2));
    await mcp.tool('select_page', { pageId });
    note('A06', 'Closed owned second page; old MCP pageId rejected, new unique-marker page mapped to different Target with no inherited proxy verification');
    await mcp.tool('navigate_page', { url: fixture.url }); await wait('Signed in: admin');
    await click('Enable independent worker'); await wait('Independent worker: enabled');
    await click('Safe worker channel probe'); await wait('"channel": "worker"');
    listener = makeListener({ mockProxyCycleId: 'cycle-worker' });
    await assert.rejects(listener.start(), error => error.code === 'MOCK_CHANNEL_UNVERIFIED');
    await writeFile(path.join(output, 'worker-targets.json'), JSON.stringify(await targets(), null, 2));
    await shot('12-worker-rejected'); listener = null;
    await mcp.tool('navigate_page', { url: fixture.url }); await wait('Signed in: admin');
    await click('Enable service worker'); await wait('Service worker: enabled');
    await click('Safe service worker channel probe'); await wait('"channel": "service-worker"');
    listener = makeListener({ mockProxyCycleId: 'cycle-service-worker' });
    await assert.rejects(listener.start(), error => error.code === 'MOCK_CHANNEL_UNVERIFIED');
    await writeFile(path.join(output, 'service-worker-targets.json'), JSON.stringify(await targets(), null, 2));
    await shot('13-service-worker-rejected'); listener = null;
    note('A39', 'Explicit independent worker and Service Worker safe probes succeeded; each caused mock startup rejection before any simulated business action');
    evidence.gaps.push('Desktop managed host ownership configuration and pipe-only path are not exercised; local CLI host only');
    evidence.gaps.push('Formal event log authorization/Run/attempt binding and report projection are separate main-line tests, not claimed by direct listener smoke');
    evidence.gaps.push('Launched MCP owner exits close Chrome by documented native lifecycle; A05 tested public connected MCP reconnect with owned launcher retained. Multiple matching rules A15 and same-request replay A16 remain component-test coverage');
    return { output, endpoint, evidence };
  } finally {
    await writeFile(path.join(output, 'acceptance.json'), JSON.stringify(evidence, null, 2));
    if (listener) await listener.stop().catch(() => {});
    if (ownedCdp) { await ownedCdp.command('Browser.close').catch(() => {}); ownedCdp.close(); }
    if (fixture) { await writeFile(path.join(output, 'upstream-final.json'), JSON.stringify(fixture.snapshot(), null, 2)); await fixture.close(); }
    await mcp.stop();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const outputArg = process.argv.find(arg => arg.startsWith('--output='))?.slice('--output='.length);
  runSmoke({ output: outputArg, discoverOnly: process.argv.includes('--discover') }).then(result => process.stdout.write(JSON.stringify(result, null, 2) + '\n')).catch(error => { console.error(error.stack); process.exitCode = 1; });
}
