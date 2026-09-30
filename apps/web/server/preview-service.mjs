import { randomBytes } from 'node:crypto';
import { operatorDiagnostics, waitForOperatorSync, OperatorSyncError } from './operator-readiness.mjs';
import { OperatorSession, OperatorConnectionError } from './operator-session.mjs';
import { networkConfiguration, assertDeploymentNetwork } from '../../../scripts/lib/network-config.mjs';
import { mkdir, open, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { firstValueFrom, timeout } from 'rxjs';
import { WebSocket } from 'ws';
import { WalletFactory, WalletSeeds } from '@midnight-ntwrk/testkit-js';
import { createKeystore, InMemoryTransactionHistoryStorage, WalletEntrySchema, mergeWalletEntries } from '@midnight-ntwrk/wallet-sdk';
import { setNetworkId } from '@midnight-ntwrk/midnight-js-network-id';
import { DustSecretKey, LedgerParameters, ZswapSecretKeys, unshieldedToken } from '@midnight-ntwrk/midnight-js-protocol/ledger';
import { ttlOneHour } from '@midnight-ntwrk/midnight-js-utils';
import { NodeZkConfigProvider } from '@midnight-ntwrk/midnight-js-node-zk-config-provider';
import { indexerPublicDataProvider } from '@midnight-ntwrk/midnight-js-indexer-public-data-provider';
import { httpClientProofProvider } from '@midnight-ntwrk/midnight-js-http-client-proof-provider';
import { levelPrivateStateProvider } from '@midnight-ntwrk/midnight-js-level-private-state-provider';
import { CompiledContract } from '@midnight-ntwrk/midnight-js-protocol/compact-js';
import { findDeployedContract } from '@midnight-ntwrk/midnight-js-contracts';
import { CompactTypeBytes, CompactTypeVector, persistentHash } from '@midnight-ntwrk/compact-runtime';

globalThis.WebSocket = WebSocket;
setNetworkId('preview');

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const secretDir = path.join(root, '.secrets');
const assets = path.join(root, 'contract/src/managed/paydrip');
const deployment = JSON.parse(await readFile(path.join(root, 'deployment.preview.json'), 'utf8'));
assertDeploymentNetwork(deployment, 'preview');

const environment = networkConfiguration('preview');
const publicDataProvider = indexerPublicDataProvider(environment.indexer, environment.indexerWS, WebSocket);
const hex64 = /^[0-9a-f]{64}$/i;
const toHex = (bytes) => Buffer.from(bytes).toString('hex');
const fromHex = (value, label) => {
  if (typeof value !== 'string' || !hex64.test(value)) throw new InputError(`${label} must be a 64-character hexadecimal value.`);
  return Uint8Array.from(Buffer.from(value, 'hex'));
};
const padded = (text) => Uint8Array.from(Buffer.concat([Buffer.from(text), Buffer.alloc(32 - Buffer.byteLength(text))]));
const vector4 = new CompactTypeVector(4, new CompactTypeBytes(32));
const requestTier = { 1: '$3,000', 2: '$5,000', 3: '$10,000' };

export class InputError extends Error {}

async function compiledContract() {
  try {
    const { Contract } = await import(path.join(assets, 'contract/index.js'));
    return { Contract, compiled: CompiledContract.withCompiledFileAssets(
      CompiledContract.withWitnesses(CompiledContract.make('paydrip', Contract), {}), assets,
    ) };
  } catch {
    throw new InputError('Generated Compact artifacts are missing. Run npm run paydrip:compile first.');
  }
}

export function parseOpening(input) {
  if (!input || typeof input !== 'object' || input.format !== 'paydrip-record-v1') {
    throw new InputError('Import a PayDrip private record file (paydrip-record-v1).');
  }
  const salaryText = input.monthlySalaryMinor;
  if (typeof salaryText !== 'string' || !/^[1-9]\d{0,19}$/.test(salaryText)) {
    throw new InputError('The private record contains an invalid monthly salary.');
  }
  const monthlySalaryMinor = BigInt(salaryText);
  if (monthlySalaryMinor > 18446744073709551615n) throw new InputError('The monthly salary is outside the contract range.');
  if (input.currency !== 'USD') throw new InputError('This Preview contract supports USD only.');
  return {
    record: {
      domain: fromHex(input.domain, 'Deployment domain'),
      organization: fromHex(input.organization, 'Organization'),
      epoch: fromHex(input.epoch, 'Payroll period ID'),
      employeePseudonym: fromHex(input.employeePseudonym, 'Employee pseudonym'),
      monthlySalaryMinor,
      currency: Uint8Array.from(Buffer.from('USD')),
    },
    randomness: fromHex(input.randomness, 'Record randomness'),
  };
}

export function publicLedger(value) {
  const revoked = new Set([...value.revoked].map(toHex));
  const records = [...value.records].map(([commitment, epoch]) => ({
    commitment: toHex(commitment), epoch: toHex(epoch), revoked: revoked.has(toHex(commitment)),
  }));
  const recordEpoch = new Map(records.map((record) => [record.commitment, record.epoch]));
  const claims = [...value.claims].map(([context, tier]) => {
    const key = toHex(context);
    const commitment = toHex(value.claimRecords.lookup(context));
    return { context: key, kind: tier === 0n ? 'employment' : 'income-tier', tier: Number(tier),
      commitment, epoch: recordEpoch.get(commitment) ?? null };
  });
  return {
    organization: toHex(value.organization), domain: toHex(value.domain), currency: Buffer.from(value.currency).toString('utf8').replace(/\0/g, ''),
    epochs: [...value.epochs].map(([id, code]) => ({ id: toHex(id), status: code === 1n ? 'Open' : code === 2n ? 'Closed' : 'Unknown' })),
    records, claims,
  };
}

async function publicState() {
  const { ledger } = await import(path.join(assets, 'contract/index.js')).catch(() => {
    throw new InputError('Generated Compact artifacts are missing. Run npm run paydrip:compile first.');
  });
  const state = await publicDataProvider.queryContractState(deployment.contractAddress);
  if (!state) throw new Error('Preview has not returned the deployed contract state.');
  return publicLedger(ledger(state.data));
}

async function localAdmin() {
  try {
    const value = JSON.parse(await readFile(path.join(secretDir, 'preview-admin.json'), 'utf8'));
    return fromHex(value.adminSecret, 'Local administrator secret');
  } catch (error) {
    if (error instanceof InputError) throw error;
    throw new InputError('The local administrator vault is unavailable on this machine.');
  }
}

async function webPrivateStatePassword() {
  const filename = path.join(secretDir, 'web-private-state.password');
  try { return (await readFile(filename, 'utf8')).trim(); }
  catch (error) {
    if (error.code !== 'ENOENT') throw error;
    await mkdir(secretDir, { recursive: true, mode: 0o700 });
    const generated = randomBytes(32).toString('base64url');
    try {
      const file = await open(filename, 'wx', 0o600);
      try { await file.writeFile(`${generated}\n`); } finally { await file.close(); }
      return generated;
    } catch (writeError) {
      if (writeError.code === 'EEXIST') return (await readFile(filename, 'utf8')).trim();
      throw writeError;
    }
  }
}

async function health(url) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(4_000) });
    return response.ok;
  } catch { return false; }
}

