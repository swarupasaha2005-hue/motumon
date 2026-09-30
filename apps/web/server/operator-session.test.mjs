import { afterEach, describe, expect, it, vi } from 'vitest';
import { OperatorSession, OperatorConnectionError } from './operator-session.mjs';

const deferred = () => { let resolve; const promise = new Promise((r) => { resolve = r; }); return { promise, resolve }; };
const built = (start = vi.fn().mockResolvedValue(undefined), stop = vi.fn().mockResolvedValue(undefined)) => ({ wallet: { stop }, start, address: 'mn_addr_preview1test', keys: {} });
afterEach(() => vi.useRealTimers());

describe('local operator lifecycle (mocked SDK boundary)', () => {
  it('publishes only successful startup, coalesces concurrent connects, disconnects and reconnects', async () => {
    const startup = deferred();
    const candidate = built(() => startup.promise);
    const factory = vi.fn().mockResolvedValue(candidate);
    const session = new OperatorSession(factory);
    const first = session.connect();
    expect(session.connect()).toBe(first);
    expect(session.info().connected).toBe(false);
    startup.resolve();
    await first;
    expect(factory).toHaveBeenCalledTimes(1);
    expect(session.info()).toMatchObject({ connected: true, address: candidate.address });
    expect(await session.connect()).toMatchObject({ connected: true });
    expect(factory).toHaveBeenCalledTimes(1);
    await session.disconnect();
    expect(session.info()).toMatchObject({ connected: false, address: null });
    expect(candidate.wallet.stop).toHaveBeenCalled();
    await session.connect();
    expect(factory).toHaveBeenCalledTimes(2);
  });

  it('sanitizes failed startup, cleans up and permits retry when cleanup finishes', async () => {
    const candidate = built(vi.fn().mockRejectedValue(new Error('unknown error with confidential payload')));
    const factory = vi.fn().mockResolvedValueOnce(candidate).mockResolvedValue(built());
    const session = new OperatorSession(factory);
    await expect(session.connect()).rejects.toThrow(OperatorConnectionError);
    expect(session.info().connected).toBe(false);
    expect(candidate.wallet.stop).toHaveBeenCalled();
    await vi.waitFor(async () => expect(await session.connect()).toMatchObject({ connected: true }));
    await session.disconnect();
  });

  it('reports network startup errors without exposing raw errors', async () => {
    const candidate = built(vi.fn().mockRejectedValue(Object.assign(new Error('request with confidential data'), { code: 'ENOTFOUND' })));
    const session = new OperatorSession(async () => candidate);
    await expect(session.connect()).rejects.toThrow('RPC/indexer connection failed');
    expect(session.info().address).toBeNull();
  });

  it('times out hanging startup, prevents duplicate instances, ignores late completion and permits retry after cleanup', async () => {
    vi.useFakeTimers();
    const startup = deferred();
    const candidate = built(() => startup.promise);
    const factory = vi.fn().mockResolvedValueOnce(candidate).mockResolvedValue(built());
    const session = new OperatorSession(factory, 120_000);
    const first = session.connect();
    const rejection = expect(first).rejects.toThrow('timed out');
    await vi.advanceTimersByTimeAsync(120_000);
    await rejection;
    expect(session.info().connected).toBe(false);
    await expect(session.connect()).rejects.toThrow('cleaning up');
    expect(factory).toHaveBeenCalledTimes(1);
    startup.resolve();
    await vi.advanceTimersByTimeAsync(0);
    expect(session.info().connected).toBe(false);
    await session.connect();
    expect(factory).toHaveBeenCalledTimes(2);
    await session.disconnect();
  });

  it('cleans up a constructor that resolves after the initialization deadline without starting it', async () => {
    vi.useFakeTimers();
    const construction = deferred();
    const candidate = built();
    const session = new OperatorSession(() => construction.promise, 120_000);
    const rejection = expect(session.connect()).rejects.toThrow('timed out');
    await vi.advanceTimersByTimeAsync(120_000);
    await rejection;
    construction.resolve(candidate);
    await vi.advanceTimersByTimeAsync(0);
    expect(candidate.start).not.toHaveBeenCalled();
    expect(candidate.wallet.stop).toHaveBeenCalled();
    expect(session.info().connected).toBe(false);
  });

  it('does not reconnect if cleanup cannot be confirmed', async () => {
    const candidate = built(vi.fn().mockRejectedValue(new Error('startup failed')), vi.fn().mockRejectedValue(new Error('cleanup failed')));
    const factory = vi.fn().mockResolvedValue(candidate);
    const session = new OperatorSession(factory);
    await expect(session.connect()).rejects.toThrow(OperatorConnectionError);
    await vi.waitFor(() => expect(session.info().stage).toContain('Cleanup failed'));
    await expect(session.connect()).rejects.toThrow('restart');
    expect(factory).toHaveBeenCalledTimes(1);
  });
});
