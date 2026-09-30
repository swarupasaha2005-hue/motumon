# Real user onboarding and feedback — Levels 5/6

**PLANNED:** no users or feedback have been recorded. Preprod MVP and prior levels must be completed before qualifying recruitment. Validate the supplied 50/70-user requirements against the actual program.

## Onboarding once Preprod MVP works

1. Open the verified public app; read signer/local-service limitations before starting.
2. Connect the supported wallet and confirm Preprod/address/contract.
3. Use the genuine supported demo record flow. Deliver openings privately; do not request seeds or private payroll credentials through feedback forms.
4. Review disclosure, submit an actual supported action, and retain the public receipt identifier.
5. Give feedback and consent to submission use of public wallet/activity evidence. A local-operator transaction does not prove a connected 1AM participant signed it. If activity only identifies the shared operator, it cannot establish distinct participant activity.

## Evidence

`cohort.csv` is empty except for headers. Populate only with real consented evidence. Record actual Preprod address, public tx/claim, date and verification source; keep cohort 1 (1–50) and cohort 2 (51–70). Do not generate addresses or treat distinct wallets as independently proven humans. Confirm program eligibility rules before counting. Address format and on-chain activity must be verified through the supported SDK/indexer; this template does not validate either.

No names, contact details, salaries, secrets, openings or raw requests belong in this repository. Publish wallet lists only with consent. Deduplicate supplied public addresses within the same network; retain verification failures rather than inflate totals.

## Feedback questions

- What were you trying to do?
- Was wallet connection clear? Did you understand which wallet executed the transaction?
- What did you understand would be shared and remain private?
- Was proof generation and verification understandable?
- Where did you get stuck? Supply sanitized messages only.
- What scoped improvement would help?

## Issues and iterations

`issues.csv` is empty except for headers. Summarize feedback without private values. P0: blocking correctness/privacy/security; P1: major UX/security issue; P2: scoped improvement; P3: future. Link real feedback evidence to decision, code/test evidence and status. No synthetic feedback should justify a product change.

Cycle 1: analyze genuine users 1–50, fix supported issues and update usage/FAQ/limitations. Cycle 2: retain first-cycle evidence, analyze users 51–70, compare recurring/new/resolved issues and privacy/signer misunderstandings. Summaries remain pending until data exists. Keep the same Preprod MVP unless a justified versioned upgrade is required.

## Read-only evidence collector

Run `npm run users:verify` on a network-enabled Mac for the existing Preview manifest. `npm run users:verify -- preprod` requires a genuine separate `deployment.preprod.json`; no Preview address is reused. The command writes `USER_EVIDENCE.md` and `user-evidence.csv`, makes only GraphQL queries, and never loads operator credentials. Exit code 1 means collection/verification failed, not that the chain has no activity. The scan is limited to 10,000 action-containing blocks and labels an incomplete scan. It queries the latest action at successively earlier block offsets, fetches all contract transactions in each block, and corroborates each transaction via a second block-hash lookup. No raw transactions/private state are requested.

Indexed hashes and action types are activity evidence only. Circuit names, contexts, commitments and participant wallet addresses are not inferred. The current operator/session architecture gives zero independently attributable users in this report, regardless of transaction count. Deployment is not a user interaction. No Preview activity qualifies as Preprod evidence.

`responses.csv` is header-only until real consented feedback is available. Add a stable response ID, accurate network and transaction hash/SDK identifier, publication consent `true`, sanitized faithful summary, actual reviewed sentiment (`Positive`, `Negative`, `Mixed`, `Neutral`), category and date. Never paste raw payroll inputs or credentials. Only consented responses referencing independently indexed transactions are joined; duplicate response IDs are excluded. Unclassified feedback is excluded from sentiment percentages and reported separately. Cohort entries and feedback do not prove wallet control or unique humans. A cryptographically verified participant attestation and program-approved eligibility criteria are still required before counting users.
