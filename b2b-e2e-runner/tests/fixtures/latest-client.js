/* Local non-production UI fixture. All business actions use visible semantic controls. */
(() => {
  const $ = id => document.getElementById(id);
  let name = '', date = '', uploadId = null, worker = null, registration = null, conditionalAction = 0;
  let environmentReady = !new URL(location.href).searchParams.has('environment');
  const request = async (route, body) => {
    const response = await fetch(route, { method: body === undefined ? 'GET' : 'POST', headers: { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
    const value = await response.json();
    if (!response.ok) throw new Error(`${response.status}: ${value.error || JSON.stringify(value)}`);
    return value;
  };
  const action = (id, callback) => $(id).addEventListener('click', async () => { try { await callback(); $('status').textContent = 'Action completed'; } catch (error) { $('status').textContent = error.message; } });
  function identity(value) { $('identity').textContent = value.role ? `Signed in: ${value.role}` : 'Not signed in'; $('workspace').hidden = !value.role; }
  async function initializeEnvironment() {
    if (environmentReady) return;
    $('login').disabled = true;
    const response = await fetch('/environment-config');
    const body = await response.json();
    environmentReady = response.ok && response.headers.get('x-fixture-response') === 'ready' && body.loginEnabled === true && body.deployment === 'local-approved';
    $('environment-status').textContent = environmentReady ? 'Environment access ready: request header, response header and body accepted' : 'Environment access blocked';
    $('login').disabled = !environmentReady;
  }
  initializeEnvironment().then(() => request('/fixture-session')).then(identity).catch(error => { $('status').textContent = error.message; });
  action('login', async () => { if (!environmentReady) throw new Error('Environment access blocked'); identity(await request('/fixture-session', { role: $('role').value })); await list(); });
  action('permission-load', async () => {
    const value = await request('/api/frontend-permissions');
    if (typeof value.canApprove !== 'boolean') throw new Error('Invalid frontend permission contract');
    $('permission-approve').hidden = !value.canApprove;
    $('permission-status').textContent = `Frontend approve permission: ${value.canApprove ? 'available' : 'unavailable'}; input source: ${value.source}`;
  });
  action('permission-approve', async () => { $('permission-result').textContent = JSON.stringify(await request('/api/frontend-approve', {})); });
  $('conditional-missing-dispatch').addEventListener('change', () => { $('conditional-fault').textContent = `Missing-dispatch defect ${$('conditional-missing-dispatch').checked ? 'enabled' : 'disabled'}`; });
  action('conditional-submit', async () => {
    const current = ++conditionalAction; const value = $('conditional-name').value.trim();
    if (!value) { $('conditional-result').textContent = `Conditional action ${current} complete: Name is required; no request dispatched`; return; }
    if ($('conditional-missing-dispatch').checked) { $('conditional-result').textContent = `Conditional action ${current} complete: Valid name accepted; handler ended without dispatch`; return; }
    try { const result = await request('/api/conditional', { name: value }); $('conditional-result').textContent = `Conditional action ${current} complete: ${JSON.stringify(result)}`; }
    catch (error) { $('conditional-result').textContent = `Conditional action ${current} complete: ${error.message}`; throw error; }
  });
  $('record-name').addEventListener('blur', () => { name = $('record-name').value; $('name-readback').textContent = name || 'Not committed'; });
  $('record-date').addEventListener('blur', event => { if (event.relatedTarget !== $('confirm-date')) $('record-date').value = date; });
  action('confirm-date', async () => {
    const proposed = $('record-date').value;
    // Confirmation is visible immediately only after the server accepts the actual value.
    const confirmed = await request('/api/confirm-date', { date: proposed });
    date = confirmed.date; $('record-date').value = date; $('date-readback').textContent = date;
  });
  $('record-image').addEventListener('change', () => { uploadId = null; const file = $('record-image').files[0]; $('upload-stage').textContent = file ? `Selected: ${file.name}; ${file.size} bytes; not uploaded` : 'No file selected'; });
  action('upload', async () => {
    const file = $('record-image').files[0]; if (!file) throw new Error('Select an image first');
    const image = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result).split(',')[1]); reader.onerror = reject; reader.readAsDataURL(file); });
    try { const result = await request('/api/uploads', { image }); uploadId = result.uploadId; $('upload-stage').textContent = `Uploaded: ${result.image.width}×${result.image.height}, ${result.image.bytes} bytes; not saved`; }
    catch (error) { uploadId = null; $('upload-stage').textContent = `Upload rejected: ${error.message}`; throw error; }
  });
  async function list() {
    const result = await request('/api/records'); $('records').replaceChildren();
    for (const record of result.records) {
      const row = document.createElement('li'); const button = document.createElement('button');
      button.textContent = `Open ${record.id} ${record.name}`;
      button.addEventListener('click', async () => { try { $('detail').textContent = JSON.stringify(await request('/api/records/' + encodeURIComponent(record.id)), null, 2); } catch (error) { $('status').textContent = error.message; } });
      row.append(button); $('records').append(row);
    }
  }
  action('refresh', list);
  action('save', async () => {
    if (!name || !date || !uploadId) throw new Error('Complete committed name, confirmed date, and upload before saving');
    const result = await request('/api/records', { name, date, uploadId }); $('save-stage').textContent = `Saved real record ID: ${result.id}`; await list();
  });
  async function mock(route, body) { try { const value = await request('/api/mock/' + route, body); $('mock-result').textContent = JSON.stringify(value, null, 2); return value; } catch (error) { $('mock-result').textContent = error.message; throw error; } }
  action('mock-create', () => mock('create', { name: 'Mock draft' }));
  action('mock-read', () => mock('read'));
  action('mock-update', () => mock('update', { name: 'Mock updated' }));
  action('mock-double', async () => { const first = await mock('create', { name: 'Mock draft' }); const second = await mock('create', { name: 'Mock draft' }); $('mock-result').textContent = JSON.stringify({ first, second }, null, 2); });
  action('mock-unclassified-get', async () => { try { await mock('unsafe-get'); } catch (error) { $('mock-result').textContent = `unsafe-get: ${error.message}`; throw error; } });
  action('mock-unknown', () => mock('unknown', {}));
  action('mock-extra', () => mock('create', { name: 'Mock draft', undeclared: true }));
  action('mock-type', () => mock('create', { name: 123 }));
  const channelResult = value => { $('probe-result').textContent = JSON.stringify(value, null, 2); };
  const channels = () => { $('channels').textContent = `Independent worker: ${worker ? 'enabled' : 'disabled'}; Service worker: ${registration ? 'enabled' : 'disabled'}`; };
  action('probe', async () => channelResult(await request('/fixture-probe?channel=page')));
  action('worker-enable', () => { if (!worker) { worker = new Worker('/fixture-worker.js'); worker.onmessage = event => channelResult(event.data); } channels(); });
  for (const [id, kind] of [['worker-probe', 'probe'], ['worker-business', 'business']]) action(id, () => { if (!worker) throw new Error('Enable independent worker first'); worker.postMessage(kind); });
  action('sw-enable', async () => { if (!navigator.serviceWorker) throw new Error('Service worker unsupported'); await navigator.serviceWorker.register('/fixture-sw.js'); registration = await navigator.serviceWorker.ready; channels(); });
  if (navigator.serviceWorker) navigator.serviceWorker.addEventListener('message', event => channelResult(event.data));
  for (const [id, kind] of [['sw-probe', 'probe'], ['sw-business', 'business']]) action(id, () => { if (!registration?.active) throw new Error('Enable service worker first'); registration.active.postMessage(kind); });
  action('apply-fault', async () => { const result = await request('/fixture-control', { mode: $('fault-mode').value }); $('fault-result').textContent = result.mode; });
})();
