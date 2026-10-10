import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { prepareV4Source, validateV4SourcePackBeforeStaging } from '../../src/entry.mjs';
import { advanceStrict } from '../../src/advance-strict.mjs';
import { canonicalStringify, digest } from '../../src/canonical.mjs';
import { stageV4PrdCollectionObservation, loadV4SourceReadingSummary } from '../../src/prd-source-collection-v4.mjs';
import { createV4RunDirectory } from '../../src/run-bootstrap-v4.mjs';
import { stageV4SourceAcquisitionAction } from '../../src/source-acquisition-v4.mjs';
import { compileCanonicalSourceStructure } from '../../src/source-locators-v4.mjs';
import { canonicalizeSourceUrl, sourceByteDigest } from '../../src/source-canonicalization.mjs';
import { createCompilerSourceRuntimeV4 } from '../../src/source-runtime-registry-v4.mjs';
import { v4PipelineFixture } from '../helpers/v4-pipeline-fixture.mjs';
import { bindGeneralQualityFixture, v4GeneralQualityFixture } from '../helpers/v4-general-quality-fixture.mjs';

const encoder = new TextEncoder();
const metadata = {
  source_id: 'SRC-offline', kind: 'prd', version: '1', status: 'effective',
  authority: 'user supplied', domain: 'business'
};

/** @param {string} content @param {Record<string, any>} [changes] */
function prepare(content, changes = {}) {
  return prepareV4Source({
    metadata, raw_response_bytes: encoder.encode(content), capture_bytes: encoder.encode(content),
    assets: [], acquisition: {}, additional_units: [], ...changes
  });
}

test('public preparation reuses canonical text, Markdown and HTML table partitioning', () => {
  for (const content of [
    '# 订单\n- 提交后显示成功\n\n| 字段 | 值 |\n| --- | --- |\n| 状态 | 成功 |',
    '<h2>订单</h2><table><tr><th>字段</th><th>值</th></tr><tr><td>状态</td><td>成功</td></tr></table>'
  ]) {
    const prepared = prepare(content);
    assert.equal(prepared.status, 'prepared', JSON.stringify(prepared));
    assert.deepEqual(prepared.units, compileCanonicalSourceStructure(metadata.source_id, prepared.source.content));
    assert.deepEqual(prepared.source.semantic_projection.structure, prepared.units);
    assert.equal(prepared.review_units.length, prepared.units.length);
    assert.equal(prepared.review_units[0].unit_id, prepared.units[0].unit_id);
    assert.equal(prepared.collection.raw_response_digest, sourceByteDigest(encoder.encode(content)));
    assert.equal(prepared.collection.capture_digest, prepared.source.capture_digest);
  }
});

test('pre-staging rejects schema-valid invented IDs, wrong partition and dangling locator', () => {
  const pack = v4PipelineFixture().artifacts.source_pack;
  const valid = validateV4SourcePackBeforeStaging(pack);
  assert.equal(valid.status, 'valid', JSON.stringify(valid));
  for (const change of /** @type {Array<(candidate:any)=>void>} */ ([
    candidate => { candidate.sources[0].semantic_projection.structure[0].unit_id = 'SCOPE-U1'; },
    candidate => { candidate.sources[0].semantic_projection.structure[0].text = 'wrong partition'; },
    candidate => { candidate.locators[0].unit_id = 'SCOPE-U1'; },
    candidate => { candidate.locators[0].section_id = 'SCOPE-U1'; },
    candidate => { candidate.locators[0].excerpt = 'unbound text'; }
  ])) {
    const candidate = structuredClone(pack);
    change(candidate);
    assert.equal(validateV4SourcePackBeforeStaging(candidate).status, 'invalid');
  }
});

