// Controlled synthetic participants; NEVER genuine-user traction evidence.
import { readFile, mkdir, open, rename, lstat, unlink } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { ContractState } from '@midnight-ntwrk/compact-runtime';
import { PreviewService, publicLedger, friendlyError } from '../apps/web/server/preview-service.mjs';
import { networkConfiguration, assertDeploymentNetwork } from './lib/network-config.mjs';
import { renderTestReport } from './lib/test-run70-report.mjs';
import { RunStop, initialCheckpoint, runControlledTests, effectPresent } from './lib/test-run70.mjs';

const root = fileURLToPath(new URL('../',import.meta.url));
const manifest = assertDeploymentNetwork(JSON.parse(await readFile(path.join(root,'deployment.preview.json'),'utf8')),'preview');
const expectedContract = '3094e6e6e6dc2a5f91b09859a5e5b1ec8df41a9aad1511570006141c98d6ec7c';
if (manifest.contractAddress!==expectedContract) throw new Error('Preview deployment differs from the approved test target. No transaction attempted.');
const args = process.argv.slice(2);
if (args.some(a=>a!=='--canary' && !/^--recover-tx-id=[a-f0-9]{64}$/i.test(a))) throw new Error('Use --canary or --recover-tx-id=<actual SDK transaction ID>.');
const recoverTxId = args.find(a=>a.startsWith('--recover-tx-id='))?.split('=')[1] ?? null;
const config = networkConfiguration('preview');
const secretDir = path.join(root,'.secrets/paydrip-run70');
const cpFile = path.join(secretDir,'checkpoint.public.json'), vaultFile=path.join(secretDir,'private.json');
const lockFile = path.join(secretDir,'run.lock');
const service = new PreviewService();
let cp=initialCheckpoint(manifest.contractAddress), vault={format:'paydrip-test-private-v1',network:'preview',contract:manifest.contractAddress,epoch:null,participants:[]};
let stage='Preview indexer verification', lock=null, exitCode=0, readiness=null;
const txQuery = `query TestReceipt($offset: TransactionOffset!) { transactions(offset:$offset) {
  hash block {height hash timestamp} contractActions {address state __typename}
  ... on RegularTransaction { identifiers transactionResult {status} }
} }`;
const blockQuery = `query TestBlock($offset:BlockOffset) {block(offset:$offset){height hash transactions{hash contractActions{address}}}}`;
async function query(query, variables) {
  try {
    const response=await fetch(config.indexer,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({query,variables}),signal:AbortSignal.timeout(20000)});
    if (!response.ok) throw new RunStop(stage,`Preview indexer returned HTTP ${response.status}.`,true);
    const data=await response.json();
    if (data.errors?.length || !data.data) throw new RunStop(stage,'Preview indexer rejected the metadata query. No raw errors printed.',false);
    return data.data;
  } catch(error) {
    if(error instanceof RunStop) throw error;
    const code=['ENOTFOUND','ECONNREFUSED','ETIMEDOUT','EAI_AGAIN'].includes(error?.cause?.code)?error.cause.code:'REQUEST_FAILED';
    throw new RunStop(stage,`Preview indexer ${code}. No network success inferred.`,true);
  }
}
async function secureDirectory() {
  for (const dir of [path.join(root,'.secrets'),secretDir]) {
    await mkdir(dir,{recursive:true,mode:0o700});
    const stat=await lstat(dir);
    if (!stat.isDirectory() || stat.isSymbolicLink() || (stat.mode & 0o077)) throw new RunStop('Secret storage','Private test directory must be a real directory with mode 700.',false);
  }
  try { execFileSync('git',['check-ignore','--quiet','.secrets/paydrip-run70/private.json'],{cwd:root,stdio:'ignore'}); }
  catch { throw new RunStop('Secret storage','Private test vault is not gitignored. No test material generated.',false); }
}
async function readSecure(filename) {
  try {
    const stat=await lstat(filename);
    if(!stat.isFile() || stat.isSymbolicLink() || (stat.mode & 0o077)) throw new RunStop('Checkpoint','Test checkpoint/vault must be regular mode-600 files.',false);
    return JSON.parse(await readFile(filename,'utf8'));
  } catch(error) { if(error.code==='ENOENT') return null; throw error; }
}
async function atomicWrite(filename,data) {
  const temporary=filename+'.tmp';
  const file=await open(temporary,'wx',0o600);
  try { await file.writeFile(JSON.stringify(data)); await file.sync(); } finally { await file.close(); }
  await rename(temporary,filename);
}
async function save() {
  // Private material first: an orphan private entry is safer than a missing opening.
  await atomicWrite(vaultFile,vault); await atomicWrite(cpFile,cp);
}
async function verify(txId,circuit,expected) {
  stage=`Indexer verification: ${circuit}`;
  const payload=await query(txQuery,{offset:{identifier:txId}});
  const matches=payload.transactions.filter(t=>t.identifiers?.includes(txId));
  if(matches.length!==1) throw new RunStop(stage,'SDK transaction ID is not uniquely indexed. No success recorded; do not resubmit.',false);
  const tx=matches[0];
  if(tx.transactionResult?.status!=='SUCCESS') throw new RunStop(stage,'Indexed transaction was not entirely successful. Bulk execution stopped.',false);
  if(!/^[a-f0-9]{64}$/i.test(tx.hash) || !Number.isSafeInteger(tx.block?.height)) throw new RunStop(stage,'Malformed indexer transaction metadata.',false);
  const block=(await query(blockQuery,{offset:{hash:tx.block.hash}})).block;
  if(block?.height!==tx.block.height || !block.transactions.some(t=>t.hash===tx.hash && t.contractActions.some(a=>a.address===manifest.contractAddress)))
    throw new RunStop(stage,'Transaction/block/contract correlation failed.',false);
  if(block.transactions.filter(t=>t.contractActions.some(a=>a.address===manifest.contractAddress)).length!==1)
    throw new RunStop(stage,'Multiple PayDrip transactions share this block. Exact state-transition attribution requires manual inspection; no success recorded.',false);
  const {ledger}=await import('../contract/src/managed/paydrip/contract/index.js');
  const states=tx.contractActions.filter(a=>a.address===manifest.contractAddress && a.__typename==='ContractCall').map(a=>
    publicLedger(ledger(ContractState.deserialize(Uint8Array.from(Buffer.from(a.state,'hex'))).data)));
  if(!states.some(s=>effectPresent(s,circuit,expected))) throw new RunStop(stage,'Indexed PayDrip state does not contain the expected public effect.',false);
  if(tx.block.height>0){
    const prior=(await query('query PriorTestState($address:HexEncoded!,$offset:ContractActionOffset){contractAction(address:$address,offset:$offset){state}}',{address:manifest.contractAddress,offset:{blockOffset:{height:tx.block.height-1}}})).contractAction;
    if(!prior?.state || effectPresent(publicLedger(ledger(ContractState.deserialize(Uint8Array.from(Buffer.from(prior.state,'hex'))).data)),circuit,expected))
      throw new RunStop(stage,'Required public effect was already present or prior state could not be verified. Transaction attribution unresolved.',false);
  }
  return {txHash:tx.hash,block:tx.block.height,blockHash:tx.block.hash,indexed:true};
}
async function report() {
  const dir=path.join(root,'docs/testing'); await mkdir(dir,{recursive:true});
  const {writeFile}=await import('node:fs/promises');
  const rendered=renderTestReport(cp);
  await writeFile(path.join(dir,'70-user-run.csv'),rendered.csv);
  await writeFile(path.join(dir,'70-user-run.md'),rendered.md);
  await writeFile(path.join(dir,'70-user-feedback.csv'),rendered.feedbackCsv);
  console.log(JSON.stringify({network:'preview',contract:cp.contract,operator:cp.operator,...rendered.totals,status:rendered.verdict,failure:cp.failure}));
}

