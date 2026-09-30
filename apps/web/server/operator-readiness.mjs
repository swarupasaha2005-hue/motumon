import { combineLatest, firstValueFrom, timer, map, tap, filter, timeout, throttleTime, catchError, throwError } from 'rxjs';

export const SYNC_TIMEOUT_MS = 15 * 60 * 1000;
export class OperatorSyncError extends Error {
  constructor(message, diagnostics = null) { super(message); this.diagnostics = diagnostics; }
}
const scalar = value => typeof value === 'bigint' || typeof value === 'number' ? String(value) : null;
const gap = (high, applied) => typeof high === 'bigint' && typeof applied === 'bigint'
  ? String(high >= applied ? high - applied : applied - high) : null;

// Whitelisted scalar diagnostics only. Never return coin objects, keys or raw SDK state.
export function operatorDiagnostics(state, info, nightToken, time = new Date()) {
  const u=state.unshielded, d=state.dust, up=u.progress, dp=d.state.progress;
  const unshieldedSynced=up?.isStrictlyComplete?.()===true, dustSynced=dp?.isStrictlyComplete?.()===true;
  const available=d.capabilities.coinsAndBalances.getAvailableCoinsWithGeneratedDust(d.state,time);
  const spendable=available.reduce((sum,coin)=>sum+coin.value,0n);
  const night=u.balances[nightToken] ?? 0n;
  const nightCoins=u.availableCoins.filter(c=>c.utxo.type===nightToken);
  const unregistered=nightCoins.filter(c=>c.meta.registeredForDustGeneration===false).length;
  const total=d.balance(time);
  let readinessReason;
  if(!unshieldedSynced) readinessReason='SYNCING_UNSHIELDED';
  else if(!dustSynced) readinessReason=dp?.isConnected===true?'SYNCING_DUST':'DUST_NO_EVENTS_OBSERVED';
  else if(spendable>0n) readinessReason='READY_FOR_FEE_ESTIMATION';
  else if(total>0n) readinessReason='DUST_PENDING_OR_RESERVED';
  else if(night===0n) readinessReason='NO_NIGHT_OR_DUST';
  else if(unregistered>0) readinessReason='DUST_GENERATION_REGISTRATION_REQUIRED';
  else readinessReason='NO_SPENDABLE_DUST';
  return {
    network:'Preview',connected:info.connected===true,address:info.address??null,
    unshieldedSynced,dustSynced,nightRaw:String(night),dustBalanceRaw:String(total),spendableDustRaw:String(spendable),
    balancesProvisional:!(unshieldedSynced&&dustSynced),availableNightCoins:nightCoins.length,unregisteredNightCoins:unregistered,
    availableDustCoins:available.length,pendingDustCoins:d.pendingCoins.length,
    unshieldedProgress:{isConnected:up?.isConnected===true,appliedId:scalar(up?.appliedId),highestTransactionId:scalar(up?.highestTransactionId),
      gap:gap(up?.highestTransactionId,up?.appliedId)},
    dustProgress:{isConnected:dp?.isConnected===true,appliedIndex:scalar(dp?.appliedIndex),highestRelevantWalletIndex:scalar(dp?.highestRelevantWalletIndex),
      highestIndex:scalar(dp?.highestIndex),highestRelevantIndex:scalar(dp?.highestRelevantIndex),gap:gap(dp?.highestRelevantWalletIndex,dp?.appliedIndex)},
    readinessReason,feeReadiness:spendable>0n&&unshieldedSynced&&dustSynced?'POSITIVE_SPENDABLE_DUST; SDK_FEE_ESTIMATE_REQUIRED':'NOT_READY',
  };
}

export async function waitForOperatorSync(state$, describe, { timeoutMs=SYNC_TIMEOUT_MS, onObservation=(_value)=>{}, heartbeatMs=15000 }={}) {
  /** @type {ReturnType<typeof operatorDiagnostics> | null} */
  let last=null;
  let lastPrinted=-Infinity, previousReason=null;
  const started=Date.now();
  try {
    // One continuous state subscription. The deadline is after filter: repeated
    // unsynced emissions cannot reset it. Throttle diagnostics, not SDK replay.
    return await firstValueFrom(combineLatest([
      state$.pipe(catchError(()=>throwError(()=>new OperatorSyncError('SDK wallet state subscription failed. No raw SDK error or private state is exposed.',last))),throttleTime(1000,undefined,{leading:true,trailing:true})),timer(0,1000),
    ]).pipe(
      map(([state])=>({...describe(state),elapsedSeconds:Math.floor((Date.now()-started)/1000),timeoutSeconds:timeoutMs/1000})),
      tap(value=>{
        last=value;
        if(value.readinessReason!==previousReason || Date.now()-lastPrinted>=heartbeatMs || value.unshieldedSynced&&value.dustSynced){
          onObservation(value);lastPrinted=Date.now();previousReason=value.readinessReason;
        }
      }),
      filter(value=>value.unshieldedSynced&&value.dustSynced),
      timeout({first:timeoutMs}),
    ));
  } catch(error) {
    if(error instanceof OperatorSyncError) throw error;
    if(error?.name==='TimeoutError') {
      const diagnostic=/** @type {ReturnType<typeof operatorDiagnostics> | null} */ (last);
      const subject=diagnostic?.unshieldedSynced&&!diagnostic?.dustSynced?'DUST synchronization':'Operator synchronization';
      throw new OperatorSyncError(`${subject} did not complete within ${timeoutMs/60000} minutes. Inspect the reported event gap and event-receipt status; funding is separate. No transaction submitted by this wait.`,last);
    }
    throw new OperatorSyncError('DUST progress/balance diagnostics failed. No raw SDK error or private state is exposed.',last);
  }
}
