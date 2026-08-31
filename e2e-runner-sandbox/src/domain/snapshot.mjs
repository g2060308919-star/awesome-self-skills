import { canonicalStringify, canonicalize } from "../bundle/canonical-json.mjs";
import { sha256Text } from "../bundle/digests.mjs";

export function createSnapshot(state, options = {}) {
  const normalized = canonicalize(state, options);
  const canonical = canonicalStringify(normalized);
  return {
    schemaVersion: "snapshot-v1",
    normalizerVersion: "canonical-json-v1",
    normalized,
    digest: sha256Text(canonical)
  };
}

function diffValue(before, after, pointer, changes) {
  if (JSON.stringify(before) === JSON.stringify(after)) return;
  const beforeObject = before !== null && typeof before === "object";
  const afterObject = after !== null && typeof after === "object";
  if (!beforeObject || !afterObject || Array.isArray(before) || Array.isArray(after)) {
    changes.push({ pointer: pointer || "/", before, after });
    return;
  }
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  for (const key of [...keys].sort()) {
    const escaped = key.replaceAll("~", "~0").replaceAll("/", "~1");
    diffValue(before[key], after[key], `${pointer}/${escaped}`, changes);
  }
}

export function diffSnapshots(beforeSnapshot, afterSnapshot) {
  const changes = [];
  diffValue(beforeSnapshot.normalized, afterSnapshot.normalized, "", changes);
  return {
    beforeDigest: beforeSnapshot.digest,
    afterDigest: afterSnapshot.digest,
    changed: changes.length > 0,
    changes
  };
}