try {
  // Load only the public checkpoint so failed preflight cannot erase historical evidence.
  const previous=await readSecure(cpFile);
  if(previous){
    if(previous.contract!==manifest.contractAddress || previous.network!=='preview' || previous.target!==70)
      throw new RunStop('Checkpoint','Existing public checkpoint targets a different deployment.',false);
    cp=previous;
  }
  // Stop before credentials/proofs if the existing deployment cannot be indexed.
  const deployment=(await query('query ExistingTestContract($address:HexEncoded!){contractAction(address:$address){address transaction{block{height}}}}',{address:manifest.contractAddress})).contractAction;
  if(deployment?.address!==manifest.contractAddress) throw new RunStop(stage,'Existing Preview deployment is not indexed; no deployment attempted.',true);
  stage='Proof server and Preview node health'; const meta=await service.meta();
  const missing=[['proof server',meta.proofServerHealthy],['Preview node',meta.nodeHealthy],['operator seed file',meta.walletAvailable],['administrator vault',meta.adminAvailable]].filter(([,ok])=>!ok).map(([name])=>name);
  if(missing.length) throw new RunStop(stage,`Unavailable prerequisites: ${missing.join(', ')}. No transaction attempted.`,true);
  stage='Private checkpoint safety'; await secureDirectory();
  try { lock=await open(lockFile,'wx',0o600); await lock.writeFile(String(process.pid)); }
  catch { throw new RunStop(stage,'Another runner or stale lock exists. Do not overlap runs; inspect the local runner lock.',false); }
  const saved=await readSecure(cpFile), savedVault=await readSecure(vaultFile);
  if(saved || savedVault){
    if(!saved || !savedVault || saved.contract!==manifest.contractAddress || saved.network!=='preview' || saved.target!==70 || savedVault.contract!==saved.contract || savedVault.epoch!==saved.epoch)
      throw new RunStop(stage,'Checkpoint/vault mismatch. Do not regenerate or resubmit existing participants.',false);
    cp=saved; vault=savedVault;
  }
  cp.failure=null;
  stage='Operator initialization'; const info=await service.connect(); cp.operator=info.address;
  stage='Operator synchronization';
  const observation=await service.waitForOperatorSynchronization(value=>{
    console.log(JSON.stringify({stage,...value}));
  });
  readiness=observation;
  stage='Operator transaction resources';
  if(BigInt(observation.spendableDustRaw)<=0n) throw new RunStop(stage,`No spendable DUST after synchronization (${observation.readinessReason}). Inspect the public operator balance/registration diagnostics; no payroll transaction submitted.`,true);
  console.log(JSON.stringify({operator:cp.operator,network:'preview',synced:true,nightRaw:observation.nightRaw,spendableDustRaw:observation.spendableDustRaw}));
  stage='Controlled canary';
  await runControlledTests({service,checkpoint:cp,vault,save,verify,canaryOnly:args.includes('--canary'),recoverTxId,emit:message=>{
    stage=message; console.log(JSON.stringify({stage}));
  }});
} catch(error) {
  exitCode=1;
  cp.failure={stage:error instanceof RunStop?error.stage:stage,error:error instanceof RunStop?error.message:friendlyError(error),retrySafe:error instanceof RunStop?error.retrySafe:false};
  if(error?.diagnostics || readiness) cp.failure.diagnostics=error?.diagnostics??readiness;
  if(lock) await save().catch(()=>{cp.failure={stage:'Checkpoint persistence',error:'Could not save checkpoint safely. Inspect local files before retrying.',retrySafe:false};});
} finally {
  try { await service.disconnect(); } catch { exitCode=1; }
  if(lock){await lock.close();await unlink(lockFile).catch(()=>{});}
  await report();
  // Do not leave SDK background workers alive after the sequential run stops.
  process.exit(exitCode);
}
