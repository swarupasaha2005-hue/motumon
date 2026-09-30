# Level 3 — Proposal Submission Copy

Prepared copy only. **Not submitted; approval pending.** No official form or approval URL is assumed.

**Project name:** PayDrip

**Selected provided idea:** Private Payroll / Splits

**One-line pitch:** Payroll belongs on-chain. Salaries don't.

**Problem:** Eligibility checks often require a full payslip, while public payroll ledgers expose compensation and relationships. Verifiers frequently need only a narrow, authorized income answer.

**Solution:** Employers authorize commitments to private payroll records. Employees use a matching private opening and secret to prove historical payroll membership or one of three supported monthly income thresholds. Verifiers read an accepted public claim receipt rather than the private payroll file.

**Midnight privacy usage:** Compact checks issuer authorization, record commitment membership, employee-secret ownership, epoch binding, revocation, fresh context and a private salary comparison. It discloses the selected tier, context and linked commitment, not the salary, employee secret or randomness in ledger state. Issuer/local prover trust, public metadata/linkage and threshold probing remain explicit limitations.

**Selective disclosure example:** Synthetic $5,000 monthly salary → prove ≥ $3,000 → public Tier 1 eligibility receipt. This describes the implemented relation; successful network proof evidence still needs verification.

**MVP:** Six Compact circuits and local organization/employee/verifier terminal. 1AM provides a Preview browser session; a separately labelled local operator executes circuits. No confidential salary payments or splits execution is claimed.

**Demo:** https://pay-drip.vercel.app/ — configured public interface demo; hosted circuit controls are intentionally disabled. Full-functionality recording requires the real local Preview path to confirm first. Video URL not yet supplied.

**Repository:** https://github.com/swarupasaha2005-hue/motumon — configured remote; confirm publication of current implementation before submitting.

**Network:** Midnight Preview

**Contract:** `3094e6e6e6dc2a5f91b09859a5e5b1ec8df41a9aad1511570006141c98d6ec7c`

**Detailed proposal:** [LEVEL3_PRODUCT_PROPOSAL.md](../LEVEL3_PRODUCT_PROPOSAL.md)

After submission, record the real form/reference/date and approval outcome in [LEVEL3_SUBMISSION.md](LEVEL3_SUBMISSION.md). Do not mark approval complete before receiving it.
