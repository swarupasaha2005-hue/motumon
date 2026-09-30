# PayDrip submission gates — Levels 3–6

Requirements below follow the user's supplied program checklist. Obtain the current official program URL and approval before treating it as independently verified eligibility. Labels: [PASS] source/local evidence; [BLOCKED] prerequisite or runtime evidence absent; [USER ACTION] external approval/data/account/recording; [NOT STARTED] no implementation/evidence.

## Level 2 prerequisite

- [PASS] Six real circuits, generated-artifact workflow, 1AM browser adapter, separate local operator, privacy UI and deterministic tests.
- [BLOCKED] Successful operator connection on the user's Mac and real Preview openEpoch → registerRecord → proveIncomeTier → verifier receipt evidence have not been supplied.
- [USER ACTION] Record actual public tx IDs/blocks/contexts and runtime privacy inspection; approve real 1AM connection/disconnect. Do not submit private inputs.

## Level 3

- [PASS] Private Payroll / Splits proposal prepared in [PROPOSAL.md](PROPOSAL.md); V1 is records/claims, not payment splits.
- [USER ACTION] Submit proposal and retain actual approval evidence.
- [PASS] Contract/frontend tests and unified `npm run validate`; record actual terminal results for this checkout.
- [PASS] CI workflow configured at `.github/workflows/ci.yaml`; it compiles/tests/checks/builds without wallet credentials or transactions.
- [USER ACTION] Push after approval, inspect real GitHub Actions result, capture a screenshot of 3+ passing tests. Configuration is not CI success.
- [PASS] Implemented disclosure/threat model in [PRIVACY.md](PRIVACY.md); architecture/trust boundaries in [WEB_TERMINAL.md](WEB_TERMINAL.md).
- [BLOCKED] Production-quality hosted transaction experience: current Vercel app is a static interface; circuits require loopback service, local artifacts/prover/operator.
- [USER ACTION] Verify current public https://pay-drip.vercel.app/ including Launch App, adapter assets and no deployment protection. No live verification in this checkout is asserted.
- [USER ACTION] Record/upload a real demo; see [DEMO.md](DEMO.md). No video URL exists.
- [PASS] Local meaningful-history candidates exceed 10; see [COMMIT_EVIDENCE.md](COMMIT_EVIDENCE.md). Published visibility/program acceptance still require verification.
- [BLOCKED] Level 3 completion until prerequisite/runtime/product and submission gates above are resolved.

## Level 4

- [BLOCKED] Level 3 prerequisite.
- [PASS] Offline Preview/Preprod configuration and cross-network manifest guard in `scripts/lib/network-config.mjs`; existing Preview remains selected.
- [USER ACTION] Verify Preprod runtime compatibility/endpoints and fund a dedicated Preprod wallet; no address has been generated/reported.
- [NOT STARTED] Separate safe Preprod wallet/deployment tooling, `deployment.preprod.json`, Preprod UI/wallet/provider selection, actual deployment and independent lookup. Never reuse Preview address/credentials/manifests.
- [NOT STARTED] Preprod openEpoch/registerRecord/proveIncomeTier and public claim/privacy evidence.
- [PASS] Preparation runbook in [PREPROD.md](PREPROD.md). No Preprod execution commands are invented.
- [USER ACTION] Create real product X profile; prepared copy in [PRODUCT_X.md](PRODUCT_X.md). Supply actual URL.
- [PASS] Existing substantive-history candidates exceed 15; CI configuration prepared; runtime CI/CD success unverified.

## Level 5

- [BLOCKED] Working same Preprod MVP and completed Level 4.
- [PASS] [Feedback/onboarding/evidence process](feedback/README.md), empty public cohort/issue tracking files prepared.
- [USER ACTION] Recruit 50 real qualifying Preprod users, obtain consent and associate accepted public activity/feedback. Current collected users: none recorded.
- [NOT STARTED] Feedback-based fixes and updated usage/FAQ; implement from real supplied feedback, not invented interviews.
- [PASS] Existing substantive-history candidates exceed 20; acceptance still belongs to program review.

## Level 6

- [BLOCKED] Completed Level 5 and same refined Preprod MVP.
- [USER ACTION] Extend the genuine cohort to 70 qualifying users, retaining first-cycle data. Unique wallets are not proof of unique humans.
- [PASS] Second-cycle comparison/issue process prepared in feedback docs.
- [NOT STARTED] Real second-cycle findings, justified refinements, final video and published evidence.
- [PASS] At least 30 substantive-history candidates identified locally; do not count empty/template/cosmetic padding as engineering evidence.

## Evidence handoff

Provide official program/approval URL, actual CI run URL, live site check, real public circuit IDs/blocks/context, separate Preprod deployment evidence when obtained, X URL, consented public cohort evidence and video URL. Never provide seeds, admin/employee secrets, randomness, passwords or record opening files.
