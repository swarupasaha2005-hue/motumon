import { readFile } from 'node:fs/promises';
import { afterEach, expect, it, vi } from 'vitest';

// Real handlers with a small DOM and mocked loopback API; no wallet or network calls.
const html = await readFile(new URL('./index.html', import.meta.url), 'utf8');
const address = 'mn_addr_preview1publictest';
const epoch = 'a'.repeat(64);
const ledger = { domain: 'b'.repeat(64), organization: 'c'.repeat(64), epochs: [], records: [], claims: [] };
function node() {
  const listeners = new Map();
  const attributes = new Map();
  return { value: '', textContent: '', disabled: false, hidden: false, files: [], dataset: {}, children: [],
    classList: { remove() {}, toggle() {} }, setAttribute(k, v) { attributes.set(k, v); }, getAttribute(k) { return attributes.get(k); },
    addEventListener(k, fn) { listeners.set(k, [...(listeners.get(k) ?? []), fn]); },
    async emit(k) { for (const fn of listeners.get(k) ?? []) await fn({ preventDefault() {} }); },
    append(...items) { this.children.push(...items); }, replaceChildren(...items) { this.children = items; },
    reset() {}, click() {}, remove() {},
  };
}
const response = (data, ok = true) => ({ ok, json: async () => data });
function deferred() { let resolve; const promise = new Promise((r) => { resolve = r; }); return { promise, resolve }; }
async function terminal({ hostname = '127.0.0.1', registry, initialState, action, connect, extra } = {}) {
  const elements = new Map([...html.matchAll(/id="([^"]+)"/g)].map((m) => [m[1], node()]));
  const submit = new Map(['open-epoch-form', 'close-epoch-form', 'revoke-record-form'].map((id) => [id, node()]));
  const generates = [...html.matchAll(/data-generate="([^"]+)"/g)].map((m) => Object.assign(node(), { dataset: { generate: m[1] } }));
  vi.stubGlobal('document', { hidden: false, body: node(), getElementById: (id) => elements.get(id), createElement: node, addEventListener() {},
    querySelector: (s) => submit.get(s.split(' ')[0].slice(1)) ?? elements.get(s.slice(1)) ?? node(),
    querySelectorAll: (s) => s === '[data-generate]' ? generates : [],
  });
  vi.stubGlobal('window', { midnight: registry, location: { hostname }, addEventListener() {}, matchMedia: () => ({ matches: true }), scrollTo() {} });
  let connected = false;
  vi.stubGlobal('fetch', vi.fn(async (url, options) => {
    if (url === '/deployment.preview.json') return response({ network: 'preview', contractAddress: 'd'.repeat(64) });
    if (url === '/api/session') return response({ token: 'test-session' });
    if (url === '/api/meta') return response({ adminAvailable: true, proofServerHealthy: true, nodeHealthy: true, contractAddress: 'd'.repeat(64) });
    if (url === '/api/state') return initialState ? await initialState() : response(ledger);
    if (url === '/api/wallet') return response({ connected, address: connected ? address : null });
    if (url === '/api/wallet/connect') { const result = connect ? await connect() : response({ connected: true, address }); connected = result.ok; return result; }
    if (url === '/api/wallet/disconnect') { connected = false; return response({ connected: false }); }
    if (url === '/api/actions') return action ? await action(JSON.parse(options.body)) : response({ error: 'Synthetic safe failure' }, false);
    if (extra) return extra(url, options);
    throw new Error('Unexpected mocked API route');
  }));
  vi.resetModules();
  await import('./terminal.js');
  return { elements, submit, generates };
}
async function ready(harness) {
  await vi.waitFor(() => expect(harness.elements.get('indexer-health').textContent).toBe('Contract state available'));
}
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.resetModules(); });

it('does not let a delayed initial public refresh overwrite a newer operator connection', async () => {
  const pending = deferred();
  const { elements, submit } = await terminal({ initialState: () => pending.promise });
  await vi.waitFor(() => expect(fetch.mock.calls.some(([url]) => url === '/api/wallet')).toBe(true));
  elements.get('open-epoch').value = epoch;
  await elements.get('connect-wallet').emit('click');
  expect(submit.get('open-epoch-form').disabled).toBe(false);
  pending.resolve(response(ledger));
  await vi.waitFor(() => expect(elements.get('indexer-health').textContent).toBe('Contract state available'));
  expect(elements.get('overview-wallet').textContent).toBe('Connected');
  expect(submit.get('open-epoch-form').disabled).toBe(false);
});

