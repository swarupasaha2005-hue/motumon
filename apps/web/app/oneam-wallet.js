// The Midnight DApp connector v4 exposes each wallet under a registry key on window.midnight.
// Keep this adapter limited to permission, network, and public address. Payroll actions still
// use the separate local PayDrip service and do not use the browser wallet for signing.

/** @typedef {{name?: string, rdns?: string, apiVersion?: string, connect?: (networkId: string) => Promise<ConnectedWallet>}} InitialWallet */
/** @typedef {{getConnectionStatus?: () => Promise<{status: string, networkId?: string}>, getUnshieldedAddress?: () => Promise<{unshieldedAddress?: string}>, getUnshieldedBalances?: Function, getShieldedAddresses?: Function, getConfiguration?: Function, signData?: Function, balanceUnsealedTransaction?: Function, submitTransaction?: Function, getProvingProvider?: Function}} ConnectedWallet */

class OneAmConnectionError extends Error {}

/** @param {Record<string, InitialWallet> | undefined} registry */
export function findOneAm(registry) {
  const matches = Object.values(registry ?? {}).filter((wallet) =>
    wallet && (/^(?:1am|oneam)(?: wallet)?$/i.test(wallet.name?.trim() ?? '') || /^(?:[a-z0-9-]+\.)*(?:1am|oneam)\.(?:xyz|com)$/i.test(wallet.rdns?.trim() ?? ''))
  );
  if (matches.length > 1) throw new OneAmConnectionError('Multiple 1AM wallet connectors were detected. Disable duplicate or untrusted wallet extensions and retry.');
  return matches[0] ?? null;
}

/** @param {Record<string, InitialWallet> | undefined} registry */
export async function connectOneAm(registry) {
  const wallet = findOneAm(registry);
  if (!wallet) throw new OneAmConnectionError('1AM was not detected. Install and unlock the 1AM browser extension, then reload this page.');
  if (!/^4\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:[-+][\w.-]+)?$/.test(wallet.apiVersion ?? '')) {
    throw new OneAmConnectionError('This 1AM connector does not expose the supported Midnight DApp Connector v4 API. Update the extension and retry.');
  }
  if (typeof wallet.connect !== 'function') throw new OneAmConnectionError('The 1AM connector cannot start a wallet session. Update the extension and retry.');

  const connected = await wallet.connect('preview');
  if (typeof connected?.getConnectionStatus !== 'function' || typeof connected.getUnshieldedAddress !== 'function') {
    throw new OneAmConnectionError('The 1AM connector did not provide the required v4 wallet methods.');
  }
  const status = await connected.getConnectionStatus();
  if (status?.status !== 'connected' || status.networkId !== 'preview') {
    throw new OneAmConnectionError('1AM is not connected to Midnight Preview. Select Preview in the wallet and retry.');
  }
  const { unshieldedAddress } = await connected.getUnshieldedAddress();
  if (typeof unshieldedAddress !== 'string' || !/^mn_addr_preview1[0-9a-z]+$/.test(unshieldedAddress)) {
    throw new OneAmConnectionError('1AM did not return a valid Preview unshielded address.');
  }
  return { api: connected, address: unshieldedAddress, network: 'Preview', capabilities: oneAmCapabilities(connected) };
}


// Presence is not proof that a wallet method works. Never invoke signing or proving
// just to probe it, and never infer transaction support from a successful connection.
/** @param {ConnectedWallet} api */
export function oneAmCapabilities(api) {
  const has = (name) => typeof api?.[name] === 'function';
  return {
    balances: has('getUnshieldedBalances'),
    publicKeys: has('getShieldedAddresses'),
    configuration: has('getConfiguration'),
    dataSigning: has('signData'),
    balancing: has('balanceUnsealedTransaction'),
    submission: has('submitTransaction'),
    proving: has('getProvingProvider'),
  };
}

// Extension errors may contain request data. Only show our own safe messages.
export function walletConnectionError(error) {
  const message = error instanceof Error ? error.message : '';
  if (error instanceof OneAmConnectionError) return error.message;
  if (/reject|denied|declin|cancel/i.test(message)) return 'Connection was declined. You can connect again when you are ready.';
  if (/lock/i.test(message)) return 'Unlock 1AM Wallet, then try connecting again.';
  if (/unavailable|not available/i.test(message)) return '1AM Wallet is unavailable. Open the extension and retry.';
  return 'Unable to connect to 1AM Wallet. Check the extension and retry.';
}

/** Application-session cleanup: Connector v4 has no disconnect/revoke method. */
export function createOneAmSession() {
  /** @type {Awaited<ReturnType<typeof connectOneAm>> | null} */
  let session = null;
  let generation = 0;
  let pending = false;
  /** @type {(() => void) | null} */
  let cancel = null;
  return {
    get session() { return session; },
    get pending() { return pending; },
    /** @param {Record<string, InitialWallet> | undefined} registry */
    async connect(registry, timeoutMs = 60_000) {
      if (pending) throw new OneAmConnectionError('A wallet connection is already in progress.');
      if (session) return session;
      const attempt = ++generation;
      pending = true;
      let timer;
      try {
        const interruption = new Promise((_, reject) => {
          cancel = () => reject(new OneAmConnectionError('Wallet connection was cancelled.'));
          timer = setTimeout(() => reject(new OneAmConnectionError('The 1AM connection timed out. Open the extension and retry.')), timeoutMs);
        });
        const connected = await Promise.race([connectOneAm(registry), interruption]);
        if (attempt !== generation) throw new OneAmConnectionError('Wallet connection was cancelled.');
        session = /** @type {Awaited<ReturnType<typeof connectOneAm>>} */ (connected);
        return session;
      } finally {
        clearTimeout(timer);
        if (attempt === generation) { pending = false; cancel = null; }
      }
    },
    disconnect() {
      ++generation;
      cancel?.();
      cancel = null;
      pending = false;
      session = null;
    },
    async refresh() {
      const current = session;
      if (!current) return false;
      try {
        const status = await current.api.getConnectionStatus();
        const address = await current.api.getUnshieldedAddress();
        if (current !== session) return false;
        if (status.status !== 'connected' || status.networkId !== 'preview' || address.unshieldedAddress !== current.address) {
          this.disconnect();
          return false;
        }
        return true;
      } catch {
        if (current === session) this.disconnect();
        return false;
      }
    },
  };
}

// Browser identity is not the signer in the existing local operator path.
export function operatorActionAvailability({ hosted, connected, busy }) {
  if (hosted) return { enabled: false, reason: 'Circuit calls need the local PayDrip terminal. 1AM connection alone cannot enable this hosted build.' };
  if (busy) return { enabled: false, reason: 'Wait for the current contract action to finish.' };
  if (!connected) return { enabled: false, reason: 'Connect the local Preview operator wallet in Network & contract to submit a circuit call.' };
  return { enabled: true, reason: 'Ready. The local Preview operator signs and submits this call; 1AM is a separate browser session.' };
}