test('pre-staging detects an unlocated reviewed unit before topology discovery', () => {
  const pack = v4PipelineFixture().artifacts.source_pack;
  const original = pack.sources[0];
  const content = `${original.content}\n\n这是背景说明`;
  const bytes = encoder.encode(content);
  const prepared = prepareV4Source({
    metadata: Object.fromEntries(['source_id', 'kind', 'version', 'status', 'authority', 'title', 'scope', 'domain']
      .filter(key => original[key] !== undefined).map(key => [key, original[key]])),
    raw_response_bytes: bytes, capture_bytes: bytes, assets: [], acquisition: {}, additional_units: []
  });
  assert.equal(prepared.status, 'prepared');
  assert.equal(prepared.units.length, 2);
  pack.sources[0] = prepared.source;
  pack.source_reviews[0] = {
    source_id: original.source_id, semantic_digest: prepared.source.semantic_digest,
    units: prepared.review_units.map((/** @type {any} */ unit, /** @type {number} */ index) => ({
      ...unit, classification: index === 0 ? 'normative' : 'non_normative'
    }))
  };
  const first = prepared.units[0];
  pack.locators[0] = {
    ...pack.locators[0], semantic_digest: prepared.source.semantic_digest,
    unit_id: first.unit_id, section_id: first.section_id,
    range: { start: 0, end: Array.from(first.text).length },
    excerpt: first.text, excerpt_digest: sourceByteDigest(encoder.encode(first.text))
  };
  const missing = validateV4SourcePackBeforeStaging(pack);
  assert.equal(missing.status, 'invalid');
  assert.ok(missing.diagnostics.some((/** @type {any} */ item) => item.code === 'TOPOLOGY_SOURCE_BINDING_INVALID'));

  const second = prepared.units[1];
  pack.locators.push({
    ...pack.locators[0], locator_id: 'locator_background', unit_id: second.unit_id,
    section_id: second.section_id, range: { start: 0, end: Array.from(second.text).length },
    excerpt: second.text, excerpt_digest: sourceByteDigest(encoder.encode(second.text)),
    field_path: '/background'
  });
  assert.equal(validateV4SourcePackBeforeStaging(pack).status, 'valid');
});

test('preparation is deterministic and input is closed', () => {
  const first = prepare('\ufeff规则一\r\n规则二');
  const second = prepare('\ufeff规则一\r\n规则二');
  assert.equal(first.status, 'prepared');
  assert.deepEqual(first.source, second.source);
  assert.equal(first.source.content, '规则一\n规则二');
  assert.equal(prepare('规则', { unexpected: true }).status, 'source_diagnostic');
});

test('P14 Markdown URL labels remain text while only destinations are parsed as URLs', () => {
  for (const content of [
    '[https://example.com/page](https://example.com/page)',
    '[document](https://example.com/page), [https://example.com/other](https://example.com/other).'
  ]) {
    const result = prepare(content);
    assert.equal(result.status, 'prepared', JSON.stringify(result));
    assert.equal(result.source.content, content);
  }
});

test('P14 a credential-bearing URL label remains quarantined', () => {
  const signed = '[https://example.com/page?token=TEST_ONLY_SECRET](https://example.com/page)';
  const result = prepare(signed);
  assert.notEqual(result.status, 'prepared');
  assert.doesNotMatch(JSON.stringify(result), /TEST_ONLY_SECRET/u);
});

test('P14 escaped destinations, adjacent links and punctuation retain URL boundaries', () => {
  const content = '[a](https://example.com/a\\(b\\)),[b](https://example.com/b).';
  const result = prepare(content);
  assert.equal(result.status, 'prepared', JSON.stringify(result));
  assert.equal(result.source.content, '[a](https://example.com/a(b)),[b](https://example.com/b).');
});

test('P14 angle-bracket Markdown destination with balanced path parentheses is a URL, not an HTML tag', () => {
  const result = prepare('[规则](<https://example.com/a(b)>)');
  assert.equal(result.status, 'prepared', JSON.stringify(result));
  assert.equal(result.source.content, '[规则](<https://example.com/a(b)>)');
});

test('P14 bare URL does not absorb adjacent closing punctuation but keeps balanced path parentheses', () => {
  const result = prepare('说明（https://example.com/page）。另见 https://example.com/a(b)。');
  assert.equal(result.status, 'prepared', JSON.stringify(result));
  assert.equal(result.source.content,
    '说明（https://example.com/page）。另见 https://example.com/a(b)。');
});

test('actual Cooper attachment host removes only controlled signing keys', () => {
  const signed = 'https://s3-ep-inter.didistatic.com/doc/image.png?variant=cover&tag=a&X-Amz-Signature=TEST_ONLY_CANARY&tag=b';
  const result = prepare(`![流程](${signed})`, {
    assets: [{ retrieval_uri: signed, bytes: new Uint8Array([1, 2, 3]) }],
    acquisition: { provider: 'cooper', provider_contract_version: '1' }
  });
  assert.equal(result.status, 'prepared', JSON.stringify(result));
  assert.match(result.source.content, /variant=cover&tag=a&tag=b/u);
  assert.doesNotMatch(JSON.stringify(result), /TEST_ONLY_CANARY|X-Amz-Signature/u);
  assert.equal(result.source.semantic_projection.assets[0].asset_digest, sourceByteDigest(new Uint8Array([1, 2, 3])));
});

