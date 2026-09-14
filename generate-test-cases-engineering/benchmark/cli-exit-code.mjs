const SUCCESS_STATUSES = new Set([
  'pass',
  'valid',
  'pilot_ready',
  'started',
  'awaiting_submission',
  'sealed'
]);

/** @param {unknown} status */
export function exitCodeForStatus(status) {
  return typeof status === 'string' && SUCCESS_STATUSES.has(status) ? 0 : 1;
}

/** @param {{status?: unknown}} report */
export function applyReportExitCode(report) {
  process.exitCode = exitCodeForStatus(report?.status);
}
