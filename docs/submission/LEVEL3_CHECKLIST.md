# Level 3 Submission Checklist

This checklist concerns Level 3 only. Controlled 70-participant activity is not required or counted as human traction. Checked items describe repository evidence, not external approval.

## Product

- [x] Selected supplied idea: Private Payroll / Splits.
- [x] Six actual Compact circuits and selective disclosure relation inspected.
- [x] Organization, employee and verifier workflows wired in the local terminal.
- [x] Existing Preview deployment manifest retained; previously indexed on the user's Mac.
- [x] Private inputs/local files distinguished from public ledger and SDK private-state plumbing.
- [ ] Real local Preview payroll proof and matching verifier receipt confirmed.
- [ ] Runtime transaction/indexer disclosure inspected for private-data leakage.
- [ ] Real 1AM approval/session demonstrated in the recording environment.

## Testing

- [x] At least three meaningful protocol tests: 8 passed locally.
- [x] Application tests: 61 passed locally.
- [x] Six circuits compile; check/typecheck/build pass locally.
- [x] Screenshot command: `npm run paydrip:test -- --reporter=verbose` (compile first).
- [x] Actual passing PayDrip test screenshot supplied and saved at `docs/images/paydrip-protocol-tests.png`; public publication remains pending.

## CI/CD

- [x] `.github/workflows/ci.yaml`: every push, pull request and manual dispatch.
- [x] Compile/test/check/typecheck/build, without wallet secrets or Preview calls.
- [x] README badge uses configured remote and actual workflow filename.
- [ ] Current changes published after owner authorization.
- [ ] GitHub-hosted run for the submitted revision confirmed passing; run URL recorded.

## Submission

- [x] Public repository URL exists; git remote matches it.
- [ ] Complete current source/history/README availability confirmed on public GitHub. Web lookup showed a minimal view inconsistent with local history; freshness unknown.
- [x] README and Privacy Model prepared.
- [x] Proposal and approval-form copy prepared.
- [ ] Product proposal submitted; real reference recorded.
- [ ] Product proposal approved; genuine evidence recorded.
- [x] Configured live interface URL documented.
- [ ] Current live landing/app/assets, protection status and wallet flow independently verified.
- [x] Approximately one-minute recording script prepared, conditional on real functionality.
- [x] Supplied screen recording saved at `docs/videos/paydrip-demo.mov` using Git LFS and linked.
- [ ] Recording verified to demonstrate full functionality; public publication/access confirmed.
- [x] At least ten meaningful local commits verified: 18 conservatively selected.
- [ ] Submission links and commit publication checked against the final remote revision.

## Requirement Audit

Statuses: PASS = direct repository evidence; PARTIAL = implementation/preparation without full external/runtime evidence; BLOCKED = known unresolved execution gate; MISSING = no completed artifact.

| Requirement | Status | Evidence | Missing Work |
|---|---|---|---|
| Fully functional dApp | BLOCKED | All six wired; tests pass; real payroll claim not verified; Mac DUST stall unresolved | Confirm genuine Preview proof/receipt and inspect public transaction data |
| Meaningful Midnight privacy | PASS | Compact private opening/authorization/threshold relation and disclosure map | Runtime privacy inspection still required for stronger claims |
| 3+ tests | PASS | 8 protocol + 61 application tests; supplied 8-test screenshot | Publish screenshot with submission |
| CI compile/test every push | PARTIAL | Local workflow configured; deterministic validation passes | Publish and confirm hosted run |
| Approved supplied idea | PARTIAL | Private Payroll / Splits proposal prepared | Submit and receive real approval |
| 10 meaningful commits | PASS | 18 selected local substantive commits | Confirm remote publication |
| Public repository + complete README | PARTIAL | Public URL/remote; local README complete | Verify current project published |
| Live demo | PARTIAL | Configured Vercel interface URL; static safety preserved | Verify current public build; disclose local circuit mode |
| Test screenshot | PASS | `docs/images/paydrip-protocol-tests.png` shows 8 passing tests | Publish with submission |
| CI badge/workflow + passing run | PARTIAL | Actual badge/workflow path | Confirm run for submission revision |
| One-minute full-functionality video | PARTIAL | Supplied MOV linked; full-functionality/duration unverified | Review against real runtime evidence and publish |
| README Privacy Model | PASS | Public/private, observer/verifier knowledge and limitations | Keep runtime evidence qualification |
| Proposal submitted | MISSING | Paste-ready text only | Actual submission reference |
