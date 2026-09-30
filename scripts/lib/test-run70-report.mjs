import { csvCell } from './user-evidence.mjs';
import { summary, TARGET } from './test-run70.mjs';

// AUTHORIZED SYNTHETIC TEST FIXTURE. These are not observations or human feedback.
const positive = [
  'Clear public/private preview', 'Readable disclosure labels', 'Useful tier explanation', 'Explicit private-input boundary',
  'Understandable commitment warning', 'Helpful linkage explanation', 'Clear income-claim scope', 'Useful historical-membership caveat',
  'Well-labelled request context', 'Readable verifier receipt', 'Clear contract identifier', 'Useful Preview network badge',
  'Understandable record status', 'Helpful revocation indicator', 'Clear period status', 'Useful claim lookup layout',
  'Readable transaction details', 'Clear confirmed-state layout', 'Useful block-height field', 'Helpful executor label',
  'Distinct 1AM session role', 'Clear operator funding address', 'Useful connection progress', 'Readable disconnect control',
  'Explicit private-file handling', 'Helpful identity download step', 'Clear record-import labels', 'Useful malformed-file guidance',
  'Readable period-ID instructions', 'Helpful secure ID generation', 'Clear authorization workflow', 'Useful record-download prerequisite',
  'Understandable supported tiers', 'Readable eligibility selector', 'Clear threshold comparison', 'Useful fresh-context guidance',
  'Helpful replay explanation', 'Understandable pseudonym sharing', 'Clear local-session label', 'Useful private opening warning',
  'Readable action prerequisites', 'Helpful disabled-button reason', 'Clear busy-state explanation', 'Useful retry guidance',
  'Well-separated verifier workflow', 'Helpful public receipt fields', 'Clear no-payment-rail caveat', 'Useful issuer-trust explanation',
  'Readable compact form layout', 'Helpful visible focus state', 'Clear navigation grouping', 'Useful mobile input labels',
  'Understandable empty records view', 'Clear registered-record handle', 'Helpful proof-stage description', 'Useful indexed-evidence export',
];
const negative = [
  'Operator terminology needs explanation', 'Proof waiting needs clearer progress', 'Submission states need more detail',
  'Wallet roles need simpler wording', 'Mobile long hashes need easier copying', 'Preview terminology feels technical',
  'Private-file delivery needs guidance', 'Stale locks need clearer recovery steps', 'Funding errors need actionable detail',
  'Receipt context paste needs guidance', 'Revocation warnings need prominence', 'Hosted restrictions need explanation',
  'Reconnect recovery needs clearer steps', 'Tier-probing caveat needs plain language',
];
export function feedbackFixture() {
  if(positive.length!==56 || negative.length!==14) throw new Error('Synthetic fixture count mismatch');
  return [...positive,...negative].map((feedback,i)=>({number:i+1,classification:'SYNTHETIC TEST FIXTURE — NOT HUMAN FEEDBACK',
    feedback,sentiment:i<56?'Positive':'Negative'}));
}
const cell = value => String(value??'').replaceAll('|','\\|').replaceAll('\n',' ');
export function renderTestReport(cp, generatedAt=new Date().toISOString()) {
  const feedback=feedbackFixture();
  const rows=Array.from({length:TARGET},(_,i)=>{
    const number=i+1,p=cp.participants.find(p=>p.number===number),r=p?.registration,c=p?.claim;
    const registrationVerified=r?.status==='VERIFIED',claimVerified=c?.status==='VERIFIED';
    const status=registrationVerified && claimVerified?'VERIFIED':!r&&!c?'NOT ATTEMPTED':[r,c].some(a=>a?.status==='FAILED')?'FAILED':'UNVERIFIED';
    return {number,participant:p?`controlled-test-${number}`:`planned-slot-${String(number).padStart(2,'0')}`,network:cp.network,
      registrationTx:r?.txId??'',registrationHash:r?.txHash??'',registrationBlock:r?.block??'',claimTx:c?.txId??'',claimHash:c?.txHash??'',claimBlock:c?.block??'',
      commitment:registrationVerified?p.commitment:'',context:claimVerified?p.context:'',registrationVerified,claimVerified,
      feedback:feedback[i].feedback,sentiment:feedback[i].sentiment,feedbackBasis:feedback[i].classification,status};
  });
  const totals={...summary(cp),registrationTransactions:rows.filter(r=>r.registrationTx).length,claimTransactions:rows.filter(r=>r.claimTx).length};
  const columns=['number','participant','network','registrationTx','registrationHash','registrationBlock','claimTx','claimHash','claimBlock','commitment','context','registrationVerified','claimVerified','feedback','sentiment','feedbackBasis','status'];
  const csv=[columns.join(','),...rows.map(r=>columns.map(c=>csvCell(r[c])).join(','))].join('\n')+'\n';
  const table=['| # | Test Participant | Network | Registration Tx | Registration Block | Claim Tx | Claim Block | Commitment / Receipt | Registration Verified | Claim Verified | Feedback (SYNTHETIC) | Sentiment | Final Status |',
    '|---|---|---|---|---|---|---|---|---|---|---|---|---|',...rows.map(r=>`| ${r.number} | ${r.participant} | ${r.network} | ${cell(r.registrationTx)} | ${r.registrationBlock} | ${cell(r.claimTx)} | ${r.claimBlock} | ${r.commitment}${r.context?' / '+r.context:''} | ${r.registrationVerified?'Yes':'No'} | ${r.claimVerified?'Yes':'No'} | ${cell(r.feedback)} | ${r.sentiment} | ${r.status} |`)];
  const metrics=[['Target participants',TARGET],['Attempted',totals.attempted],['Registration transactions with returned IDs',totals.registrationTransactions],
    ['Claim transactions with returned IDs',totals.claimTransactions],['Total transactions with returned submission IDs (includes epoch)',totals.transactionsSubmitted],
    ['Transactions verified',totals.transactionsVerified],['Fully completed participants',totals.completed],['Failed or ambiguous participants',totals.failed],
    ['Positive synthetic feedback',56],['Negative synthetic feedback',14],['Positive synthetic percentage','80%'],['Negative synthetic percentage','20%']];
  const environmentBlocked=cp.failure && ['Preview indexer verification','Proof server and Preview node health','Operator initialization','Operator synchronization','Operator transaction resources','Private checkpoint safety','Checkpoint'].includes(cp.failure.stage);
  const verdict=environmentBlocked?'EXTERNAL ENVIRONMENT BLOCKER — EXECUTION COULD NOT CONTINUE':totals.completed===70?'70 TEST PARTICIPANTS COMPLETED AND VERIFIED ON-CHAIN':cp.canaryVerified?`PARTIAL TEST RUN — ${totals.completed}/70 VERIFIED`:'CANARY FAILED — ROOT CAUSE IDENTIFIED';
  const md=`# PayDrip — Controlled 70 Test Participant Run\n\nSYNTHETIC TEST PARTICIPANTS AND FEEDBACK — NOT HUMAN USER TRACTION.\n\nGenerated: ${generatedAt}\n\nNetwork: ${cp.network}\n\nContract: ${cp.contract}\n\nRecorded public operator: ${cp.operator??'Not initialized'}\n\nThe 70 rows are planned test slots. NOT ATTEMPTED means no participant transaction was attempted; it does not imply a private identity was created. Empty evidence fields are intentional. Feedback is generated test data, not observed experience. Previously verified receipts, if present, reflect persisted indexed evidence, not a fresh verification guarantee on a blocked rerun.\n\n${table.join('\n')}\n\n## Summary\n\n| Metric | Result |\n|---|---:|\n${metrics.map(([k,v])=>`| ${k} | ${v} |`).join('\n')}\n\nShared epoch: ${cp.epochAction?.txId??'No transaction ID'}; block: ${cp.epochAction?.block??'Not verified'}; indexed: ${cp.epochAction?.status==='VERIFIED'?'Yes':'No'}.\n\nSubmission attempts with possibly ambiguous outcomes: ${totals.submissionAttempts}. Returned ID counts do not replace indexer verification.\n\nFailure: ${cp.failure?JSON.stringify(cp.failure):'None recorded'}\n\n${verdict}\n`;
  const feedbackCsv=['test_slot,classification,feedback,sentiment',...feedback.map(f=>[f.number,f.classification,f.feedback,f.sentiment].map(csvCell).join(','))].join('\n')+'\n';
  return {csv,md,feedbackCsv,totals,verdict,rows};
}
