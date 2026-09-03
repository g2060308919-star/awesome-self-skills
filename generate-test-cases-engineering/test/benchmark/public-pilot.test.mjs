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
const checkedInCatalogPath = fileURLToPath(new URL('../../benchmark/public-pilot/v1/catalog.json', import.meta.url));
const checkedInComparatorsPath = fileURLToPath(new URL('../../benchmark/public-pilot/v1/comparators.json', import.meta.url));
const checkedInRepositoryRoot = fileURLToPath(new URL('../../', import.meta.url));
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
  const root = path.join(base, 'benchmark', 'public-pilot', 'v1');
  await mkdir(root, { recursive: true });
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
      const scope = `Product ${itemIndex} checkout, authorization, and settlement behavior`;
      const sourceBytes = `# ${pilotId} product requirements\nScope: ${scope}.\nUnique requirement ${itemIndex}.\n`;
      const licenseBytes = `MIT License\nCopyright fixture ${itemIndex}\n`;
      const acquiredAt = '2026-08-31T00:00:00Z';
      const sourceUrl = `https://github.com/${repository}/blob/${commit}/docs/prd.md`;
      const licenseUrl = `https://github.com/${repository}/blob/${commit}/LICENSE`;
      const taskBytes = `${JSON.stringify({
        case_id: pilotId,
        scope,
        stratum,
        source_paths: [sourcePath],
        clarification_candidate: {
          status: 'unassessed',
          evidence_class: 'machine-pilot-candidate',
          reason: 'Clarification necessity has not been assessed.'
        }
      })}\n`;
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
          source_id: sourceId,
          scope
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

  /** @type {any} */
  const catalog = {
    schema_version: '1.0.0',
    catalog_id: 'public-source-machine-pilot-test',
    evidence_class: 'public-source-machine-pilot',
    release_eligible: false,
    release_status: 'insufficient_evidence',
    items
  };

  const corpusSnapshotBytes = `${JSON.stringify({
    schema_version: catalog.schema_version,
    catalog_id: catalog.catalog_id,
    evidence_class: catalog.evidence_class,
    release_eligible: catalog.release_eligible,
    release_status: catalog.release_status,
    items: catalog.items.map((/** @type {any} */ item) => ({ ...item, reviews: [], defects: [] }))
  }, null, 2)}\n`;
  const corpusSnapshotSha256 = sha256(corpusSnapshotBytes);
  const intakeReportPath = 'intake-report.md';
  const intakeReportDigest = await writeRetained(root, intakeReportPath, '# Frozen intake report fixture\n');
  /** @param {string} reportId @param {string} reviewerId */
  const makeReviewReport = (reportId, reviewerId) => ({
    schema_version: '1.0.0',
    report_id: reportId,
    reviewer_id: reviewerId,
    reviewer_class: 'machine-agent',
    review_scope: 'intake-only',
    external_expert_evidence: false,
    formal_admit_count: 0,
    release_eligible: false,
    release_status: 'insufficient_evidence',
    input_catalog_sha256: corpusSnapshotSha256,
    input_intake_report_sha256: intakeReportDigest,
    reviewed_at: '2026-08-31T01:00:00Z',
    cases: catalog.items.map((/** @type {any} */ item) => ({
      review_id: `${reportId}:${item.pilot_id}`,
      case_id: item.pilot_id,
      source_id: item.source.source_id,
      task_id: item.task.task_id,
      repository: item.repository,
      stratum: item.stratum,
      input_source_sha256: item.source.sha256,
      input_task_sha256: item.task.sha256,
      decision: 'admit',
      reasons: ['The fixture source, task, provenance, and license are complete and consistently bound.']
    }))
  });
  const reviewReports = [
    makeReviewReport('machine-expert-a-v1', 'machine-test-expert-a'),
    makeReviewReport('machine-expert-b-v1', 'machine-test-expert-b')
  ];
  const reviewPaths = ['evidence/machine-expert-a.json', 'evidence/machine-expert-b.json'];
  const reviewDescriptors = [];
  for (const [index, report] of reviewReports.entries()) {
    const bytes = `${JSON.stringify(report, null, 2)}\n`;
    reviewDescriptors.push({
      report_id: report.report_id,
      path: reviewPaths[index],
      sha256: await writeRetained(root, reviewPaths[index], bytes),
      reviewer_id: report.reviewer_id,
      reviewer_class: report.reviewer_class,
      review_scope: report.review_scope
    });
  }

  const decisionCounts = { admit: catalog.items.length, hold: 0, reject: 0 };
  const finalAdmitsByStratum = Object.fromEntries(FROZEN_STRATA.map((stratum) => [stratum, perStratum]));
  const adjudication = {
    schema_version: '1.0.0',
    report_id: 'machine-adjudication-v1',
    reviewer_id: 'machine-adjudicator',
    reviewer_class: 'machine-agent',
    review_scope: 'intake-only',
    external_expert_evidence: false,
    input_catalog_path: 'catalog.json',
    input_catalog_sha256: corpusSnapshotSha256,
    input_reports: reviewDescriptors.map(({ report_id, path: reportPath, sha256: digest }) => ({
      report_id,
      path: reportPath,
      sha256: digest
    })),
    adjudicated_at: '2026-08-31T02:00:00Z',
    boundary_note: 'Machine intake adjudication only; this is not external-human evidence.',
    cases: catalog.items.map((/** @type {any} */ item) => ({
      review_id: `machine-adjudication-v1:${item.pilot_id}`,
      case_id: item.pilot_id,
      source_id: item.source.source_id,
      task_id: item.task.task_id,
      repository: item.repository,
      stratum: item.stratum,
      input_source_sha256: item.source.sha256,
      input_task_sha256: item.task.sha256,
      expert_a_decision: 'admit',
      expert_b_decision: 'admit',
      disagreement: false,
      final_decision: 'admit',
      reasons: ['Both independent machine intake reports admitted the exact retained case.']
    })),
    disagreement_resolutions: [],
    final_summary: {
      ...decisionCounts,
      disagreements: 0,
      final_admits_by_stratum: finalAdmitsByStratum,
      all_strata_meet_five: perStratum >= 5
    },
    formal_admit_count: 0,
    release_eligible: false,
    release_status: 'insufficient_evidence'
  };
  const adjudicationPath = 'evidence/machine-adjudication.json';
  const adjudicationBytes = `${JSON.stringify(adjudication, null, 2)}\n`;
  const adjudicationDigest = await writeRetained(root, adjudicationPath, adjudicationBytes);

  const leads = Array.from({ length: 32 }, (_, index) => {
    const item = catalog.items[index % catalog.items.length];
    const issueNumber = index + 1;
    return {
      defect_id: `DEFECT-${String(issueNumber).padStart(3, '0')}`,
      canonical_url: `https://github.com/${item.repository}/issues/${issueNumber}`,
      repository: item.repository,
      issue_number: issueNumber,
      frozen_risk: 'medium',
      suggested_strata: [item.stratum],
      relevance: `Fixture defect lead ${issueNumber}.`,
      status: 'lead',
      bound_case_id: null,
      countable: false,
      source_version: null,
      snapshot_sha256: null,
      snapshot_status: 'not-retained',
      source_report_path: 'docs/research/source-report.md',
      source_report_sha256: 'b'.repeat(64),
      risk_source: 'machine-normalized-from-report-summary',
      source_occurrences: Array.from({ length: index === 0 ? 2 : 1 }, (_, occurrenceIndex) => ({
        source_report_path: 'docs/research/source-report.md',
        source_report_sha256: 'b'.repeat(64),
        source_local_id: `fixture-${issueNumber}-${occurrenceIndex + 1}`
      }))
    };
  });
  const defectLedger = {
    schema_version: '1.0.0',
    ledger_id: 'public-defect-leads-v1',
    evidence_class: 'public-source-machine-pilot',
    external_expert_evidence: false,
    release_eligible: false,
    release_status: 'insufficient_evidence',
    boundary: {
      machine_generated: true,
      formal_admit_count: 0,
      immutable_snapshots_retained: 0,
      current_case_bindings: 0,
      note: 'Mutable issue research leads are not retained benchmark defects.'
    },
    normalization: {
      raw_entry_count: 33,
      unique_lead_count: 32,
      deduplication_count: 1,
      deduplicated_issue: {
        canonical_url: leads[0].canonical_url,
        canonical_defect_id: leads[0].defect_id,
        merged_source_local_ids: leads[0].source_occurrences.map((entry) => entry.source_local_id)
      }
    },
    controlling_sources: [],
    source_reports: [],
    leads
  };
  const defectLedgerPath = 'evidence/defect-ledger.json';
  const defectLedgerBytes = `${JSON.stringify(defectLedger, null, 2)}\n`;
  const defectLedgerDigest = await writeRetained(root, defectLedgerPath, defectLedgerBytes);

  for (const item of catalog.items) {
    item.reviews = [
      ...reviewReports.map((report) => {
        const review = report.cases.find((/** @type {any} */ entry) => entry.case_id === item.pilot_id);
        if (!review) throw new Error(`Missing fixture review for ${item.pilot_id}.`);
        return {
          review_id: `${report.report_id}:${item.pilot_id}`,
          report_id: report.report_id,
          reviewer_class: report.reviewer_class,
          review_scope: report.review_scope,
          source_id: item.source.source_id,
          task_id: item.task.task_id,
          decision: review.decision
        };
      }),
      {
        review_id: `${adjudication.report_id}:${item.pilot_id}`,
        report_id: adjudication.report_id,
        reviewer_class: adjudication.reviewer_class,
        review_scope: adjudication.review_scope,
        source_id: item.source.source_id,
        task_id: item.task.task_id,
        decision: 'admit'
      }
    ];
    item.defects = [];
  }
  catalog.corpus_snapshot_sha256 = corpusSnapshotSha256;
  catalog.review_reports = reviewDescriptors;
  catalog.adjudication_report = {
    report_id: adjudication.report_id,
    path: adjudicationPath,
    sha256: adjudicationDigest,
    reviewer_id: adjudication.reviewer_id,
    reviewer_class: adjudication.reviewer_class,
    review_scope: adjudication.review_scope
  };
  catalog.defect_ledger = {
    ledger_id: defectLedger.ledger_id,
    path: defectLedgerPath,
    sha256: defectLedgerDigest
  };
  catalog.intake_report = {
    path: intakeReportPath,
    sha256: intakeReportDigest
  };
  const frozenSkillDigest = await writeRetained(base, 'skill/generate-test-cases/SKILL.md', '# Fixture Skill\n');
  const frozenCompilerDigest = await writeRetained(base, 'skill/generate-test-cases/scripts/test-compiler.mjs', 'export const fixtureCompiler = true;\n');
  const frozenSchemaDigest = await writeRetained(base, 'skill/generate-test-cases/scripts/schema-manifest.json', '{"schema_version":"1.0.0"}\n');
  const comparatorRegistry = {
    schema_version: '1.0.0',
    registry_id: 'public-pilot-comparators-v1',
    evidence_class: 'public-source-machine-pilot',
    captures_allowed: false,
    systems: [
      {
        system_id: 'generate-test-cases',
        status: 'frozen',
        version: '0.1.0',
        repository_revision: '1'.repeat(40),
        artifacts: [
          { artifact_id: 'skill', kind: 'skill', repository_path: 'skill/generate-test-cases/SKILL.md', sha256: frozenSkillDigest },
          { artifact_id: 'compiler', kind: 'compiler', repository_path: 'skill/generate-test-cases/scripts/test-compiler.mjs', sha256: frozenCompilerDigest },
          { artifact_id: 'schema-manifest', kind: 'schema', repository_path: 'skill/generate-test-cases/scripts/schema-manifest.json', sha256: frozenSchemaDigest }
        ],
        model_identity: {
          provider: 'openai',
          model_id: 'fixture-model-v1',
          reasoning_effort: 'high'
        },
        run_recipe: {
          recipe_id: 'fixture-run-v1',
          invocation: 'Invoke the frozen Skill in a fresh context.',
          input_contract: 'Exact retained source and task bytes.',
          output_contract: 'Retain the unmodified raw response.',
          independent_runs: 3
        }
      },
      ...['long-prompt', 'test-case-designer', 'technique-router'].map((systemId) => ({
        system_id: systemId,
        status: 'unresolved',
        missing_fields: ['version', 'artifacts', 'model_identity', 'run_recipe'],
        resolution_note: 'No licensed, authoritative implementation identity is available.'
      }))
    ]
  };
  const comparatorPath = 'comparators.json';
  const comparatorBytes = `${JSON.stringify(comparatorRegistry, null, 2)}\n`;
  const comparatorDigest = await writeRetained(root, comparatorPath, comparatorBytes);
  catalog.comparators = {
    registry_id: comparatorRegistry.registry_id,
    path: comparatorPath,
    sha256: comparatorDigest
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

/**
 * @param {{ root: string, catalog: any }} fixture
 * @param {number} itemIndex
 * @param {(task: any) => void} update
 */
async function updateTask(fixture, itemIndex, update) {
  const item = fixture.catalog.items[itemIndex];
  const absolutePath = path.join(fixture.root, item.task.path);
  const task = JSON.parse(await readFile(absolutePath, 'utf8'));
  update(task);
  const bytes = `${JSON.stringify(task)}\n`;
  await writeFile(absolutePath, bytes);
  item.task.sha256 = sha256(bytes);
}

/**
 * @param {{ root: string, catalog: any }} fixture
 * @param {any} descriptor
 * @param {(record: any) => void} update
 */
async function updateRetainedJson(fixture, descriptor, update) {
  const absolutePath = path.join(fixture.root, descriptor.path);
  const record = JSON.parse(await readFile(absolutePath, 'utf8'));
  update(record);
  const bytes = `${JSON.stringify(record, null, 2)}\n`;
  await writeFile(absolutePath, bytes);
  descriptor.sha256 = sha256(bytes);
}

/** @param {{ root: string, catalog: any }} fixture */
async function refreshTask4SnapshotBindings(fixture) {
  const projection = {
    schema_version: fixture.catalog.schema_version,
    catalog_id: fixture.catalog.catalog_id,
    evidence_class: fixture.catalog.evidence_class,
    release_eligible: fixture.catalog.release_eligible,
    release_status: fixture.catalog.release_status,
    items: fixture.catalog.items.map((/** @type {any} */ item) => ({
      pilot_id: item.pilot_id,
      status: item.status,
      repository: item.repository,
      commit: item.commit,
      stratum: item.stratum,
      acquired_at: item.acquired_at,
      source: item.source,
      license: item.license,
      provenance: item.provenance,
      task: item.task,
      reviews: [],
      defects: []
    }))
  };
  const snapshotDigest = sha256(`${JSON.stringify(projection, null, 2)}\n`);
  fixture.catalog.corpus_snapshot_sha256 = snapshotDigest;
  for (const descriptor of fixture.catalog.review_reports) {
    await updateRetainedJson(fixture, descriptor, (report) => {
      report.input_catalog_sha256 = snapshotDigest;
    });
  }
  await updateRetainedJson(fixture, fixture.catalog.adjudication_report, (adjudication) => {
    adjudication.input_catalog_sha256 = snapshotDigest;
    adjudication.input_reports = fixture.catalog.review_reports.map((/** @type {any} */ descriptor) => ({
      report_id: descriptor.report_id,
      path: descriptor.path,
      sha256: descriptor.sha256
    }));
  });
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
  assert.equal(report.captures_ready, false);
  assert.deepEqual(Object.keys(report.counts.by_stratum), [...FROZEN_STRATA]);
  assert.deepEqual(Object.values(report.counts.by_stratum), [5, 5, 5, 5, 5, 5]);
});

