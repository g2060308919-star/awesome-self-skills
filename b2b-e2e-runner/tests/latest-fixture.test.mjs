import assert from 'node:assert/strict';
import test from 'node:test';
import sharp from 'sharp';
import { JSDOM } from 'jsdom';
import { readFile } from 'node:fs/promises';
import { startLatestWorkflowFixture } from './fixtures/latest-workflow-server.mjs';

async function fixture(t) {
  const app = await startLatestWorkflowFixture({ port: 0 });
  t.after(() => app.close());
  const request = async (route, body, cookie = 'fixture-role=admin') => {
    const response = await fetch(app.url + route, { method: body === undefined ? 'GET' : 'POST', headers: { cookie, 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: response.status, body: await response.json() };
  };
  return { app, request };
}

async function png(width, height, bytes = 100000) {
  const data = await sharp({ create: { width, height, channels: 3, background: '#3780a0' } }).png().toBuffer();
  // PNG decoders permit trailing bytes; this is only fixture input, never screenshot evidence.
  return Buffer.concat([data, Buffer.alloc(Math.max(0, bytes - data.length))]).toString('base64');
}

test('fixture rejects wrong dimensions and oversized actual images, preserves upload/save separation', async t => {
  const { app, request } = await fixture(t);
  assert.equal((await request('/api/uploads', { image: await png(750, 360) })).status, 422);
  assert.equal((await request('/api/uploads', { image: await png(750, 600, 4000000) })).status, 422);
  assert.equal((await request('/api/uploads', { image: Buffer.from('not png').toString('base64') })).status, 422);
  const uploaded = await request('/api/uploads', { image: await png(750, 600) });
  assert.equal(uploaded.status, 201);
  assert.deepEqual(uploaded.body.image, { width: 750, height: 600, bytes: 100000 });
  assert.equal((await request('/api/records')).body.records.length, 1);
  const record = await request('/api/records', { name: 'Independent ID', date: '2030-10-27', uploadId: uploaded.body.uploadId });
  assert.equal(record.status, 201);
  assert.match(record.body.id, /^real-/);
  assert.deepEqual((await request('/api/records/' + record.body.id)).body, record.body);
  assert.equal((await request('/api/records')).body.records.length, 2);
  assert.equal(app.snapshot().counts['POST /api/records'], 1);
});

test('fixture enforces role, committed date and known upload, records real upstream mock writes', async t => {
  const { app, request } = await fixture(t);
  assert.equal((await request('/api/records', {}, '')).status, 401);
  assert.equal((await request('/api/records', {}, 'fixture-role=user')).status, 403);
  assert.equal((await request('/api/records', { name: 'A', date: '2030-02-30', uploadId: 'missing' })).status, 422);
  assert.equal((await request('/api/records', { name: 'A', date: '2030-02-28', uploadId: 'missing' })).status, 422);
  const created = await request('/api/mock/create', { name: 'Mock draft' });
  assert.equal(created.body.name, 'Mock draft');
  assert.deepEqual((await request('/api/mock/read')).body, created.body);
  assert.equal((await request('/api/mock/update', { name: 'Mock updated' })).body.name, 'Mock updated');
  assert.equal((await request('/api/mock/read')).body.name, 'Mock updated');
  assert.equal((await request('/api/mock/unknown', {})).status, 409);
  assert.equal(app.snapshot().counts['POST /api/mock/create'], 1);
  assert.equal(app.snapshot().counts['POST /api/mock/update'], 1);
  assert.equal(app.snapshot().counts['POST /api/mock/unknown'], 1);
  const disk = JSON.parse(await readFile(app.observationFile, 'utf8'));
  assert.deepEqual(disk, app.snapshot());
});

test('fixture failure and lost-response controls distinguish a committed write from a failed one', async t => {
  const { app, request } = await fixture(t);
  app.setFault('/api/mock/create', { status: 503 });
  assert.equal((await request('/api/mock/create', { name: 'Mock draft' })).status, 503);
  assert.equal((await request('/api/mock/read')).status, 404);
  app.setFault('/api/mock/create', { disconnectAfterCommit: true });
  await assert.rejects(request('/api/mock/create', { name: 'Lost response' }));
  assert.equal((await request('/api/mock/read')).body.name, 'Lost response');
});

test('fixture controls require date confirmation, upload then save, and render actual server record detail', async t => {
  const { app } = await fixture(t);
  const dom = await JSDOM.fromURL(app.url, { runScripts: 'dangerously', resources: 'usable', beforeParse(window) {
    window.fetch = (route, options = {}) => fetch(new URL(route, app.url), { ...options, headers: { ...options.headers, cookie: 'fixture-role=admin' } });
  } });
  t.after(() => dom.window.close());
  await new Promise(resolve => dom.window.addEventListener('load', resolve));
  const { document, Event } = dom.window;
  const visibleText = (id, text) => new Promise(resolve => {
    const element = document.getElementById(id);
    const matches = () => typeof text === 'function' ? text(element.textContent) : element.textContent === text;
    if (matches()) return resolve();
    const observer = new dom.window.MutationObserver(() => { if (matches()) { observer.disconnect(); resolve(); } });
    observer.observe(element, { childList: true, subtree: true, characterData: true });
  });
  await visibleText('identity', 'Signed in: admin');
  const title = document.querySelector('#record-name');
  title.value = 'Changed title'; title.dispatchEvent(new Event('input')); title.dispatchEvent(new Event('blur'));
  assert.equal(document.querySelector('#name-readback').textContent, 'Changed title');
  const date = document.querySelector('#record-date');
  date.value = '2030-10-27'; date.dispatchEvent(new Event('input')); date.dispatchEvent(new Event('blur'));
  assert.equal(date.value, '');
  assert.equal(document.querySelector('#date-readback').textContent, 'Not confirmed');
  date.value = '2030-10-27'; date.dispatchEvent(new Event('input'));
  document.querySelector('#confirm-date').click();
  await visibleText('date-readback', '2030-10-27');
  date.dispatchEvent(new Event('blur'));
  assert.equal(date.value, '2030-10-27');
  assert.equal(document.querySelector('#date-readback').textContent, '2030-10-27');
  assert.equal(document.querySelector('#upload-stage').textContent, 'No file selected');
  assert.equal(document.querySelector('#save-stage').textContent, 'Not saved');
  const image = new dom.window.File([Buffer.from(await png(750, 600), 'base64')], 'preparation.png', { type: 'image/png' });
  const fileInput = document.querySelector('#record-image');
  Object.defineProperty(fileInput, 'files', { value: [image] });
  fileInput.dispatchEvent(new Event('change'));
  assert.equal(document.querySelector('#upload-stage').textContent, 'Selected: preparation.png; 100000 bytes; not uploaded');
  assert.equal(app.snapshot().counts['POST /api/uploads'], undefined);
  document.querySelector('#upload').click();
  await visibleText('upload-stage', 'Uploaded: 750×600, 100000 bytes; not saved');
  assert.equal(app.snapshot().counts['POST /api/records'], undefined);
  document.querySelector('#save').click();
  await visibleText('save-stage', text => text.startsWith('Saved real record ID: real-'));
  await visibleText('records', text => text.includes('Changed title'));
  const open = [...document.querySelectorAll('#records button')].find(button => button.textContent.includes('Changed title'));
  open.click();
  await visibleText('detail', text => text.includes('Changed title'));
  const detail = JSON.parse(document.querySelector('#detail').textContent);
  assert.equal(detail.date, '2030-10-27');
  assert.equal(detail.image.bytes, 100000);
  assert.equal(app.snapshot().counts['POST /api/records'], 1);
  document.querySelector('#fault-mode').value = 'fail-date';
  document.querySelector('#apply-fault').click();
  await visibleText('fault-result', 'fail-date');
  date.value = '2031-10-27';
  document.querySelector('#confirm-date').click();
  await visibleText('status', '422: Controlled fixture failure');
  assert.equal(document.querySelector('#date-readback').textContent, '2030-10-27');
});
