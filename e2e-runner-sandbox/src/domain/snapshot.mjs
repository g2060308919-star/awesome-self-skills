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
  if (Array.isArray(before) && Array.isArray(after)) {
    const entityArrays = before.every((item) => item && typeof item === "object" && typeof item.id === "string") &&
      after.every((item) => item && typeof item === "object" && typeof item.id === "string");
    if (entityArrays) {
      const beforeById = new Map(before.map((item) => [item.id, item]));
      const afterById = new Map(after.map((item) => [item.id, item]));
      const ids = new Set([...beforeById.keys(), ...afterById.keys()]);
      for (const id of [...ids].sort()) {
        const escapedId = id.replaceAll("~", "~0").replaceAll("/", "~1");
        diffValue(beforeById.get(id), afterById.get(id), `${pointer}/${escapedId}`, changes);
      }
      return;
    }
    changes.push({ pointer: pointer || "/", before, after });
    return;
  }
  const beforeObject = before !== null && typeof before === "object";
  const afterObject = after !== null && typeof after === "object";
  if (!beforeObject || !afterObject) {
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
