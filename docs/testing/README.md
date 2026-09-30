# Controlled 70-participant Preview integration run

**SYNTHETIC TEST PARTICIPANTS — NOT REAL HUMAN USERS OR LEVEL 5/6 TRACTION.**

The shared local Preview operator runs one epoch, 70 distinct employee identities, 70 registrations and 70 Tier 1 income claims. This requires at least **141 successful transactions**, not 70 wallets. No additional contract is deployed. Participant 1 is the mandatory canary and is included in the total of 70. Private inputs are synthetic, generated securely, and never printed.

## Run on a network-enabled Mac

Stop `web:dev` and other operator processes first; use a single operator process for consistent balances and private-state database access.

```sh
cd '/Users/swarupasaha/Projects/Payroll Midnight/PayDrip'
docker compose -f compose.preview.yml up -d
curl -fsS http://127.0.0.1:6300/health
npm run users:canary
```

Only after the canary succeeds and its indexed receipts are verified:

```sh
npm run users:run70
```

The bulk command also enforces/re-verifies the canary. All operations are sequential and stop on the first failure. It checks deployment indexing, existing proof/node health, local vault availability, wallet synchronization and positive spendable DUST before starting. A positive balance is not a guarantee of sufficient resources for all 141 transactions: the existing SDK balancer enforces transaction funding, and any failure stops the run. Sync may take up to 15 minutes; the installed proof provider uses a 300,000 ms request timeout, and confirmation uses the existing service/SDK lifecycle. No fake timing or completion states are used. If the SDK hangs, stop the process; durable intent makes the next run refuse ambiguous resubmission.

## Local persistence and recovery

`.secrets/paydrip-run70/private.json` holds private synthetic openings/employee secrets for resumability. `.secrets/paydrip-run70/checkpoint.public.json` contains only public IDs and action status. Both use mode 600; directories require 700, and the script verifies Git ignore coverage. Do not share either file; never upload the private vault. Keep it until the run is complete. A local exclusive lock prevents overlapping runner instances. Abrupt termination may leave `run.lock` or `.tmp` files: inspect running processes and file timestamps before manually resolving them; do not remove a lock while its process is active. Do not delete checkpoints to bypass an ambiguous transaction.

Verified actions are rechecked on resume, not submitted again. If an action has a known SDK transaction ID, the runner queries it and verifies its public effect before continuing. If an interrupted submission has no returned ID, it reads current public state and stops rather than resubmitting. After independent indexer investigation, the actual SDK transaction ID can be supplied:

```sh
npm run users:canary -- --recover-tx-id=ACTUAL_SDK_TRANSACTION_ID
```

Replace the instruction token with the actual 64-hex SDK identifier, not the indexer transaction hash. Use `users:run70` with the same option for a later participant. No recovery ID is invented. The verifier rejects unrelated IDs, partial/failed transactions, wrong contracts and state effects already present in the previous block. Multiple PayDrip transactions in one block require manual attribution and stop the runner conservatively.

## Evidence

`70-user-run.csv` and `70-user-run.md` contain public receipts only. The report always contains 70 planned test slots, with registration and claim columns; the shared epoch is reported separately. NOT ATTEMPTED slots do not imply an identity was created. Reports may have no rows when the environment blocks preflight. A receipt is VERIFIED only after matching the SDK identifier, indexed SUCCESS result, block membership, PayDrip public state transition and current state. Participant completion also requires the application's read-only verifier receipt to match the commitment, epoch and Tier 1 claim. Missing IDs/blocks are never manufactured.

A separate `70-user-feedback.csv` fixture contains exactly 56 Positive and 14 Negative synthetic texts (80% / 20%). These are generated test scenarios, not observations or responses from humans. The report joins this fixture only as explicitly labelled SYNTHETIC feedback, including when no network execution was possible. No generated feedback is inserted into genuine feedback files. All test activity must be excluded from genuine user traction totals, even though its transactions may be real.

## DUST synchronization diagnostics

Installed versions inspected: wallet-sdk 1.2.0, facade 4.1.0, dust-wallet 4.2.0, abstractions 2.1.0, indexer-client 1.2.3, testkit-js 4.1.1. The facade starts DUST automatically. The exact strict DUST predicate is `isConnected && abs(highestRelevantWalletIndex - appliedIndex) === 0`; it is independent of balance and matches `dust.waitForSyncedState(0n)`. No extra DUST start call is needed.

The previously printed booleans do not establish why the user's DUST stream stayed unsynced. A fresh SDK wallet replays DUST events from the beginning. PayDrip's service previously used SDK defaults (10-event batches, 1 ms batching timeout, 4 ms spacing); it now uses the same 100-event / 10 ms / zero-spacing pacing already used by the repository's Preview deployment tool. This uses exported SDK factories, not mutation of the fluent builder's private configuration. Event cursors, zero-gap readiness, authorization and funding checks remain unchanged. This is a source-level catch-up improvement, not verified runtime completion.

The canary and wallet diagnostic now keep a continuous state subscription with a fixed 15-minute deadline. Repeated incomplete emissions cannot extend that deadline. Progress is printed on reason changes and at 15-second heartbeat intervals, including elapsed time, applied index, indexed event target and gap. Silent or failed state streams are bounded/sanitized. Timeout returns the last public diagnostics.

Read the diagnostics as follows:

- `SYNCING_UNSHIELDED`: unshielded history is incomplete.
- `DUST_NO_EVENTS_OBSERVED`: DUST's SDK connected marker is false. No applied DUST event is evidenced; this alone does not diagnose an RPC outage.
- `SYNCING_DUST`: DUST has applied events but is not strictly caught up. Compare `appliedIndex`, `highestRelevantWalletIndex` and `gap` over time. Advancing indices indicate replay; unchanged indices alone do not prove an external outage.
- `DUST_GENERATION_REGISTRATION_REQUIRED`: synchronization completed, no spendable DUST, and available NIGHT UTXOs are marked unregistered. No registration transaction is performed automatically by this diagnostic.
- `DUST_PENDING_OR_RESERVED`: wallet balance exists but the available-coin projection is zero.
- `NO_NIGHT_OR_DUST` / `NO_SPENDABLE_DUST`: confirmed synchronized snapshot lacks usable resources; inspect the public balances before funding decisions.
- `READY_FOR_FEE_ESTIMATION`: both streams are strictly synchronized and available DUST is positive. Actual fee sufficiency is still enforced by the SDK balancer.

`dustBalanceRaw` is the SDK wallet balance; `spendableDustRaw` is the sum of currently projected **available** DUST coins, excluding pending spends. Both are raw quantities, not dollar amounts. Unsynchronized balances are marked provisional. Only scalar counters, public address and balance aggregates are exposed: no coin objects/nonces or secret material.

DUST's SDK `isConnected` marker is set when events are applied; it is not an independent live RPC health monitor. The reported normal-closure RuntimeVersion messages do not alone establish why DUST sync failed. No funding amount, resource shortage, or final runtime root cause is claimed without a synchronized observation. Do not run the bulk cohort until the canary genuinely completes.
