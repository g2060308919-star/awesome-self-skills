/** Local non-production acceptance fixture. Routes/fields are defined here, not inferred from any real product. */
import http from 'node:http';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

function validDate(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
}
async function readBody(request) {
  const chunks = []; let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 6000000) throw new Error('Fixture body exceeds 6000000 bytes');
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString() || '{}');
}

export async function startLatestWorkflowFixture({ port = 0 } = {}) {
  const root = mkdtempSync(path.join(os.tmpdir(), 'runner-latest-fixture-'));
  const observationFile = path.join(root, 'observation.json');
  const uploads = new Map();
  const records = [{ id: 'real-expired-seed', name: 'Expired seed', date: '2000-01-01', status: 'expired' }];
  const counts = {}; const faults = new Map(); let mockRecord = null;
  const snapshot = () => structuredClone({ counts, records, mockRecord, uploadCount: uploads.size });
  const persist = () => { writeFileSync(observationFile + '.tmp', JSON.stringify(snapshot(), null, 2), { mode: 0o600 }); renameSync(observationFile + '.tmp', observationFile); };
  persist();
  const server = http.createServer(async (request, response) => {
    const url = new URL(request.url, 'http://127.0.0.1');
    const route = url.pathname;
    const configuredFault = faults.get(route);
    const fault = request.method === (configuredFault?.method || 'POST') ? configuredFault : null;
    const send = (status, body, headers = {}) => {
      persist();
      if (fault?.disconnectAfterCommit && status >= 200 && status < 300) { request.socket.destroy(); return; }
      response.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store', ...headers });
      response.end(JSON.stringify(body));
    };
    try {
      if (route === '/' || route === '/latest-client.js') {
        response.writeHead(200, { 'content-type': route === '/' ? 'text/html; charset=utf-8' : 'text/javascript', 'cache-control': 'no-store' });
        response.end(readFileSync(new URL(route === '/' ? './latest-page.html' : './latest-client.js', import.meta.url))); return;
      }
      if (route === '/fixture-worker.js' || route === '/fixture-sw.js') {
        response.writeHead(200, { 'content-type': 'text/javascript', 'service-worker-allowed': '/' });
        response.end(route === '/fixture-worker.js' ? `self.onmessage=async e=>{try{const r=await fetch(e.data==='business'?'/api/mock/read':'/fixture-probe?channel=worker');self.postMessage({status:r.status,body:await r.json()})}catch(e){self.postMessage({error:e.message})}};` : `self.addEventListener('install',()=>self.skipWaiting());self.addEventListener('activate',e=>e.waitUntil(self.clients.claim()));self.addEventListener('message',e=>e.waitUntil((async()=>{try{const r=await fetch(e.data==='business'?'/api/mock/read':'/fixture-probe?channel=service-worker');e.source.postMessage({channel:'service-worker',status:r.status,body:await r.json()})}catch(error){e.source.postMessage({error:error.message})}})()));`); return;
      }
      if (route === '/favicon.ico') { response.writeHead(204); response.end(); return; }
      counts[request.method + ' ' + route] = (counts[request.method + ' ' + route] || 0) + 1;
      persist();
      if (fault?.delayMs) await new Promise(resolve => setTimeout(resolve, fault.delayMs));
      if (fault?.status) return send(fault.status, { error: 'Controlled fixture failure' });
      if (route === '/fixture-probe' && request.method === 'GET') return send(200, { safe: true, channel: url.searchParams.get('channel') || 'page', source: 'real-fixture' });
      if (route === '/fixture-control' && request.method === 'POST') {
        const body = await readBody(request);
        if (!['normal', 'fail-date', 'fail-save', 'delay-save', 'lost-response'].includes(body.mode)) return send(422, { error: 'Unknown fixture mode' });
        faults.delete('/api/records'); faults.delete('/api/confirm-date');
        if (body.mode === 'fail-date') faults.set('/api/confirm-date', { status: 422 });
        if (body.mode === 'fail-save') faults.set('/api/records', { status: 503 });
        if (body.mode === 'delay-save') faults.set('/api/records', { delayMs: 2500 });
        if (body.mode === 'lost-response') faults.set('/api/records', { disconnectAfterCommit: true });
        return send(200, { mode: body.mode });
      }
      if (route === '/fixture-session' && request.method === 'POST') {
        const { role } = await readBody(request);
        if (!['admin', 'user'].includes(role)) return send(422, { error: 'Choose admin or user' });
        return send(200, { role }, { 'set-cookie': `fixture-role=${role}; HttpOnly; SameSite=Strict; Path=/` });
      }
      const role = /(?:^|;\s*)fixture-role=(admin|user)(?:;|$)/.exec(request.headers.cookie || '')?.[1];
      if (route === '/fixture-session' && request.method === 'GET') return send(200, { role: role || null });
      if (!role) return send(401, { error: 'Select a fixture role first' });
      if (request.method === 'POST' && role !== 'admin') return send(403, { error: 'Administrator role required for real write' });
      if (route === '/api/confirm-date' && request.method === 'POST') {
        const { date } = await readBody(request);
        return validDate(date) ? send(200, { date }) : send(422, { error: 'Use a real YYYY-MM-DD date' });
      }
      if (route === '/api/uploads' && request.method === 'POST') {
        const body = await readBody(request);
        const bytes = Buffer.from(typeof body.image === 'string' ? body.image : '', 'base64');
        if (bytes.length > 200000) return send(422, { error: 'PNG must be at most 200000 bytes', bytes: bytes.length });
        let metadata;
        try { metadata = await sharp(bytes, { limitInputPixels: 1000000 }).metadata(); await sharp(bytes).raw().toBuffer(); }
        catch { return send(422, { error: 'A valid PNG image is required' }); }
        if (metadata.format !== 'png' || metadata.width !== 750 || metadata.height !== 600) return send(422, { error: 'PNG dimensions must be 750×600', width: metadata.width, height: metadata.height });
        const uploadId = 'upload-' + randomUUID();
        const image = { width: metadata.width, height: metadata.height, bytes: bytes.length };
        uploads.set(uploadId, image); return send(201, { uploadId, image });
      }
      if (route === '/api/records' && request.method === 'GET') return send(200, { records });
      if (route === '/api/records' && request.method === 'POST') {
        const body = await readBody(request);
        if (typeof body.name !== 'string' || !body.name.trim() || !validDate(body.date) || !uploads.has(body.uploadId)) return send(422, { error: 'Confirmed name/date and successful upload required' });
        const record = { id: 'real-' + randomUUID(), name: body.name, date: body.date, image: uploads.get(body.uploadId), status: 'saved' };
        records.push(record); return send(201, record);
      }
      if (route.startsWith('/api/records/') && request.method === 'GET') {
        const record = records.find(item => item.id === route.slice('/api/records/'.length));
        return record ? send(200, record) : send(404, { error: 'Record not found' });
      }
      if (route === '/api/mock/create' && request.method === 'POST') {
        const body = await readBody(request);
        if (typeof body.name !== 'string' || Object.keys(body).length !== 1) return send(422, { error: 'Exactly one string name required' });
        mockRecord = { id: 'real-mock-' + randomUUID(), name: body.name, status: 'draft' }; return send(201, mockRecord);
      }
      if (route === '/api/mock/read' && request.method === 'GET') return mockRecord ? send(200, mockRecord) : send(404, { error: 'No record' });
      if (route === '/api/mock/update' && request.method === 'POST') {
        const body = await readBody(request);
        if (!mockRecord) return send(404, { error: 'No record' });
        if (typeof body.name !== 'string' || Object.keys(body).length !== 1) return send(422, { error: 'Exactly one string name required' });
        mockRecord = { ...mockRecord, name: body.name }; return send(200, mockRecord);
      }
      return send(409, { error: 'Unknown fixture business route reached real upstream' });
    } catch { if (!response.headersSent && !response.destroyed) send(400, { error: 'Invalid fixture request' }); }
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve); });
  return { url: `http://127.0.0.1:${server.address().port}`, observationFile, snapshot, setFault(route, fault) { if (fault) faults.set(route, fault); else faults.delete(route); }, async close() { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); rmSync(root, { recursive: true, force: true }); } };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const fixture = await startLatestWorkflowFixture({ port: Number(process.argv[2] || 0) });
  process.stdout.write(JSON.stringify({ url: fixture.url, observationFile: fixture.observationFile }) + '\n');
  const stop = async () => { await fixture.close(); process.exit(0); };
  process.once('SIGINT', stop); process.once('SIGTERM', stop);
}
