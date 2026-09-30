# PayDrip — Level 3 Submission Pack

**Status: NOT READY — real Preview payroll proof/verifier evidence remains unverified, alongside external submission requirements.** Prepared assets are not proposal approval, video or hosted CI evidence.

## Project

| Field | Evidence / value |
|---|---|
| Project | PayDrip |
| Provided track | Private Payroll / Splits |
| One-line pitch | Payroll belongs on-chain. Salaries don't. |
| Repository | https://github.com/swarupasaha2005-hue/motumon — public URL exists; current complete project publication not confirmed |
| Live demo | https://pay-drip.vercel.app/ — configured interface demo, current public-build verification pending |
| Network | Midnight Preview |
| Contract | `3094e6e6e6dc2a5f91b09859a5e5b1ec8df41a9aad1511570006141c98d6ec7c` |
| Deployment | `deployment.preview.json`: SDK ID `002c3679d87f1de6b7c380547088f83f5b082d3ee1a59d0bcd45519d960ed32aa5`, SDK-reported block `1069550`; indexed deployment previously checked on user's Mac |
| Tests | Local: 8 protocol + 61 application tests; six circuits compile; check/typecheck/build pass |
| Screenshot command | `npm run paydrip:test -- --reporter=verbose` after compilation |
| CI/CD | PayDrip CI, `.github/workflows/ci.yaml`; every push/PR/manual dispatch; `npm run validate`; no wallet secrets/network transactions |
| CI run URL | Not supplied / passing hosted run for this revision unverified |
| Privacy | Private opening/secret comparison; public tier/context/linked handle; issuer and local prover trust, linkage and probing limits |
| Product proposal | `docs/LEVEL3_PRODUCT_PROPOSAL.md`; prepared, submission not evidenced, approval pending |
| Meaningful commits | 18 selected local commits; uncommitted work excluded; remote publication pending confirmation |
| Demo video | [Supplied screen recording](../videos/paydrip-demo.mov), Git LFS; publication and full-functionality evidence review pending |
| Test screenshot | [Supplied PayDrip output: 8 passing tests](../images/paydrip-protocol-tests.png); saved locally, public publication pending |
| Proposal submission / approval | No reference, date or approval evidence supplied |

## Actual Execution Architecture

1AM supplies a Preview browser session/address; it does **not** sign PayDrip circuits. The loopback service uses the separate local Preview operator, Midnight.js, local artifacts and proof server to call the deployed contract. Hosted Vercel controls intentionally do not submit circuits or accept private proving inputs. All exported circuits are wired, but a confirmed payroll claim remains unverified; deployment and off-chain tests do not prove that flow.

## Privacy Summary

The circuit authenticates the employee secret, private record opening and issuer-authorized unrevoked commitment/epoch, then checks the selected income comparison. Public state exposes issuer/context, lifecycle, handles, claim kind/tier and links. Exact salary, secrets and randomness are not ledger fields. Runtime transaction disclosure still requires inspection. This is not confidential salary payment or perfect anonymity.

## Prepared Assets

- [README](../../README.md)
- [Product proposal](../LEVEL3_PRODUCT_PROPOSAL.md)
- [Approval-form copy](LEVEL3_PROPOSAL_SUBMISSION.md)
- [60-second demo script](LEVEL3_DEMO_SCRIPT.md)
- [Commit audit](LEVEL3_COMMIT_AUDIT.md)
- [Privacy/disclosure map](../PRIVACY.md)
- [Checklist and requirement audit](LEVEL3_CHECKLIST.md)

## Final Checklist

