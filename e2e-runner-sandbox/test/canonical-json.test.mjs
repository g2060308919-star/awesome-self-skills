import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  canonicalStringify,
  canonicalize
} from "../src/bundle/canonical-json.mjs";
import { sha256File, sha256Text } from "../src/bundle/digests.mjs";

test("canonical snapshots sort keys, normalize dates, and exclude volatile fields", () => {
  const value = {
    z: 1,
    updatedAt: "2026-08-31T08:00:00+08:00",
    nonce: "drop",
    a: 2
  };

  assert.equal(
    canonicalStringify(value, { volatileKeys: ["nonce"] }),
    '{"a":2,"updatedAt":"2026-08-31T00:00:00.000Z","z":1}'
  );
});

test("entity arrays sort by stable id without reordering semantic arrays", () => {
  const value = {
    customers: [{ id: "CUS-2" }, { id: "CUS-1" }],
    tags: ["gold", "east"]
  };

  assert.equal(
    canonicalStringify(value),
    '{"customers":[{"id":"CUS-1"},{"id":"CUS-2"}],"tags":["gold","east"]}'
  );
});

test("canonicalization rejects cycles and non-finite numbers", () => {
  const cyclic = {};
  cyclic.self = cyclic;

  assert.throws(() => canonicalize(cyclic), { code: "CANONICAL_CYCLE" });
  assert.throws(() => canonicalize({ amount: Number.NaN }), {
    code: "CANONICAL_NUMBER"
  });
  assert.throws(() => canonicalize({ amount: Number.POSITIVE_INFINITY }), {
    code: "CANONICAL_NUMBER"
  });
});

test("SHA-256 helpers return the same digest for text and file bytes", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "sandbox-digest-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const path = join(directory, "sample.txt");
  await writeFile(path, "deterministic", "utf8");

  assert.equal(
    await sha256File(path),
    sha256Text("deterministic")
  );
  assert.match(sha256Text("deterministic"), /^[a-f0-9]{64}$/);
});
