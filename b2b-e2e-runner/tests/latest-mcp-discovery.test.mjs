import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { locateChromeMcpCli } from './fixtures/local-mcp-cli.mjs';

test('native MCP discovery finds installed cache entries without downloading or starting Chrome', async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'mcp-cli-discovery-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const cli = path.join(root, 'owned-cache/node_modules/chrome-devtools-mcp/build/src/bin/chrome-devtools-mcp.js');
  await mkdir(path.dirname(cli), { recursive: true });
  await writeFile(cli, '// installed fixture');
  assert.equal(await locateChromeMcpCli({ explicit: '', cacheRoot: root, includeLocal: false }), cli);
  assert.equal(await locateChromeMcpCli({ explicit: cli, cacheRoot: '/nonexistent', includeLocal: false }), cli);
  await assert.rejects(locateChromeMcpCli({ explicit: '', cacheRoot: path.join(root, 'missing'), includeLocal: false }), /Real MCP smoke unavailable/);
  await assert.rejects(locateChromeMcpCli({ explicit: path.join(root, 'missing'), cacheRoot: root, includeLocal: false }), /ENOENT/);
});