- [x] Provided idea selected and honest MVP scope documented.
- [x] Privacy Model, ZK relation, architecture and setup documented.
- [x] 3+ actual passing tests; local compile/check/typecheck/build validation.
- [x] Every-push compile/test workflow and correctly targeted badge prepared.
- [x] 10+ meaningful local commits audited (18).
- [x] Existing Preview deployment evidence and verification command documented.
- [ ] Real payroll claim, result renderer and matching verifier flow confirmed on Preview.
- [ ] Public ledger/transaction privacy inspected using actual successful claim.
- [ ] Current complete repository/history and live build confirmed publicly accessible.
- [ ] Submitted revision has a genuinely passing GitHub Actions run.
- [ ] Proposal submitted and approved; real references recorded.
- [x] Supplied passing PayDrip test screenshot saved and linked; publish with submission.
- [x] Supplied screen recording saved with Git LFS and linked.
- [ ] Full-functionality video evidence reviewed and publicly accessible.

No synthetic feedback/users or 70-participant completion is required for this Level 3 submission.

## Final Requirement Matrix

READY describes the cited repository evidence only. NEEDS EXTERNAL ACTION is a missing approval/publication/artifact/check. BLOCKED identifies the unresolved functional gate.

| Level 3 Requirement | Status | Evidence | Remaining Action |
|---|---|---|---|
| Functional dApp | BLOCKED | Six circuits wired; successful Preview payroll claim/verifier flow unverified | Resolve/observe operator DUST readiness and confirm actual proof/receipt |
| Meaningful Midnight privacy | READY | Source-defined private commitment/ownership/threshold relation and disclose map | Runtime payload inspection before claiming end-to-end privacy |
| 3+ tests | READY | 8 contract + 61 application tests pass locally; screenshot supplied | Publish screenshot |
| CI/CD workflow | READY | Every-push compile/test/check/typecheck/build workflow | Publish after authorization |
| CI run passing | NEEDS EXTERNAL ACTION | Local validation passes; hosted run not verified | Record passing run URL for submitted revision |
| Provided idea selected | READY | Private Payroll / Splits | None |
| Proposal prepared | READY | LEVEL3_PRODUCT_PROPOSAL.md and form copy | None |
| Proposal submitted | NEEDS EXTERNAL ACTION | No submission reference supplied | Submit actual form |
| Proposal approved | NEEDS EXTERNAL ACTION | Approval pending | Obtain genuine approval |
| 10 meaningful commits | READY | 18 substantive local commits audited | Confirm remote publication |
| Public GitHub repo | NEEDS EXTERNAL ACTION | Public configured URL; current complete project publication unverified | Confirm source/history/README at submitted revision |
| Complete README | READY | Product, privacy, ZK, architecture, setup, tests and honest gates | Publish |
| Live demo | NEEDS EXTERNAL ACTION | Configured interface URL; network verification unavailable | Verify current assets/access; disclose local circuit mode |
| Test screenshot | READY | Supplied screenshot shows 8 passing PayDrip protocol tests | Publish with submission |
| CI badge | READY | Actual remote/workflow badge link | Confirm hosted status |
| 1-minute demo video | NEEDS EXTERNAL ACTION | Supplied MOV recording linked; functionality/duration unverified | Review content against real runtime evidence and publish |
| Privacy Model section | READY | README private/public/verifier/observer/limitations | Retain honest scope |
| Deployment evidence | READY | Public manifest plus previously reported Mac indexing | Recheck current deployment on accessible host if needed; no redeploy |

## Latest Local Validation / Hygiene

`npm run validate` passed: six compiled circuits, 8 contract tests, 61 application tests, syntax/check/typecheck/build. `npm run paydrip:test -- --reporter=verbose` separately passed all 8 named protocol tests. CI script/library syntax loop, HEAD whitespace and `git diff --check` passed. Eight Level 3 README/proposal/submission documents have no broken local Markdown destinations.

No sensitive credential filenames are tracked currently; `.secrets/`, environment files and SDK database output are ignored. Pattern review found no literal credential/private-key markers in current tracked files or new Level 3 documents. Historical template `bboard-ui/.env.preview` and `.env.preprod` contain public network/log-level settings only, not wallet credentials. This is a scoped source hygiene review, not a complete forensic security audit. No private file contents were printed and no commit/push/deployment occurred.