it.each(['127.0.0.1', 'localhost'])('gates period generation, invalid input, disconnect and reconnect on %s', async (hostname) => {
  const harness = await terminal({ hostname });
  await ready(harness);
  const { elements, submit, generates } = harness;
  const open = submit.get('open-epoch-form');
  await generates.find((n) => n.dataset.generate === 'open-epoch').emit('click');
  expect(elements.get('open-epoch').value).toMatch(/^[0-9a-f]{64}$/);
  expect(open.disabled).toBe(true);
  expect(elements.get('open-period-status').textContent).toContain('Connect the local');
  await elements.get('connect-wallet').emit('click');
  expect(open.disabled).toBe(false);
  expect(elements.get('top-wallet').textContent).toBe('Not connected'); // 1AM is independent.
  elements.get('open-epoch').value = 'invalid';
  await elements.get('open-epoch').emit('input');
  expect(open.disabled).toBe(true);
  await elements.get('open-epoch-form').emit('submit');
  expect(fetch.mock.calls.some(([url]) => url === '/api/actions')).toBe(false);
  expect(elements.get('notice').textContent).toContain('64-character');
  await generates.find((n) => n.dataset.generate === 'open-epoch').emit('click');
  expect(open.disabled).toBe(false);
  await elements.get('disconnect-wallet').emit('click');
  expect(open.disabled).toBe(true);
  await elements.get('connect-wallet').emit('click');
  expect(open.disabled).toBe(false);
});

it('recovers from operator connection failure and action failure without leaving busy controls stuck', async () => {
  const pending = deferred();
  let attempt = 0;
  const harness = await terminal({ connect: () => ++attempt === 1 ? response({ error: 'Safe connection failure' }, false) : response({ connected: true, address }), action: () => pending.promise });
  await ready(harness);
  const { elements, submit } = harness;
  elements.get('open-epoch').value = epoch;
  await elements.get('connect-wallet').emit('click');
  expect(submit.get('open-epoch-form').disabled).toBe(true);
  expect(elements.get('connect-wallet').disabled).toBe(false);
  await elements.get('connect-wallet').emit('click');
  const operation = elements.get('open-epoch-form').emit('submit');
  expect(submit.get('open-epoch-form').disabled).toBe(true);
  expect(elements.get('open-period-status').textContent).toContain('current contract action');
  expect(elements.get('disconnect-wallet').disabled).toBe(true);
  pending.resolve(response({ error: 'Synthetic safe failure' }, false));
  await operation;
  expect(submit.get('open-epoch-form').disabled).toBe(false);
  expect(elements.get('disconnect-wallet').disabled).toBe(false);
  expect(elements.get('activity-title').textContent).toBe('Action failed');
});

it('keeps hosted actions unavailable and explains why', async () => {
  const { elements, submit, generates } = await terminal({ hostname: 'pay-drip.vercel.app' });
  await generates.find((n) => n.dataset.generate === 'open-epoch').emit('click');
  expect(submit.get('open-epoch-form').disabled).toBe(true);
  expect(elements.get('open-period-status').textContent).toContain('hosted build');
  expect(elements.get('submit-proof').disabled).toBe(true);
  expect(elements.get('connect-wallet').disabled).toBe(true);
  expect(fetch.mock.calls.every(([url]) => url === '/deployment.preview.json')).toBe(true);
});

it('does not confuse a 1AM session or disconnect with the local operator', async () => {
  const api = { getConnectionStatus: async () => ({ status: 'connected', networkId: 'preview' }),
    getUnshieldedAddress: async () => ({ unshieldedAddress: address }) };
  const harness = await terminal({ registry: { wallet: { name: '1AM', apiVersion: '4.0.1', connect: async () => api } } });
  await ready(harness);
  const { elements, submit } = harness;
  elements.get('open-epoch').value = epoch;
  await elements.get('connect-oneam-header').emit('click');
  expect(elements.get('top-wallet').textContent).toContain('1AM • Connected');
  expect(submit.get('open-epoch-form').disabled).toBe(true);
  await elements.get('connect-wallet').emit('click');
  expect(submit.get('open-epoch-form').disabled).toBe(false);
  await elements.get('disconnect-oneam-header').emit('click');
  expect(elements.get('overview-wallet').textContent).toBe('Connected');
  expect(submit.get('open-epoch-form').disabled).toBe(false);
  expect(elements.get('submit-proof').disabled).toBe(true);
});

it('preserves a newer disconnect when an earlier refresh returns connected', async () => {
  let reads = 0;
  const pending = deferred();
  const harness = await terminal({ initialState: () => ++reads === 1 ? response(ledger) : pending.promise });
  await ready(harness);
  const { elements, submit } = harness;
  elements.get('open-epoch').value = epoch;
  await elements.get('connect-wallet').emit('click');
  await elements.get('refresh-state').emit('click');
  await elements.get('disconnect-wallet').emit('click');
  pending.resolve(response(ledger));
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(elements.get('overview-wallet').textContent).toBe('Disconnected');
  expect(submit.get('open-epoch-form').disabled).toBe(true);
});

