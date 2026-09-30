import { randomBytes } from 'node:crypto';

export const TARGET = 70;
export function randomHex() {
  let value; do { value=randomBytes(32).toString('hex'); } while (/^0+$/.test(value));
  return value;
}
export class RunStop extends Error {
  constructor(stage, safeMessage, retrySafe = false) { super(safeMessage); this.stage = stage; this.retrySafe = retrySafe; }
}
export function initialCheckpoint(contract) {
  return { format: 'paydrip-controlled-test-v1', network: 'preview', contract, target: TARGET, epoch: null,
    operator: null, epochAction: null, participants: [], failure: null };
}
export function effectPresent(state, action, expected) {
  if (action === 'openEpoch') return state.epochs.some(e=>e.id===expected.epoch && e.status==='Open');
  if (action === 'registerRecord') return state.records.some(r=>r.commitment===expected.commitment && r.epoch===expected.epoch && !r.revoked);
  if (action === 'proveIncomeTier') return state.claims.some(c=>c.context===expected.context && c.commitment===expected.commitment && c.epoch===expected.epoch && c.tier===1);
  return false;
}
export function summary(checkpoint) {
  const actions = [checkpoint.epochAction, ...checkpoint.participants.flatMap(p=>[p.registration,p.claim])].filter(Boolean);
  return { target: TARGET, attempted: checkpoint.participants.filter(p=>p.registration || p.claim).length,
    completed: checkpoint.participants.filter(p=>p.registration?.status==='VERIFIED' && p.claim?.status==='VERIFIED').length,
    failed: checkpoint.participants.filter(p=>[p.registration,p.claim].some(a=>a && ['FAILED','AMBIGUOUS'].includes(a.status))).length,
    transactionsSubmitted: actions.filter(a=>a.txId).length,
    submissionAttempts: actions.filter(a=>a.intent).length,
    transactionsVerified: actions.filter(a=>a.status==='VERIFIED').length };
}

// Reuses service.perform; no protocol/signing implementation lives here.
export async function runControlledTests({ service, checkpoint: cp, vault, save, verify, canaryOnly = false, recoverTxId = null, emit = () => {} }) {
  async function action(holder, key, circuit, input, expected) {
    const old = holder[key];
    if (old?.intent) {
      // Always read current public state before deciding whether to retry.
      const current = await service.state();
      if (old.status==='VERIFIED') {
        await verify(old.txId, circuit, expected);
        if (!effectPresent(current,circuit,expected)) throw new RunStop(circuit,'Previously verified test state is no longer valid. No resubmission.',false);
        return;
      }
      const id = old.txId ?? recoverTxId;
      if (!id) throw new RunStop(circuit, effectPresent(current,circuit,expected)
        ? 'Public effect exists but transaction attribution is unresolved. Supply the actual SDK transaction ID using --recover-tx-id; no resubmission.'
        : 'Prior submission outcome is ambiguous. Inspect indexer evidence before retrying; automatic resubmission is disabled.', false);
      const evidence = await verify(id,circuit,expected);
      if (!effectPresent(current,circuit,expected)) throw new RunStop(circuit,'Recovered transaction is indexed but current test state is invalid.',false);
      Object.assign(old,evidence,{status:'VERIFIED',txId:id}); recoverTxId=null; await save(); return;
    }
    const before = await service.state();
    if (effectPresent(before,circuit,expected)) throw new RunStop(circuit,'Unexpected existing test receipt before first submission. No transaction sent.',false);
    holder[key] = { circuit, intent:true, status:'AMBIGUOUS', txId:null, ...expected };
    await save(); // Durable intent prevents duplicate submissions after crash/timeout.
    try {
      emit(circuit);
      const result = await service.perform(circuit,input,stage=>emit(stage));
      if (!result.txId) throw new RunStop(circuit,'Service returned no transaction ID. Submission outcome remains ambiguous.',false);
      holder[key].txId=result.txId; await save();
      const evidence = await verify(result.txId,circuit,expected);
      if (!effectPresent(await service.state(),circuit,expected)) throw new RunStop(circuit,'Indexed transaction did not establish the required current public effect.',false);
      Object.assign(holder[key],evidence,{status:'VERIFIED'}); await save();
    } catch (error) { await save(); throw error; }
  }
  if (!cp.epoch) { cp.epoch = randomHex(); vault.epoch=cp.epoch; await save(); }
  await action(cp,'epochAction','openEpoch',{epoch:cp.epoch},{epoch:cp.epoch});
  async function participant(number) {
    let entry = cp.participants.find(p=>p.number===number);
    let privateEntry = vault.participants.find(p=>p.number===number);
    if (!entry) {
      const state = await service.state();
      let employeeSecret; do { employeeSecret=randomHex(); } while(vault.participants.some(p=>p.employeeSecret===employeeSecret));
      const {pseudonym} = await service.derivePseudonym({epoch:cp.epoch,employeeSecret});
      if (cp.participants.some(p=>p.pseudonym===pseudonym)) throw new RunStop('Identity','Duplicate pseudonym detected.',false);
      const opening = {format:'paydrip-record-v1', domain:state.domain, organization:state.organization, epoch:cp.epoch,
        employeePseudonym:pseudonym, monthlySalaryMinor:'500000',currency:'USD',randomness:randomHex()};
      const record = await service.checkRecord({opening,employeeSecret});
      let context; do { context=randomHex(); } while(cp.participants.some(p=>p.context===context));
      entry = {number,pseudonym,commitment:record.commitment,context,registration:null,claim:null};
      privateEntry = {number,employeeSecret,opening};
      cp.participants.push(entry); vault.participants.push(privateEntry); await save();
    }
    if (!privateEntry) throw new RunStop('Private vault','Existing participant private material is missing; do not regenerate.',false);
    await action(entry,'registration','registerRecord',{opening:privateEntry.opening},{epoch:cp.epoch,commitment:entry.commitment});
    await action(entry,'claim','proveIncomeTier',{opening:privateEntry.opening,employeeSecret:privateEntry.employeeSecret,context:entry.context,tier:1},
      {epoch:cp.epoch,commitment:entry.commitment,context:entry.context});
    const receipt = await service.claim(entry.context);
    if (!receipt.found || receipt.claim.tier!==1 || receipt.claim.commitment!==entry.commitment || receipt.claim.epoch!==cp.epoch)
      throw new RunStop('Verifier','Read-only claim receipt did not match the test participant.',false);
    emit(`TEST participant ${number}: indexed registration and income claim verified`);
  }
  await participant(1); // Mandatory canary, including on resume.
  cp.canaryVerified = true; await save();
  if (!canaryOnly) for (let number=2;number<=TARGET;number++) await participant(number);
}
