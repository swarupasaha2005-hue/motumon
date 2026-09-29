const $ = (id) => document.getElementById(id);
const field = (id) => /** @type {HTMLInputElement | HTMLSelectElement} */ ($(id));
const input = (id) => /** @type {HTMLInputElement} */ ($(id));
const form = (id) => /** @type {HTMLFormElement} */ ($(id));
const button = (id) => /** @type {HTMLButtonElement} */ ($(id));
const hex64 = /^[0-9a-f]{64}$/i;
const pages = {
  overview: ['Overview', 'A local view of the deployed payroll protocol.'],
  payroll: ['Payroll periods', 'Open and close periods authorized by the administrator secret.'],
  records: ['Payroll records', 'Issue or revoke the public commitment to a private record.'],
  'my-payroll': ['My payroll', 'Bring your private opening to this local terminal.'],
  proofs: ['Create a claim', 'Prove historical membership or a supported income tier.'],
  verify: ['Verify a claim', 'Read an accepted claim receipt from the Preview ledger.'],
  network: ['Network & contract', 'Inspect the deployed contract and local services.'],
};
const app = { token: null, meta: null, ledger: null, wallet: null, opening: null,
  employeeSecret: null, preparedOpening: null, identity: null, currentPage: 'overview', busy: false };

function notice(message, tone = 'neutral') {
  $('notice').textContent = message;
  $('notice').dataset.tone = tone;
}

function short(value, front = 8, back = 6) {
  return typeof value === 'string' && value.length > front + back ? `${value.slice(0, front)}…${value.slice(-back)}` : value;
}

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = String(text);
  return node;
}

function detail(label, value) {
  const row = element('div', 'detail-row');
  row.append(element('span', '', label), element('code', 'wrap', value ?? 'Unavailable'));
  return row;
}

function randomHex() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function requireHex(value, label) {
  const result = String(value ?? '').trim();
  if (!hex64.test(result)) throw new Error(`${label} must be a 64-character hexadecimal value.`);
  return result.toLowerCase();
}

function dollarsToMinor(value) {
  const cleaned = String(value).trim();
  if (!/^(?:0|[1-9]\d{0,14})(?:\.\d{1,2})?$/.test(cleaned)) throw new Error('Enter a positive USD amount with up to two decimal places.');
  const [whole, decimal = ''] = cleaned.split('.');
  const cents = BigInt(whole) * 100n + BigInt(decimal.padEnd(2, '0') || '0');
  if (cents <= 0n || cents > 18446744073709551615n) throw new Error('Salary is outside the supported range.');
  return String(cents);
}

async function api(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (options.method === 'POST') {
    headers['Content-Type'] = 'application/json';
    headers['X-PayDrip-Session'] = app.token;
  }
  const response = await fetch(`/api/${path}`, { ...options, headers, cache: 'no-store' });
  let body;
  try { body = await response.json(); } catch { throw new Error('The local terminal did not return JSON.'); }
  if (!response.ok) throw new Error(body.error || `The local terminal returned ${response.status}.`);
  return body;
}

const post = (path, body) => api(path, { method: 'POST', body: JSON.stringify(body) });

