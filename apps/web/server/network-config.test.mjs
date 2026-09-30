import { describe, expect, it } from 'vitest';
import { networkConfiguration, assertDeploymentNetwork } from '../../../scripts/lib/network-config.mjs';

describe('explicit network configuration (offline)', () => {
  it.each(['preview', 'preprod'])('keeps all %s providers on the same network', (network) => {
    const config = networkConfiguration(network);
    expect(config.networkId).toBe(network);
    expect(config.walletNetworkId).toBe(network);
    expect(config.indexer).toBe(`https://indexer.${network}.midnight.network/api/v4/graphql`);
    expect(config.indexerWS).toBe(`wss://indexer.${network}.midnight.network/api/v4/graphql/ws`);
    expect(config.nodeWS).toBe(`wss://rpc.${network}.midnight.network`);
    expect(Object.isFrozen(config)).toBe(true);
  });
  it('rejects unsupported networks and cross-network deployment reuse', () => {
    expect(() => networkConfiguration('mainnet')).toThrow();
    expect(() => assertDeploymentNetwork({ network: 'preview', contractAddress: 'a'.repeat(64) }, 'preprod')).toThrow();
    expect(() => assertDeploymentNetwork({ network: 'preprod', contractAddress: 'invalid' }, 'preprod')).toThrow();
    expect(() => assertDeploymentNetwork(null, 'preprod')).toThrow();
  });
});
