import dns from 'node:dns';
import net from 'node:net';
import { readFile } from 'node:fs/promises';
import { WebSocket } from 'ws';
import { indexerPublicDataProvider } from '@midnight-ntwrk/midnight-js-indexer-public-data-provider';

const deployment = JSON.parse(await readFile(new URL('../deployment.preview.json', import.meta.url), 'utf8'));
if (deployment.network !== 'preview' || !/^[0-9a-f]{64}$/.test(deployment.contractAddress)) {
  throw new Error('Invalid public Preview deployment manifest');
}

const override = process.env.PAYDRIP_INDEXER_IP;
if (override) {
  const hostname = 'indexer.preview.midnight.network';
  if (net.isIP(override) !== 4 || !(await dns.promises.resolve4(hostname)).includes(override)) {
    throw new Error('PAYDRIP_INDEXER_IP must be a current Preview indexer IPv4 address');
  }
  const originalLookup = dns.lookup.bind(dns);
  dns.lookup = (host, options, callback) => {
    if (host !== hostname) return originalLookup(host, options, callback);
    const cb = typeof options === 'function' ? options : callback;
    const opts = typeof options === 'function' ? {} : options;
    if (opts?.all) cb(null, [{ address: override, family: 4 }]);
    else cb(null, override, 4);
  };
}

const provider = indexerPublicDataProvider(
  'https://indexer.preview.midnight.network/api/v4/graphql',
  'wss://indexer.preview.midnight.network/api/v4/graphql/ws',
  WebSocket,
);
const [current, deployed] = await Promise.all([
  provider.queryContractState(deployment.contractAddress),
  provider.queryDeployContractState(deployment.contractAddress),
]);
if (!current || !deployed) throw new Error('Preview indexer did not return current and deployed contract state');
console.log(JSON.stringify({
  network: deployment.network,
  contractAddress: deployment.contractAddress,
  currentStateIndexed: true,
  deploymentStateIndexed: true,
}, null, 2));
