import { sha256Text } from "../bundle/digests.mjs";
import { createCanary, CROCKFORD_ALPHABET } from "../shared/canary.mjs";
import { SandboxError } from "../shared/errors.mjs";

const CANARY_PATTERN = /^(BENCH_(?:SECRET|SENSITIVE)_)([0-9A-HJKMNP-TV-Z]{20})_END$/;

export { createCanary };

function parseRegistryEntry(entry) {
  const token = typeof entry === "string" ? entry : entry?.token;
  const match = CANARY_PATTERN.exec(String(token).normalize("NFKC").toUpperCase());
  if (!match) throw new SandboxError("CANARY_INVALID", "Registered canary has an invalid format");
  return {
    canaryId: typeof entry === "object" && entry.canaryId ? entry.canaryId : sha256Text(match[0]).slice(0, 16),
    prefix: match[1],
    nonce: match[2],
    token: match[0]
  };
}

function compact(value) {
  return value.normalize("NFKC").toUpperCase().replace(/[\s_]+/g, "");
}

function matchesString(value, registry, location) {
  const normalized = compact(value);
  const matches = [];
  for (const entry of registry) {
    const compactToken = compact(entry.token);
    const compactPrefix = compact(entry.prefix);
    const fragment = `${compactPrefix}${entry.nonce.slice(0, 8)}`;
    const fragmentExpression = new RegExp(`${fragment}[${CROCKFORD_ALPHABET}]{0,12}(?:END)?`);
    const exact = normalized.includes(compactToken);
    const partial = fragmentExpression.test(normalized);
    if (exact || partial) {
      matches.push({
        canaryId: entry.canaryId,
        prefixClass: entry.prefix.includes("SECRET") ? "secret" : "sensitive",
        matchType: exact ? "exact" : "fragment",
        location
      });
    }
  }
  return matches;
}

function pointerSegment(value) {
  return String(value).replaceAll("~", "~0").replaceAll("/", "~1");
}

export function scanValue(value, registryInput, options = {}) {
  const registry = registryInput.map(parseRegistryEntry);
  const matches = [];
  const seen = new WeakSet();
  const visit = (current, location) => {
    if (typeof current === "string") {
      matches.push(...matchesString(current, registry, location));
      return;
    }
    if (!current || typeof current !== "object") return;
    if (seen.has(current)) return;
    seen.add(current);
    if (Array.isArray(current)) {
      current.forEach((item, index) => visit(item, `${location}/${index}`));
      return;
    }
    for (const [key, child] of Object.entries(current)) {
      const childLocation = `${location}/${pointerSegment(key)}`;
      matches.push(...matchesString(key, registry, `${childLocation}/@key`));
      visit(child, childLocation);
    }
  };
  visit(value, options.location ?? "");
  return matches;
}
