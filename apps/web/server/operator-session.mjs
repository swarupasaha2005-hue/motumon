// SDK startup has no AbortSignal. A timed-out attempt must never publish a
// session or overlap a replacement while its background cleanup is unresolved.
export class OperatorConnectionError extends Error {}

function safeFailure(error, stage) {
  if (error instanceof OperatorConnectionError) return error;
  if (/ENOTFOUND|EAI_AGAIN|ECONNREFUSED|ETIMEDOUT|websocket|network|fetch/i.test(String(error?.code ?? '') + String(error?.message ?? ''))) {
    return new OperatorConnectionError(`Preview RPC/indexer connection failed during ${stage}. HTTP health alone does not verify WebSocket access.`);
  }
  return new OperatorConnectionError(`Local Preview wallet ${stage} failed. No operator session was connected.`);
}

async function boundedStop(wallet) {
  let timer;
  try {
    await Promise.race([
      Promise.resolve().then(() => wallet.stop()),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new OperatorConnectionError('Wallet cleanup timed out. Restart the local PayDrip server before reconnecting.')), 10_000); }),
    ]);
  } finally { clearTimeout(timer); }
}

export class OperatorSession {
  #active = null;
  #pending = null;
  #draining = false;
  #stage = 'Disconnected';
  constructor(build, timeoutMs = 120_000) { this.build = build; this.timeoutMs = timeoutMs; }
  get active() { return this.#active; }
  info() { return { connected: !!this.#active, address: this.#active?.address ?? null, stage: this.#stage }; }
  connect() {
    if (this.#draining) return Promise.reject(new OperatorConnectionError('A failed wallet startup is still cleaning up. Wait, or restart the local PayDrip server before retrying.'));
    if (this.#pending) return this.#pending;
    if (this.#active) return Promise.resolve(this.info());
    /** @type {{wallet: {stop: () => Promise<unknown>}, start: () => Promise<unknown>, address: string, keys: unknown} | undefined} */
    let candidate;
    let cancelled = false;
    let timedOut = false;
    let timer;
    this.#stage = 'Constructing Preview wallet';
    const work = Promise.resolve().then(() => this.build()).then(async (built) => {
      candidate = built;
      if (cancelled) throw new OperatorConnectionError('Wallet initialization timed out.');
      this.#stage = 'Starting Preview wallet';
      await built.start();
      if (cancelled) throw new OperatorConnectionError('Wallet initialization timed out.');
      return built;
    });
    this.#pending = (async () => {
      try {
        const built = await Promise.race([work, new Promise((_, reject) => {
          timer = setTimeout(() => {
            timedOut = true;
            cancelled = true;
            reject(new OperatorConnectionError('Preview wallet initialization timed out after 120 seconds. Check RPC/indexer WebSocket access; wallet synchronization happens separately after startup.'));
          }, this.timeoutMs);
        })]);
        this.#active = built;
        this.#stage = 'Started; synchronization runs in the background';
        return this.info();
      } catch (error) {
        cancelled = true;
        const failure = safeFailure(error, this.#stage);
        this.#stage = 'Disconnected';
        this.#draining = true;
        // Stop now to interrupt SDK background work. Also stop after a late
        // construction/start resolution, since the SDK has no cancellation API.
        const cleanup = candidate ? boundedStop(candidate.wallet) : Promise.resolve();
        void Promise.allSettled([work, cleanup]).then(async ([, stopped]) => {
          try {
            if (stopped.status === 'rejected') throw stopped.reason;
            if (candidate && timedOut) await boundedStop(candidate.wallet);
            this.#draining = false;
          } catch { this.#stage = 'Cleanup failed; restart the local server'; }
        });
        throw failure;
      } finally { clearTimeout(timer); this.#pending = null; }
    })();
    return this.#pending;
  }
  async disconnect() {
    if (this.#pending) await this.#pending.catch(() => {});
    if (this.#draining) throw new OperatorConnectionError('Wallet startup cleanup is pending. Restart the local server if it does not finish.');
    const active = this.#active;
    this.#active = null;
    this.#stage = 'Disconnected';
    if (active) {
      this.#draining = true;
      try { await boundedStop(active.wallet); this.#draining = false; }
      catch { this.#stage = 'Cleanup failed; restart the local server'; throw new OperatorConnectionError(this.#stage); }
    }
    return this.info();
  }
}
