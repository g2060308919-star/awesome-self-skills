import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

// These regression suites describe the pre-v1.1 v2 workflow. v1.1 must still
// load those historical logs without silently adding coverage requirements.
// New-run coverage behavior is tested separately by workflow-v11-* suites.
export async function markAsHistoricalV2(runRoot) {
  const logPath = path.join(runRoot, "execution-log.json");
  const log = JSON.parse(await readFile(logPath, "utf8"));
  delete log.extensions;
  await writeFile(logPath, JSON.stringify(log, null, 2) + "\n");
}
