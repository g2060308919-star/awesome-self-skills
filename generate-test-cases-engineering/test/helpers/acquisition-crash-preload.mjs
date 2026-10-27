import fs from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
// Kill a real CLI process immediately AFTER an actual atomic rename. This does
// not mock a compiler result or alter its control flow before the durable write.
const rename = fs.promises.rename;
fs.promises.rename = async (/** @type {string} */ from, /** @type {string} */ to) => {
  await rename(from, to);
  const target = String(to);
  const phase = process.env.GTC_CRASH_PHASE;
  let value;
  try { value = JSON.parse(await fs.promises.readFile(target, 'utf8')); } catch { return; }
  const context = target.endsWith('/context.json') && value.candidate_revision === 1;
  const projection = target.endsWith('/derived/source-acquisition.json') && value.status === 'acquired' && value.committed_revision === 1;
  const match = phase === 'initial_material_saved' && target.endsWith('/derived/source-acquisition.json') && value.status === 'acquired' && value.committed_revision === 0
    || phase === 'base_saved' && context && value.phase === 'prepared'
    || phase === 'material_saved' && projection
    || phase === 'semantic_rejected' && context && value.phase === 'rejected'
    || phase === 'artifacts_committed' && target.endsWith('/staging/pending-revision.json') && value.candidate_revision === 1 && value.phase === 'artifacts_committed'
    || phase === 'checkpoint_committed' && target.endsWith('/checkpoint.json') && !target.includes('/derived/') && value.revision === 1 && value.commit_profile
    || phase === 'projection_synced' && projection && fs.existsSync(target.replace('/derived/source-acquisition.json', '/transactions/source-acquisition/accepted/r001.json'));
  if (match) {
    fs.writeFileSync(process.env.GTC_CRASH_LOG, JSON.stringify({ phase, target, value }));
    process.exit(86);
  }
};
syncBuiltinESMExports();