export function friendlyError(error) {
  if (error instanceof OperatorSyncError) return error.message;
  if (error instanceof OperatorConnectionError) return error.message;
  if (error instanceof InputError) return error.message;
  const known = ['Unauthorized', 'Epoch exists', 'Epoch not open', 'Unknown epoch', 'Unknown record', 'Wrong epoch',
    'Wrong domain', 'Wrong organization', 'Wrong currency', 'Invalid salary', 'Duplicate record', 'Already revoked',
    'Revoked record', 'Request already used', 'Missing context', 'Invalid tier', 'Below threshold'];
  const message = error instanceof Error ? error.message : '';
  const match = known.find((item) => message.includes(item));
  if (match) return match === 'Unauthorized' ? 'The supplied employee record or local administrator authorization was rejected.' : match;
  if (/timeout|network|fetch|ECONNREFUSED|ENOTFOUND|EAI_AGAIN/i.test(message)) {
    return 'Preview or the local proof server could not be reached. Check network and Docker status.';
  }
  return 'The operation did not complete. No success has been recorded in this terminal.';
}

// Public SDK factory configuration; no credentials enter this helper.
export function previewOperatorConfiguration() {
  return {
    indexerClientConnection:{indexerHttpUrl:environment.indexer,indexerWsUrl:environment.indexerWS},
    provingServerUrl:new URL(environment.proofServer),networkId:environment.walletNetworkId,relayURL:new URL(environment.nodeWS),
    txHistoryStorage:new InMemoryTransactionHistoryStorage(WalletEntrySchema,mergeWalletEntries),
    costParameters:{feeBlocksMargin:5},
    // Match the existing Preview deployment tool. This changes catch-up pacing,
    // never the event cursor, verification, funding, or strict completion rule.
    batchUpdates:{size:100,timeout:10,spacing:0},
  };
}

