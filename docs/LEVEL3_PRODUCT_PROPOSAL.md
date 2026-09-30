# PayDrip — Private Payroll / Splits

**Provided idea:** Private Payroll / Splits

**Product:** PayDrip

**Approval status:** Pending — no submission or approval evidence supplied.

## Problem

Public payroll ledgers expose compensation and relationships. Conventional verification often requires disclosing a complete payslip to answer a narrow income or employment question. Employees need reusable eligibility evidence with less disclosure.

## Solution

An organization authorizes a randomized commitment to a private payroll record. The employee holds the record opening and matching private identity, and uses Midnight Compact to prove historical membership or an allowed income threshold. A verifier checks the accepted public receipt without receiving the salary or payroll file.

## Target Users

- Organizations/employers authorizing payroll records.
- Employees selectively demonstrating historical membership or income eligibility.
- Verifiers such as landlords, lenders, platforms and eligibility services needing a bounded claim rather than a payslip.

These are intended users, not evidence of recruited customers or production adoption.

## Core Flow

1. Administrator opens a payroll epoch using private administrator authorization.
2. Employee derives a period/domain-scoped pseudonym and shares only it with the issuer.
3. Issuer prepares a private USD monthly record and registers its commitment; the opening is delivered securely outside the protocol.
4. Employee supplies the matching secret/opening, selects a supported claim and accepts its disclosures.
5. Compact authenticates the unrevoked registered record and, for income, checks the private salary against the selected threshold.
6. Verifier reads the public context/tier/commitment receipt and period relationship.

**Synthetic example:** a private $5,000 record can satisfy monthly income ≥ $3,000. The accepted receipt records Tier 1, not the exact salary. This example describes the relation, not a claimed successful network demonstration.

## Why Midnight

A conventional public contract would expose the compensation needed for its comparison. Compact verifies that comparison over private inputs while updating only selectively disclosed state. The proof also binds the opening to the issuer-authorized commitment and checks employee authorization and revocation. Midnight is used for private computation, not simply as a payroll database.

## Privacy

**Private inputs:** exact salary, employee secret, administrator secret, commitment randomness and complete opening. The issuer knows the issued salary; the employee's loopback service/local proof server sees private proving inputs. No employee name/email is in the record schema.

**Public:** issuer/domain/currency/admin authenticator, epoch lifecycle, commitment handles, revocations, claim context/kind/tier, linked record handle and transaction metadata. Handles link claims. Repeated threshold requests can narrow the salary band. A commitment is not encryption; issuer honesty and secure opening delivery remain necessary.

See [the disclosure map and threat model](PRIVACY.md).

## MVP Scope

Implemented: `openEpoch`, `registerRecord`, `revokeRecord`, `proveEmployment`, `proveIncomeTier`, `closeEpoch`; local terminal for organization/employee/verifier workflows; 1AM Preview browser session; separate local Preview operator, Midnight.js and proof server; private-file import/export; fixed $3,000/$5,000/$10,000 monthly USD tiers.

Existing deployment: Midnight Preview, `3094e6e6e6dc2a5f91b09859a5e5b1ec8df41a9aad1511570006141c98d6ec7c`. Deployment indexing was previously verified on the user's Mac. Payroll claim confirmation and runtime public-payload inspection remain unverified. The DUST readiness investigation is not completed runtime evidence. Off-chain tests do not close that gap.

The configured [live demo](https://pay-drip.vercel.app/) is an interface preview; real circuits use the local operator path. 1AM is not the circuit signer. V1 does not implement payment splits, salary transfers, payment verification, tax or confidential banking.

## Future Scope

Evaluate a genuinely supported browser transaction provider; review secure private-record delivery; consider stronger unlinkability and verifier-policy binding. These are future work, not implemented submission claims. No protocol rewrite is proposed for this Level 3 pass.

## Submission

[Repository](https://github.com/swarupasaha2005-hue/motumon) · [Form copy](submission/LEVEL3_PROPOSAL_SUBMISSION.md) · [Submission gates](submission/LEVEL3_CHECKLIST.md). Approval must come from the actual program and be recorded with its genuine reference/date.
