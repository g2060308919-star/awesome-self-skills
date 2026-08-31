import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile
} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import nodeTest from 'node:test';
import { fileURLToPath } from 'node:url';
import { validatePublicPilot } from '../../benchmark/public-pilot/validate.mjs';

const fsPromises = /** @type {any} */ (await import('node:fs/promises'));
const appendFile = fsPromises.appendFile;
const link = fsPromises.link;
const symlink = fsPromises.symlink;
const unlink = fsPromises.unlink;
const childProcess = /** @type {any} */ (await import('node:child_process'));
const test = /** @type {(name: string, callback: (context: any) => Promise<any>) => any} */ (nodeTest);
const validatorPath = fileURLToPath(new URL('../../benchmark/public-pilot/validate.mjs', import.meta.url));
const schemaPath = fileURLToPath(new URL('../../benchmark/public-pilot/catalog.schema.json', import.meta.url));
const catalogSchema = JSON.parse(await readFile(schemaPath, 'utf8'));

/** @param {string} executable @param {string[]} args */
async function execFileAsync(executable, args) {
  return new Promise((resolve, reject) => {
    childProcess.execFile(executable, args, { encoding: 'utf8' }, (
      /** @type {any} */ error,
      /** @type {string} */ stdout,
      /** @type {string} */ stderr
    ) => error ? reject(error) : resolve({ stdout, stderr }));
  });
}

const FROZEN_STRATA = Object.freeze([
  'transaction/order/payment',
  'identity/role/permission',
  'workflow/approval/state',
  'form/configuration/input validation',
  'asynchronous integration/event',
  'time-window/quota/entitlement'
]);

/** @param {string | Uint8Array} value */
function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

/** @param {string} value @param {{minLength?: number, pattern?: string}} schema */
function schemaAllowsString(value, schema) {
  return (schema.minLength === undefined || value.length >= schema.minLength)
    && (schema.pattern === undefined || new RegExp(schema.pattern).test(value));
}

/** @param {string} root @param {string} relativePath @param {string} contents */
async function writeRetained(root, relativePath, contents) {
  const absolutePath = path.join(root, relativePath);
  await mkdir(path.dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, contents);
  return sha256(contents);
}

/**
 * @param {any} context
 * @param {{ perStratum?: number }} [options]
 */
