import { describe, expect, it, vi } from 'vitest';
import { connectOneAm, findOneAm } from './oneam-wallet.js';

const previewAddress = 'mn_addr_preview1fpcx7ql99zdlhxt4swdahv3ja73806au5eqqgmay4cq7f72jxwrq8t5rst';

function wallet(status = { status: 'connected', networkId: 'preview' }, address = previewAddress) {
  const connected = {
    getConnectionStatus: vi.fn().mockResolvedValue(status),
    getUnshieldedAddress: vi.fn().mockResolvedValue({ unshieldedAddress: address }),
  };
  return { name: '1AM', rdns: '1am.xyz', apiVersion: '4.0.1', connect: vi.fn().mockResolvedValue(connected) };
}

describe('1AM browser connector', () => {
  it('selects 1AM from a Midnight registry and connects specifically to Preview', async () => {
    const oneAm = wallet();
    const session = await connectOneAm({ 'some-other-wallet': { name: 'Lace' }, 'random-uuid': oneAm });
    expect(oneAm.connect).toHaveBeenCalledExactlyOnceWith('preview');
    expect(session.address).toBe(previewAddress);
    expect(session.network).toBe('Preview');
  });

  it('rejects a missing connector, duplicate identity, and an unsupported API version', async () => {
    await expect(connectOneAm(undefined)).rejects.toThrow('not detected');
    expect(() => findOneAm({ a: wallet(), b: wallet() })).toThrow('Multiple 1AM');
    await expect(connectOneAm({ a: { ...wallet(), apiVersion: '3.0.0' } })).rejects.toThrow('v4 API');
  });

  it('rejects a different network or missing Preview address', async () => {
    await expect(connectOneAm({ a: wallet({ status: 'connected', networkId: 'preprod' }) })).rejects.toThrow('Preview');
    await expect(connectOneAm({ a: wallet({ status: 'connected', networkId: 'preview' }, 'mn_addr_preprod1abc') })).rejects.toThrow('Preview unshielded address');
  });
});

import { createOneAmSession, oneAmCapabilities, operatorActionAvailability, walletConnectionError } from './oneam-wallet.js';

describe('1AM session lifecycle', () => {
  it('does not select unrelated wallets or the Lace decoy', () => {
    expect(findOneAm({ a: { name: 'Lace', rdns: 'io.lace.wallet' }, b: { name: 'Some Wallet' } })).toBeNull();
    expect(findOneAm({ a: { name: 'OneAM Wallet' } })).not.toBeNull();
  });

  it('connects, clears the application session, and reconnects without inventing wallet revocation', async () => {
    const adapter = wallet();
    const controller = createOneAmSession();
    expect(controller.session).toBeNull();
    const session = await controller.connect({ a: adapter });
    expect(controller.session.address).toBe(previewAddress);
    expect(controller.pending).toBe(false);
    expect(await controller.refresh()).toBe(true);
    controller.disconnect();
    expect(controller.session).toBeNull();
    await controller.connect({ a: adapter });
    expect(adapter.connect).toHaveBeenCalledTimes(2);
    expect(controller.session.api).toBe(session.api);
  });

  it('rejects connection failures and redacts extension error payloads', async () => {
    const controller = createOneAmSession();
    const adapter = { ...wallet(), connect: vi.fn().mockRejectedValue(new Error('user rejected request')) };
    await expect(controller.connect({ a: adapter })).rejects.toThrow('rejected');
    expect(controller.session).toBeNull();
    expect(controller.pending).toBe(false);
    expect(walletConnectionError(new Error('user rejected request'))).toContain('declined');
    expect(walletConnectionError(new Error('wallet locked'))).toContain('Unlock');
    expect(walletConnectionError(new Error('1AM is not connected: private request contents'))).toBe('Unable to connect to 1AM Wallet. Check the extension and retry.');
  });

  it('drops a late approval after disconnect, without restoring account state', async () => {
    let resolve;
    const approval = new Promise((done) => { resolve = done; });
    const controller = createOneAmSession();
    const connected = await wallet().connect('preview');
    const adapter = { ...wallet(), connect: vi.fn().mockReturnValue(approval) };
    const attempt = controller.connect({ a: adapter });
    const rejected = expect(attempt).rejects.toThrow('cancelled');
    expect(controller.pending).toBe(true);
    controller.disconnect();
    resolve(connected);
    await rejected;
    expect(controller.session).toBeNull();
    expect(controller.pending).toBe(false);
  });

  it('times out and rejects concurrent attempts without faking a connection', async () => {
    vi.useFakeTimers();
    try {
      const controller = createOneAmSession();
      const adapter = { ...wallet(), connect: vi.fn().mockReturnValue(new Promise(() => {})) };
      const attempt = controller.connect({ a: adapter }, 100);
      const rejected = expect(attempt).rejects.toThrow('timed out');
      await expect(controller.connect({ a: adapter })).rejects.toThrow('already in progress');
      await vi.advanceTimersByTimeAsync(100);
      await rejected;
      expect(controller.session).toBeNull();
      expect(controller.pending).toBe(false);
    } finally { vi.useRealTimers(); }
  });

  it('clears an expired, switched-network, or switched-account session', async () => {
    for (const status of [{ status: 'disconnected' }, { status: 'connected', networkId: 'preprod' }]) {
      const adapter = wallet();
      const controller = createOneAmSession();
      await controller.connect({ a: adapter });
      const connected = await adapter.connect.mock.results[0].value;
      connected.getConnectionStatus.mockResolvedValue(status);
      expect(await controller.refresh()).toBe(false);
      expect(controller.session).toBeNull();
    }
    const adapter = wallet();
    const controller = createOneAmSession();
    await controller.connect({ a: adapter });
    const connected = await adapter.connect.mock.results[0].value;
    connected.getUnshieldedAddress.mockResolvedValue({ unshieldedAddress: 'another-account' });
    expect(await controller.refresh()).toBe(false);
    expect(controller.session).toBeNull();
  });

  it('detects transaction method presence without invoking or claiming successful signing', () => {
    const method = vi.fn();
    const capabilities = oneAmCapabilities({ balanceUnsealedTransaction: method, submitTransaction: method, getProvingProvider: method });
    expect(capabilities).toMatchObject({ balancing: true, submission: true, proving: true, dataSigning: false });
    expect(method).not.toHaveBeenCalled();
    expect(oneAmCapabilities({}).submission).toBe(false);
  });
});

describe('honest operator action gating', () => {
  it('never enables hosted circuit calls from an address-only wallet session', () => {
    expect(operatorActionAvailability({ hosted: true, connected: true, busy: false }).enabled).toBe(false);
  });
  it('requires a local operator and prevents concurrent calls', () => {
    expect(operatorActionAvailability({ hosted: false, connected: false, busy: false }).reason).toContain('Connect the local');
    expect(operatorActionAvailability({ hosted: false, connected: true, busy: true }).enabled).toBe(false);
    expect(operatorActionAvailability({ hosted: false, connected: true, busy: false })).toMatchObject({ enabled: true });
  });
});
