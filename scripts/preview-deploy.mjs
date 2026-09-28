import { randomBytes } from 'node:crypto';
import dns from 'node:dns';
import net from 'node:net';
import { mkdir, open, readFile, writeFile } from 'node:fs/promises';
import https from 'node:https';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { firstValueFrom, filter, throttleTime, timeout, tap } from 'rxjs';
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
const deploymentPath = path.join(secretDir, 'preview-deployment.json');
const privatePasswordPath = path.join(secretDir, 'preview-private-state.password');

async function assertNotAlreadyDeployed() {
  try {
    const prior = JSON.parse(await readFile(deploymentPath, 'utf8'));
    if (prior.contractAddress) throw new Error(`Already deployed at ${prior.contractAddress}; refusing duplicate deployment`);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}

if (process.argv[2] === '--deploy') await assertNotAlreadyDeployed();

// Preview's DNS can return an edge that accepts TCP/TLS but stalls on requests.
// Select responsive DNS answers locally; HTTPS and WSS still verify the official hostname.
async function selectResponsiveIp(hostname, probePath) {
  const addresses = await dns.promises.resolve4(hostname);
  const checks = addresses.map((address) => new Promise((resolve) => {
    const started = Date.now();
    const request = https.get({
      hostname, path: probePath, timeout: 4_000,
      lookup: (_host, options, callback) => {
        if (options?.all) callback(null, [{ address, family: 4 }]);
        else callback(null, address, 4);
      },
    }, (response) => {
      response.resume();
      resolve(response.statusCode === 200 ? { address, latencyMs: Date.now() - started } : null);
    });
    request.on('timeout', () => request.destroy());
    request.on('error', () => resolve(null));
  }));
  const results = await Promise.all(checks);
  const selected = results.filter(Boolean).sort((a, b) => a.latencyMs - b.latencyMs)[0]?.address;
  if (!selected) throw new Error(`No responsive Preview endpoint for ${hostname}`);
  return selected;
}

const responsive = new Map(await Promise.all([
  ['rpc.preview.midnight.network', '/health'],
  ['indexer.preview.midnight.network', '/ready'],
].map(async ([hostname, probePath]) => [hostname, await selectResponsiveIp(hostname, probePath)])));
for (const [hostname, envName] of [
  ['rpc.preview.midnight.network', 'PAYDRIP_RPC_IP'],
  ['indexer.preview.midnight.network', 'PAYDRIP_INDEXER_IP'],
]) {
  const override = process.env[envName];
  if (override) {
    if (net.isIP(override) !== 4 || !(await dns.promises.resolve4(hostname)).includes(override)) {
      throw new Error(`${envName} must be a current IPv4 address for ${hostname}`);
    }
    responsive.set(hostname, override);
  }
}
const originalLookup = dns.lookup.bind(dns);
dns.lookup = (hostname, options, callback) => {
  const selected = responsive.get(hostname);
  if (!selected) return originalLookup(hostname, options, callback);
  const cb = typeof options === 'function' ? options : callback;
  const opts = typeof options === 'function' ? {} : options;
  if (opts?.all) cb(null, [{ address: selected, family: 4 }]);
  else cb(null, selected, 4);
};
console.log(`Selected responsive Preview endpoints: RPC ${responsive.get('rpc.preview.midnight.network')}, indexer ${responsive.get('indexer.preview.midnight.network')}.`);

const seed = (await readFile(path.join(secretDir, 'preview-wallet.seed'), 'utf8')).trim();
if (!/^[0-9a-f]{64}$/.test(seed)) throw new Error('Missing or invalid local Preview wallet seed');
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
const walletBuilder = FluentWalletBuilder.forEnvironment(environment).withDustOptions(dustOptions).withSeed(seed);
// A fresh wallet must replay the Preview DUST event stream. Larger batches avoid
// spending most of that first sync waiting between tiny default batches.
walletBuilder.config.batchUpdates = { size: 100, timeout: 10, spacing: 0 };
const built = await walletBuilder.buildWithoutStarting();
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
    throttleTime(15_000, undefined, { leading: true, trailing: true }),
    tap((s) => console.log(`Wallet sync: unshielded=${s.unshielded.progress?.isConnected ?? false} ${s.unshielded.progress?.appliedId ?? 0n}/${s.unshielded.progress?.highestTransactionId ?? 0n}, dust=${s.dust.state.progress?.isConnected ?? false} ${s.dust.state.progress?.appliedIndex ?? 0n}/${s.dust.state.progress?.highestRelevantWalletIndex ?? 0n}, observed NIGHT=${s.unshielded.balances[unshieldedToken().raw] ?? 0n}`)),
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
    await assertNotAlreadyDeployed();

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
    const compiledContract = CompiledContract.withCompiledFileAssets(
      CompiledContract.withWitnesses(CompiledContract.make('paydrip', Contract), {}),
      assets,
    );
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