it('exercises identity, download-before-registration, private import, tier input, confirmed result and verifier handlers with a mocked API', async () => {
  const downloads = [];
  vi.spyOn(URL, 'createObjectURL').mockImplementation((blob) => { downloads.push(blob); return 'blob:test'; });
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
  const state = { ...ledger, epochs: [{ id: epoch, status: 'Open' }] };
  const commitment = 'e'.repeat(64);
  let submitted;
  let claimContext;
  const harness = await terminal({ initialState: () => response(state),
    action: (payload) => {
      submitted = payload;
      if (payload.action === 'registerRecord') state.records = [{ epoch, commitment, revoked: false }];
      if (payload.action === 'proveIncomeTier') claimContext = payload.context;
      return response({ id: 'f'.repeat(32) });
    },
    extra: (url) => {
      if (url === '/api/pseudonym') return response({ pseudonym: '9'.repeat(64) });
      if (url === '/api/record/check') return response({ commitment, epoch, registered: true, revoked: false, epochStatus: 'Open' });
      if (url.startsWith('/api/jobs/')) return response({ status: 'confirmed', result: { circuit: submitted.action, txId: 'mock-test-transaction', blockHeight: '123', contractAddress: 'd'.repeat(64) } });
      if (url.startsWith('/api/claim/')) return response({ found: true, claim: { kind: 'income-tier', tierLabel: '$3,000', context: claimContext, epoch, commitment, organization: state.organization, epochStatus: 'Open', recordRevokedNow: false } });
      throw new Error('Unexpected mocked route');
    },
  });
  await ready(harness);
  const { elements, generates } = harness;
  await elements.get('connect-wallet').emit('click');
  elements.get('identity-epoch').value = epoch;
  await elements.get('identity-form').emit('submit');
  await elements.get('download-identity').emit('click');
  elements.get('record-epoch').value = epoch;
  elements.get('record-pseudonym').value = elements.get('identity-pseudonym').textContent;
  elements.get('record-salary').value = '5000.00';
  await elements.get('prepare-record-form').emit('submit');
  expect(elements.get('register-record').disabled).toBe(true);
  expect(elements.get('register-record-status').textContent).toContain('Download');
  await elements.get('download-opening').emit('click');
  expect(elements.get('register-record').disabled).toBe(false);
  await elements.get('register-record').emit('click');
  expect(submitted.action).toBe('registerRecord');
  expect(submitted.opening.monthlySalaryMinor === '500000').toBe(true);
  expect(elements.get('register-record').disabled).toBe(true);
  const identity = JSON.parse(await downloads[0].text());
  const opening = JSON.parse(await downloads[1].text());
  elements.get('record-file').files = [{ size: 20000, text: async () => { throw new Error('Oversized file should not be read'); } }];
  await elements.get('import-record-form').emit('submit');
  expect(elements.get('notice').textContent).toContain('smaller than 16 KB');
  elements.get('record-file').files = [{ size: 1000, text: async () => JSON.stringify(opening) }];
  elements.get('identity-file').files = [{ size: 1000, text: async () => JSON.stringify({ ...identity, epoch: '8'.repeat(64) }) }];
  await elements.get('import-record-form').emit('submit');
  expect(elements.get('notice').textContent).toContain('does not match this payroll period');
  expect(elements.get('submit-proof').disabled).toBe(true);
  elements.get('identity-file').files = [{ size: 1000, text: async () => JSON.stringify(identity) }];
  await elements.get('import-record-form').emit('submit');
  expect(elements.get('notice').textContent).toContain('matches a registered');
  expect(elements.get('submit-proof').disabled).toBe(true);
  await generates.find((n) => n.dataset.generate === 'verify-context').emit('click');
  const context = elements.get('verify-context').value;
  expect(context).toMatch(/^[0-9a-f]{64}$/);
  elements.get('proof-kind').value = 'income-tier';
  elements.get('proof-tier').value = '1';
  elements.get('proof-context').value = '0'.repeat(64);
  await elements.get('proof-context').emit('input');
  expect(elements.get('submit-proof').disabled).toBe(true);
  elements.get('proof-context').value = context;
  await elements.get('proof-context').emit('input');
  expect(elements.get('submit-proof').disabled).toBe(false);
  await elements.get('proof-form').emit('submit');
  expect(submitted.action).toBe('proveIncomeTier');
  expect(submitted.tier).toBe(1);
  const text = (n) => `${n.textContent} ${(n.children ?? []).map(text).join(' ')}`;
  const publicResult = text(elements.get('proof-result'));
  expect(publicResult).toContain('mock-test-transaction');
  expect(publicResult).toContain('Local Preview operator (not 1AM)');
  expect(publicResult.includes(opening.monthlySalaryMinor)).toBe(false);
  expect(publicResult.includes(identity.employeeSecret)).toBe(false);
  expect(publicResult.includes(opening.randomness)).toBe(false);
  await elements.get('verify-form').emit('submit');
  expect(text(elements.get('verify-result'))).toContain('Accepted by the PayDrip contract');
  expect(text(elements.get('verify-result')).includes(opening.monthlySalaryMinor)).toBe(false);
});