test('checked-in public pilot stays bound to the current target artifacts', async () => {
  const report = await validatePublicPilot(checkedInCatalogPath);
  const registry = JSON.parse(await readFile(checkedInComparatorsPath, 'utf8'));

  assert.equal(report.status, 'pilot_ready');
  assert.equal(report.release_eligible, false);
  assert.equal(report.release_status, 'insufficient_evidence');
  assert.equal(report.captures_ready, false);
  assert.equal(hasIssue(report.issues, 'COMPARATOR_ARTIFACT_DIGEST_MISMATCH'), false);

  for (const system of registry.systems.filter((/** @type {any} */ item) => item.status === 'frozen')) {
    await execFileAsync('git', [
      '-C', checkedInRepositoryRoot, 'cat-file', '-e', `${system.repository_revision}^{commit}`
    ]);
    for (const artifact of system.artifacts) {
      const { stdout } = /** @type {{ stdout: string }} */ (await execFileAsync('git', [
        '-C', checkedInRepositoryRoot, 'show',
        `${system.repository_revision}:${artifact.repository_path}`
      ]));
      assert.equal(sha256(stdout), artifact.sha256);
    }
  }
});

test('captures stay closed while any comparator identity is unresolved', async (context) => {
  const fixture = await createFixture(context);

  const report = await validatePublicPilot(fixture.catalogPath);

  assert.equal(report.status, 'pilot_ready');
  assert.equal(report.captures_ready, false);
  assert.equal(hasIssue(report.issues, 'COMPARATOR_UNRESOLVED'), true);
});

