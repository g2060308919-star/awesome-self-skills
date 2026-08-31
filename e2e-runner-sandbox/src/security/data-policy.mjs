const EMAIL = /\b[A-Z0-9._%+-]+@([A-Z0-9.-]+\.[A-Z]{2,})\b/gi;
const URL_PATTERN = /https?:\/\/([^\s/"'<>]+)/gi;
const PAYMENT_KEY = /(?:card|payment|iban|routing|bankAccount)/i;
const CREDENTIAL_KEY = /(?:password|passwd|apiKey|accessToken|privateKey|clientSecret)/i;
const PHONE_KEY = /(?:phone|mobile|telephone)/i;

function allowedHost(host) {
  const normalized = host.replace(/:\d+$/, "").toLowerCase();
  return normalized === "127.0.0.1" || normalized === "[::1]" || normalized === "localhost" ||
    normalized.endsWith(".invalid");
}

export function validateSyntheticData(value) {
  const violations = [];
  const seen = new WeakSet();
  const add = (policy, path) => violations.push({ policy, path });
  const visit = (current, path) => {
    if (typeof current === "string") {
      for (const match of current.matchAll(EMAIL)) {
        if (!match[1].toLowerCase().endsWith(".invalid")) add("real-email", path);
      }
      for (const match of current.matchAll(URL_PATTERN)) {
        if (!allowedHost(match[1])) add("real-domain", path);
      }
      return;
    }
    if (!current || typeof current !== "object" || seen.has(current)) return;
    seen.add(current);
    if (Array.isArray(current)) {
      current.forEach((entry, index) => visit(entry, `${path}/${index}`));
      return;
    }
    for (const [key, child] of Object.entries(current)) {
      const childPath = `${path}/${key}`;
      if (CREDENTIAL_KEY.test(key) && child !== null && child !== "") add("credential", childPath);
      if (PAYMENT_KEY.test(key) && child !== null && child !== "") add("payment", childPath);
      if (PHONE_KEY.test(key) && child !== null && child !== "") add("phone", childPath);
      visit(child, childPath);
    }
  };
  visit(value, "");
  return violations;
}