async function createFixture(context, { perStratum = 5 } = {}) {
  const base = await mkdtemp(path.join(os.tmpdir(), 'public-pilot-test-'));
  const root = path.join(base, 'catalog-root');
  await mkdir(root);
  context.after(async () => rm(base, { recursive: true, force: true }));

  /** @type {any[]} */
  const items = [];
  let itemIndex = 0;
  for (const stratum of FROZEN_STRATA) {
    for (let offset = 0; offset < perStratum; offset += 1) {
      itemIndex += 1;
      const pilotId = `PF-${String(itemIndex).padStart(2, '0')}`;
      const sourceId = `source-${pilotId}`;
      const taskId = `task-${pilotId}`;
      const repository = `owner-${itemIndex}/product-${itemIndex}`;
      const commit = sha256(`commit:${pilotId}`).slice(0, 40);
      const directory = `retained/${pilotId}`;
      const sourcePath = `${directory}/prd.md`;
      const licensePath = `${directory}/LICENSE`;
      const provenancePath = `${directory}/provenance.json`;
      const taskPath = `${directory}/task.json`;
      const reviewPath = `${directory}/review.json`;
      const defectPath = `${directory}/defect.json`;
      const leadPath = `${directory}/unbound-lead.json`;
      const sourceBytes = `# ${pilotId} product requirements\nUnique requirement ${itemIndex}.\n`;
      const licenseBytes = `MIT License\nCopyright fixture ${itemIndex}\n`;
      const acquiredAt = '2026-08-31T00:00:00Z';
      const sourceUrl = `https://github.com/${repository}/blob/${commit}/docs/prd.md`;
      const licenseUrl = `https://github.com/${repository}/blob/${commit}/LICENSE`;
      const taskBytes = `${JSON.stringify({ task_id: taskId, source_id: sourceId, scope: stratum })}\n`;
      const reviewBytes = `${JSON.stringify({ review_id: `review-${pilotId}`, reviewer_class: 'machine-agent', review_scope: 'intake-only' })}\n`;
      const defectBytes = `${JSON.stringify({ defect_id: `defect-${pilotId}`, status: 'case-bound', source_id: sourceId })}\n`;
      const leadBytes = `${JSON.stringify({ defect_id: `lead-${pilotId}`, status: 'lead', source_id: null })}\n`;

      const sourceDigest = await writeRetained(root, sourcePath, sourceBytes);
      const licenseDigest = await writeRetained(root, licensePath, licenseBytes);
      const provenanceBytes = `${JSON.stringify({
        repository,
        commit,
        source_url: sourceUrl,
        source_sha256: sourceDigest,
        content_digest: sourceDigest,
        license_url: licenseUrl,
        license_sha256: licenseDigest,
        reported_license: 'MIT',
        scope_decision: 'applicable',
        acquired_at: acquiredAt
      })}\n`;
      const provenanceDigest = await writeRetained(root, provenancePath, provenanceBytes);
      const taskDigest = await writeRetained(root, taskPath, taskBytes);
      const reviewDigest = await writeRetained(root, reviewPath, reviewBytes);
      const defectDigest = await writeRetained(root, defectPath, defectBytes);
      const leadDigest = await writeRetained(root, leadPath, leadBytes);

      items.push({
        pilot_id: pilotId,
        status: 'pilot-admitted',
        repository,
        commit,
        stratum,
        acquired_at: acquiredAt,
        source: {
          source_id: sourceId,
          path: sourcePath,
          sha256: sourceDigest,
          content_digest: sourceDigest,
          upstream_url: sourceUrl
        },
        license: {
          path: licensePath,
          sha256: licenseDigest,
          upstream_url: licenseUrl,
          reported_license: 'MIT',
          scope_decision: 'applicable'
        },
        provenance: {
          path: provenancePath,
          sha256: provenanceDigest
        },
        task: {
          task_id: taskId,
          path: taskPath,
          sha256: taskDigest,
          source_id: sourceId
        },
        reviews: [{
          review_id: `review-${pilotId}`,
          path: reviewPath,
          sha256: reviewDigest,
          reviewer_class: 'machine-agent',
          review_scope: 'intake-only',
          source_id: sourceId,
          task_id: taskId,
          decision: 'admit'
        }],
        defects: [
          {
            defect_id: `defect-${pilotId}`,
            path: defectPath,
            sha256: defectDigest,
            upstream_url: `https://github.com/${repository}/issues/${itemIndex}`,
            status: 'case-bound',
            bound_pilot_id: pilotId,
            countable: true
          },
          {
            defect_id: `lead-${pilotId}`,
            path: leadPath,
            sha256: leadDigest,
            upstream_url: `https://github.com/${repository}/issues/${itemIndex + 1000}`,
            status: 'lead',
            bound_pilot_id: null,
            countable: false
          }
        ]
      });
    }
  }

  const catalog = {
    schema_version: '1.0.0',
    catalog_id: 'public-source-machine-pilot-test',
    evidence_class: 'public-source-machine-pilot',
    release_eligible: false,
    release_status: 'insufficient_evidence',
    items
  };
  const catalogPath = path.join(root, 'catalog.json');
  await saveCatalog({ catalog, catalogPath });
  return { base, root, catalogPath, catalog };
}

/** @param {{ catalog: any, catalogPath: string }} fixture */
async function saveCatalog(fixture) {
  await writeFile(fixture.catalogPath, `${JSON.stringify(fixture.catalog, null, 2)}\n`);
}

/**
 * @param {{ root: string, catalog: any }} fixture
 * @param {number} itemIndex
 * @param {(provenance: any) => void} update
 */