test('frozen comparators require exact artifact digests, version, model identity, and run recipe', async (context) => {
  const fixture = await createFixture(context);
  await updateRetainedJson(fixture, fixture.catalog.comparators, (registry) => {
    registry.systems[1].status = 'frozen';
  });
  await saveCatalog(fixture);

  const report = await validatePublicPilot(fixture.catalogPath);

  assert.equal(report.status, 'invalid');
  assert.equal(report.captures_ready, false);
  assert.equal(hasIssue(report.issues, 'COMPARATOR_FROZEN_IDENTITY_INVALID'), true);
});

test('captures become ready only after all four comparator identities are frozen', async (context) => {
  const fixture = await createFixture(context);
  const baselineDigests = new Map();
  for (const systemId of ['long-prompt', 'test-case-designer', 'technique-router']) {
    const repositoryPath = `comparators/${systemId}.md`;
    baselineDigests.set(systemId, {
      repositoryPath,
      digest: await writeRetained(fixture.base, repositoryPath, `# ${systemId} frozen prompt\n`)
    });
  }
  await updateRetainedJson(fixture, fixture.catalog.comparators, (registry) => {
    const template = registry.systems[0];
    for (const system of registry.systems.slice(1)) {
      Object.assign(system, {
        status: 'frozen',
        version: '1.0.0',
        repository_revision: '2'.repeat(40),
        artifacts: [{
          artifact_id: `${system.system_id}-prompt`,
          kind: 'prompt',
          repository_path: baselineDigests.get(system.system_id).repositoryPath,
          sha256: baselineDigests.get(system.system_id).digest
        }],
        model_identity: { ...template.model_identity },
        run_recipe: { ...template.run_recipe, recipe_id: `${system.system_id}-run-v1` }
      });
      delete system.missing_fields;
      delete system.resolution_note;
    }
    registry.captures_allowed = true;
  });
  await saveCatalog(fixture);

  const report = await validatePublicPilot(fixture.catalogPath);

  assert.equal(report.status, 'pilot_ready');
  assert.equal(report.captures_ready, true);
  assert.equal(hasIssue(report.issues, 'COMPARATOR_UNRESOLVED'), false);

  fixture.catalog.release_eligible = true;
  await saveCatalog(fixture);
  const invalidReport = await validatePublicPilot(fixture.catalogPath);
  assert.equal(invalidReport.status, 'invalid');
  assert.equal(invalidReport.captures_ready, false);
});

