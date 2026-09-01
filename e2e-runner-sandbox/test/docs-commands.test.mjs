import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { parseArguments } from "../bin/evaluator.mjs";

const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const repositoryRoot = dirname(packageRoot);

function shellCommands(markdown) {
  return [...markdown.matchAll(/```bash\n([\s\S]*?)```/g)]
    .flatMap((match) => match[1].split("\n"))
    .map((line) => line.trim())
    .filter((line) => /^(?:npm|node bin\/evaluator\.mjs)\b/.test(line));
}

function substitutePlaceholders(tokens) {
  const values = {
    "<runtime-directory>": "/tmp/e2e-runtime",
    "<trial-directory>": "/tmp/e2e-trial",
    "<output-file>": "/tmp/e2e-output.json",
    "<registry-file>": "/tmp/e2e-registry.json",
    "<path>": "/tmp/e2e-artifacts",
    "<run-id>": "documented-run"
  };
  return tokens.map((token) => values[token] ?? token);
}

test("every shell command in the quickstart maps to an existing package script or CLI command", async () => {
  const [readme, packageJson] = await Promise.all([
    readFile(join(packageRoot, "README.md"), "utf8"),
    readFile(join(packageRoot, "package.json"), "utf8").then(JSON.parse)
  ]);
  const failures = [];
  for (const command of shellCommands(readme)) {
    const tokens = command.split(/\s+/);
    if (tokens[0] === "npm") {
      if (tokens[1] === "ci") continue;
      const script = tokens[1] === "start" || tokens[1] === "test" ? tokens[1] : tokens[2];
      if (!Object.hasOwn(packageJson.scripts, script)) failures.push(command);
      continue;
    }
    try {
      parseArguments(substitutePlaceholders(tokens.slice(2)));
    } catch {
      failures.push(command);
    }
  }
  assert.deepEqual(failures, []);
});

test("the runbook includes manual login, assistance, residual, and shutdown procedures", async () => {
  const text = await readFile(join(packageRoot, "docs", "operator-runbook.md"), "utf8");
  for (const heading of ["Manual login", "Scripted assistance", "Residual data", "Shutdown"]) {
    assert.match(text, new RegExp(`## ${heading}`));
  }
});

test("repository entrypoint links the sandbox and runtime output stays ignored", async () => {
  const [rootReadme, ignore] = await Promise.all([
    readFile(join(repositoryRoot, "README.md"), "utf8"),
    readFile(join(repositoryRoot, ".gitignore"), "utf8")
  ]);
  assert.match(rootReadme, /e2e-runner-sandbox\/README\.md/);
  for (const entry of [".sandbox-runtime/", "trial-results/", ".cache/tesseract/"]) {
    assert.match(ignore, new RegExp(entry.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
});
