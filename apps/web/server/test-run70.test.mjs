// MOCKED network boundaries. These tests are not transaction or traction evidence.
import { createHash } from 'node:crypto';
import { describe, it, expect } from 'vitest';
import { initialCheckpoint, runControlledTests, summary } from '../../../scripts/lib/test-run70.mjs';
function harness(failCircuit=null) {
  const cp=initialCheckpoint('a'.repeat(64));
  const vault={participants:[]}; const calls=[];
  const state={domain:'b'.repeat(64),organization:'c'.repeat(64),epochs:[],records:[],claims:[]};
  const digest=x=>createHash('sha256').update(x).digest('hex');
  const service={state:async()=>state,derivePseudonym:async({employeeSecret})=>({pseudonym:digest(employeeSecret)}),
    checkRecord:async({opening})=>({commitment:digest(opening.employeePseudonym)}),
    claim:async context=>({found:state.claims.some(c=>c.context===context),claim:state.claims.find(c=>c.context===context)}),
    perform:async(circuit,input)=>{
      calls.push(circuit); if(circuit===failCircuit)throw new Error('MOCK boundary failure');
      if(circuit==='openEpoch')state.epochs.push({id:input.epoch,status:'Open'});
      if(circuit==='registerRecord')state.records.push({commitment:digest(input.opening.employeePseudonym),epoch:input.opening.epoch,revoked:false});
      if(circuit==='proveIncomeTier')state.claims.push({context:input.context,commitment:digest(input.opening.employeePseudonym),epoch:input.opening.epoch,tier:1});
      return{txId:digest('mock-'+calls.length)};
    }};
  const options={service,checkpoint:cp,vault,save:async()=>{},verify:async()=>({indexed:true,block:1,txHash:digest('mock-indexed')})};
  return{options,cp,vault,calls,state};
}
describe('controlled sequential runner — OFFLINE MOCKS ONLY',()=>{
  it('runs exactly one canary before bulk and resumes it without duplicate transactions',async()=>{
    const h=harness(); await runControlledTests({...h.options,canaryOnly:true});
    expect(h.calls).toEqual(['openEpoch','registerRecord','proveIncomeTier']); expect(h.cp.canaryVerified).toBe(true);
    await runControlledTests({...h.options,canaryOnly:true}); expect(h.calls).toHaveLength(3);
    expect(summary(h.cp).completed).toBe(1);
  });
  it('runs exactly 70 distinct controlled identities, one epoch, sequentially',async()=>{
    const h=harness(); await runControlledTests(h.options);
    expect(summary(h.cp)).toMatchObject({target:70,attempted:70,completed:70,failed:0,transactionsVerified:141});
    expect(h.calls.filter(c=>c==='openEpoch')).toHaveLength(1);
    expect(new Set(h.cp.participants.map(p=>p.pseudonym)).size).toBe(70);
    expect(h.vault.participants).toHaveLength(70);
    expect(JSON.stringify(h.cp)).not.toMatch(/employeeSecret|monthlySalaryMinor|randomness/);
  });
  it('stops after canary failure without creating bulk participants or blindly retrying',async()=>{
    const h=harness('proveIncomeTier'); await expect(runControlledTests(h.options)).rejects.toThrow('MOCK');
    expect(h.cp.participants).toHaveLength(1); expect(h.cp.participants[0].claim.status).toBe('AMBIGUOUS');
    const count=h.calls.length; await expect(runControlledTests(h.options)).rejects.toThrow('ambiguous');
    expect(h.calls).toHaveLength(count);
  });
  it('persists a returned ID but never reports success without indexer verification',async()=>{
    const h=harness(); h.options.verify=async()=>{throw new Error('Indexer unavailable');};
    await expect(runControlledTests(h.options)).rejects.toThrow('Indexer');
    expect(h.cp.epochAction.txId).toBeTruthy();expect(h.cp.epochAction.status).toBe('AMBIGUOUS');
    expect(summary(h.cp).transactionsVerified).toBe(0);expect(h.cp.participants).toHaveLength(0);
  });
  it('stops on an unexpected existing effect before sending',async()=>{
    const h=harness();h.cp.epoch='d'.repeat(64);h.state.epochs.push({id:h.cp.epoch,status:'Open'});
    await expect(runControlledTests(h.options)).rejects.toThrow('Unexpected existing'); expect(h.calls).toHaveLength(0);
  });
  it('recovers a known pending ID by verification, not resubmission',async()=>{
    const h=harness();let first=true;const verify=h.options.verify;
    h.options.verify=async(...args)=>{if(first){first=false;throw new Error('Temporary indexer failure');}return verify(...args);};
    await expect(runControlledTests({...h.options,canaryOnly:true})).rejects.toThrow('Temporary');
    await runControlledTests({...h.options,canaryOnly:true});
    expect(h.calls).toHaveLength(3);expect(summary(h.cp).completed).toBe(1);
  });
});
