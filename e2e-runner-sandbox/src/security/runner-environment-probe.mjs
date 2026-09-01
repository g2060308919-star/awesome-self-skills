import { execFile } from "node:child_process";
import { dirname, join } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);
const packageRoot = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const childPath = join(packageRoot, "src", "security", "runner-permission-child.mjs");

export async function runRunnerEnvironmentProbe(options) {
  const args = [
    "--permission",
    `--allow-fs-read=${childPath}`,
    `--allow-fs-read=${options.inputPath}`,
    `--allow-fs-write=${options.artifactDirectory}`,
    childPath,
    options.inputPath,
    options.artifactDirectory,
    options.bundlePath,
    options.oraclePath,
    options.capabilityPath,
    options.socketPath
  ];
  const { stdout } = await execFileAsync(process.execPath, args, { maxBuffer: 1024 * 1024 });
  return JSON.parse(stdout);
}
