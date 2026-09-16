import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

import {
  commitRevisionTransactionV4, ensureV4RunInstance
} from '../../src/revision-transaction-v4.mjs';
import {
  buildCaseDocumentPresentationV4, renderLegacyBusinessHtmlV42, renderLegacyCaseTableV42
} from '../../src/case-document-presentation-v4.mjs';
import { CANDIDATE_V4_CONTRACT } from '../../src/v4-contract.mjs';
import {
  appendRequest, byteDigest, revisionArtifacts, withRun
} from '../helpers/v4-revision-transaction-fixture.mjs';

/** @param {string} target */
async function exists(target) {
  try { await stat(target); return true; } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') return false;
    throw error;
  }
}

for (const phase of ['reserved', 'artifacts_committed', 'checkpoint_committed', 'delivery_committed']) {
  test(`A22 candidate recovers a crash after ${phase} without authorizing a partial readable set`, async () => {
    await withRun(async directory => {
      const run = await ensureV4RunInstance(directory, {
        delivery_intent: 'case_document', contract: CANDIDATE_V4_CONTRACT
      });
      const request = appendRequest('final', null, 0, {
        run_id: run.run_id, contract: CANDIDATE_V4_CONTRACT
      });
      let injected = false;
      await assert.rejects(commitRevisionTransactionV4(directory, request, {
        after_phase(observed) {
          if (!injected && observed === phase) {
            injected = true;
            throw new Error(`CANDIDATE_CRASH_AFTER_${phase}`);
          }
        }
      }), new RegExp(`CANDIDATE_CRASH_AFTER_${phase}`, 'u'));

      const currentPath = path.join(directory, 'output/current.json');
      if (await exists(currentPath)) {
        const interrupted = JSON.parse(await readFile(currentPath, 'utf8'));
        for (const key of ['bundle', 'markdown', 'execution_worksheet', 'html', 'chat_table', 'source_reading']) {
          assert.ok(await exists(path.join(directory, interrupted[key].path)), `${phase}:${key}`);
        }
      }

      const recovered = await commitRevisionTransactionV4(directory, request);
      assert.equal(recovered.status, 'committed');
      assert.equal(recovered.commit_profile, 'final');
      const manifest = JSON.parse(await readFile(currentPath, 'utf8'));
      assert.equal(manifest.schema_version, '4.2.0');
      assert.equal(manifest.compiler_version, '0.7.0');
      for (const key of ['bundle', 'markdown', 'execution_worksheet', 'html', 'chat_table', 'source_reading']) {
        assert.ok(await exists(path.join(directory, manifest[key].path)), key);
      }
    });
  });
}

test('A21/A22 final transaction can recover a complete frozen 4.2 presentation family', async () => {
  await withRun(async directory => {
    const run = await ensureV4RunInstance(directory, {
      delivery_intent: 'case_document', contract: CANDIDATE_V4_CONTRACT
    });
    const artifacts = revisionArtifacts('final', 0, {
      run_id: run.run_id, contract: CANDIDATE_V4_CONTRACT
    });
    const view = buildCaseDocumentPresentationV4(
      artifacts.bundle.value, artifacts.manifest.value.render_options
    );
    const legacyHtml = renderLegacyBusinessHtmlV42(view, artifacts.source_reading.value);
    const legacyTable = renderLegacyCaseTableV42(view);
    artifacts.html.text = legacyHtml;
    artifacts.table.text = legacyTable;
    artifacts.manifest.value.html.digest = byteDigest(legacyHtml);
    artifacts.manifest.value.chat_table.digest = byteDigest(legacyTable);

    const result = await commitRevisionTransactionV4(directory, appendRequest(
      'final', null, 0, {
        run_id: run.run_id, contract: CANDIDATE_V4_CONTRACT,
        append_id: 'APPEND-legacy-42-family', artifacts
      }
    ));
    assert.equal(result.status, 'committed');
    assert.equal(
      await readFile(path.join(directory, 'output/r000/test-cases.html'), 'utf8'), legacyHtml
    );
    assert.equal(
      await readFile(path.join(directory, 'output/r000/case-table.txt'), 'utf8'), legacyTable
    );
  });
});
