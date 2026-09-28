# PayDrip

**Payroll belongs on-chain. Salaries don't.**

PayDrip is an experimental Midnight Compact contract for employer-issued private payroll records and selective historical employment and income-tier claims. The contract does **not** transfer salaries, prove that payment occurred, or guarantee anonymity. Public record commitments and claim receipts are linkable, and repeated tier answers can reveal a salary band. Read [the protocol architecture](docs/ARCHITECTURE.md) before using it.

## Current status

- **Implemented locally:** six Compact circuits in `contract/src/paydrip.compact` and focused off-chain tests.
- **Compiled/tested:** run the commands below to reproduce on your machine. Generated `managed/paydrip` artifacts are ignored by Git and must be generated locally.
- **Preview deployment:** pending a funded wallet, DUST, local proof server, and a successful deployment transaction. No contract address is claimed yet.
- **Web app:** planned. The copied bboard packages still present in the repository are not PayDrip product code and must not be presented as such.

## Public and private model

The ledger exposes organization and deployment-domain identifiers, admin authenticator, USD unit, epoch status, randomized record commitments, revocations, and successful claim receipts. Claim receipts expose the associated record handle, so claims for the same record can be linked. Exact salary, employee secret, and commitment randomness remain private inputs. The employer already knows the salary it issues. The actual generated call payload and disclosure surface require a network inspection before making stronger privacy claims.

## Compact circuits

`openEpoch`, `registerRecord`, `revokeRecord`, `proveEmployment`, `proveIncomeTier`, `closeEpoch`. V1 uses USD monthly salary in cents and tiers of $3,000, $5,000, and $10,000. Employment means inclusion in a historical payroll epoch, not current employment.

## Prerequisites

- Node.js 22 or later and npm; this repo's template declares Node.js 24.11.1 or later.
- [Compact devtools and compiler](https://docs.midnight.network/relnotes/support-matrix): checked with devtools 0.5.1 and compiler 0.31.1.
- Docker with enough disk space for the proof server and its initial proving-key downloads.
- A funded **Preview** NIGHT wallet; NIGHT must be registered for DUST generation before deployment. See the [official funding guide](https://docs.midnight.network/guides/acquire-tokens).

## Exact Preview commands

From a terminal on this computer:

```bash
cd '/Users/swarupasaha/Projects/Payroll Midnight/PayDrip'
npm ci
npm run paydrip:compile
npm run paydrip:test
npm run preview:wallet
docker compose -f compose.preview.yml up -d
curl http://127.0.0.1:6300/health
npm run preview:status
npm run preview:deploy
```

`preview:wallet` prints only the unshielded Preview address. Its seed is generated once in `.secrets/preview-wallet.seed` with mode 600 and is Git-ignored. Back it up securely before funding. Fund **that address** using the [Preview faucet](https://midnight-tmnight-preview.nethermind.dev/); do not paste a seed into the faucet or chat. `preview:status` may take time for a fresh wallet to sync. `preview:deploy` registers NIGHT for DUST if necessary, waits for spendable DUST, then submits the PayDrip deployment. It prints and locally stores the actual contract address and transaction details only after the network returns them. Do not run it multiple times blindly: it refuses a second deployment when a local deployment manifest already contains an address.

The administrator secret and encrypted private-state password are generated into Git-ignored `.secrets/` files. Back them up securely; losing them can prevent future payroll administration or contract maintenance. The deployment-domain and organization IDs are random public identifiers. The deployed contract address is distinct from the funding wallet address.

To stop the local proof server:

```bash
docker compose -f compose.preview.yml down
```

## Tests and limitations

`npm run paydrip:test` covers authorized mutation, wrong salary/secret/randomness, tier boundaries, context replay, revocation, and closure. The current tests execute generated Compact logic off chain; they do not establish that proving, transaction submission, indexing, or the frontend work on Preview. There is no confidential payment feature. Issuer honesty, delivery of payroll openings, wallet/transaction metadata, threshold probing, and post-close historical claim semantics remain explicit limitations. See the architecture's threat model and validation gates.

## Deployment evidence

**Network:** Preview (planned). **PayDrip contract address:** pending genuine deployment. **Transaction:** pending. After deployment, record the actual address, transaction ID, block height, and an explorer/indexer check here. Never use a placeholder or the funding wallet address as a contract address.

## Further work

Replace the leftover bboard packages with a PayDrip API, secure employee opening delivery, and a real privacy-first web app. Review the generated public payloads and claim linkage on Preview. Validate the current Rise In program requirements before submission.
