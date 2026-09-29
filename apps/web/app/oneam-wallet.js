// The Midnight DApp connector v4 exposes each wallet under a registry key on window.midnight.
// Keep this adapter limited to permission, network, and public address. Payroll actions still
// use the separate local PayDrip service and do not use the browser wallet for signing.

/** @typedef {{name?: string, rdns?: string, apiVersion?: string, connect?: (networkId: string) => Promise<ConnectedWallet>}} InitialWallet */
/** @typedef {{getConnectionStatus?: () => Promise<{status: string, networkId?: string}>, getUnshieldedAddress?: () => Promise<{unshieldedAddress?: string}>}} ConnectedWallet */

/** @param {Record<string, InitialWallet> | undefined} registry */
export function findOneAm(registry) {
  const matches = Object.values(registry ?? {}).filter((wallet) =>
    wallet && (/^1am(?: wallet)?$/i.test(wallet.name?.trim() ?? '') || /^(?:[a-z0-9-]+\.)*(?:1am|oneam)\.(?:xyz|com)$/i.test(wallet.rdns?.trim() ?? ''))
  );
  if (matches.length > 1) throw new Error('Multiple 1AM wallet connectors were detected. Disable duplicate or untrusted wallet extensions and retry.');
  return matches[0] ?? null;
}

/** @param {Record<string, InitialWallet> | undefined} registry */
export async function connectOneAm(registry) {
  const wallet = findOneAm(registry);
  if (!wallet) throw new Error('1AM was not detected. Install and unlock the 1AM browser extension, then reload this page.');
  if (!/^4\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:[-+][\w.-]+)?$/.test(wallet.apiVersion ?? '')) {
    throw new Error('This 1AM connector does not expose the supported Midnight DApp Connector v4 API. Update the extension and retry.');
  }
  if (typeof wallet.connect !== 'function') throw new Error('The 1AM connector cannot start a wallet session. Update the extension and retry.');

  const connected = await wallet.connect('preview');
  if (typeof connected?.getConnectionStatus !== 'function' || typeof connected.getUnshieldedAddress !== 'function') {
    throw new Error('The 1AM connector did not provide the required v4 wallet methods.');
  }
  const status = await connected.getConnectionStatus();
  if (status?.status !== 'connected' || status.networkId !== 'preview') {
    throw new Error('1AM is not connected to Midnight Preview. Select Preview in the wallet and retry.');
  }
  const { unshieldedAddress } = await connected.getUnshieldedAddress();
  if (typeof unshieldedAddress !== 'string' || !/^mn_addr_preview1[0-9a-z]+$/.test(unshieldedAddress)) {
    throw new Error('1AM did not return a valid Preview unshielded address.');
  }
  return { api: connected, address: unshieldedAddress, network: 'Preview' };
}