function navigate(page) {
  if (!pages[page]) return;
  app.currentPage = page;
  for (const item of document.querySelectorAll('[data-screen]')) {
    const section = /** @type {HTMLElement} */ (item);
    section.hidden = section.dataset.screen !== page;
  }
  for (const item of document.querySelectorAll('[data-nav]')) {
    const button = /** @type {HTMLElement} */ (item);
    if (button.dataset.nav === page) button.setAttribute('aria-current', 'page');
    else button.removeAttribute('aria-current');
  }
  $('page-title').textContent = pages[page][0];
  $('page-subtitle').textContent = pages[page][1];
  $('page-trail').textContent = pages[page][0].toUpperCase();
  $('sidebar').classList.remove('is-open');
  $('menu-toggle').setAttribute('aria-expanded', 'false');
  $('menu-toggle').setAttribute('aria-label', 'Open navigation');
  window.scrollTo({ top: 0, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
}

function renderWallet() {
  const connected = !!app.wallet?.connected;
  $('top-wallet').textContent = connected ? short(app.wallet.address, 17, 9) : app.wallet ? 'Local wallet disconnected' : 'Wallet status unavailable';
  $('overview-wallet').textContent = connected ? 'Connected' : app.wallet ? 'Disconnected' : 'Unknown';
  $('wallet-address').textContent = connected ? app.wallet.address : app.wallet ? 'Disconnected' : 'Unavailable';
  $('connect-wallet').hidden = connected;
  $('disconnect-wallet').hidden = !connected;
}

function renderMeta() {
  if (!app.meta) {
    $('node-health').textContent = 'Unavailable';
    $('proof-health').textContent = 'Unavailable';
    $('admin-available').textContent = 'Unknown';
    $('network-light').classList.remove('is-online');
    $('overview-network').textContent = 'Public state unavailable';
    return;
  }
  $('overview-contract').textContent = app.meta.contractAddress;
  $('network-contract').textContent = app.meta.contractAddress;
  $('node-health').textContent = app.meta.nodeHealthy ? 'Available' : 'Unavailable';
  $('proof-health').textContent = app.meta.proofServerHealthy ? 'Available' : 'Unavailable';
  $('admin-available').textContent = app.meta.adminAvailable ? 'Present locally' : 'Not found locally';
  $('network-light').classList.toggle('is-online', !!app.meta.nodeHealthy && !!app.ledger);
  $('overview-network').textContent = app.ledger ? 'Contract state indexed' : 'Public state unavailable';
}

function renderList(targetId, items, type) {
  const target = $(targetId);
  target.replaceChildren();
  if (!items?.length) {
    target.append(element('div', 'empty-state', type === 'epoch' ? 'No payroll periods are recorded on this contract.' : 'No record commitments are recorded on this contract.'));
    return;
  }
  for (const item of items) {
    const row = element('div', 'data-item');
    const text = element('div');
    text.append(element('span', '', type === 'epoch' ? 'PERIOD ID' : 'PUBLIC COMMITMENT'), element('code', 'wrap', type === 'epoch' ? item.id : item.commitment));
    if (type === 'record') text.append(element('small', '', `Period ${short(item.epoch, 12, 8)}`));
    const tag = element('span', `status-tag ${type === 'epoch' && item.status === 'Closed' || type === 'record' && item.revoked ? 'status-tag--closed' : ''}`, type === 'epoch' ? item.status : item.revoked ? 'Revoked' : 'Registered');
    row.append(text, tag);
    target.append(row);
  }
}

function renderLedger() {
  if (!app.ledger) return;
  $('epoch-count').textContent = `${app.ledger.epochs.length} public period${app.ledger.epochs.length === 1 ? '' : 's'}`;
  $('record-count').textContent = `${app.ledger.records.length} public handle${app.ledger.records.length === 1 ? '' : 's'}`;
  renderList('epoch-list', app.ledger.epochs, 'epoch');
  renderList('record-list', app.ledger.records, 'record');
  $('indexer-health').textContent = 'Contract state available';
  renderMeta();
}

async function refresh() {
  const [meta, ledger, wallet] = await Promise.allSettled([api('meta'), api('state'), api('wallet')]);
  app.meta = meta.status === 'fulfilled' ? meta.value : null;
  app.ledger = ledger.status === 'fulfilled' ? ledger.value : null;
  app.wallet = wallet.status === 'fulfilled' ? wallet.value : null;
  renderMeta(); renderLedger(); renderWallet();
  if (ledger.status === 'rejected') {
    $('indexer-health').textContent = 'Unavailable';
    $('epoch-count').textContent = 'Unavailable';
    $('record-count').textContent = 'Unavailable';
    $('epoch-list').replaceChildren(element('div', 'empty-state', 'Preview public state is unavailable. No period list can be shown.'));
    $('record-list').replaceChildren(element('div', 'empty-state', 'Preview public state is unavailable. No record handles can be shown.'));
    notice(ledger.reason.message, 'error');
  } else notice('Public contract state is current. Private record data is never reconstructed from this view.', 'success');
}

function downloadJson(filename, value) {
  const blob = new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

function showActivity(title, message, result = null) {
  $('activity-panel').hidden = false;
  $('activity-title').textContent = title;
  $('activity-message').textContent = message;
  $('activity-result').hidden = !result;
  $('activity-result').textContent = result ? `Transaction ${result.txId ?? 'unavailable'} · Block ${result.blockHeight ?? 'unavailable'}` : '';
}

async function waitForJob(id) {
  for (;;) {
    const job = await api(`jobs/${id}`);
    showActivity(job.status === 'running' ? 'Working on Preview' : job.status === 'confirmed' ? 'Confirmed on Preview' : 'Action failed',
      job.status === 'running' ? job.stage : job.status === 'failed' ? job.error : 'The contract call finalized.', job.result);
    if (job.status === 'confirmed') return job.result;
    if (job.status === 'failed') throw new Error(job.error);
    await new Promise((resolve) => setTimeout(resolve, 1800));
  }
}

async function runAction(action, input) {
  if (app.busy) throw new Error('Wait for the current contract action to finish.');
  app.busy = true;
  showActivity('Preparing', 'Submitting only after the local wallet and proof server are ready.');
  try {
    const job = await post('actions', { action, ...input });
    const result = await waitForJob(job.id);
    await refresh();
    notice(`${action} was confirmed on Preview.`, 'success');
    return result;
  } catch (error) {
    showActivity('Action failed', error.message);
    notice(error.message, 'error');
    throw error;
  } finally { app.busy = false; }
}

function showRecordCheck(check) {
  const panel = $('my-record-panel');
  panel.replaceChildren();
  const body = element('div', 'record-panel__body');
  body.append(element('span', 'panel-kicker', 'PRIVATE RECORD / LOCAL SESSION'), element('h3', '', check.registered ? 'Record found on Preview' : 'No matching commitment found'));
  body.append(detail('Public commitment', check.commitment), detail('Payroll period', check.epoch),
    detail('Period status', check.epochStatus), detail('Record status', check.revoked ? 'Revoked' : check.registered ? 'Registered' : 'Not registered'));
  const foot = element('p', 'fine-print', check.registered && !check.revoked
    ? 'Your imported opening matches a public commitment. The exact salary remains in this browser session and the local proving inputs.'
    : 'A proof cannot succeed from an absent or revoked record. Confirm the opening with the issuer.');
  body.append(foot); panel.append(body);
}

function showClaimResult(targetId, title, rows, note) {
  const panel = $(targetId);
  panel.hidden = false;
  panel.replaceChildren(element('span', 'panel-kicker', 'PUBLIC CLAIM RESULT'), element('h3', '', title));
  for (const [label, value] of rows) panel.append(detail(label, value));
  panel.append(element('p', '', note));
}

function bindNavigation() {
  document.querySelectorAll('[data-nav]').forEach((item) => item.addEventListener('click', () => navigate(/** @type {HTMLElement} */ (item).dataset.nav)));
  document.querySelectorAll('[data-go]').forEach((item) => item.addEventListener('click', () => navigate(/** @type {HTMLElement} */ (item).dataset.go)));
  $('menu-toggle').addEventListener('click', () => {
    const open = $('menu-toggle').getAttribute('aria-expanded') !== 'true';
    $('sidebar').classList.toggle('is-open', open);
    $('menu-toggle').setAttribute('aria-expanded', String(open));
    $('menu-toggle').setAttribute('aria-label', open ? 'Close navigation' : 'Open navigation');
  });
  document.addEventListener('keydown', (event) => { if (event.key === 'Escape') { $('sidebar').classList.remove('is-open'); $('menu-toggle').setAttribute('aria-expanded', 'false'); } });
  document.querySelectorAll('[data-generate]').forEach((item) => item.addEventListener('click', () => { field(/** @type {HTMLElement} */ (item).dataset.generate).value = randomHex(); }));
  $('refresh-state').addEventListener('click', () => void refresh());
}

function bindWallet() {
  $('connect-wallet').addEventListener('click', async () => {
    button('connect-wallet').disabled = true;
    notice('Connecting the existing local Preview wallet. Initial synchronization can take time.');
    try { app.wallet = await post('wallet/connect', {}); renderWallet(); notice('Local Preview wallet connected.', 'success'); }
    catch (error) { notice(error.message, 'error'); }
    finally { button('connect-wallet').disabled = false; }
  });
  $('disconnect-wallet').addEventListener('click', async () => {
    try {
      app.wallet = await post('wallet/disconnect', {});
      app.opening = null; app.employeeSecret = null; app.preparedOpening = null; app.identity = null;
      $('my-record-panel').replaceChildren(element('div', 'empty-state', 'Private record cleared from this browser session.'));
      $('identity-result').hidden = true; $('prepared-record').hidden = true; renderWallet();
      notice('Wallet disconnected. Private session data was cleared.', 'success');
    } catch (error) { notice(error.message, 'error'); }
  });
}

function bindOrganization() {
  $('open-epoch-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    try { await runAction('openEpoch', { epoch: requireHex(field('open-epoch').value, 'Period ID') }); form('open-epoch-form').reset(); }
    catch (error) { notice(error.message, 'error'); }
  });
  $('close-epoch-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    try { await runAction('closeEpoch', { epoch: requireHex(field('close-epoch').value, 'Period ID') }); form('close-epoch-form').reset(); }
    catch (error) { notice(error.message, 'error'); }
  });
  $('prepare-record-form').addEventListener('submit', (event) => {
    event.preventDefault();
    try {
      if (!app.ledger) throw new Error('Refresh the public contract state before preparing a record.');
      const epoch = requireHex(field('record-epoch').value, 'Period ID');
      if (!app.ledger.epochs.some((item) => item.id === epoch && item.status === 'Open')) throw new Error('Choose a period that is open on Preview.');
      const opening = { format: 'paydrip-record-v1', domain: app.ledger.domain, organization: app.ledger.organization,
        epoch, employeePseudonym: requireHex(field('record-pseudonym').value, 'Employee pseudonym'),
        monthlySalaryMinor: dollarsToMinor(field('record-salary').value), currency: 'USD', randomness: randomHex() };
      app.preparedOpening = opening;
      field('record-salary').value = '';
      $('prepared-record').hidden = false;
      button('register-record').disabled = true;
      notice('Private opening prepared. Download it before registering the commitment.', 'success');
    } catch (error) { notice(error.message, 'error'); }
  });
  $('download-opening').addEventListener('click', () => {
    if (!app.preparedOpening) return;
    downloadJson(`paydrip-record-${app.preparedOpening.epoch.slice(0, 12)}.json`, app.preparedOpening);
    button('register-record').disabled = false;
    notice('Private record download started. Keep it secure and deliver it only to the intended employee.', 'success');
  });
  $('register-record').addEventListener('click', async () => {
    if (!app.preparedOpening) return;
    try { await runAction('registerRecord', { opening: app.preparedOpening }); app.preparedOpening = null; $('prepared-record').hidden = true; form('prepare-record-form').reset(); }
    catch (error) { notice(error.message, 'error'); }
  });
  $('revoke-record-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    try { await runAction('revokeRecord', { epoch: requireHex(field('revoke-epoch').value, 'Period ID'), commitment: requireHex(field('revoke-commitment').value, 'Commitment') }); form('revoke-record-form').reset(); }
    catch (error) { notice(error.message, 'error'); }
  });
}

