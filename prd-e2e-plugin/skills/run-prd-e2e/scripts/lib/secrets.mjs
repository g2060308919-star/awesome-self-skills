import { fail } from "./errors.mjs";

const SECRET_KEY = /(?:^|[_-])(password|passwd|pwd|cookie|authorization|token|session[_-]?id|ticket|signature|signed|secret|api[_-]?key|access[_-]?key)(?:$|[_-])/i;
const SECRET_QUERY_KEY = /^(?:password|passwd|pwd|cookie|authorization|auth|token|access_token|id_token|session|session_id|ticket|signature|sig|signed|secret|api_key|key)$/i;
const SECRET_TEXT = /(?:\bauthorization\s*:|\bcookie\s*:|\bset-cookie\s*:|\bbearer\s+[A-Za-z0-9._~+\/-]+=*|\bbasic\s+[A-Za-z0-9+/]+=*|(?:password|passwd|token|access_token|session_id|ticket|signature|api_key)\s*[=:]\s*\S+)/i;

export function hasAuthenticatedUrl(value) {
  if (typeof value !== "string") return false;
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    return false;
  }
  if (!/^https?:$/.test(parsed.protocol)) return false;
  if (parsed.username || parsed.password) return true;
  return [...parsed.searchParams.keys()].some(key => SECRET_QUERY_KEY.test(key));
}

export function assertNoSecrets(value, path = "$") {
  if (typeof value === "string") {
    if (SECRET_TEXT.test(value) || hasAuthenticatedUrl(value)) {
      fail("SECRET_MATERIAL_FORBIDDEN", `Secret material is forbidden at ${path}.`);
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNoSecrets(item, `${path}[${index}]`));
    return;
  }
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    const childPath = `${path}.${key}`;
    if (SECRET_KEY.test(key) && child !== null && child !== undefined && child !== "") {
      fail("SECRET_MATERIAL_FORBIDDEN", `Secret-bearing field is forbidden at ${childPath}.`);
    }
    assertNoSecrets(child, childPath);
  }
}

export function isSecretQueryKey(key) {
  return SECRET_QUERY_KEY.test(key);
}