test('signatures rotate without changing semantic identity; ordinary query order and duplicate keys remain', () => {
  const base = 'https://s3-ep-inter.didistatic.com/doc/image.png?variant=cover&tag=a&tag=b';
  const first = prepare(`![图](${base}&X-Amz-Signature=TEST_ONLY_CANARY_1)`);
  const second = prepare(`![图](${base}&X-Amz-Signature=TEST_ONLY_CANARY_2)`);
  assert.equal(first.status, 'prepared');
  assert.equal(second.status, 'prepared');
  assert.equal(first.source.semantic_digest, second.source.semantic_digest);
  assert.notEqual(first.collection.capture_digest, second.collection.capture_digest);
  assert.match(first.source.content, /variant=cover&tag=a&tag=b/u);
  assert.notEqual(prepare(`![图](https://s3-ep-inter.didistatic.com/doc/image.png?tag=b&tag=a)`).source.semantic_digest,
    first.source.semantic_digest);
});

test('unknown credential keys and unregistered signed hosts remain quarantined', () => {
  for (const uri of [
    'https://s3-ep-inter.didistatic.com/doc/image.png?X-Amz-NewCredential=TEST_ONLY_CANARY',
    'https://unknown.example.invalid/doc/image.png?X-Amz-Signature=TEST_ONLY_CANARY'
  ]) {
    const result = prepare(`![图](${uri})`);
    assert.equal(result.status, 'need_artifact');
    assert.doesNotMatch(JSON.stringify(result), /TEST_ONLY_CANARY/u);
  }
});

test('historical source runtime keeps the old Cooper host contract', () => {
  const signed = 'https://s3-ep-inter.didistatic.com/doc/image.png?X-Amz-Signature=TEST_ONLY_CANARY';
  const oldRuntime = createCompilerSourceRuntimeV4('4.3.0');
  const newRuntime = createCompilerSourceRuntimeV4('4.3.1');
  assert.equal(oldRuntime.registry_version, 'source-runtime-v1');
  assert.equal(newRuntime.registry_version, 'source-runtime-v2');
  assert.equal(canonicalizeSourceUrl(signed, oldRuntime.provider_registry).status, 'need_artifact');
  assert.equal(canonicalizeSourceUrl(signed, newRuntime.provider_registry).status, 'canonical');
  assert.throws(() => createCompilerSourceRuntimeV4('4.9.0'), /SOURCE_RUNTIME_SCHEMA_UNSUPPORTED/u);
});

test('same safe asset identity with different bytes has a different content version', () => {
  const uri = 'https://s3-ep-inter.didistatic.com/doc/image.png?variant=cover';
  const one = prepare('图片见附件', { assets: [{ retrieval_uri: uri, bytes: new Uint8Array([1]) }] });
  const two = prepare('图片见附件', { assets: [{ retrieval_uri: uri, bytes: new Uint8Array([2]) }] });
  assert.equal(one.status, 'prepared');
  assert.equal(two.status, 'prepared');
  assert.equal(one.source.semantic_projection.assets[0].canonical_uri, two.source.semantic_projection.assets[0].canonical_uri);
  assert.notEqual(one.source.semantic_projection.assets[0].asset_digest, two.source.semantic_projection.assets[0].asset_digest);
  assert.notEqual(one.source.semantic_digest, two.source.semantic_digest);
  assert.equal(one.source.semantic_projection.structure.every((/** @type {any} */ unit) => unit.type !== 'image_region'), true,
    'download alone must not create a reviewed image region');
});

