# PayDrip

**Payroll belongs on-chain. Salaries don't.**

PayDrip is an experimental Midnight Compact contract for employer-issued private payroll records and selective historical employment and income-tier claims. The contract does **not** transfer salaries, prove that payment occurred, or guarantee anonymity. Public record commitments and claim receipts are linkable, and repeated tier answers can reveal a salary band. Read [the protocol architecture](docs/ARCHITECTURE.md) before using it.

## Current status

- **Implemented locally:** six Compact circuits in `contract/src/paydrip.compact` and focused off-chain tests.
- **Compiled/tested:** run the commands below to reproduce on your machine. Generated `managed/paydrip` artifacts are ignored by Git and must be generated locally.
- **Preview deployment:** completed on 2026-09-29. The contract address and independent indexer check are recorded below.
- **Landing page:** an editorial, static protocol showcase lives in `apps/web`. Its interface examples are illustrative; no wallet is connected and it cannot submit payroll transactions or proofs.
- **Web app:** a connected organization, employee, and verifier application is planned.

## Landing page

Run the static site locally with `npm run web:dev` and open `http://127.0.0.1:5173`. Run `npm run web:check` to check its JavaScript syntax and `npm run web:build` to create `dist/web`. These commands need no frontend dependencies beyond Node.js. The page explains the protocol and demonstrates claim selection with local example data only.

## Public and private model

The ledger exposes organization and deployment-domain identifiers, admin authenticator, USD unit, epoch status, randomized record commitments, revocations, and successful claim receipts. Claim receipts expose the associated record handle, so claims for the same record can be linked. Exact salary, employee secret, and commitment randomness remain private inputs. The employer already knows the salary it issues. The actual generated call payload and disclosure surface require a network inspection before making stronger privacy claims.

## Compact circuits

`openEpoch`, `registerRecord`, `revokeRecord`, `proveEmployment`, `proveIncomeTier`, `closeEpoch`. V1 uses USD monthly salary in cents and tiers of $3,000, $5,000, and $10,000. Employment means inclusion in a historical payroll epoch, not current employment.

## Prerequisites

- Node.js 24.11.1 or later and npm.
- [Compact devtools and compiler](https://docs.midnight.network/relnotes/support-matrix): checked with devtools 0.5.1 and compiler 0.31.1.
- Docker with enough disk space for the proof server and its initial proving-key downloads.
- A funded **Preview** NIGHT wallet; NIGHT must be registered for DUST generation before deployment. See the [official funding guide](https://docs.midnight.network/guides/acquire-tokens).

## Exact Preview commands

From a terminal after cloning the repository:

```bash
git clone https://github.com/swarupasaha2005-hue/motumon.git PayDrip
cd PayDrip
npm ci
npm run paydrip:compile
npm run paydrip:test
npm run preview:wallet
```

Back up the generated seed securely, then fund the printed **unshielded Preview address** at the [Preview faucet](https://midnight-tmnight-preview.nethermind.dev/). After the faucet transfer arrives, continue:

```bash
docker compose -f compose.preview.yml up -d
until curl -fsS http://127.0.0.1:6300/health; do sleep 5; done
npm run preview:status
npm run preview:deploy
```

`preview:wallet` prints only the unshielded Preview address. Its seed is generated once in `.secrets/preview-wallet.seed` with mode 600 and is Git-ignored. Back it up securely before funding. Fund **that address** using the [Preview faucet](https://midnight-tmnight-preview.nethermind.dev/); do not paste a seed into the faucet or chat. `preview:status` reports an initial wallet observation, which may precede full sync. `preview:deploy` registers NIGHT for DUST if necessary, waits for spendable DUST, then submits the PayDrip deployment. It prints and locally stores the actual contract address and transaction details only after the network returns them. This repository's wallet has already deployed the contract below; the script refuses a second deployment while its local manifest contains an address. Preview DNS was intermittent during deployment, so the script supports `PAYDRIP_RPC_IP` and `PAYDRIP_INDEXER_IP` overrides using current DNS answers when needed.

The administrator secret and encrypted private-state password are generated into Git-ignored `.secrets/` files. Back them up securely; losing them can prevent future payroll administration or contract maintenance. The deployment-domain and organization IDs are random public identifiers. The deployed contract address is distinct from the funding wallet address.

To stop the local proof server:

```bash
docker compose -f compose.preview.yml down
```

## Tests and limitations

`npm run paydrip:test` covers authorized mutation, wrong salary/secret/randomness, tier boundaries, context replay, revocation, and closure. The current tests execute generated Compact logic off chain. A real deployment transaction and indexed contract state have been verified on Preview; payroll operations have not been tested there. The landing page is a static concept, not a connected application. There is no confidential payment feature. Issuer honesty, delivery of payroll openings, wallet/transaction metadata, threshold probing, and post-close historical claim semantics remain explicit limitations. See the architecture's threat model and validation gates.

## Deployment evidence

**Network:** Preview. **PayDrip contract address:** `3094e6e6e6dc2a5f91b09859a5e5b1ec8df41a9aad1511570006141c98d6ec7c`. **Deployment transaction:** `002c3679d87f1de6b7c380547088f83f5b082d3ee1a59d0bcd45519d960ed32aa5`. **Block height:** `1069550`. The deployment SDK returned these values on 2026-09-29. Run `npm run preview:verify` to query both current and deployment state from the Preview indexer using the public `deployment.preview.json` manifest. This confirms the contract address is indexed; the transaction ID and block height remain values reported by the deployment SDK. The funding wallet is `mn_addr_preview1fpcx7ql99zdlhxt4swdahv3ja73806au5eqqgmay4cq7f72jxwrq8t5rst`; it is not the contract address. The local deployment manifest is Git-ignored at `.secrets/preview-deployment.json`.

## Further work

Build a PayDrip API, secure employee opening delivery, and a real privacy-first web app. Review the generated public payloads and claim linkage on Preview. Validate the current Rise In program requirements before submission.