test('frozen comparator artifacts are read and digest-verified inside the repository root', async (context) => {
  await context.test('tampered bytes', async (/** @type {any} */ childContext) => {
    const fixture = await createFixture(childContext);
    await appendFile(path.join(fixture.base, 'skill/generate-test-cases/SKILL.md'), 'tampered\n');

    const report = await validatePublicPilot(fixture.catalogPath);

    assert.equal(report.status, 'invalid');
    assert.equal(report.captures_ready, false);
    assert.equal(hasIssue(report.issues, 'COMPARATOR_ARTIFACT_DIGEST_MISMATCH'), true);
  });

  await context.test('missing path', async (/** @type {any} */ childContext) => {
    const fixture = await createFixture(childContext);
    await updateRetainedJson(fixture, fixture.catalog.comparators, (registry) => {
      registry.systems[0].artifacts[0].repository_path = 'skill/generate-test-cases/MISSING.md';
    });
    await saveCatalog(fixture);

    const report = await validatePublicPilot(fixture.catalogPath);

    assert.equal(report.status, 'invalid');
    assert.equal(report.captures_ready, false);
    assert.equal(hasIssue(report.issues, 'RETAINED_FILE_UNREADABLE'), true);
  });

  await context.test('parent traversal', async (/** @type {any} */ childContext) => {
    const fixture = await createFixture(childContext);
    await updateRetainedJson(fixture, fixture.catalog.comparators, (registry) => {
      registry.systems[0].artifacts[0].repository_path = '../outside.md';
    });
    await saveCatalog(fixture);

    const report = await validatePublicPilot(fixture.catalogPath);

    assert.equal(report.status, 'invalid');
    assert.equal(report.captures_ready, false);
    assert.equal(hasIssue(report.issues, 'COMPARATOR_FROZEN_IDENTITY_INVALID'), true);
  });
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

test('the corpus snapshot digest is recomputed from the Task 3 projection', async (context) => {
  const fixture = await createFixture(context);
  fixture.catalog.corpus_snapshot_sha256 = '0'.repeat(64);
  await saveCatalog(fixture);

  const report = await validatePublicPilot(fixture.catalogPath);

  assert.equal(report.status, 'invalid');
  assert.equal(hasIssue(report.issues, 'CORPUS_SNAPSHOT_DIGEST_MISMATCH'), true);
});

test('retained review reports cannot claim external human evidence', async (context) => {
  const fixture = await createFixture(context);
  await updateRetainedJson(fixture, fixture.catalog.review_reports[0], (review) => {
    review.external_expert_evidence = true;
    review.reviewer_class = 'external-human-expert';
  });
  await saveCatalog(fixture);

  const report = await validatePublicPilot(fixture.catalogPath);

  assert.equal(report.status, 'invalid');
  assert.equal(hasIssue(report.issues, 'EXTERNAL_EXPERT_EVIDENCE_FORBIDDEN'), true);
});

test('each independent report must review the complete frozen corpus', async (context) => {
  const fixture = await createFixture(context);
  await updateRetainedJson(fixture, fixture.catalog.review_reports[0], (review) => {
    review.cases.pop();
  });
  await saveCatalog(fixture);

  const report = await validatePublicPilot(fixture.catalogPath);

  assert.equal(report.status, 'invalid');
  assert.equal(hasIssue(report.issues, 'REVIEW_CASE_COVERAGE_INVALID'), true);
});

test('review reports must bind the retained frozen intake bytes', async (context) => {
  const fixture = await createFixture(context);
  await appendFile(path.join(fixture.root, fixture.catalog.intake_report.path), 'tampered\n');

  const report = await validatePublicPilot(fixture.catalogPath);

  assert.equal(report.status, 'invalid');
  assert.equal(hasIssue(report.issues, 'INTAKE_REPORT_DIGEST_MISMATCH'), true);
});

test('machine adjudication must digest-bind both independent reports', async (context) => {
  const fixture = await createFixture(context);
  await updateRetainedJson(fixture, fixture.catalog.adjudication_report, (adjudication) => {
    adjudication.input_reports.pop();
  });
  await saveCatalog(fixture);

  const report = await validatePublicPilot(fixture.catalogPath);

  assert.equal(report.status, 'invalid');
  assert.equal(hasIssue(report.issues, 'ADJUDICATION_INPUT_MISSING'), true);
});

test('machine adjudication must structurally bind every disagreement resolution', async (context) => {
  const fixture = await createFixture(context);
  const item = fixture.catalog.items[0];
  await updateRetainedJson(fixture, fixture.catalog.review_reports[1], (review) => {
    review.cases[0].decision = 'hold';
  });
  item.reviews[1].decision = 'hold';
  await updateRetainedJson(fixture, fixture.catalog.adjudication_report, (adjudication) => {
    adjudication.input_reports = fixture.catalog.review_reports.map((/** @type {any} */ descriptor) => ({
      report_id: descriptor.report_id,
      path: descriptor.path,
      sha256: descriptor.sha256
    }));
    adjudication.cases[0].expert_b_decision = 'hold';
    adjudication.cases[0].disagreement = true;
    adjudication.disagreement_resolutions = [{}];
    adjudication.final_summary.disagreements = 1;
  });
  await saveCatalog(fixture);

  const report = await validatePublicPilot(fixture.catalogPath);

  assert.equal(report.status, 'invalid');
  assert.equal(hasIssue(report.issues, 'ADJUDICATION_RESOLUTIONS_INVALID'), true);
});

test('a case with an invalid report link is excluded from admitted counts', async (context) => {
  const fixture = await createFixture(context);
  fixture.catalog.items[0].reviews[0].review_id = 'wrong-review-id';
  await saveCatalog(fixture);

  const report = await validatePublicPilot(fixture.catalogPath);

  assert.equal(report.status, 'invalid');
  assert.equal(report.counts.pilot_admitted, 29);
  assert.equal(report.counts.by_stratum[FROZEN_STRATA[0]], 4);
});

test('duplicate canonical issues are rejected even when routed to different strata', async (context) => {
  const fixture = await createFixture(context);
  await updateRetainedJson(fixture, fixture.catalog.defect_ledger, (ledger) => {
    ledger.leads[1].canonical_url = ledger.leads[0].canonical_url;
    ledger.leads[1].repository = ledger.leads[0].repository;
    ledger.leads[1].issue_number = ledger.leads[0].issue_number;
    ledger.leads[1].suggested_strata = [FROZEN_STRATA[1]];
  });
  await saveCatalog(fixture);

  const report = await validatePublicPilot(fixture.catalogPath);

  assert.equal(report.status, 'invalid');
  assert.equal(hasIssue(report.issues, 'DUPLICATE_DEFECT_ISSUE'), true);
});

test('a countable defect cannot bind to a non-admitted case', async (context) => {
  const fixture = await createFixture(context);
  const item = fixture.catalog.items[0];
  item.status = 'hold';
  await updateRetainedJson(fixture, fixture.catalog.defect_ledger, (ledger) => {
    Object.assign(ledger.leads[0], {
      status: 'case-bound',
      bound_case_id: item.pilot_id,
      countable: true,
      source_version: item.commit,
      snapshot_sha256: 'c'.repeat(64),
      snapshot_status: 'retained'
    });
  });
  await saveCatalog(fixture);

  const report = await validatePublicPilot(fixture.catalogPath);

  assert.equal(report.status, 'invalid');
  assert.equal(hasIssue(report.issues, 'DEFECT_BOUND_TO_NON_ADMITTED'), true);
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
          ? fixture.catalog.review_reports[0].path
          : fixture.catalog.defect_ledger.path;
      await appendFile(path.join(fixture.root, relativePath), 'tampered\n');

      const report = await validatePublicPilot(fixture.catalogPath);

      assert.equal(report.status, 'invalid');
      assert.equal(hasIssue(report.issues, code), true);
    });
  }
});

