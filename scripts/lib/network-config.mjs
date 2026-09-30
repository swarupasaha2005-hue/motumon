// Source: https://docs.midnight.network/relnotes/network (reviewed 2026-09-30).
// Defining Preprod endpoints does not establish connectivity or a deployment.
export function networkConfiguration(network) {
  if (!['preview', 'preprod'].includes(network)) throw new Error('Unsupported PayDrip network.');
  return Object.freeze({
    walletNetworkId: network, networkId: network,
    indexer: `https://indexer.${network}.midnight.network/api/v4/graphql`,
    indexerWS: `wss://indexer.${network}.midnight.network/api/v4/graphql/ws`,
    node: `https://rpc.${network}.midnight.network`,
    nodeWS: `wss://rpc.${network}.midnight.network`,
    proofServer: 'http://127.0.0.1:6300',
  });
}

export function assertDeploymentNetwork(manifest, expectedNetwork) {
  networkConfiguration(expectedNetwork);
  if (manifest?.network !== expectedNetwork || !/^[0-9a-f]{64}$/.test(manifest?.contractAddress ?? '')) {
    throw new Error(`A valid ${expectedNetwork} PayDrip deployment manifest is required. Never reuse an address from another network.`);
  }
  return manifest;
}
