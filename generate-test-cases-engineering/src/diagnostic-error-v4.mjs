/** Keep technical diagnostics useful without echoing source values or URLs.
 * @param {unknown} value @param {number} limit */
function safeText(value, limit) {
  return String(value ?? '').replace(/https?:\/\/[^\s"<>]+/giu, '[redacted-url]')
    .replace(/\b(?:proxy-)?authorization\s*[:=]\s*(?:bearer|basic)\s+[^\s,;"<>]+/giu, 'authorization=[redacted]')
    .replace(/\b(token|secret|password|authorization|signature|api[_-]?key)\s*[:=]\s*[^\s,;]+/giu, '$1=[redacted]')
    .slice(0, limit);
}

/** @param {any[]} diagnostics */
export function safeDiagnosticsV4(diagnostics) {
  return diagnostics.slice(0, 32).map(item => ({
    category: safeText(item.category ?? 'reference', 64),
    code: safeText(item.code ?? 'INVARIANT_INVALID', 96),
    path: safeText(item.path ?? '/', 256),
    message: safeText(item.message ?? 'Deterministic validation failed.', 512)
  }));
}

export class DiagnosticErrorV4 extends TypeError {
  /** @param {string} code @param {any[]} diagnostics */
  constructor(code, diagnostics) {
    super(code);
    this.diagnostics = safeDiagnosticsV4(diagnostics);
  }
}