test('retained task contract stays bound when rewritten bytes have a synchronized digest', async (context) => {
  /** @type {Array<[string, (task: any) => void]>} */
  const mutations = [
    ['case_id', (task) => { task.case_id = 'PF-OTHER'; }],
    ['scope', (task) => { task.scope = 'A different product capability'; }],
    ['stratum', (task) => { task.stratum = FROZEN_STRATA[1]; }],
    ['source_paths', (task) => { task.source_paths = ['retained/PF-OTHER/prd.md']; }],
    ['clarification_candidate', (task) => { task.clarification_candidate.status = 'assessed'; }],
    ['unknown field', (task) => { task.unexpected = true; }]
  ];
  for (const [label, update] of mutations) {
    await context.test(label, async (/** @type {any} */ childContext) => {
      const fixture = await createFixture(childContext);
      await updateTask(fixture, 0, update);
      await saveCatalog(fixture);

      const report = await validatePublicPilot(fixture.catalogPath);

      assert.equal(report.status, 'invalid');
      assert.equal(hasIssue(report.issues, 'TASK_CONTENT_BINDING_INVALID'), true);
    });
  }

  await context.test('malformed JSON', async (/** @type {any} */ childContext) => {
    const fixture = await createFixture(childContext);
    const item = fixture.catalog.items[0];
    const bytes = '{\n';
    await writeFile(path.join(fixture.root, item.task.path), bytes);
    item.task.sha256 = sha256(bytes);
    await saveCatalog(fixture);

    const report = await validatePublicPilot(fixture.catalogPath);

    assert.equal(report.status, 'invalid');
    assert.equal(hasIssue(report.issues, 'TASK_JSON_INVALID'), true);
  });
});

