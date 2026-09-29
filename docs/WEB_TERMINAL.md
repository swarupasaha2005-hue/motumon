# PayDrip local web terminal

The application at `/app` is a **Preview terminal**. Its contract actions use the deployed PayDrip contract address from `deployment.preview.json`, the repository's generated Compact bindings, Midnight.js 4.1.1, a local proof server, and a local Preview wallet. Its separate 1AM browser connection requests Preview access and reads a public unshielded address. It does not turn the landing page's illustrative product cards into fabricated accounts or records.

## Contract-to-product inventory

All six exported circuits return `[]`. A successful web action therefore displays the finalized transaction ID and block height, then refreshes public ledger state; it does not receive a salary or proof document as a circuit return value. There are no separate Compact witness functions.

| Compact circuit → UI action | Authorization and required inputs | Public state read → written; disclosure | Failure cases |
| --- | --- | --- | --- |
| `openEpoch` → Payroll / Open period | Local administrator secret (private), 32-byte period ID | Admin authenticator and `epochs` → `epochs[id] = Open`. Period ID and transition are public. | Wrong admin secret, duplicate ID. |
| `registerRecord` → Records / Register commitment | Local administrator secret, private `PayrollRecord` and fresh 32-byte randomness. Record binds domain, organization, period, employee pseudonym, monthly USD salary in cents, and currency. | Authenticator, sealed config, open epoch, `records` → randomized commitment keyed to epoch. Commitment and registration timing are public; exact salary and opening are not. | Wrong admin, non-open epoch, wrong config, zero salary, duplicate commitment. |
| `revokeRecord` → Records / Revoke | Local administrator secret; public period and commitment handle | Authenticator, epoch, records, revoked set → revoked handle inserted. Handle and revocation are public. | Wrong admin, non-open/wrong epoch, absent or already revoked handle. |
| `proveEmployment` → Create a claim / Historical membership | Employee secret, complete private record opening and randomness, unique verifier context | Sealed config, epoch, records, revoked set, claims → `claims[context] = 0` and `claimRecords[context] = commitment`. Context, record handle, period relationship, and claim activity are public. | Wrong employee secret/opening/org/period, absent or revoked record, missing or reused context. Closed epochs still allow historical claims. |
| `proveIncomeTier` → Create a claim / Income eligibility | Same employee inputs plus tier 1, 2, or 3, meaning monthly USD base salary at least $3,000, $5,000, or $10,000 | Same checks → `claims[context] = tier` and linked commitment. Tier and context are public; exact salary is not stored publicly. | Membership failures, unsupported tier, salary below tier, reused context. |
| `closeEpoch` → Payroll / Close period | Local administrator secret; public period ID | Authenticator and open epoch → `epochs[id] = Closed`. Closure is public. | Wrong admin, absent or already closed epoch. |

The generated TypeScript/JavaScript binding is `contract/src/managed/paydrip/contract/index.js`. The browser has no direct binding to it: `apps/web/server/preview-service.mjs` uses `findDeployedContract(...).callTx` and returns only selected public transaction metadata. `apps/web/server/api.mjs` exposes these actions on loopback. Generated managed artifacts are ignored by Git; run `npm run paydrip:compile` locally.

## Practical flows

- **Issuer:** use the local administrator vault to open a period. Obtain an employee-derived pseudonym. Prepare a private record package and download it before registering its commitment. Deliver the package through an authenticated private channel. Revoke while the period is open if needed, then close it.
- **Employee:** run a terminal on a machine they control, generate a fresh employee secret for the chosen period, and share only the derived pseudonym. Import the issuer's private record package and their private identity file, or use the identity generated in the current session. The terminal checks the generated commitment against public state and checks ownership before permitting a claim. A proof call requires the employee's explicit submission and a verifier-provided context.
- **Verifier:** generate a fresh 32-byte context, give it to the employee, and later look it up. The terminal reads the accepted receipt from contract state and displays claim kind, tier, organization ID, period ID, and public record handle. A missing receipt is **not** labeled an invalid proof. The contract does not bind a context to a named verifier or prove that salary was paid.

## Privacy and operational limits

The private record and employee secret remain in browser memory for the session and are sent only to the loopback service for checking or proving. The local service and local proof server see private inputs transiently. Do not run this terminal on an issuer-controlled or shared remote host for employee claims. No salary, randomness, employee secret, wallet seed, or raw Midnight.js call result is sent in a public-state response or logged by the application. The issuer necessarily knows the salary it commits. Public commitments, claim contexts, transaction metadata, and linked record handles can correlate activity; repeated tiers can reveal a salary band.

This terminal's SDK call path is **wired but not yet confirmed by a live Preview payroll transaction**. The repository's existing Preview evidence verifies the constructor deployment and indexed contract state. Static `dist/web` assets allow a 1AM connection but do not provide the local API or submit payroll transactions. The 1AM connection does not sign or fund contract calls. A future remotely hosted product needs an independently reviewed browser-wallet transaction provider, private record delivery, and deployment model.
