import assert from 'node:assert/strict';
import test from 'node:test';

import { exitCodeForStatus } from '../../benchmark/cli-exit-code.mjs';

test('benchmark CLI success statuses exit zero and blocking statuses exit nonzero', () => {
  for (const status of ['pass', 'valid', 'pilot_ready', 'started', 'awaiting_submission', 'sealed']) {
    assert.equal(exitCodeForStatus(status), 0, status);
  }
  for (const status of ['fail', 'fatal', 'invalid', 'insufficient_evidence', 'pilot_incomplete', undefined]) {
    assert.equal(exitCodeForStatus(status), 1, String(status));
  }
});
