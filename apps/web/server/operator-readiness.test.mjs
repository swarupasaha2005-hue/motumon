// SDK predicate semantics and mocked observables; not live Preview evidence.
import { afterEach, describe, it, expect, vi } from 'vitest';
import { BehaviorSubject, NEVER, throwError } from 'rxjs';
import { SyncProgress } from '@midnight-ntwrk/wallet-sdk-abstractions';
import { operatorDiagnostics, waitForOperatorSync, OperatorSyncError } from './operator-readiness.mjs';
import { previewOperatorConfiguration } from './preview-service.mjs';
const info={connected:true,address:'public-test-address'};
function state({connected=true,applied=10n,tip=10n,night=0n,total=0n,available=0n,unregistered=false}={}) {
  const progress=SyncProgress.createSyncProgress({isConnected:connected,appliedIndex:applied,highestRelevantWalletIndex:tip});
  return {privateKey:'MOCK-PRIVATE-MARKER',unshielded:{progress:{isStrictlyComplete:()=>true,isConnected:true,appliedId:5n,highestTransactionId:5n},
    balances:{NIGHT:night},availableCoins:night>0n?[{utxo:{type:'NIGHT'},meta:{registeredForDustGeneration:!unregistered}}]:[]},
    dust:{state:{progress,secret:'MOCK-PRIVATE-MARKER'},balance:()=>total,pendingCoins:total>available?[{nonce:'MOCK-PRIVATE-MARKER'}]:[],
      capabilities:{coinsAndBalances:{getAvailableCoinsWithGeneratedDust:()=>available>0n?[{value:available,token:{nonce:'MOCK-PRIVATE-MARKER'}}]:[]}}}};
}
const describeState=s=>operatorDiagnostics(s,info,'NIGHT');
afterEach(()=>vi.useRealTimers());
describe('DUST synchronization/readiness (offline)',()=>{
  it('zero DUST does not mean incomplete SDK synchronization',()=>{
    const result=describeState(state());expect(result.dustSynced).toBe(true);
    expect(result.readinessReason).toBe('NO_NIGHT_OR_DUST');expect(result.feeReadiness).toBe('NOT_READY');
  });
  it('strictly requires connection and zero event gap, even with positive DUST',()=>{
    expect(describeState(state({connected:false,available:10n,total:10n})).dustSynced).toBe(false);
    const result=describeState(state({applied:1n,tip:20n,available:10n,total:10n}));
    expect(result.dustSynced).toBe(false);expect(result.dustProgress.gap).toBe('19');
    expect(result.readinessReason).toBe('SYNCING_DUST');expect(result.balancesProvisional).toBe(true);
  });
  it('distinguishes no received events from replay lag without claiming RPC failure',()=>{
    expect(describeState(state({connected:false,applied:0n,tip:0n})).readinessReason).toBe('DUST_NO_EVENTS_OBSERVED');
  });
  it('excludes pending coins from spendable DUST and identifies unregistered NIGHT',()=>{
    const reserved=describeState(state({night:100n,total:100n,available:0n}));
    expect(reserved.dustBalanceRaw).toBe('100');expect(reserved.spendableDustRaw).toBe('0');
    expect(reserved.readinessReason).toBe('DUST_PENDING_OR_RESERVED');
    expect(describeState(state({night:100n,unregistered:true})).readinessReason).toBe('DUST_GENERATION_REGISTRATION_REQUIRED');
    expect(describeState(state({night:100n})).readinessReason).toBe('NO_SPENDABLE_DUST');
    expect(describeState(state({total:100n,available:40n})).readinessReason).toBe('READY_FOR_FEE_ESTIMATION');
  });
  it('serializes only scalar diagnostics and no coin/key/nonce objects',()=>{
    const output=JSON.stringify(describeState(state({night:100n,total:10n,available:5n})));
    expect(output).not.toMatch(/MOCK-PRIVATE-MARKER|privateKey|nonce|"secret"/);
  });
  it('uses the same Preview endpoints and explicit bounded replay batches as deployment tooling',()=>{
    const config=previewOperatorConfiguration();
    expect(config.networkId).toBe('preview');expect(config.batchUpdates).toEqual({size:100,timeout:10,spacing:0});
    expect(config.indexerClientConnection.indexerWsUrl).toBe('wss://indexer.preview.midnight.network/api/v4/graphql/ws');
    expect(config.relayURL.href).toBe('wss://rpc.preview.midnight.network/');
  });
  it('continues monitoring one stream until strict sync, then unsubscribes',async()=>{
    vi.useFakeTimers();const source=new BehaviorSubject(state({applied:1n,tip:20n}));
    const result=waitForOperatorSync(source,describeState,{timeoutMs:5000});
    await vi.advanceTimersByTimeAsync(1);source.next(state({total:0n}));
    await vi.advanceTimersByTimeAsync(1000);
    expect((await result).dustSynced).toBe(true);expect(source.observers).toHaveLength(0);
  });
  it('repeated unsynced emissions never extend the fixed deadline',async()=>{
    vi.useFakeTimers();const source=new BehaviorSubject(state({applied:1n,tip:20n}));const observation=vi.fn();
    const result=waitForOperatorSync(source,describeState,{timeoutMs:3000,onObservation:observation,heartbeatMs:15000}).catch(e=>e);
    for(let i=0;i<3;i++){source.next(state({applied:BigInt(i+2),tip:20n}));await vi.advanceTimersByTimeAsync(1000);}
    const error=await result;expect(error).toBeInstanceOf(OperatorSyncError);expect(error.message).toContain('DUST synchronization');
    expect(error.diagnostics.dustSynced).toBe(false);expect(source.observers).toHaveLength(0);expect(observation.mock.calls.length).toBeLessThan(4);
  });
  it('times out a silent observable and sanitizes state-stream failure',async()=>{
    vi.useFakeTimers();const waiting=waitForOperatorSync(NEVER,describeState,{timeoutMs:1000}).catch(e=>e);
    await vi.advanceTimersByTimeAsync(1000);expect((await waiting).diagnostics).toBeNull();
    await expect(waitForOperatorSync(throwError(()=>new Error('MOCK-PRIVATE-MARKER')),describeState)).rejects.toThrow('SDK wallet state subscription failed');
  });
});
