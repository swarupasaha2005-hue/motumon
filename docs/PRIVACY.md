# PayDrip: implemented privacy and threat model

Authoritative implementation: `contract/src/paydrip.compact`. This document describes source and off-chain tests, not a completed runtime transaction audit.

## Public / private

| Data | Visibility and rationale |
| --- | --- |
| organization, domain, currency | Sealed public issuer/context and USD unit; links a deployment's activity. |
| adminAuthenticator | Public secret-preimage hash for authorization; not the admin secret. |
| epochs | Public 32-byte IDs and status 1 Open / 2 Closed; lifecycle and timing visible. |
| records | Public randomized commitment → epoch; counts and issuance activity visible. |
| revoked | Public invalidated commitment handles. |
| claims | Public context → 0 employment / 1–3 income tier. |
| claimRecords | Public context → record commitment; claims for a record are linkable. |
| exact salary, employee secret, randomness, complete opening, admin secret | Private circuit inputs. Issuer knows the salary; loopback service and local proof server receive inputs when checking/proving. |
| wallet seed and private-state password | Local operator credentials, not payroll/public API data; ignored secret files. |

Private openings are not encrypted commitments. Browser inputs are transient memory and explicit private downloads; authenticated delivery is external. SDK LevelDB storage resides on the operator machine. A shared/untrusted operator or remote prover defeats the local trust assumption.

## Every disclose expression

Occurrences with identical expressions/sinks are grouped; this covers every `disclose()` in the current source. No exact salary, secret or randomness expression is disclosed.

| Expression | Circuit / public sink | Why required | Less revealing alternative / linkage |
| --- | --- | --- | --- |
| org, deploymentDomain, unit, adminHash | Constructor sealed ledger | Issuer/domain, unit and access-control configuration | Less metadata requires a different discovery/authentication design. All activity shares these fields. |
| epoch | openEpoch membership/insert, revokeRecord epoch lookup, closeEpoch lookup/insert | Explicit lifecycle and epoch binding | Hidden epoch membership would require different state/proofs. Public period activity is linked. |
| record.epoch | registerRecord epoch lookup/record insert; requireEmployeeRecord epoch membership | Registration only when open; authentic record period | Private-root membership would be a separate protocol design. Record-period relationship is public. |
| commitment | registerRecord membership/insert; revokeRecord membership/lookup/revoked set; requireEmployeeRecord membership/lookup/revocation check | Match an authorized issued record and reject revocation | A private membership root may reduce linkage in V2; not implemented. Current handles link issuance, revocation and claims. |
| context | Both claim circuits: uniqueness lookup, claims/claimRecords insert | One successful accepted claim per context | Off-chain reusable proofs would change the receipt model. Requests and claim timing become public. |
| recordCommitment(record, randomness) | Both claim circuits: claimRecords insert | Associate accepted receipt with authenticated record | Omitting the receipt handle would reduce explicit receipt linkage, but membership checks already disclose it. |
| tier | proveIncomeTier claims insert | State exactly which requirement passed | A generic boolean would omit requirement meaning. Fixed tiers limit resolution but reveal a salary band across queries. |

## Observer knowledge

An observer learns issuer/domain/currency, public epoch/record counts, lifecycle, commitments, revocations, accepted request contexts, tiers, handle links and transaction metadata. Public state does not provide the exact opening, salary, employee secret or randomness. This does not guarantee anonymity or absence of inference: tier combinations, external identity/context, timing and wallet metadata can correlate activity. Public transaction representations still need runtime inspection.

## Threat model and controls

| Threat | Implemented control / residual limitation |
| --- | --- |
| Unauthorized opening/registration/revocation/closure | Domain-separated admin secret authenticator; theft of the admin secret permits mutation. |
| Salary, organization, domain, epoch, pseudonym or nonce substitution | Typed persistentCommit binds all PayrollRecord fields and randomness; opening must match issued commitment. Employee secret must derive the record pseudonym. |
| Unissued record / forged compensation | Admin registration required; issuer can still issue false real-world compensation. No bank/payment attestation. |
| Wrong employee secret | Domain-and-epoch pseudonym recomputed in-circuit. Secure employee identity/opening delivery remains external. |
| Threshold boundary | Uint64 USD cents; >= comparisons; only tier IDs 1–3. No floating-point salary comparisons. |
| Revocation / closed epoch | Revocation prevents new claims; closed epochs forbid registration/revocation. Historical claims remain allowed after closure. Old accepted receipts are not erased. |
| Context replay / cross-kind replay | A nonzero context may be used successfully only once across both claim kinds. It is not bound to a named verifier or signed policy. |
| Fresh-context reuse / adaptive probing | New contexts allow further claims for the same record. Fixed $3k/$5k/$10k tiers and explicit UI consent limit granularity, not query count. No on-chain rate limit or global nullifier. |
| Cross-contract/network reuse | Record fields do not include network or contract address. Use fresh deployment domains and records; reusing issuer/domain configuration across deployments can permit unwanted reuse. |
| Cross-organization/epoch linkage | Domain+epoch scoped pseudonyms; use fresh secrets and randomness. Contract/wallet metadata and handle reuse still link activity. |
| Secret leakage through UI/API/logs | No private inputs in public-state selection/result panels; unknown errors sanitized; no browser storage/analytics for openings. SDK/prover and user device remain trusted. |
| Credential loss / departure | Local backups required; no admin rotation or post-close employment-status updates. Historical membership is not current employment. |

## Tests and outstanding evidence

Generated Compact tests cover authorization, commitment integrity, tiers, replay, revocation, lifecycle and public schema. Web tests cover safe serialization/error handling, wallet sessions, operator lifecycle, input conversion/import, and action/result handlers (mocked API).

Before claiming end-to-end privacy: execute a genuine claim; inspect decoded ledger, receipt, public indexer/transaction representation and requests/logs; check that no unexpected private fields occur. Absence of the literal demo salary alone is insufficient. Preserve only public IDs and sanitized evidence; never publish private payloads or openings.
