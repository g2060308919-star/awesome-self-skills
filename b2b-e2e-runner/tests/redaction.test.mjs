import assert from "node:assert/strict";
import test from "node:test";

import {
  assertNoSecrets,
  findSecrets,
  sanitizeUrl
} from "../scripts/lib/redaction.mjs";

test("AC-012: passwords, auth headers, cookies, tokens, and signed URLs are detected", () => {
  const findings = findSecrets({
    password: "fixture-value",
    headers: {
      Cookie: "fixture-cookie",
      Authorization: "Bearer fixture-auth"
    },
    access_token: "fixture-access",
    url: "https://example.test/file?X-Amz-Signature=fixture-signature&part=1"
  });
  assert.deepEqual(new Set(findings.map(x => x.kind)), new Set([
    "sensitive-key",
    "sensitive-url-parameter"
  ]));
  assert.throws(() => assertNoSecrets({ token: "fixture" }), error => error.code === "SECRET_DETECTED");
  assert.equal(
    sanitizeUrl("https://example.test/file?X-Amz-Signature=fixture-signature&part=1"),
    "https://example.test/file?part=1"
  );
});

test("AC-013: UID, IP, order ID, record ID, and business fields are preserved", () => {
  const business = {
    uid: "user-123",
    ip: "192.0.2.10",
    order_id: "ORD-9002",
    record_id: "REC-42",
    amount: "19.95"
  };
  assert.deepEqual(findSecrets(business), []);
  assert.doesNotThrow(() => assertNoSecrets(business));
});
