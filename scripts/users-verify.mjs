import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { networkConfiguration, assertDeploymentNetwork } from './lib/network-config.mjs';
import { collectActivity, parseCsv, csvCell, joinFeedback, linkedResponses, sentimentDistribution } from './lib/user-evidence.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const network = process.argv[2] ?? 'preview';
const environment = networkConfiguration(network);
const manifest = assertDeploymentNetwork(JSON.parse(await readFile(resolve(root, `deployment.${network}.json`), 'utf8')), network);
const cohort = parseCsv(await readFile(resolve(root, 'docs/feedback/cohort.csv'), 'utf8'));
const issues = parseCsv(await readFile(resolve(root, 'docs/feedback/issues.csv'), 'utf8'));
const responses = parseCsv(await readFile(resolve(root, 'docs/feedback/responses.csv'), 'utf8'));
let result = { rows: [], complete: false }, status = 'NOT VERIFIED';
async function query(query, variables) {
  const response = await fetch(environment.indexer, { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables }), signal: AbortSignal.timeout(20000) });
  if (!response.ok) throw new Error('Indexer HTTP failure');
  const payload = await response.json();
  if (payload.errors?.length || !payload.data) throw new Error('Indexer GraphQL failure');
  return payload.data;
}
try { result = await collectActivity(query, manifest); status = result.complete ? 'COMPLETE INDEXED HISTORY' : 'PARTIAL — SCAN LIMIT REACHED'; }
catch (error) { const code = ['ENOTFOUND','ECONNREFUSED','ETIMEDOUT'].includes(error?.cause?.code) ? error.cause.code : 'REQUEST_OR_CORRELATION_FAILED'; status = `${code}: NOT VERIFIED — indexer request or correlation failed. No chain absence inferred; run on a network-enabled Mac.`; process.exitCode = 1; }
const rows = joinFeedback(result.rows, cohort, issues);
const linked = linkedResponses(rows, responses);
const sentiment = sentimentDistribution(linked);
for (const row of rows) {
  const matching = linked.filter(r=>r.network===row.network && [row.transaction_hash,...row.sdk_identifiers].includes(r.public_transaction_or_claim));
  row.feedback = [row.feedback,...matching.map(r=>r.sanitized_summary)].filter(Boolean).join(' / ');
  row.sentiment = [...new Set(matching.map(r=>r.sentiment).filter(s=>['Positive','Negative','Mixed','Neutral'].includes(s)))].join(';');
}
const headers = ['network','contract','public_wallet','action','circuit','transaction_hash','block','block_hash','timestamp','context','commitment','verified_on_chain','feedback','sentiment','evidence_status'];
const csv = [headers.join(','), ...rows.map(r => headers.map(h => csvCell(r[h])).join(','))].join('\n') + '\n';
const safe = v => String(v ?? '').replaceAll('|', '\\|').replaceAll('\n', ' ');
const table = ['| # | Public Wallet | Network | Interaction | Transaction Hash | Block | Verified On-Chain | Feedback | Sentiment | Evidence Status |',
  '|---|---|---|---|---|---|---|---|---|---|', ...rows.map((r,i) => `| ${i+1} | Not attributable | ${r.network} | ${safe(r.action)} | ${r.transaction_hash} | ${r.block} | Yes | ${safe(r.feedback)} | ${safe(r.sentiment)||'Unclassified'} | ${r.evidence_status} |`)];
const report = `# PayDrip — 70-User Evidence Audit

Generated: ${new Date().toISOString()}

## On-Chain Source
Network: ${network}\n\nContract: ${manifest.contractAddress}\n\nIndexer: ${environment.indexer}\n\nCollection: ${status}

## User Attribution Model
Indexed contract actions establish contract activity, not unique employees or humans. The current shared local operator signs independently of 1AM browser sessions. No wallet attribution is inferred from UTXO ownership, commitments, claim contexts or cohort assertions. Deployment is not user participation. Circuit names, claim contexts and commitments are left empty because the queried metadata does not establish them.

## Evidence Table
${table.join('\n')}

${rows.length ? '' : 'No transactions verified in this run. This does not establish zero on-chain activity.'}

## Transaction Verification
Verified transaction hashes: ${rows.length}\n\nHistory complete: ${result.complete}\n\nEach included hash was correlated against its action block and independently re-fetched by block hash. No raw transaction/private data was requested. Indexed action presence does not prove a particular circuit succeeded. No unverified hashes are included. Qualifying user interactions: not established.

## Feedback
Consented, transaction-linked issue summaries: ${rows.filter(r=>r.feedback).length} transaction rows (not unique responses). Verified-transaction-linked, consented feedback responses: ${linked.length}. No sentiment was inferred or invented; classification must come from actual reviewed responses. Issue summaries without response records remain unclassified.

Positive: ${sentiment.counts.Positive} (${sentiment.percentages.Positive})

Negative: ${sentiment.counts.Negative} (${sentiment.percentages.Negative})

Mixed: ${sentiment.counts.Mixed} (${sentiment.percentages.Mixed})

Neutral: ${sentiment.counts.Neutral} (${sentiment.percentages.Neutral})

Unclassified responses: ${sentiment.unclassified}. Percentages use ${sentiment.classified} classified responses as denominator (two decimals). Issues unrelated to verifiable consented transaction references are excluded.

## Verification Summary
Target users: 70\n\nVerified qualifying users: 0\n\nVerified attributable unique wallets: 0\n\nOperator wallets: not inferred\n\nVerified transactions: ${rows.length}\n\nFeedback source issue rows: ${issues.length} (not necessarily participant responses)

## Level 5
Required: 50 real qualifying Preprod users\n\nVerified: 0\n\nStatus: NOT YET SATISFIED

## Level 6
Required: 70 real qualifying Preprod users\n\nVerified: 0\n\nStatus: NOT YET SATISFIED

${network === 'preview' ? 'Preview evidence does not satisfy a Preprod cohort requirement.\n' : ''}
## Missing Evidence
Collect consented participant wallet-control attestations binding network, contract and actual public receipt, using a verified connector signing API only if genuinely supported. Independently verify the signature and chain receipt; do not call this proof of a unique human. Define program-approved participant eligibility and exclude operator, synthetic/test and duplicate entries. Wallet-owned transactions could establish wallet participation after a real browser signer path exists. The current collector deliberately does not count unverified cohort assertions. Gather actual feedback with consent and documented sentiment classification. Never collect payroll secrets.

## Final Verdict
INSUFFICIENT REAL USER EVIDENCE
`;
await writeFile(resolve(root,'docs/feedback/user-evidence.csv'), csv);
await writeFile(resolve(root,'docs/feedback/USER_EVIDENCE.md'), report);
console.log(JSON.stringify({ network, sourceStatus: status, verifiedTransactions: rows.length, verifiedUsers: 0, attributableWallets: 0,
  report: 'docs/feedback/USER_EVIDENCE.md' }, null, 2));