async function updateProvenance(fixture, itemIndex, update) {
  const item = fixture.catalog.items[itemIndex];
  const absolutePath = path.join(fixture.root, item.provenance.path);
  const provenance = JSON.parse(await readFile(absolutePath, 'utf8'));
  update(provenance);
  const bytes = `${JSON.stringify(provenance)}\n`;
  await writeFile(absolutePath, bytes);
  item.provenance.sha256 = sha256(bytes);
}

/** @param {{ code: string }[]} issues @param {string} code */
function hasIssue(issues, code) {
  return issues.some((issue) => issue.code === code);
}

test('public pilot can never claim release eligibility', async (context) => {
  const fixture = await createFixture(context);
  const report = await validatePublicPilot(fixture.catalogPath);

  assert.equal(report.status, 'pilot_ready');
  assert.equal(report.release_eligible, false);
  assert.equal(report.release_status, 'insufficient_evidence');
  assert.deepEqual(Object.keys(report.counts.by_stratum), [...FROZEN_STRATA]);
  assert.deepEqual(Object.values(report.counts.by_stratum), [5, 5, 5, 5, 5, 5]);
});

test('machine reviewers cannot be encoded as external experts', async (context) => {
  const fixture = await createFixture(context);
  fixture.catalog.items[0].reviews[0].reviewer_class = 'external-human-expert';
  await saveCatalog(fixture);

  const report = await validatePublicPilot(fixture.catalogPath);

  assert.equal(report.status, 'invalid');
  assert.equal(hasIssue(report.issues, 'REVIEWER_CLASS_INVALID'), true);
});

test('every admitted item requires digest-bound provenance with catalog-consistent metadata', async (context) => {
  await context.test('missing', async (/** @type {any} */ childContext) => {
    const fixture = await createFixture(childContext);
    delete fixture.catalog.items[0].provenance;
    await saveCatalog(fixture);

    const report = await validatePublicPilot(fixture.catalogPath);

    assert.equal(report.status, 'invalid');
    assert.equal(hasIssue(report.issues, 'PROVENANCE_REQUIRED'), true);
  });

  await context.test('tampered bytes', async (/** @type {any} */ childContext) => {
    const fixture = await createFixture(childContext);
    await appendFile(path.join(fixture.root, fixture.catalog.items[0].provenance.path), 'tampered\n');

    const report = await validatePublicPilot(fixture.catalogPath);

    assert.equal(report.status, 'invalid');
    assert.equal(hasIssue(report.issues, 'PROVENANCE_DIGEST_MISMATCH'), true);
  });

  await context.test('metadata mismatch', async (/** @type {any} */ childContext) => {
    const fixture = await createFixture(childContext);
    await updateProvenance(fixture, 0, (provenance) => {
      provenance.repository = 'other-owner/other-product';
    });
    await saveCatalog(fixture);

    const report = await validatePublicPilot(fixture.catalogPath);

    assert.equal(report.status, 'invalid');
    assert.equal(hasIssue(report.issues, 'PROVENANCE_BINDING_INVALID'), true);
  });
});

test('machine reviews require the intake-only review scope', async (context) => {
  for (const [label, value] of [['missing', undefined], ['wrong', 'release-adjudication']]) {
    await context.test(label, async (/** @type {any} */ childContext) => {
      const fixture = await createFixture(childContext);
      if (value === undefined) delete fixture.catalog.items[0].reviews[0].review_scope;
      else fixture.catalog.items[0].reviews[0].review_scope = value;
      await saveCatalog(fixture);

      const report = await validatePublicPilot(fixture.catalogPath);

      assert.equal(report.status, 'invalid');
      assert.equal(hasIssue(report.issues, 'REVIEW_SCOPE_INVALID'), true);
    });
  }
});

test('changed retained source bytes invalidate the declared source digest', async (context) => {
  const fixture = await createFixture(context);
  await appendFile(path.join(fixture.root, fixture.catalog.items[0].source.path), 'tampered\n');

  const report = await validatePublicPilot(fixture.catalogPath);

  assert.equal(report.status, 'invalid');
  assert.equal(hasIssue(report.issues, 'SOURCE_DIGEST_MISMATCH'), true);
});