test('initial CLI request and safe source_assets enter existing pending and resume path', async () => {
  const catalog = await mkdtemp(path.join(os.tmpdir(), 'gtc-source-preparation-'));
  try {
    const directory = (await createV4RunDirectory(catalog, 'case_document')).run_directory;
    const initial = await advanceStrict(directory);
    assert.equal(initial.stage, 'source_pack');
    const fixture = v4GeneralQualityFixture('4.3.2');
    fixture.artifacts.evidence_claims.fact_ledger.push({
      ...structuredClone(fixture.artifacts.evidence_claims.fact_ledger[0]),
      fact_id: 'fact_checkout_context', statement: 'checkout 是订单验收的业务模块',
      acceptance_role: 'context_only'
    });
    fixture.artifacts.evidence_claims.fact_ledger.reverse();
    assert.equal(canonicalStringify({ facts: fixture.artifacts.evidence_claims.fact_ledger }),
      canonicalStringify({ facts: [...fixture.artifacts.evidence_claims.fact_ledger].reverse() }));
    bindGeneralQualityFixture(fixture, '4.3.2');
    const pack = fixture.artifacts.source_pack;
    pack.run_instance_id = initial.scope.run_instance_id;
    pack.schema_version = '4.3.2';
    pack.source_revision = initial.scope.source_revision;
    const source = pack.sources[0];
    const signed = 'https://s3-ep-inter.didistatic.com/doc/diagram.png?variant=cover&X-Amz-Signature=TEST_ONLY_CANARY';
    const safe = 'https://s3-ep-inter.didistatic.com/doc/diagram.png?variant=cover';
    const combinedContent = `${source.content}\n\n## 附注（非执行环境）\n` +
      '参考 [https://example.com/page](https://example.com/page)。\n\n' +
      '| 字段 | 示例 |\n| --- | --- |\n| 图示 | 非业务规则 |\n\n' +
      '评论：图示仅解释布局。\n\n回复：同意上述说明。';
    const capture = encoder.encode(`\ufeff${combinedContent.replace(/\n/gu, '\r\n')}`);
    const prepared = prepare(combinedContent, {
      metadata: Object.fromEntries(['source_id', 'kind', 'version', 'status', 'authority', 'title', 'scope', 'domain']
        .filter(key => source[key] !== undefined).map(key => [key, source[key]])),
      raw_response_bytes: encoder.encode(`{"image":"${signed}","body":"${combinedContent}"}`),
      capture_bytes: capture
    });
    assert.equal(prepared.status, 'prepared', JSON.stringify(prepared));
    pack.sources[0] = prepared.source;
    pack.locators[0].semantic_digest = prepared.source.semantic_digest;
    pack.source_reviews[0].semantic_digest = prepared.source.semantic_digest;
    pack.source_reviews[0].units = prepared.units.map((/** @type {any} */ unit, /** @type {number} */ index) => ({
      unit_id: unit.unit_id, content_digest: sourceByteDigest(encoder.encode(unit.text)),
      classification: index === 0 ? 'normative' : 'non_normative'
    }));
    for (const [index, unit] of prepared.units.entries()) {
      if (index === 0) continue;
      pack.locators.push({
        locator_id: `LOC-combined-${index}`, source_id: source.source_id,
        semantic_digest: prepared.source.semantic_digest,
        type: unit.type === 'table_cell' ? 'table_cell' : 'text_block_range',
        unit_id: unit.unit_id, excerpt: unit.text,
        excerpt_digest: sourceByteDigest(encoder.encode(unit.text)),
        domain: 'business', field_path: `/non_normative/${index}`,
        ...(unit.type === 'table_cell'
          ? { table_id: unit.table_id, row: unit.row, column: unit.column }
          : { section_id: unit.section_id, range: { start: 0, end: Array.from(unit.text).length } })
      });
    }
    pack.source_assets = [{
      asset_id: 'ASSET-diagram', source_id: source.source_id,
      locator_id: pack.locators[0].locator_id, status: 'unavailable',
      classification: 'uncertain', review_basis: {
        reviewer: 'operator', method: 'inspection', evidence: 'Referenced image has not been acquired'
      }, canonical_uri: safe
    }];
    const discovery = discoverV4Topology(pack);
    assert.deepEqual(discovery.topology_candidates.map((/** @type {any} */ item) => item.candidate_id),
      fixture.artifacts.evidence_claims.topology_discovery.topology_candidates.map(
        (/** @type {any} */ item) => item.candidate_id
      ));
    fixture.artifacts.evidence_claims.topology_discovery = discovery;
    fixture.artifacts.evidence_claims.topology_review = {
      ...fixture.artifacts.evidence_claims.topology_review,
      ...discovery.scanned_units
    };
    const tableUnits = prepared.units.filter((/** @type {any} */ unit) => unit.type === 'table_cell');
    const commentUnit = prepared.units.find((/** @type {any} */ unit) => unit.text.startsWith('评论：'));
    const replyUnit = prepared.units.find((/** @type {any} */ unit) => unit.text.startsWith('回复：'));
    assert.ok(commentUnit && replyUnit && tableUnits.length > 0);
    const bodyUnits = prepared.units.filter((/** @type {any} */ unit) =>
      unit.type !== 'table_cell' && unit.unit_id !== commentUnit.unit_id
        && unit.unit_id !== replyUnit.unit_id);
    await stageV4PrdCollectionObservation(directory, initial, {
      version: '1.0.0', scope: {
        mode: 'online_document', root_ref: 'cooper:document/offline-fixture',
        source_version: source.version,
        collection_window: { started_at: '2026-10-08T00:00:00.000Z', ended_at: '2026-10-08T00:00:01.000Z' }
      },
      channels: ['body', 'table', 'image', 'comment', 'reply'].map(channel => ({
        channel, enumeration_status: 'exhausted', page_count: 1,
        terminal_page_observed: true, diagnostic_code: null
      })),
      items: [
        { item_id: 'body', parent_item_id: null, channel: 'body', source_id: source.source_id,
          asset_id: null, unit_ids: bodyUnits.map((/** @type {any} */ unit) => unit.unit_id),
          acquisition_status: 'acquired',
          review_status: 'reviewed', unavailable_reason: null },
        { item_id: 'table', parent_item_id: null, channel: 'table', source_id: source.source_id,
          asset_id: null, unit_ids: tableUnits.map((/** @type {any} */ unit) => unit.unit_id),
          acquisition_status: 'acquired', review_status: 'reviewed', unavailable_reason: null },
        { item_id: 'image', parent_item_id: null, channel: 'image', source_id: source.source_id,
          asset_id: 'ASSET-diagram', unit_ids: [], acquisition_status: 'unavailable',
          review_status: 'unread', unavailable_reason: 'IMAGE_MATERIAL_PENDING' },
        { item_id: 'comment', parent_item_id: null, channel: 'comment', source_id: source.source_id,
          asset_id: null, unit_ids: [commentUnit.unit_id], acquisition_status: 'acquired',
          review_status: 'reviewed', unavailable_reason: null },
        { item_id: 'reply', parent_item_id: 'comment', channel: 'reply', source_id: source.source_id,
          asset_id: null, unit_ids: [replyUnit.unit_id], acquisition_status: 'acquired',
          review_status: 'reviewed', unavailable_reason: null }
      ]
    }, ['body', 'table', 'comment', 'reply'].map(item_id => ({
      item_id, raw_response_bytes: encoder.encode(`{"image":"${signed}","channel":"${item_id}"}`),
      capture_bytes: capture
    })));
    await mkdir(path.join(directory, 'staging'), { recursive: true });
    await writeFile(path.join(directory, 'staging/source-pack.json'), `${canonicalStringify(pack)}\n`);
    const pending = await advanceStrict(directory);
    assert.equal(pending.status, 'need_artifact', JSON.stringify(pending));
    assert.doesNotMatch(JSON.stringify(pending), /TEST_ONLY_CANARY/u);
    assert.equal(pending.incomplete_reason.code, 'SOURCE_ASSET_UNAVAILABLE');
    assert.equal(pending.artifact_requests.length, 1);
    const image = Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/GZkAAAAASUVORK5CYII=', 'base64'));
    const changed = structuredClone(pack);
    changed.sources[0].title = '同身份下不同来源';
    await assert.rejects(stageV4SourceAcquisitionAction(directory, pending, changed, [{
      artifact_request_id: pending.artifact_requests[0].artifact_request_id,
      input: { kind: 'safe_upload_ref', upload_id: 'UPLOAD-offline-diagram', media_type: 'image/png',
        byte_length: image.byteLength, content_digest: sourceByteDigest(image) },
      material: image
    }]), /ARTIFACT_SOURCE_CANDIDATE_INVALID/u);
    await stageV4SourceAcquisitionAction(directory, pending, pack, [{
      artifact_request_id: pending.artifact_requests[0].artifact_request_id,
      input: { kind: 'safe_upload_ref', upload_id: 'UPLOAD-offline-diagram', media_type: 'image/png',
        byte_length: image.byteLength, content_digest: sourceByteDigest(image) },
      material: image, asset_review: {
        classification: 'non_normative', review_basis: {
          reviewer: 'offline fixture author', method: 'inspection', evidence: 'Single transparent pixel carries no business rule'
        }
      }
    }]);
    const runner = fileURLToPath(new URL('../../skill/generate-test-cases/scripts/test-compiler.mjs', import.meta.url));
    const restarted = await new Promise((resolve, reject) => {
      const child = spawn(process.execPath, [runner, directory]);
      let stdout = ''; let stderr = '';
      child.stdout.setEncoding('utf8');
      child.stderr.setEncoding('utf8');
      child.stdout.on('data', (/** @type {string} */ chunk) => { stdout += chunk; });
      child.stderr.on('data', (/** @type {string} */ chunk) => { stderr += chunk; });
      child.on('error', reject);
      child.on('close', (/** @type {number|null} */ code) => resolve({ code, stdout, stderr }));
    });
    assert.equal(restarted.code, 0, restarted.stderr);
    assert.doesNotMatch(restarted.stdout + restarted.stderr, /TEST_ONLY_CANARY/u);
    const resumed = JSON.parse(restarted.stdout);
    assert.equal(resumed.stage, 'evidence_claims', JSON.stringify(resumed));
    assert.doesNotMatch(JSON.stringify(resumed), /TEST_ONLY_CANARY/u);
    let final = resumed;
    for (const stage of ['evidence_claims', 'behavior_views', 'case_drafts']) {
      await writeFile(path.join(directory, `staging/${stage.replaceAll('_', '-')}.json`),
        `${canonicalStringify(fixture.artifacts[stage])}\n`);
      final = await advanceStrict(directory);
    }
    assert.equal(final.status, 'finished', JSON.stringify(final));
    const manifest = JSON.parse(await readFile(path.join(directory, 'output/current.json'), 'utf8'));
    assert.equal(manifest.schema_version, '4.3.2');
    assert.ok(manifest.source_reading?.path);
    const reading = JSON.parse(await readFile(path.join(directory, manifest.source_reading.path), 'utf8'));
    assert.equal(reading.status, 'complete_within_scope');
    assert.deepEqual(reading.items.map((/** @type {any} */ item) => item.channel),
      ['body', 'table', 'image', 'comment', 'reply']);
    assert.equal(reading.items.find((/** @type {any} */ item) => item.channel === 'reply').parent_item_id,
      'comment');
    const accepted = JSON.parse(await readFile(path.join(directory, 'accepted/r000/source-pack.json'), 'utf8'));
    const statePath = path.join(directory, 'derived/source-acquisition.json');
    const beforeRead = await readFile(statePath, 'utf8');
    assert.deepEqual(await loadV4SourceReadingSummary(directory, accepted), reading);
    assert.equal(await readFile(statePath, 'utf8'), beforeRead);
    const clarified = structuredClone(accepted);
    clarified.source_revision = 1;
    clarified.sources[0].semantic_projection.structure.push({
      unit_id: 'UNIT-test-answer', type: 'user_statement', text: '仅用于版本绑定的测试确认',
      presentation_id: 'PRES-test-answer', message_digest: sourceByteDigest(encoder.encode('仅用于版本绑定的测试确认')),
      answer_span: { start: 0, end: Array.from('仅用于版本绑定的测试确认').length }
    });
    clarified.sources[0].semantic_digest = `sha256:${digest(clarified.sources[0].semantic_projection)}`;
    assert.deepEqual(await loadV4SourceReadingSummary(directory, clarified), reading);
    const tampered = structuredClone(accepted);
    tampered.sources[0].semantic_projection.content = '改写后的正文';
    await assert.rejects(loadV4SourceReadingSummary(directory, tampered), /SOURCE_READING_BINDING_INVALID/u);
    const repeated = await advanceStrict(directory);
    assert.equal(repeated.status, 'finished');
    /** @param {string} root @returns {Promise<string[]>} */
    async function storedFiles(root) {
      const result = [];
      for (const item of await readdir(root, { withFileTypes: true })) {
        const file = path.join(root, item.name);
        if (item.isDirectory()) result.push(...await storedFiles(file));
        else if (item.isFile()) result.push(file);
      }
      return result;
    }
    for (const file of await storedFiles(directory)) {
      assert.doesNotMatch(await readFile(file, 'utf8'), /TEST_ONLY_CANARY/u, file);
    }
  } finally {
    await rm(catalog, { recursive: true, force: true });
  }
});