function bindEmployee() {
  $('identity-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
      const epoch = requireHex(field('identity-epoch').value, 'Period ID');
      const employeeSecret = randomHex();
      const { pseudonym } = await post('pseudonym', { epoch, employeeSecret });
      app.identity = { format: 'paydrip-identity-v1', epoch, employeeSecret };
      $('identity-pseudonym').textContent = pseudonym;
      $('identity-result').hidden = false;
      notice('Pseudonym generated. Share the pseudonym only; keep the identity file private.', 'success');
    } catch (error) { notice(error.message, 'error'); }
  });
  $('download-identity').addEventListener('click', () => {
    if (app.identity) downloadJson(`paydrip-identity-${app.identity.epoch.slice(0, 12)}.json`, app.identity);
  });
  $('import-record-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
      const file = input('record-file').files[0];
      if (!file || file.size > 16_384) throw new Error('Choose a private PayDrip record file smaller than 16 KB.');
      const opening = JSON.parse(await file.text());
      const identityFile = input('identity-file').files[0];
      let employeeSecret;
      if (identityFile) {
        if (identityFile.size > 16_384) throw new Error('Choose a private identity file smaller than 16 KB.');
        const identity = JSON.parse(await identityFile.text());
        if (identity.format !== 'paydrip-identity-v1' || identity.epoch !== opening.epoch) {
          throw new Error('The private identity file does not match this payroll period.');
        }
        employeeSecret = requireHex(identity.employeeSecret, 'Employee secret');
      } else if (field('employee-secret').value.trim()) {
        employeeSecret = requireHex(field('employee-secret').value, 'Employee secret');
      } else if (app.identity?.epoch === opening.epoch) {
        employeeSecret = app.identity.employeeSecret;
      } else {
        throw new Error('Choose your private identity file or enter your employee secret.');
      }
      const check = await post('record/check', { opening, employeeSecret });
      app.opening = check.registered && !check.revoked ? opening : null;
      app.employeeSecret = check.registered && !check.revoked ? employeeSecret : null;
      field('employee-secret').value = '';
      field('identity-file').value = '';
      field('record-file').value = '';
      showRecordCheck(check);
      notice(check.registered && !check.revoked ? 'Private opening matches a registered Preview record.' : 'The private opening is not currently claimable.', check.registered && !check.revoked ? 'success' : 'error');
    } catch (error) { notice(error.message, 'error'); }
  });
  $('proof-kind').addEventListener('change', () => {
    $('tier-field').hidden = field('proof-kind').value !== 'income-tier';
    $('proof-public-preview').textContent = field('proof-kind').value === 'income-tier'
      ? 'Claim context, selected tier, linked commitment handle, and period. Repeated tiers can reveal a salary band.'
      : 'Historical membership, claim context, linked commitment handle, and period. This does not prove current employment.';
  });
  $('proof-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
      if (!app.opening || !app.employeeSecret) throw new Error('Import your private payroll record and employee secret first.');
      const context = requireHex(field('proof-context').value, 'Verifier request context');
      const income = field('proof-kind').value === 'income-tier';
      const action = income ? 'proveIncomeTier' : 'proveEmployment';
      const tier = income ? Number(field('proof-tier').value) : undefined;
      const result = await runAction(action, { opening: app.opening, employeeSecret: app.employeeSecret, context, ...(income ? { tier } : {}) });
      showClaimResult('proof-result', 'Claim accepted on Preview', [
        ['Statement', income ? `Monthly income ≥ ${ { 1: '$3,000', 2: '$5,000', 3: '$10,000' }[tier] }` : 'Included in a historical payroll period'],
        ['Request context', context], ['Transaction', result.txId], ['Block', result.blockHeight],
      ], 'Exact salary is not stored in the public claim receipt. The context and record handle are public and can link activity.');
    } catch (error) { notice(error.message, 'error'); }
  });
}

