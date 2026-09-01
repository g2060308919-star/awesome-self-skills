const COOKIE_NAME = "bench_session";

export function readSessionCookie(request) {
  const cookies = String(request.headers.cookie ?? "").split(";");
  for (const cookie of cookies) {
    const [name, ...parts] = cookie.trim().split("=");
    if (name === COOKIE_NAME) return decodeURIComponent(parts.join("="));
  }
  return null;
}

export function createSessionCookie(sessionId) {
  return `${COOKIE_NAME}=${encodeURIComponent(sessionId)}; Path=/; HttpOnly; SameSite=Strict`;
}

export function clearSessionCookie() {
  return `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0`;
}
