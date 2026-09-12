const SENSITIVE_KEY = /^(?:pass(?:word|wd)?|authorization|proxy-authorization|cookie|set-cookie|(?:access|refresh|id)?_?token|secret|client_secret|session(?:id|_id)?|api[_-]?key)$|(?:^|[-_])(?:auth(?:orization)?|access|refresh|id)?[-_]?token$|(?:^|[-_])api[-_]?key$/i;
const SENSITIVE_QUERY = /^(?:x-amz-signature|x-amz-credential|x-amz-security-token|signature|sig|token|access_token|auth|key)$/i;
const FREE_TEXT_PATTERNS = [
  /\bBearer\s+[A-Za-z0-9._~+/=-]+/i,
  /(?:^|\n)\s*(?:authorization|cookie|set-cookie)\s*:\s*[^\n]+/i
];
const EMBEDDED_SIGNED_URL = /[?&](?:x-amz-signature|signature|access_token|token)=[^&\s]+/i;

function inspectString(value, fieldPath, findings) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    parsed = null;
  }
  if (parsed) {
    for (const [name] of parsed.searchParams) {
      if (SENSITIVE_QUERY.test(name)) {
        findings.push({ kind: "sensitive-url-parameter", path: fieldPath, name });
      }
    }
  } else if (EMBEDDED_SIGNED_URL.test(value)) {
    findings.push({ kind: "sensitive-free-text", path: fieldPath });
  }
  if (FREE_TEXT_PATTERNS.some(pattern => pattern.test(value))) {
    findings.push({ kind: "sensitive-free-text", path: fieldPath });
  }
}

export function findSecrets(value, fieldPath = "$", findings = []) {
  if (typeof value === "string") {
    inspectString(value, fieldPath, findings);
    return findings;
  }
  if (!value || typeof value !== "object") return findings;
  if (Array.isArray(value)) {
    value.forEach((item, index) => findSecrets(item, `${fieldPath}[${index}]`, findings));
    return findings;
  }
  for (const [key, item] of Object.entries(value)) {
    const itemPath = `${fieldPath}.${key}`;
    if (SENSITIVE_KEY.test(key) && item !== undefined && item !== null && item !== "") {
      findings.push({ kind: "sensitive-key", path: itemPath, name: key });
      continue;
    }
    findSecrets(item, itemPath, findings);
  }
  return findings;
}

export function assertNoSecrets(value) {
  const findings = findSecrets(value);
  if (findings.length) {
    const error = new Error(`检测到 ${findings.length} 个秘密字段或值`);
    error.code = "SECRET_DETECTED";
    error.findings = findings;
    throw error;
  }
}

export function sanitizeUrl(value) {
  const url = new URL(value);
  for (const name of [...url.searchParams.keys()]) {
    if (SENSITIVE_QUERY.test(name)) url.searchParams.delete(name);
  }
  return url.toString();
}
