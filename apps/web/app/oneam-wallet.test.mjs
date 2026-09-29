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
