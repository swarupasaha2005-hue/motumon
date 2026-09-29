import { describe, expect, it } from 'vitest';
import { InputError, friendlyError, parseOpening, publicLedger } from './preview-service.mjs';

const h = (byte) => byte.repeat(64);
const bytes = (byte) => Uint8Array.from(Buffer.from(h(byte), 'hex'));
const opening = () => ({
  format: 'paydrip-record-v1', domain: h('1'), organization: h('2'), epoch: h('3'),
  employeePseudonym: h('4'), monthlySalaryMinor: '500000', currency: 'USD', randomness: h('5'),
});

describe('local terminal privacy boundaries', () => {
  it('accepts a complete private opening and rejects malformed or out-of-range values', () => {
    const parsed = parseOpening(opening());
    expect(parsed.record.monthlySalaryMinor).toBe(500000n);
    expect(parsed.randomness).toHaveLength(32);
    expect(() => parseOpening({ ...opening(), monthlySalaryMinor: '0' })).toThrow(InputError);
    expect(() => parseOpening({ ...opening(), monthlySalaryMinor: '18446744073709551616' })).toThrow(InputError);
    expect(() => parseOpening({ ...opening(), randomness: 'short' })).toThrow(InputError);
    expect(() => parseOpening({ ...opening(), currency: 'EUR' })).toThrow(InputError);
  });

  it('serializes only public ledger fields and links a claim to its record handle', () => {
    const commitment = bytes('5');
    const context = bytes('6');
    const epoch = bytes('3');
    const result = publicLedger({
      organization: bytes('2'), domain: bytes('1'), currency: Uint8Array.from(Buffer.from('USD')),
      epochs: [[epoch, 1n]], records: [[commitment, epoch]], revoked: [],
      claims: [[context, 2n]], claimRecords: { lookup: () => commitment },
    });
    expect(result.epochs[0].status).toBe('Open');
    expect(result.claims[0]).toMatchObject({ context: h('6'), tier: 2, commitment: h('5'), epoch: h('3') });
    expect(JSON.stringify(result)).not.toMatch(/salary|secret|randomness/i);
  });

  it('does not return private values from unknown SDK errors', () => {
    const message = friendlyError(new Error(`Unexpected call with private salary ${opening().monthlySalaryMinor}`));
    expect(message).not.toContain(opening().monthlySalaryMinor);
    expect(friendlyError(new Error('Below threshold'))).toBe('Below threshold');
  });
});