function bindVerifier() {
  $('verify-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
      const context = requireHex(field('verify-context').value, 'Verifier request context');
      const result = await api(`claim/${context}`);
      if (!result.found) {
        showClaimResult('verify-result', 'No accepted claim found', [['Request context', context]],
          'This means the Preview contract has no claim receipt for this context at the time of this query. It does not prove an attempted claim was invalid.');
        notice('No accepted claim is recorded for that context.', 'error');
        return;
      }
      const claim = result.claim;
      showClaimResult('verify-result', 'Accepted by the PayDrip contract', [
        ['Statement', claim.kind === 'employment' ? 'Included in a historical payroll period' : `Monthly income ≥ ${claim.tierLabel ?? 'Unknown tier'}`],
        ['Request context', context], ['Payroll period ID', claim.epoch], ['Record handle', claim.commitment],
        ['Organization ID', claim.organization], ['Period status now', claim.epochStatus],
        ['Record status now', claim.recordRevokedNow ? 'Revoked after or before this lookup' : 'Not revoked now'],
      ], 'This public receipt was accepted by the contract. It does not disclose exact salary or prove that salary was paid. The request context is not bound to a named verifier on-chain.');
      notice('Accepted claim receipt found in Preview contract state.', 'success');
    } catch (error) { notice(error.message, 'error'); }
  });
}

async function init() {
  bindNavigation(); bindWallet(); bindOrganization(); bindEmployee(); bindVerifier();
  try { app.token = (await api('session')).token; await refresh(); }
  catch (error) { notice(`Local terminal unavailable: ${error.message}`, 'error'); }
}

void init();