test('catalog task scopes must identify a product capability', async (context) => {
  for (const [label, scope] of [
    ['generic evidence class', 'public-source-machine-pilot'],
    ['stratum only', FROZEN_STRATA[0]],
    ['different bare stratum', FROZEN_STRATA[1]],
    ['blank', '   ']
  ]) {
    await context.test(label, async (/** @type {any} */ childContext) => {
      const fixture = await createFixture(childContext);
      fixture.catalog.items[0].task.scope = scope;
      await saveCatalog(fixture);

      const report = await validatePublicPilot(fixture.catalogPath);

      assert.equal(report.status, 'invalid');
      assert.equal(hasIssue(report.issues, 'TASK_SCOPE_INVALID'), true);
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
        await updateRetainedJson(fixture, fixture.catalog.defect_ledger, (ledger) => {
          ledger.leads[0].canonical_url = 'https://github.com/other-owner/other-product/issues/1';
        });
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
  const fixture = await createFixture(context, { perStratum: 4 });

  const report = await validatePublicPilot(fixture.catalogPath);

  assert.equal(report.status, 'pilot_incomplete');
  assert.equal(report.release_eligible, false);
  assert.equal(report.counts.by_stratum['time-window/quota/entitlement'], 4);
  assert.equal(hasIssue(report.issues, 'STRATUM_MINIMUM_NOT_MET'), true);
});

test('an unbound historical defect lead cannot be counted', async (context) => {
  const fixture = await createFixture(context);
  await updateRetainedJson(fixture, fixture.catalog.defect_ledger, (ledger) => {
    ledger.leads[0].countable = true;
  });
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
    ['countable lead', (defect) => { defect.countable = true; }, 'COUNTABLE_DEFECT_STATUS_INVALID'],
    ['bound lead', (defect) => { defect.bound_case_id = 'PF-01'; }, 'LEAD_DEFECT_BINDING_INVALID']
  ];
  for (const [label, update, code] of cases) {
    await context.test(label, async (/** @type {any} */ childContext) => {
      const fixture = await createFixture(childContext);
      await updateRetainedJson(fixture, fixture.catalog.defect_ledger, (ledger) => {
        update(ledger.leads[label === 'bound lead' ? 1 : 0]);
      });
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

test('RFC 3339 acquisition times enforce real calendar dates and leap years', async (context) => {
  for (const [value, expectedStatus] of [
    ['2026-02-29T00:00:00Z', 'invalid'],
    ['2026-02-31T00:00:00Z', 'invalid'],
    ['2026-04-31T23:59:59-07:00', 'invalid'],
    ['2028-02-29T00:00:00Z', 'pilot_ready'],
    ['2028-02-29T23:59:59+05:30', 'pilot_ready']
  ]) {
    await context.test(value, async (/** @type {any} */ childContext) => {
      const fixture = await createFixture(childContext);
      fixture.catalog.items[0].acquired_at = value;
      await updateProvenance(fixture, 0, (provenance) => {
        provenance.acquired_at = value;
      });
      await refreshTask4SnapshotBindings(fixture);
      await saveCatalog(fixture);

      const report = await validatePublicPilot(fixture.catalogPath);

      assert.equal(report.status, expectedStatus);
      assert.equal(hasIssue(report.issues, 'ACQUISITION_TIME_INVALID'), expectedStatus === 'invalid');
    });
  }
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
  const first = fixture.catalog.review_reports[0];
  const second = fixture.catalog.review_reports[1];
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
  fixture.catalog.review_reports[1].path = fixture.catalog.review_reports[0].path;
  fixture.catalog.review_reports[1].sha256 = fixture.catalog.review_reports[0].sha256;
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
