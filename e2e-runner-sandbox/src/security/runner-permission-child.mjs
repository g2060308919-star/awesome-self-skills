import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const [inputPath, artifactDirectory, bundlePath, oraclePath, capabilityPath, socketPath] = process.argv.slice(2);

async function readProbe(path) {
  try {
    await readFile(path);
    return { allowed: true, code: null };
  } catch (error) {
    return { allowed: false, code: error.code ?? null };
  }
}

const artifactPath = join(artifactDirectory, "permission-probe.txt");
let artifactWrite;
try {
  await writeFile(artifactPath, "runner artifact write allowed\n");
  artifactWrite = { allowed: true, code: null };
} catch (error) {
  artifactWrite = { allowed: false, code: error.code ?? null };
}

process.stdout.write(`${JSON.stringify({
  input: await readProbe(inputPath),
  artifactWrite,
  bundle: await readProbe(bundlePath),
  oracle: await readProbe(oraclePath),
  capability: await readProbe(capabilityPath),
  socket: await readProbe(socketPath)
})}\n`);