test('changed retained license bytes invalidate the declared license digest', async (context) => {
  const fixture = await createFixture(context);
  await appendFile(path.join(fixture.root, fixture.catalog.items[0].license.path), 'tampered\n');

  const report = await validatePublicPilot(fixture.catalogPath);

  assert.equal(report.status, 'invalid');
  assert.equal(hasIssue(report.issues, 'LICENSE_DIGEST_MISMATCH'), true);
});

test('task review and defect byte digests are recomputed from retained files', async (context) => {
  for (const [field, code] of [
    ['task', 'TASK_DIGEST_MISMATCH'],
    ['review', 'REVIEW_DIGEST_MISMATCH'],
    ['defect', 'DEFECT_DIGEST_MISMATCH']
  ]) {
    await context.test(field, async (/** @type {any} */ childContext) => {
      const fixture = await createFixture(childContext);
      const relativePath = field === 'task'
        ? fixture.catalog.items[0].task.path
        : field === 'review'
          ? fixture.catalog.items[0].reviews[0].path
          : fixture.catalog.items[0].defects[0].path;
      await appendFile(path.join(fixture.root, relativePath), 'tampered\n');

      const report = await validatePublicPilot(fixture.catalogPath);

      assert.equal(report.status, 'invalid');
      assert.equal(hasIssue(report.issues, code), true);
    });
  }
});

test('path-independent source content digests are recomputed', async (context) => {
  const fixture = await createFixture(context);
  fixture.catalog.items[0].source.content_digest = '0'.repeat(64);
  await saveCatalog(fixture);

  const report = await validatePublicPilot(fixture.catalogPath);

  assert.equal(report.status, 'invalid');
  assert.equal(hasIssue(report.issues, 'SOURCE_CONTENT_DIGEST_MISMATCH'), true);
});

test('mutable GitHub blob and raw URLs are rejected', async (context) => {
  const fixture = await createFixture(context);
  fixture.catalog.items[0].source.upstream_url = 'https://github.com/owner/product/blob/main/docs/prd.md';
  fixture.catalog.items[1].license.upstream_url = 'https://raw.githubusercontent.com/owner/product/main/LICENSE';
  await saveCatalog(fixture);

  const report = await validatePublicPilot(fixture.catalogPath);

  assert.equal(report.status, 'invalid');
  assert.equal(report.issues.filter((issue) => issue.code === 'MUTABLE_GITHUB_URL').length, 2);
});

test('source license and defect URLs must belong to the catalog repository', async (context) => {
  for (const [field, code] of [
    ['source', 'UPSTREAM_REPOSITORY_MISMATCH'],
    ['license', 'UPSTREAM_REPOSITORY_MISMATCH'],
    ['defect', 'DEFECT_REPOSITORY_MISMATCH']
  ]) {
    await context.test(field, async (/** @type {any} */ childContext) => {
      const fixture = await createFixture(childContext);
      const item = fixture.catalog.items[0];
      if (field === 'source') {
        item.source.upstream_url = `https://github.com/other-owner/other-product/blob/${item.commit}/docs/prd.md`;
        await updateProvenance(fixture, 0, (provenance) => {
          provenance.source_url = item.source.upstream_url;
        });
      } else if (field === 'license') {
        item.license.upstream_url = `https://raw.githubusercontent.com/other-owner/other-product/${item.commit}/LICENSE`;
        await updateProvenance(fixture, 0, (provenance) => {
          provenance.license_url = item.license.upstream_url;
        });
      } else {
        item.defects[0].upstream_url = 'https://github.com/other-owner/other-product/issues/1';
      }
      await saveCatalog(fixture);

      const report = await validatePublicPilot(fixture.catalogPath);

      assert.equal(report.status, 'invalid');
      assert.equal(hasIssue(report.issues, code), true);
    });
  }
});

test('duplicate path-independent source content digests are invalid', async (context) => {
  const fixture = await createFixture(context);
  const first = fixture.catalog.items[0].source;
  const second = fixture.catalog.items[1].source;
  const bytes = await readFile(path.join(fixture.root, first.path));
  await writeFile(path.join(fixture.root, second.path), bytes);
  second.sha256 = sha256(bytes);
  second.content_digest = sha256(bytes);
  await saveCatalog(fixture);

  const report = await validatePublicPilot(fixture.catalogPath);

  assert.equal(report.status, 'invalid');
  assert.equal(hasIssue(report.issues, 'DUPLICATE_CONTENT_DIGEST'), true);
});

