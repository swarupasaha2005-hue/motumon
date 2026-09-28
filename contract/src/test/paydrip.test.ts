import { randomBytes } from 'node:crypto';
import {
  CompactTypeBytes,
  CompactTypeVector,
  CostModel,
  createConstructorContext,
  persistentHash,
  QueryContext,
  sampleContractAddress,
} from '@midnight-ntwrk/compact-runtime';
import { setNetworkId } from '@midnight-ntwrk/midnight-js-network-id';
import { describe, expect, it } from 'vitest';
import { Contract, ledger, type PayrollRecord } from '../managed/paydrip/contract/index.js';

setNetworkId('undeployed');

const bytes = (s: string) => Uint8Array.from(Buffer.from(s));
const padded = (s: string) => Uint8Array.from(Buffer.concat([Buffer.from(s), Buffer.alloc(32 - Buffer.byteLength(s))]));
const b32 = () => randomBytes(32);
const vector3 = new CompactTypeVector(3, new CompactTypeBytes(32));
const vector4 = new CompactTypeVector(4, new CompactTypeBytes(32));
const hex = (b: Uint8Array) => Buffer.from(b).toString('hex');

function setup() {
  const org = b32();
  const domain = b32();
  const adminSecret = b32();
  const employeeSecret = b32();
  const epoch = b32();
  const randomness = b32();
  const adminHash = persistentHash(vector3, [padded('paydrip:admin:v1'), domain, adminSecret]);
  const pseudonym = persistentHash(vector4, [padded('paydrip:employee:v1'), domain, epoch, employeeSecret]);
  const contract = new Contract({});
  const initial = contract.initialState(createConstructorContext({}, '0'.repeat(64)), org, domain, bytes('USD'), adminHash);
  let context = {
    currentPrivateState: initial.currentPrivateState,
    currentZswapLocalState: initial.currentZswapLocalState,
    costModel: CostModel.initialCostModel(),
    currentQueryContext: new QueryContext(initial.currentContractState.data, sampleContractAddress()),
  };
  const call = <K extends keyof typeof contract.impureCircuits>(name: K, ...args: unknown[]) => {
    // The generated surface is typed per circuit; tests dispatch dynamically to inspect state transitions.
    const circuit = contract.impureCircuits[name] as (...xs: any[]) => { context: typeof context };
    context = circuit(context, ...args).context;
  };
  const state = () => ledger(context.currentQueryContext.state);
  const record: PayrollRecord = {
    domain, organization: org, epoch, employeePseudonym: pseudonym,
    monthlySalaryMinor: 500000n, currency: bytes('USD'),
  };
  return { call, state, record, randomness, adminSecret, employeeSecret, epoch };
}

describe('PayDrip protocol', () => {
  it('binds salary and employee identity to an issued record', () => {
    const s = setup();
    s.call('openEpoch', s.epoch, s.adminSecret);
    s.call('registerRecord', s.record, s.randomness, s.adminSecret);
    s.call('proveIncomeTier', s.record, s.randomness, s.employeeSecret, 2n, b32());
    expect(s.state().claims.size()).toBe(1n);
    expect(() => s.call('proveIncomeTier', { ...s.record, monthlySalaryMinor: 1000000n }, s.randomness, s.employeeSecret, 3n, b32())).toThrow();
    expect(() => s.call('proveIncomeTier', s.record, s.randomness, b32(), 1n, b32())).toThrow();
    expect(() => s.call('proveIncomeTier', s.record, b32(), s.employeeSecret, 1n, b32())).toThrow();
    expect(() => s.call('proveEmployment', { ...s.record, organization: b32() }, s.randomness, s.employeeSecret, b32())).toThrow();
    expect(() => s.call('proveEmployment', { ...s.record, epoch: b32() }, s.randomness, s.employeeSecret, b32())).toThrow();
  });

  it('enforces tier policy, request uniqueness and admin lifecycle', () => {
    const s = setup();
    expect(() => s.call('openEpoch', s.epoch, b32())).toThrow();
    s.call('openEpoch', s.epoch, s.adminSecret);
    expect(() => s.call('openEpoch', s.epoch, s.adminSecret)).toThrow();
    s.call('registerRecord', s.record, s.randomness, s.adminSecret);
    expect(() => s.call('proveIncomeTier', s.record, s.randomness, s.employeeSecret, 3n, b32())).toThrow();
    const request = b32();
    s.call('proveEmployment', s.record, s.randomness, s.employeeSecret, request);
    expect(() => s.call('proveEmployment', s.record, s.randomness, s.employeeSecret, request)).toThrow();
    s.call('closeEpoch', s.epoch, s.adminSecret);
    expect(() => s.call('registerRecord', { ...s.record, monthlySalaryMinor: 600000n }, b32(), s.adminSecret)).toThrow();
    s.call('proveEmployment', s.record, s.randomness, s.employeeSecret, b32());
    expect(s.state().epochs.lookup(s.epoch)).toBe(2n);
  });

  it('revokes only the record in the named open epoch', () => {
    const s = setup();
    s.call('openEpoch', s.epoch, s.adminSecret);
    s.call('registerRecord', s.record, s.randomness, s.adminSecret);
    const commitment = [...s.state().records][0][0];
    expect(hex(commitment)).toHaveLength(64);
    const otherEpoch = b32();
    s.call('openEpoch', otherEpoch, s.adminSecret);
    expect(() => s.call('revokeRecord', commitment, otherEpoch, s.adminSecret)).toThrow();
    s.call('revokeRecord', commitment, s.epoch, s.adminSecret);
    expect(() => s.call('proveEmployment', s.record, s.randomness, s.employeeSecret, b32())).toThrow();
  });
});
