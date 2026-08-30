export function summarizeDiagnostic(payload) {
  return {
    level: "error",
    code: payload.error.code,
    message: payload.error.message,
    requestId: payload.error.requestId,
    redactedFields: ["authorization", "cookie", "supplierTaxId"]
  };
}
