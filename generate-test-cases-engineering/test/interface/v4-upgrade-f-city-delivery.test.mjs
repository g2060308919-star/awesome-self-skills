// @ts-nocheck -- Integration assertions narrow runtime reply and canonical bundle unions.
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { advanceStrict, createV4RunDirectory } from '../../src/entry.mjs';
import { canonicalStringify } from '../../src/canonical.mjs';
import { fCityJourneyFixture } from '../fixtures/v4-upgrade/f-city/journey-fixture.mjs';
import {
  assertFCityBusinessProjection, projectFCityCanonicalDelivery
} from '../helpers/v4-upgrade-business-truth.mjs';

const truth = JSON.parse(await readFile(
  new URL('../fixtures/v4-upgrade/f-city/business-truth.json', import.meta.url), 'utf8'
));

async function stage(directory, filename, value) {
  await mkdir(path.join(directory, 'staging'), { recursive: true });
  await writeFile(path.join(directory, 'staging', `${filename}.json`), `${canonicalStringify(value)}\n`);
}

async function deliveredFCity() {
  const catalog = await mkdtemp(path.join(os.tmpdir(), 'gtc-v4-f-city-'));
  const created = await createV4RunDirectory(catalog, 'case_document');
  const fixture = await fCityJourneyFixture(created.run_id);
  const stages = [
    ['source-pack', fixture.artifacts.source_pack],
    ['evidence-claims', fixture.artifacts.evidence_claims],
    ['behavior-views', fixture.artifacts.behavior_views],
    ['case-drafts', fixture.artifacts.case_drafts]
  ];
  const replies = [];
  for (const [filename, value] of stages) {
    await stage(created.run_directory, filename, value);
    replies.push(await advanceStrict(created.run_directory));
  }
  const finished = replies.at(-1);
  assert.equal(finished.status, 'finished', JSON.stringify(finished));
  const manifest = JSON.parse(await readFile(path.join(created.run_directory, 'output/current.json'), 'utf8'));
  const json = await readFile(path.join(created.run_directory, manifest.bundle.path), 'utf8');
  const markdown = await readFile(path.join(created.run_directory, manifest.markdown.path), 'utf8');
  const csv = await readFile(path.join(created.run_directory, manifest.execution_worksheet.path), 'utf8');
  return {
    catalog, directory: created.run_directory, replies, manifest,
    bundle: JSON.parse(json), outputs: { json, markdown, csv }
  };
}

test('T04/T05 AT21/26/29/31/38 actual F-CITY delivery passes independent business truth', { timeout: 60_000 }, async () => {
  const run = await deliveredFCity();
  try {
    assert.deepEqual(run.replies.map((reply) => reply.status), [
      'need_revision', 'need_revision', 'need_revision', 'finished'
    ]);
    assert.ok(run.replies.every((reply) => reply.status !== 'need_artifact'),
      'manual Case generation must not require URL, account, selector, API, or live data');
    assert.equal(run.manifest.case_count, 21);
    const projection = projectFCityCanonicalDelivery(run.bundle, run.outputs);
    assert.doesNotThrow(() => assertFCityBusinessProjection(projection, truth));
    assert.equal(projection.score_instances.length, 6);
    assert.equal(projection.column_rules.length, 8);
    assert.equal(projection.authority.length, 2);
  } finally {
    await rm(run.catalog, { recursive: true, force: true });
  }
});

test('T04/T05 AT27/AT31 actual-output projection rejects legal-shape score and permission omissions', { timeout: 60_000 }, async () => {
  const run = await deliveredFCity();
  try {
    const missingSix = structuredClone(run.bundle);
    missingSix.cases = missingSix.cases.filter((item) => !(
      item.fact_ids.includes('FACT-score')
      && item.data_conditions.some((entry) => entry.description === 'star_level=6')
    ));
    const missingSixText = canonicalStringify(missingSix);
    const scoreProjection = projectFCityCanonicalDelivery(missingSix, {
      ...run.outputs, json: missingSixText
    });
    assert.throws(() => assertFCityBusinessProjection(scoreProjection, truth), /score instance: 6/u);

    const missingDenial = structuredClone(run.bundle);
    missingDenial.cases = missingDenial.cases.filter((item) =>
      !item.fact_ids.includes('FACT-permission-ordinary'));
    const denialProjection = projectFCityCanonicalDelivery(missingDenial, {
      ...run.outputs, json: canonicalStringify(missingDenial)
    });
    assert.throws(() => assertFCityBusinessProjection(denialProjection, truth),
      /permission\.ordinary\.negative_report|ordinary-user denial/u);
  } finally {
    await rm(run.catalog, { recursive: true, force: true });
  }
});

test('T04 AT38 actual Markdown condition loss fails same-source official projection', { timeout: 60_000 }, async () => {
  const run = await deliveredFCity();
  try {
    const damaged = run.outputs.markdown.replaceAll('star\\_level=6', '');
    const projection = projectFCityCanonicalDelivery(run.bundle, {
      ...run.outputs, markdown: damaged
    });
    assert.throws(() => assertFCityBusinessProjection(projection, truth), /markdown is not a complete projection/u);
  } finally {
    await rm(run.catalog, { recursive: true, force: true });
  }
});
