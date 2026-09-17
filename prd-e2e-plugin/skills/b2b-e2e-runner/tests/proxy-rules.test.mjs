import assert from "node:assert/strict";
import test from "node:test";

import {
  BODY_LIMIT_BYTES,
  applyHeaderOperations,
  applyResponseRule,
  compileRules,
  matchRule,
  validateProxyConfig
} from "../scripts/cdp-fetch-proxy.mjs";

test("AC-015: protocol/hostname/path/method match exactly and similar hosts miss", () => {
  const [rule] = compileRules([{
    match: {
      protocol: "https:",
      hostname: "fixture.example.test",
      path_prefix: "/api/orders",
      methods: ["get"]
    }
  }]);
  assert.equal(matchRule(rule, "https://fixture.example.test/api/orders/1", "GET"), true);
  assert.equal(matchRule(rule, "https://fixture.example.test.evil/api/orders/1", "GET"), false);
  assert.equal(matchRule(rule, "http://fixture.example.test/api/orders/1", "GET"), false);
  assert.equal(matchRule(rule, "https://fixture.example.test/api/users", "GET"), false);
  assert.equal(matchRule(rule, "https://fixture.example.test/api/orders/1", "POST"), false);
});

test("FR-072: omitted methods matches any HTTP method", () => {
  const [rule] = compileRules([{
    match: { protocol: "https:", hostname: "fixture.example.test", path_prefix: "/api" }
  }]);
  assert.equal(matchRule(rule, "https://fixture.example.test/api", "GET"), true);
  assert.equal(matchRule(rule, "https://fixture.example.test/api", "PATCH"), true);
});

test("AC-016: request header add/replace/remove is case-insensitive and duplicate-free", () => {
  assert.deepEqual(applyHeaderOperations([
    { name: "X-Keep", value: "yes" },
    { name: "x-change", value: "old" },
    { name: "X-CHANGE", value: "duplicate" },
    { name: "X-Remove", value: "gone" }
  ], {
    set: { "X-Change": "new", "x-added": "created" },
    remove: ["x-remove"]
  }), [
    { name: "X-Keep", value: "yes" },
    { name: "X-Change", value: "new" },
    { name: "x-added", value: "created" }
  ]);
});

test("AC-017/018: response status/header/text/base64/JSON operations and stale headers", () => {
  const json = applyResponseRule({
    status: 200,
    headers: [
      { name: "content-length", value: "100" },
      { name: "content-encoding", value: "gzip" },
      { name: "x-origin", value: "old" }
    ],
    body: Buffer.from('{"value":1,"remove":"yes"}')
  }, {
    status: 201,
    headers: { set: { "x-origin": "new", "x-added": "yes" } },
    body: {
      json_patch: [
        { op: "set", path: "/value", value: 2 },
        { op: "delete", path: "/remove" }
      ]
    }
  });
  assert.equal(json.status, 201);
  assert.deepEqual(JSON.parse(json.body), { value: 2 });
  assert.equal(json.headers.some(x => /content-(length|encoding)/i.test(x.name)), false);
  assert.equal(json.headers.find(x => x.name === "x-origin").value, "new");

  const text = applyResponseRule({ status: 200, headers: [], body: Buffer.from("old") }, {
    body: { text: "new" }
  });
  assert.equal(text.body.toString(), "new");
  const base64 = applyResponseRule({ status: 200, headers: [], body: Buffer.from("old") }, {
    body: { base64: Buffer.from("binary").toString("base64") }
  });
  assert.equal(base64.body.toString(), "binary");
});

test("technical config contract: snake_case IDs and body mode normalize without losing rule IDs", () => {
  const validated = validateProxyConfig({
    schema_version: "1.0",
    environment: "staging",
    endpoint: "http://127.0.0.1:9222",
    run_id: "RUN-01",
    target_id: "TARGET-A",
    lock_root: "/tmp/b2b-e2e-runner-lock-test",
    rules: [{
      rule_id: "RULE-01",
      enabled: true,
      match: { protocol: "https:", hostname: "staging.example.test", path_prefix: "/api" },
      response: {
        body: {
          mode: "json_patch",
          operations: [{ op: "set", path: "/ready", value: true }]
        }
      }
    }]
  });
  assert.equal(validated.runId, "RUN-01");
  assert.equal(validated.targetId, "TARGET-A");
  assert.equal(validated.lockRoot, "/tmp/b2b-e2e-runner-lock-test");
  assert.equal(validated.rules[0].rule_id, "RULE-01");
  assert.deepEqual(validated.rules[0].response.body, {
    json_patch: [{ op: "set", path: "/ready", value: true }]
  });
});

test("AC-019: invalid JSON, oversized bodies, conflicts, and unsupported traffic fail diagnostically", () => {
  assert.throws(() => applyResponseRule({
    status: 200, headers: [], body: Buffer.from("{broken")
  }, {
    body: { json_patch: [{ op: "set", path: "/x", value: 1 }] }
  }), error => error.code === "INVALID_JSON");
  assert.throws(() => applyResponseRule({
    status: 200, headers: [], body: Buffer.alloc(BODY_LIMIT_BYTES + 1)
  }, {
    body: { text: "small" }
  }), error => error.code === "BODY_TOO_LARGE");
  assert.throws(() => compileRules([{
    match: { protocol: "https:", hostname: "a.test", path_prefix: "/", methods: ["GET"] },
    response: { body: { stream: true } }
  }]), error => error.code === "UNSUPPORTED_TRAFFIC");
  assert.throws(() => compileRules([
    { match: { protocol: "https:", hostname: "a.test", path_prefix: "/", methods: ["GET"] } },
    { match: { protocol: "https:", hostname: "a.test", path_prefix: "/", methods: ["GET"] } }
  ]), error => error.code === "RULE_CONFLICT");
});

test("NFR-002: proxy config requires non-production and rejects unsafe HTTP or secret headers", () => {
  const base = {
    environment: "staging",
    endpoint: "http://127.0.0.1:9222",
    targetId: "A",
    lockRoot: "/tmp/runner-lock-test",
    rules: [{ match: { protocol: "https:", hostname: "staging.example.test", path_prefix: "/", methods: ["GET"] } }]
  };
  assert.doesNotThrow(() => validateProxyConfig(base));
  assert.throws(() => validateProxyConfig({ ...base, environment: "production" }), error => error.code === "PRODUCTION_REJECTED");
  assert.throws(() => validateProxyConfig({
    ...base,
    rules: [{ match: { protocol: "http:", hostname: "intranet.example.test", path_prefix: "/", methods: ["GET"] } }]
  }), error => error.code === "INSECURE_HTTP_REJECTED");
  assert.throws(() => validateProxyConfig({
    ...base,
    rules: [{
      match: { protocol: "https:", hostname: "staging.example.test", path_prefix: "/", methods: ["GET"] },
      request: { headers: { set: { Authorization: "Bearer fixture" } } }
    }]
  }), error => error.code === "SECRET_DETECTED");
});
