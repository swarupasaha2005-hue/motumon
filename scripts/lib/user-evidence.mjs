// Public metadata only. No wallet, raw transaction, witness or state decoding.
export const ACTION_QUERY = `query EvidenceAction($address: HexEncoded!, $offset: ContractActionOffset) {
  contractAction(address: $address, offset: $offset) { __typename address transaction { hash block { height hash timestamp } } }
}`;
export const BLOCK_QUERY = `query EvidenceBlock($offset: BlockOffset) {
  block(offset: $offset) { height hash timestamp transactions {
    hash id contractActions { __typename address }
    ... on RegularTransaction { identifiers }
  } }
}`;

export function parseCsv(text) {
  const rows = []; let row = [], field = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      if (quoted && text[i + 1] === '"') { field += '"'; i++; }
      else if (!quoted && field) throw new Error('Invalid CSV quoting');
      else quoted = !quoted;
    } else if (c === ',' && !quoted) { row.push(field); field = ''; }
    else if (c === '\n' && !quoted) { row.push(field.replace(/\r$/, '')); if (row.some(Boolean)) rows.push(row); row = []; field = ''; }
    else field += c;
  }
  if (quoted) throw new Error('Unterminated CSV field');
  if (field || row.length) { row.push(field.replace(/\r$/, '')); rows.push(row); }
  const headers = rows.shift() ?? [];
  return rows.map(values => {
    if (values.length !== headers.length) throw new Error('CSV column mismatch');
    return Object.fromEntries(headers.map((h, i) => [h, values[i]]));
  });
}
export function csvCell(value) {
  let text = String(value ?? '');
  // Prevent spreadsheet formula execution when feedback is exported.
  if (/^[=+@\-\t\r]/.test(text)) text = "'" + text;
  return '"' + text.replaceAll('"', '""') + '"';
}
export function joinFeedback(transactions, cohort, issues) {
  return transactions.map(tx => {
    const participants = cohort.filter(c => c.network === tx.network && c.publication_consent === 'true' &&
      [tx.transaction_hash, ...tx.sdk_identifiers].includes(c.public_transaction_or_claim));
    // A cohort assertion is not cryptographic attribution; never promote it to a verified user.
    const feedback = participants.flatMap(c => issues.filter(i => i.issue_id === c.issue_id && c.feedback_received === 'true'));
    return { ...tx, feedback: [...new Set(feedback.map(i => i.sanitized_summary).filter(Boolean))].join(' / '),
      sentiment: '', evidence_status: 'INDEXED TRANSACTION; UNIQUE USER NOT ATTRIBUTABLE' };
  });
}
export async function collectActivity(query, manifest, limit = 10000) {
  const rows = new Map(); let offset = null, previousHeight = Infinity, blocks = 0;
  while (blocks < limit) {
    const action = (await query(ACTION_QUERY, { address: manifest.contractAddress, offset })).contractAction;
    if (!action) return { rows: [...rows.values()], complete: true };
    const height = action.transaction?.block?.height;
    if (!Number.isSafeInteger(height) || height < 0 || height >= previousHeight || action.address !== manifest.contractAddress)
      throw new Error('Indexer history cursor could not be verified');
    const block = (await query(BLOCK_QUERY, { offset: { height } })).block;
    if (!block || block.height !== height || block.hash !== action.transaction.block.hash ||
      !block.transactions.some(t => t.hash === action.transaction.hash)) throw new Error('Action/block correlation failed');
    for (const tx of block.transactions) {
      const actions = tx.contractActions.filter(a => a.address === manifest.contractAddress);
      if (!actions.length) continue;
      if (!/^[a-f0-9]{64}$/i.test(tx.hash)) throw new Error('Invalid indexed transaction hash');
      // Re-fetch the block by hash to independently corroborate transaction membership.
      const corroborated = (await query(BLOCK_QUERY, { offset: { hash: block.hash } })).block;
      if (corroborated?.height !== height || corroborated.hash !== block.hash || !corroborated.transactions.some(t =>
        t.hash === tx.hash && t.contractActions.some(a => a.address === manifest.contractAddress)))
        throw new Error('Transaction verification failed');
      rows.set(tx.hash, { network: manifest.network, contract: manifest.contractAddress, transaction_hash: tx.hash,
        sdk_identifiers: tx.identifiers ?? [], block: height, block_hash: block.hash, timestamp: block.timestamp,
        action: [...new Set(actions.map(a => a.__typename))].join(';'), public_wallet: '',
        circuit: '', context: '', commitment: '', verified_on_chain: true });
    }
    blocks++; previousHeight = height;
    if (height === 0) return { rows: [...rows.values()], complete: true };
    offset = { blockOffset: { height: height - 1 } };
  }
  return { rows: [...rows.values()], complete: false };
}
export function linkedResponses(transactions, responses) {
  const seen = new Set();
  return responses.filter(r => {
    const match = transactions.some(t => t.network === r.network && [t.transaction_hash, ...t.sdk_identifiers].includes(r.public_transaction_or_claim));
    if (!r.response_id || seen.has(r.response_id) || r.publication_consent !== 'true' || !r.sanitized_summary || !match) return false;
    seen.add(r.response_id); return true;
  });
}
export function sentimentDistribution(responses) {
  const counts = Object.fromEntries(['Positive','Negative','Mixed','Neutral'].map(s => [s, responses.filter(r=>r.sentiment===s).length]));
  const classified = Object.values(counts).reduce((a,b)=>a+b,0);
  return { counts, classified, unclassified: responses.length - classified,
    percentages: Object.fromEntries(Object.entries(counts).map(([s,n])=>[s, classified ? (100*n/classified).toFixed(2)+'%' : 'N/A'])) };
}