async function buildPreviewOperator() {
  let seed;
  try { seed = (await readFile(path.join(secretDir, 'preview-wallet.seed'), 'utf8')).trim(); }
  catch (error) {
    throw new OperatorConnectionError(error.code === 'ENOENT'
      ? 'Local Preview wallet seed file is missing. Restore your existing wallet backup; do not replace a funded wallet.'
      : 'Local Preview wallet seed file could not be read. Check its permissions.');
  }
  if (!hex64.test(seed)) throw new OperatorConnectionError('Local Preview wallet seed file has an invalid format. Expected 64 hexadecimal characters.');
  // Same exported SDK factory used by FluentWalletBuilder, with explicit replay
  // batching rather than access to the builder's private config field.
  const seeds=WalletSeeds.fromMasterSeed(seed);
  const keystore=createKeystore(seeds.unshielded,environment.walletNetworkId);
  const configuration=previewOperatorConfiguration();
  const children=[];
  let wallet;
  try {
    const shielded=WalletFactory.createShieldedWallet(configuration,seeds.shielded);children.push(shielded);
    const unshielded=WalletFactory.createUnshieldedWallet(configuration,keystore);children.push(unshielded);
    const dust=WalletFactory.createDustWallet(configuration,seeds.dust,{
      ledgerParams:LedgerParameters.initialParameters(),additionalFeeOverhead:1000n,feeBlocksMargin:5,
    });children.push(dust);
    wallet=await WalletFactory.createWalletFacade(configuration,shielded,unshielded,dust);
  } catch {
    await Promise.allSettled(children.map(child=>child.stop()));
    throw new OperatorConnectionError('Local Preview wallet factory initialization failed.');
  }
  try {
    const zswapSecretKeys = ZswapSecretKeys.fromSeed(seeds.shielded);
    const dustSecretKey = DustSecretKey.fromSeed(seeds.dust);
    const address = keystore.getBech32Address().asString();
    return { wallet, address, keys: { keystore, zswapSecretKeys, dustSecretKey, address },
      start: () => wallet.start(zswapSecretKeys, dustSecretKey) };
  } catch {
    await wallet.stop().catch(() => {});
    throw new OperatorConnectionError('Local Preview wallet key initialization failed.');
  }
}

export class PreviewService {
  #operator = new OperatorSession(buildPreviewOperator);
  get #wallet() { return this.#operator.active?.wallet ?? null; }
  get #walletKeys() { return this.#operator.active?.keys ?? null; }

  get contractAddress() { return deployment.contractAddress; }

  async meta() {
    let adminAvailable = false;
    let walletAvailable = false;
    try { adminAvailable = hex64.test(JSON.parse(await readFile(path.join(secretDir, 'preview-admin.json'), 'utf8')).adminSecret); } catch {}
    try { walletAvailable = hex64.test((await readFile(path.join(secretDir, 'preview-wallet.seed'), 'utf8')).trim()); } catch {}
    return { network: 'Preview', contractAddress: deployment.contractAddress, adminAvailable, walletAvailable,
      proofServerHealthy: await health(`${environment.proofServer}/health`), nodeHealthy: await health(`${environment.node}/health`) };
  }