test('an admitted item requires an explicit source-bound task', async (context) => {
  const fixture = await createFixture(context);
  delete fixture.catalog.items[0].task.source_id;
  await saveCatalog(fixture);

  const report = await validatePublicPilot(fixture.catalogPath);

  assert.equal(report.status, 'invalid');
  assert.equal(hasIssue(report.issues, 'TASK_BINDING_MISSING'), true);
});

test('a structurally valid catalog below five admitted items in one stratum is pilot incomplete', async (context) => {
  const fixture = await createFixture(context);
  fixture.catalog.items.pop();
  await saveCatalog(fixture);

  const report = await validatePublicPilot(fixture.catalogPath);

  assert.equal(report.status, 'pilot_incomplete');
  assert.equal(report.release_eligible, false);
  assert.equal(report.counts.by_stratum['time-window/quota/entitlement'], 4);
  assert.equal(hasIssue(report.issues, 'STRATUM_MINIMUM_NOT_MET'), true);
});

test('an unbound historical defect lead cannot be counted', async (context) => {
  const fixture = await createFixture(context);
  fixture.catalog.items[0].defects[1].countable = true;
  await saveCatalog(fixture);

  const report = await validatePublicPilot(fixture.catalogPath);

  assert.equal(report.status, 'invalid');
  assert.equal(hasIssue(report.issues, 'UNBOUND_DEFECT_COUNTED'), true);
  assert.equal(hasIssue(report.issues, 'COUNTABLE_DEFECT_STATUS_INVALID'), true);
});

test('defect status is required and lead records stay unbound and uncountable', async (context) => {
  /** @type {Array<[string, (defect: any) => void, string]>} */
  const cases = [
    ['missing status', (defect) => delete defect.status, 'DEFECT_STATUS_INVALID'],
    ['countable lead', (defect) => { defect.status = 'lead'; }, 'COUNTABLE_DEFECT_STATUS_INVALID'],
    ['bound lead', (defect) => { defect.bound_pilot_id = 'PF-01'; }, 'LEAD_DEFECT_BINDING_INVALID']
  ];
  for (const [label, update, code] of cases) {
    await context.test(label, async (/** @type {any} */ childContext) => {
      const fixture = await createFixture(childContext);
      const defect = label === 'bound lead'
        ? fixture.catalog.items[0].defects[1]
        : fixture.catalog.items[0].defects[0];
      update(defect);
      await saveCatalog(fixture);

      const report = await validatePublicPilot(fixture.catalogPath);

      assert.equal(report.status, 'invalid');
      assert.equal(hasIssue(report.issues, code), true);
    });
  }
});

test('schema and validator agree on non-empty strings and RFC 3339 acquisition times', async (context) => {
  const nonEmptySchema = catalogSchema.$defs.nonEmptyString;
  const acquiredAtSchema = catalogSchema.$defs.rfc3339DateTime;
  assert.equal(schemaAllowsString('catalog', nonEmptySchema), true);
  assert.equal(schemaAllowsString('   ', nonEmptySchema), false);
  assert.equal(schemaAllowsString('2026-08-31T00:00:00Z', acquiredAtSchema), true);
  assert.equal(schemaAllowsString('2026-08-31', acquiredAtSchema), false);

  const blankFixture = await createFixture(context);
  blankFixture.catalog.catalog_id = '   ';
  await saveCatalog(blankFixture);
  assert.equal((await validatePublicPilot(blankFixture.catalogPath)).status, 'invalid');

  const dateFixture = await createFixture(context);
  dateFixture.catalog.items[0].acquired_at = '2026-08-31';
  await updateProvenance(dateFixture, 0, (provenance) => {
    provenance.acquired_at = '2026-08-31';
  });
  await saveCatalog(dateFixture);
  const dateReport = await validatePublicPilot(dateFixture.catalogPath);
  assert.equal(dateReport.status, 'invalid');
  assert.equal(hasIssue(dateReport.issues, 'ACQUISITION_TIME_INVALID'), true);
});

