import { describe, it, expect } from 'vitest';
import { collectActivity, parseCsv, csvCell, joinFeedback, linkedResponses, sentimentDistribution, ACTION_QUERY } from '../../../scripts/lib/user-evidence.mjs';
const contract = 'a'.repeat(64), hash = 'b'.repeat(64), blockHash = 'c'.repeat(64);
const manifest = { network: 'preview', contractAddress: contract };
const tx = { hash, contractActions: [{ address: contract, __typename: 'ContractCall' }] };
const block = { height: 10, hash: blockHash, timestamp: 123, transactions: [tx, tx] };
describe('read-only user evidence (mock indexer, not network proof)', () => {
  it('corroborates and deduplicates hashes without attributing users', async () => {
    const result = await collectActivity(async (q, v) => q === ACTION_QUERY ? { contractAction: v.offset ? null :
      { address: contract, transaction: { hash, block } } } : { block }, manifest);
    expect(result.complete).toBe(true); expect(result.rows).toHaveLength(1);
    expect(result.rows[0].public_wallet).toBe('');
    expect(JSON.stringify(result)).not.toMatch(/salary|seed|employeeSecret|randomness|raw/);
  });
  it('rejects uncorroborated transactions', async () => {
    await expect(collectActivity(async q => q === ACTION_QUERY ? { contractAction:
      { address: contract, transaction: { hash, block } } } : { block: { ...block, hash: 'd'.repeat(64) } }, manifest)).rejects.toThrow('correlation');
  });
  it('marks capped history incomplete rather than inflating totals', async () => {
    expect((await collectActivity(async q => q === ACTION_QUERY ? { contractAction:
      { address: contract, transaction: { hash, block } } } : { block }, manifest, 1)).complete).toBe(false);
  });
  it('never treats cohort assertions as verified wallet participation; requires consent', () => {
    const rows = [{ transaction_hash: hash, network: 'preview', sdk_identifiers: [] }];
    const participant = { network: 'preview', public_transaction_or_claim: hash, publication_consent: 'true', feedback_received: 'true', issue_id: 'i' };
    expect(joinFeedback(rows, [participant], [{ issue_id:'i', sanitized_summary:'Helpful interface' }])[0].evidence_status).toContain('NOT ATTRIBUTABLE');
    expect(joinFeedback(rows, [{ ...participant, publication_consent: 'false' }], [{ issue_id:'i', sanitized_summary:'Not consented' }])[0].feedback).toBe('');
  });
  it('parses real quoted CSV and rejects malformed files', () => {
    expect(parseCsv('a,b\n"one,two","say ""hello"""\n')).toEqual([{a:'one,two',b:'say "hello"'}]);
    expect(()=>parseCsv('a,b\n"broken')).toThrow();
    expect(()=>parseCsv('a,b\nonly\n')).toThrow();
    expect(parseCsv('a,b\n')).toEqual([]);
  });
  it('joins only consented indexed feedback and calculates actual distribution', () => {
    const rows = [{ transaction_hash: hash, network: 'preview', sdk_identifiers: [] }];
    const base = { network:'preview', public_transaction_or_claim:hash, publication_consent:'true', sanitized_summary:'Public feedback' };
    const responses = linkedResponses(rows, [{...base,response_id:'1',sentiment:'Positive'}, {...base,response_id:'1',sentiment:'Negative'}, {...base,response_id:'2',sentiment:'Mixed'}, {...base,response_id:'3',sentiment:''}, {...base,response_id:'4',publication_consent:'false',sentiment:'Negative'}]);
    expect(responses).toHaveLength(3);
    expect(sentimentDistribution(responses)).toEqual({counts:{Positive:1,Negative:0,Mixed:1,Neutral:0}, classified:2,unclassified:1,percentages:{Positive:'50.00%',Negative:'0.00%',Mixed:'50.00%',Neutral:'0.00%'}});
    expect(sentimentDistribution([]).percentages.Positive).toBe('N/A');
  });
  it('escapes spreadsheet formulas', () => { expect(csvCell('=1+1')).toBe('"\'=1+1"'); });
});