  async state() { return publicState(); }

  walletInfo() { return this.#operator.info(); }

  connect() { return this.#operator.connect(); }

  disconnect() { return this.#operator.disconnect(); }

  // Read-only observation for the local diagnostic; never returns keys or inputs.
  async operatorObservation() {
    if (!this.#wallet) throw new OperatorConnectionError('Connect the local Preview operator first.');
    const state = await firstValueFrom(this.#wallet.state().pipe(timeout({ first: 30_000 })));
    return operatorDiagnostics(state,this.walletInfo(),unshieldedToken().raw);
  }

  async waitForOperatorSynchronization(onObservation = (_value) => {}, timeoutMs = 900_000) {
    if (!this.#wallet) throw new OperatorConnectionError('Connect the local Preview operator first.');
    return waitForOperatorSync(this.#wallet.state(),
      state=>operatorDiagnostics(state,this.walletInfo(),unshieldedToken().raw),{onObservation,timeoutMs});
  }

  async derivePseudonym(input) {
    const state = await publicState();
    const secret = fromHex(input.employeeSecret, 'Employee secret');
    const epoch = fromHex(input.epoch, 'Payroll period ID');
    const pseudonym = persistentHash(vector4, [padded('paydrip:employee:v1'), fromHex(state.domain, 'Domain'), epoch, secret]);
    return { pseudonym: toHex(pseudonym) };
  }

  async checkRecord(input) {
    const opening = parseOpening(input.opening);
    const employeeSecret = fromHex(input.employeeSecret, 'Employee secret');
    const expected = persistentHash(vector4, [padded('paydrip:employee:v1'), opening.record.domain, opening.record.epoch, employeeSecret]);
    if (toHex(expected) !== toHex(opening.record.employeePseudonym)) throw new InputError('The employee secret does not match this payroll record.');
    const state = await publicState();
    if (toHex(opening.record.domain) !== state.domain || toHex(opening.record.organization) !== state.organization) {
      throw new InputError('This private record belongs to a different PayDrip deployment.');
    }
    const { Contract } = await compiledContract();
    // Use the exact helper generated by Compact to avoid reproducing the typed commitment encoding.
    const commitment = toHex(new Contract({})._recordCommitment_0(opening.record, opening.randomness));
    const registered = state.records.find((item) => item.commitment === commitment);
    const epoch = state.epochs.find((item) => item.id === toHex(opening.record.epoch));
    return { commitment, registered: !!registered, revoked: registered?.revoked ?? false,
      epoch: toHex(opening.record.epoch), epochStatus: epoch?.status ?? 'Unknown', organization: state.organization };
  }

  async claim(contextText) {
    const context = toHex(fromHex(contextText, 'Claim context'));
    const state = await publicState();
    const claim = state.claims.find((item) => item.context === context);
    if (!claim) return { found: false, context };
    const record = state.records.find((item) => item.commitment === claim.commitment);
    const epoch = state.epochs.find((item) => item.id === claim.epoch);
    return { found: true, context, claim: { ...claim, tierLabel: requestTier[claim.tier] ?? null,
      recordRegistered: !!record, recordRevokedNow: record?.revoked ?? false,
      epochStatus: epoch?.status ?? 'Unknown', organization: state.organization,
      contractAddress: deployment.contractAddress } };
  }

  async perform(action, input, setStage) {
    if (!this.#wallet || !this.#walletKeys) throw new InputError('Connect the local Preview wallet first.');
    const args = await this.#arguments(action, input);
    if (!(await health(`${environment.proofServer}/health`))) throw new InputError('Start the local proof server on port 6300 before submitting.');
    setStage('Synchronizing the local Preview wallet');
    await this.waitForOperatorSynchronization();
    const { keystore, zswapSecretKeys, dustSecretKey, address } = this.#walletKeys;
    const provider = {
      getCoinPublicKey: () => zswapSecretKeys.coinPublicKey,
      getEncryptionPublicKey: () => zswapSecretKeys.encryptionPublicKey,
      balanceTx: async (tx, ttl = ttlOneHour()) => {
        const recipe = await this.#wallet.balanceUnboundTransaction(tx, { shieldedSecretKeys: zswapSecretKeys, dustSecretKey }, { ttl });
        const signed = await this.#wallet.signRecipe(recipe, (payload) => keystore.signData(payload));
        return this.#wallet.finalizeRecipe(signed);
      },
      submitTx: (tx) => this.#wallet.submitTransaction(tx),
    };
    const zkConfigProvider = new NodeZkConfigProvider(assets);
    const password = await webPrivateStatePassword();
    const providers = {
      privateStateProvider: levelPrivateStateProvider({
        privateStateStoreName: 'paydrip-web-private-state', signingKeyStoreName: 'paydrip-web-signing-keys',
        privateStoragePasswordProvider: () => password, accountId: address,
      }),
      publicDataProvider, zkConfigProvider,
      proofProvider: httpClientProofProvider(environment.proofServer, zkConfigProvider),
      walletProvider: provider, midnightProvider: provider,
    };
    const { compiled } = await compiledContract();
    setStage('Preparing the contract call');
    // Generated JS leaves the no-private-state generic as unknown; runtime uses the base overload here.
    // @ts-expect-error PayDrip declares no private state or witness functions.
    const found = await findDeployedContract(providers, { contractAddress: deployment.contractAddress, compiledContract: compiled });
    setStage('Generating a proof and submitting to Preview');
    const call = await found.callTx[action](...args);
    // Never serialize the call object: its private branch contains proving inputs.
    return { circuit: action, txId: call.public.txId ?? null, blockHeight: call.public.blockHeight == null ? null : String(call.public.blockHeight),
      contractAddress: deployment.contractAddress, context: input.context ?? null };
  }

  async #arguments(action, input) {
    if (action === 'openEpoch' || action === 'closeEpoch') {
      return [fromHex(input.epoch, 'Payroll period ID'), await localAdmin()];
    }
    if (action === 'revokeRecord') {
      return [fromHex(input.commitment, 'Record commitment'), fromHex(input.epoch, 'Payroll period ID'), await localAdmin()];
    }
    if (action === 'registerRecord') {
      const opening = parseOpening(input.opening);
      const state = await publicState();
      if (toHex(opening.record.domain) !== state.domain || toHex(opening.record.organization) !== state.organization) {
        throw new InputError('This private record belongs to a different PayDrip deployment.');
      }
      return [opening.record, opening.randomness, await localAdmin()];
    }
    if (action === 'proveEmployment' || action === 'proveIncomeTier') {
      const opening = parseOpening(input.opening);
      const employeeSecret = fromHex(input.employeeSecret, 'Employee secret');
      const context = fromHex(input.context, 'Claim context');
      if (context.every((byte) => byte === 0)) throw new InputError('Claim context cannot be empty.');
      const state = await publicState();
      if (toHex(opening.record.domain) !== state.domain || toHex(opening.record.organization) !== state.organization) {
        throw new InputError('This private record belongs to a different PayDrip deployment.');
      }
      const expected = persistentHash(vector4, [padded('paydrip:employee:v1'), opening.record.domain, opening.record.epoch, employeeSecret]);
      if (toHex(expected) !== toHex(opening.record.employeePseudonym)) throw new InputError('The employee secret does not match this payroll record.');
      if (action === 'proveEmployment') return [opening.record, opening.randomness, employeeSecret, context];
      const tier = Number(input.tier);
      if (![1, 2, 3].includes(tier)) throw new InputError('Select one of the three supported USD monthly tiers.');
      return [opening.record, opening.randomness, employeeSecret, BigInt(tier), context];
    }
    throw new InputError('Unsupported PayDrip action.');
  }
}
