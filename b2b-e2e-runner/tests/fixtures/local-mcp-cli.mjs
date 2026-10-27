import { access, readdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';

// Discover an already installed native MCP. Never install a package or inspect browser ports.
export async function locateChromeMcpCli({ explicit = process.env.RUNNER_SMOKE_MCP, cacheRoot = path.join(os.homedir(), '.npm', '_npx'), includeLocal = true } = {}) {
  if (explicit) { await access(explicit); return path.resolve(explicit); }
  const candidates = [];
  if (includeLocal) {
    try { candidates.push(createRequire(import.meta.url).resolve('chrome-devtools-mcp')); } catch { /* Optional local dependency. */ }
  }
  let entries = [];
  try { entries = await readdir(cacheRoot, { withFileTypes: true }); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  for (const entry of entries.filter(item => item.isDirectory()).sort((a, b) => a.name.localeCompare(b.name))) {
    candidates.push(path.join(cacheRoot, entry.name, 'node_modules/chrome-devtools-mcp/build/src/bin/chrome-devtools-mcp.js'));
  }
  for (const candidate of candidates) { try { await access(candidate); return candidate; } catch { /* Ignore incomplete cache entries. */ } }
  throw new Error('Real MCP smoke unavailable: no installed chrome-devtools-mcp CLI found. Set RUNNER_SMOKE_MCP to the existing native CLI entry.');
}