test('absolute retained paths are rejected even when they point inside the catalog root', async (context) => {
  const fixture = await createFixture(context);
  fixture.catalog.items[0].source.path = path.join(fixture.root, fixture.catalog.items[0].source.path);
  await saveCatalog(fixture);

  const report = await validatePublicPilot(fixture.catalogPath);

  assert.equal(report.status, 'invalid');
  assert.equal(hasIssue(report.issues, 'ABSOLUTE_PATH_FORBIDDEN'), true);
});

test('parent traversal retained paths are rejected before filesystem access', async (context) => {
  const fixture = await createFixture(context);
  fixture.catalog.items[0].source.path = '../outside.md';
  await saveCatalog(fixture);

  const report = await validatePublicPilot(fixture.catalogPath);

  assert.equal(report.status, 'invalid');
  assert.equal(hasIssue(report.issues, 'PATH_TRAVERSAL_FORBIDDEN'), true);
});

test('symlinked retained files are rejected', async (context) => {
  const fixture = await createFixture(context);
  const item = fixture.catalog.items[0];
  const sourcePath = path.join(fixture.root, item.source.path);
  await unlink(sourcePath);
  await symlink(path.relative(path.dirname(sourcePath), path.join(fixture.root, item.license.path)), sourcePath);

  const report = await validatePublicPilot(fixture.catalogPath);

  assert.equal(report.status, 'invalid');
  assert.equal(hasIssue(report.issues, 'SYMLINK_FORBIDDEN'), true);
});

test('hardlinked retained files are rejected', async (context) => {
  const fixture = await createFixture(context);
  const first = fixture.catalog.items[0].reviews[0];
  const second = fixture.catalog.items[1].reviews[0];
  const firstPath = path.join(fixture.root, first.path);
  const secondPath = path.join(fixture.root, second.path);
  await unlink(secondPath);
  await link(firstPath, secondPath);
  second.sha256 = first.sha256;
  await saveCatalog(fixture);

  const report = await validatePublicPilot(fixture.catalogPath);

  assert.equal(report.status, 'invalid');
  assert.equal(hasIssue(report.issues, 'HARDLINK_FORBIDDEN'), true);
});

test('one retained physical path cannot satisfy two catalog bindings', async (context) => {
  const fixture = await createFixture(context);
  fixture.catalog.items[1].reviews[0].path = fixture.catalog.items[0].reviews[0].path;
  fixture.catalog.items[1].reviews[0].sha256 = fixture.catalog.items[0].reviews[0].sha256;
  await saveCatalog(fixture);

  const report = await validatePublicPilot(fixture.catalogPath);

  assert.equal(report.status, 'invalid');
  assert.equal(hasIssue(report.issues, 'DUPLICATE_PHYSICAL_PATH'), true);
});

test('a catalog attempt to set release_eligible true is invalid and cannot change the output boundary', async (context) => {
  const fixture = await createFixture(context);
  fixture.catalog.release_eligible = true;
  await saveCatalog(fixture);

  const report = await validatePublicPilot(fixture.catalogPath);

  assert.equal(report.status, 'invalid');
  assert.equal(report.release_eligible, false);
  assert.equal(report.release_status, 'insufficient_evidence');
  assert.equal(hasIssue(report.issues, 'RELEASE_ELIGIBILITY_FORBIDDEN'), true);
});

test('the offline CLI emits exactly one JSON report', async (context) => {
  const fixture = await createFixture(context);
  const { stdout, stderr } = /** @type {any} */ (await execFileAsync(process.execPath, [validatorPath, fixture.catalogPath]));
  const lines = stdout.trimEnd().split('\n');

  assert.equal(stderr, '');
  assert.equal(lines.length, 1);
  assert.deepEqual(JSON.parse(lines[0]), await validatePublicPilot(fixture.catalogPath));
});
