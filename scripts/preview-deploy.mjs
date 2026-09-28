import { randomBytes } from 'node:crypto';
import { mkdir, open, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { firstValueFrom, filter, timeout } from 'rxjs';
import { WebSocket } from 'ws';
import { FluentWalletBuilder } from '@midnight-ntwrk/testkit-js';
import { setNetworkId } from '@midnight-ntwrk/midnight-js-network-id';
import { DustSecretKey, LedgerParameters, ZswapSecretKeys, unshieldedToken } from '@midnight-ntwrk/midnight-js-protocol/ledger';
import { ttlOneHour } from '@midnight-ntwrk/midnight-js-utils';
import { NodeZkConfigProvider } from '@midnight-ntwrk/midnight-js-node-zk-config-provider';
import { indexerPublicDataProvider } from '@midnight-ntwrk/midnight-js-indexer-public-data-provider';
import { httpClientProofProvider } from '@midnight-ntwrk/midnight-js-http-client-proof-provider';
import { levelPrivateStateProvider } from '@midnight-ntwrk/midnight-js-level-private-state-provider';
import { CompiledContract } from '@midnight-ntwrk/midnight-js-protocol/compact-js';
import { deployContract } from '@midnight-ntwrk/midnight-js-contracts';
import { CompactTypeBytes, CompactTypeVector, persistentHash } from '@midnight-ntwrk/compact-runtime';
import { Contract } from '../contract/src/managed/paydrip/contract/index.js';

globalThis.WebSocket = WebSocket;
setNetworkId('preview');

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const secretDir = path.join(root, '.secrets');
const seed = (await readFile(path.join(secretDir, 'preview-wallet.seed'), 'utf8')).trim();
if (!/^[0-9a-f]{64}$/.test(seed)) throw new Error('Missing or invalid local Preview wallet seed');
const deploymentPath = path.join(secretDir, 'preview-deployment.json');
const privatePasswordPath = path.join(secretDir, 'preview-private-state.password');
const environment = {
  walletNetworkId: 'preview', networkId: 'preview',
  indexer: 'https://indexer.preview.midnight.network/api/v4/graphql',
  indexerWS: 'wss://indexer.preview.midnight.network/api/v4/graphql/ws',
  node: 'https://rpc.preview.midnight.network',
  nodeWS: 'wss://rpc.preview.midnight.network',
  proofServer: 'http://127.0.0.1:6300',
};

async function loadOrCreatePrivateFile(filePath, generate) {
  try { return (await readFile(filePath, 'utf8')).trim(); }
  catch (e) {
    if (e.code !== 'ENOENT') throw e;
    const value = generate();
    const handle = await open(filePath, 'wx', 0o600);
    try { await handle.writeFile(`${value}\n`); } finally { await handle.close(); }
    return value;
  }
}

const dustOptions = {
  ledgerParams: LedgerParameters.initialParameters(),
  additionalFeeOverhead: 1_000n,
  feeBlocksMargin: 5,
};
const built = await FluentWalletBuilder.forEnvironment(environment)
  .withDustOptions(dustOptions).withSeed(seed).buildWithoutStarting();
const { wallet, seeds, keystore } = built;
const zswapSecretKeys = ZswapSecretKeys.fromSeed(seeds.shielded);
const dustSecretKey = DustSecretKey.fromSeed(seeds.dust);
const address = keystore.getBech32Address().asString();
console.log(`Preview funding address: ${address}`);

await wallet.start(zswapSecretKeys, dustSecretKey);
try {
  if (process.argv[2] === '--status') {
    const current = await firstValueFrom(wallet.unshielded.state.pipe(timeout({ first: 30_000 })));
    const balance = current.balances[unshieldedToken().raw] ?? 0n;
    console.log(`Observed NIGHT: ${balance}; wallet fully synced: ${current.progress?.isStrictlyComplete?.() ?? false}`);
  } else if (process.argv[2] !== '--deploy') {
    throw new Error('Use --status or --deploy');
  } else {
  const synced = await firstValueFrom(wallet.state().pipe(
    filter((s) => s.unshielded.progress?.isStrictlyComplete?.() && s.dust.state.progress?.isStrictlyComplete?.()),
    timeout({ first: 900_000 }),
  ));
  const night = synced.unshielded.balances[unshieldedToken().raw] ?? 0n;
  const dust = synced.dust.balance(new Date()) ?? 0n;
  console.log(`Synced NIGHT: ${night}; spendable DUST: ${dust}`);

    if (night === 0n) throw new Error(`Wallet is unfunded. Fund ${address} from the Preview faucet, then retry.`);
    if (dust === 0n) {
      const utxos = synced.unshielded.availableCoins.filter((coin) => !coin.meta.registeredForDustGeneration);
      if (utxos.length > 0) {
        const dustState = await wallet.dust.waitForSyncedState();
        const recipe = await wallet.registerNightUtxosForDustGeneration(
          utxos, keystore.getPublicKey(), (payload) => keystore.signData(payload), dustState.address,
        );
        const finalized = await wallet.finalizeRecipe(recipe);
        const registrationTxId = await wallet.submitTransaction(finalized);
        console.log(`DUST registration transaction: ${registrationTxId}`);
      }
      await firstValueFrom(wallet.state().pipe(filter((s) => s.dust.balance(new Date()) > 0n), timeout({ first: 900_000 })));
    }

    const proofHealth = await fetch(`${environment.proofServer}/health`, { signal: AbortSignal.timeout(5_000) });
    if (!proofHealth.ok) throw new Error('Local proof server is unhealthy');
    try {
      const prior = JSON.parse(await readFile(deploymentPath, 'utf8'));
      if (prior.contractAddress) throw new Error(`Already deployed at ${prior.contractAddress}; refusing duplicate deployment`);
    } catch (e) { if (e.code !== 'ENOENT') throw e; }

    await mkdir(secretDir, { recursive: true, mode: 0o700 });
    const password = await loadOrCreatePrivateFile(privatePasswordPath, () => `PayDrip-${randomBytes(24).toString('base64url')}!`);
    const credentialsPath = path.join(secretDir, 'preview-admin.json');
    const credentialText = await loadOrCreatePrivateFile(credentialsPath, () => JSON.stringify({
      organization: randomBytes(32).toString('hex'),
      domain: randomBytes(32).toString('hex'),
      adminSecret: randomBytes(32).toString('hex'),
    }));
    const credentials = JSON.parse(credentialText);
    for (const field of ['organization', 'domain', 'adminSecret']) {
      if (!/^[0-9a-f]{64}$/.test(credentials[field])) throw new Error(`Invalid ${field} in local admin file`);
    }
    const org = Buffer.from(credentials.organization, 'hex');
    const domain = Buffer.from(credentials.domain, 'hex');
    const adminSecret = Buffer.from(credentials.adminSecret, 'hex');
    const adminHash = persistentHash(
      new CompactTypeVector(3, new CompactTypeBytes(32)),
      [Uint8Array.from(Buffer.concat([Buffer.from('paydrip:admin:v1'), Buffer.alloc(16)])), domain, adminSecret],
    );
    const provider = {
      getCoinPublicKey: () => zswapSecretKeys.coinPublicKey,
      getEncryptionPublicKey: () => zswapSecretKeys.encryptionPublicKey,
      balanceTx: async (tx, ttl = ttlOneHour()) => {
        const recipe = await wallet.balanceUnboundTransaction(tx, { shieldedSecretKeys: zswapSecretKeys, dustSecretKey }, { ttl });
        const signed = await wallet.signRecipe(recipe, (payload) => keystore.signData(payload));
        return wallet.finalizeRecipe(signed);
      },
      submitTx: (tx) => wallet.submitTransaction(tx),
    };
    const assets = path.join(root, 'contract/src/managed/paydrip');
    const zkConfigProvider = new NodeZkConfigProvider(assets);
    const providers = {
      privateStateProvider: levelPrivateStateProvider({
        privateStateStoreName: 'paydrip-preview-private-state',
        signingKeyStoreName: 'paydrip-preview-signing-keys',
        privateStoragePasswordProvider: () => password,
        accountId: address,
      }),
      publicDataProvider: indexerPublicDataProvider(environment.indexer, environment.indexerWS),
      zkConfigProvider,
      proofProvider: httpClientProofProvider(environment.proofServer, zkConfigProvider),
      walletProvider: provider,
      midnightProvider: provider,
    };
    const compiledContract = CompiledContract.withCompiledFileAssets(CompiledContract.make('paydrip', Contract), assets);
    const deployed = await deployContract(providers, { compiledContract, args: [org, domain, Buffer.from('USD'), adminHash] });
    const publicTx = deployed.deployTxData.public;
    const manifest = {
      network: 'preview', contractAddress: publicTx.contractAddress,
      deploymentTxId: publicTx.txId ?? null, blockHeight: publicTx.blockHeight ?? null,
      organization: org.toString('hex'), domain: domain.toString('hex'),
    };
    await writeFile(deploymentPath, JSON.stringify(manifest, null, 2), { mode: 0o600 });
    console.log(JSON.stringify(manifest, null, 2));
  }
} finally {
  await wallet.stop();
}
