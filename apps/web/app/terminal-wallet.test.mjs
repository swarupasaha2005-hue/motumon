import { readFile } from 'node:fs/promises';
import { afterEach, describe, expect, it, vi } from 'vitest';

// Minimal DOM harness exercises the real terminal event handlers on a hosted
// origin. It is not a substitute for real extension or responsive browser tests.
const html = await readFile(new URL('./index.html', import.meta.url), 'utf8');
const address = 'mn_addr_preview1fpcx7ql99zdlhxt4swdahv3ja73806au5eqqgmay4cq7f72jxwrq8t5rst';
function node() {
  const listeners = new Map();
  const attributes = new Map();
  return { textContent: '', hidden: false, disabled: false, title: '', value: '', dataset: {},
    classList: { remove() {}, toggle() {} },
    setAttribute(key, value) { attributes.set(key, value); },
    getAttribute(key) { return attributes.get(key); },
    addEventListener(event, callback) { listeners.set(event, callback); },
    async emit(event) { await listeners.get(event)?.({ preventDefault() {} }); },
    replaceChildren(...items) { this.children = items; this.textContent = items.map((item) => item.textContent).join(''); },
    reset() { this.resetCount = (this.resetCount ?? 0) + 1; },
  };
}
async function terminal(registry) {
  const elements = new Map([...html.matchAll(/id="([^"]+)"/g)].map((match) => [match[1], node()]));
  const document = { hidden: false, getElementById: (id) => elements.get(id),
    querySelector: (selector) => selector === '#submit-proof' ? elements.get('submit-proof') : node(), querySelectorAll: () => [], addEventListener() {}, createElement: node };
  vi.stubGlobal('document', document);
  vi.stubGlobal('window', { midnight: registry, location: { hostname: 'pay-drip.vercel.app' }, addEventListener() {} });
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ network: 'preview', contractAddress: 'a'.repeat(64) }) }));
  vi.resetModules();
  await import('./terminal.js');
  return { elements, document };
}
afterEach(() => { vi.unstubAllGlobals(); vi.resetModules(); });

describe('persistent terminal wallet controls', () => {
  it('shows a safe missing-wallet error without calling the local transaction API', async () => {
    const { elements } = await terminal(undefined);
    await elements.get('connect-oneam-header').emit('click');
    expect(elements.get('notice').textContent).toContain('not detected');
    expect(elements.get('connect-oneam-header').hidden).toBe(false);
    expect(elements.get('connect-oneam-header').disabled).toBe(false);
    expect(elements.get('submit-proof').disabled).toBe(true);
    expect(fetch.mock.calls.every(([url]) => url === '/deployment.preview.json')).toBe(true);
  });

  it('renders the actual public address, then disconnects and permits reconnect on the hosted app', async () => {
    const connected = { getConnectionStatus: vi.fn().mockResolvedValue({ status: 'connected', networkId: 'preview' }),
      getUnshieldedAddress: vi.fn().mockResolvedValue({ unshieldedAddress: address }) };
    const initial = { name: '1AM', apiVersion: '4.0.1', connect: vi.fn().mockResolvedValue(connected) };
    const { elements } = await terminal({ test: initial });
    await elements.get('connect-oneam-header').emit('click');
    expect(initial.connect).toHaveBeenCalledWith('preview');
    expect(elements.get('top-wallet').textContent).toContain('1AM • Connected');
    expect(elements.get('top-wallet').title).toBe(address);
    expect(elements.get('oneam-address').textContent).toBe(address);
    expect(elements.get('disconnect-oneam-header').hidden).toBe(false);
    expect(elements.get('connect-oneam-header').hidden).toBe(true);
    expect(elements.get('submit-proof').disabled).toBe(true);
    await elements.get('disconnect-oneam-header').emit('click');
    expect(elements.get('top-wallet').textContent).toBe('Not connected');
    expect(elements.get('oneam-address').textContent).toBe('Not connected');
    expect(elements.get('import-record-form').resetCount).toBe(1);
    expect(elements.get('proof-result').hidden).toBe(true);
    expect(elements.get('reveal-private-salary').disabled).toBe(true);
    await elements.get('connect-oneam-header').emit('click');
    expect(initial.connect).toHaveBeenCalledTimes(2);
  });

  it('rejects the wrong network without showing a connected header', async () => {
    const connected = { getConnectionStatus: async () => ({ status: 'connected', networkId: 'preprod' }), getUnshieldedAddress: async () => ({ unshieldedAddress: address }) };
    const { elements } = await terminal({ test: { name: '1AM', apiVersion: '4.0.1', connect: async () => connected } });
    await elements.get('connect-oneam-header').emit('click');
    expect(elements.get('notice').textContent).toContain('Select Preview');
    expect(elements.get('top-wallet').textContent).toBe('Not connected');
  });
});
