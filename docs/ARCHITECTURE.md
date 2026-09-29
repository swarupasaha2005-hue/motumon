# PayDrip — V1 protocol architecture

**Status:** design plus first implementation, 29 September 2026. Six circuits compile and pass focused off-chain tests. The constructor was deployed to Preview at `3094e6e6e6dc2a5f91b09859a5e5b1ec8df41a9aad1511570006141c98d6ec7c` in transaction `002c3679d87f1de6b7c380547088f83f5b082d3ee1a59d0bcd45519d960ed32aa5`, block `1069550`. A separate indexer query returned contract state. Payroll circuit calls, transaction disclosure, and a web frontend still need Preview validation.

**Product statement:** Payroll belongs on-chain. Salaries don't. V1 proves an employer-issued payroll record and an income threshold. It does **not** transfer compensation or prove that a salary was paid.

## 1. Final MVP scope

One organization deploys one PayDrip contract. Its administrator opens epochs, registers private compensation commitments, may revoke a record before close, and closes epochs. An employee who possesses an independently generated employee secret plus the record opening can submit an employment claim or a salary-tier claim. A verifier checks the finalized contract call and its public claim context. The employer is the issuer: PayDrip proves consistency with an employer-authorized record, not the truth of the employer's off-chain payroll books.

V1 supports one fixed compensation denomination per deployment, one salary measure (base monthly amount in minor units), a short published list of eligibility tiers, and historical epoch membership. Bonuses, exchange rates, payments, amendments, and current-employment assertions are excluded. A corrected salary requires revocation and a new record before epoch closure.

## 2–4. Participant flows

1. **Organization:** deploy with a domain-specific admin commitment and public organization identifier; open an epoch; receive a fresh employee pseudonym for that epoch through an authenticated private channel; agree on monthly base amount and currency policy; construct and register a randomized record commitment; privately deliver its opening to the employee; revoke erroneous records if necessary; close the epoch. The administrator must keep its secret in local encrypted storage, not an API or repository.
2. **Employee:** generate a fresh high-entropy secret for each organization/epoch, supply only its derived pseudonym to the organization, receive and validate the commitment opening, inspect a human-readable claim request, consent to local proving, and submit either an epoch-membership or income-tier claim. Secret material stays in local private state and the local proof server.
3. **Verifier:** state the organization, epoch, claim type, accepted salary tier, and request context; receive the finalized claim transaction identifier; read the contract and ledger state; verify the correct circuit call, request context, epoch status, and result. The verifier learns the public context, that a qualifying record exists, and possibly the public record handle (see privacy limits). It does not receive the exact salary or employee secret.

## 5–6. Public and private data; proposed ledger

| Field | Location | Reason and privacy cost |
| --- | --- | --- |
| Contract address and organization identifier | Public, one deployment per organization | Issuer discovery and domain binding. All epochs within an organization are linked. |
| Admin authenticator hash | Public, sealed at deployment | Circuit access control. Repeated admin calls can be linked to this contract. |
| Epoch identifier, status, record count | Public ledger | Prevent cross-epoch substitution and enforce lifecycle. Count and timing reveal workforce activity. Count can be omitted if collection semantics allow. |
| Fixed currency/unit and allowed tier table or version | Public, sealed configuration | Prevent unit confusion and arbitrary threshold probing. |
| Record commitment | Public set keyed by epoch | Binds the private record. Registration timing and total count leak; the handle may link later claims. |
| Revoked commitment handles | Public set, or status per record | Prevent proof of a revoked record; revocation reveals which handle was affected. |
| Claim type, epoch, tier ID, request/context ID, success transaction | Public call data or ledger receipt | Lets a verifier identify the asserted statement and prevent cross-context reuse. Repeated claims can reveal activity. Exact call data visibility must be checked in an implementation spike. |
| Employee identity, secret, derived pseudonym opening, salary, compensation note, commitment randomness | Private record/local state | Never included as public circuit parameters, URLs, analytics, logs, or error strings. The derived pseudonym is shared privately with the employer for issuance. |

**Ledger proposal:** sealed `orgId`, `adminAuthenticator`, `currencyUnit`, `tierPolicyVersion`; an epoch status map (`UNCREATED → OPEN → CLOSED`); epoch-keyed sets of active record commitments and revoked commitments; optionally a set of consumed request IDs if the verifier needs at-most-once receipts. Exact Compact collection types, keying, update costs, and leakage require compiler and test validation. Registration is append-only; a revoked commitment remains historically visible. Closed epochs are immutable.

## 7. Witness proposal

The first implementation passes the admin secret, employee secret, and full record opening as private circuit inputs; it declares no separate witness functions. The record includes salary, epoch, organization, domain, USD unit, pseudonym, and fresh 32-byte commitment randomness. **Every private value is untrusted:** Compact recomputes the admin authenticator, employee pseudonym, and record commitment and asserts them against public ledger state. The proof server is local because it sees proving inputs.

## 8. Six proposed circuit boundaries

These are specifications, not claimed Compact syntax. Every state update must be asserted in-circuit.

| Circuit | Authorization / private witness | Public input and state / transition | Disclosure and failures |
| --- | --- | --- | --- |
| `openEpoch` | Admin secret preimage matches sealed authenticator | Epoch ID; require absent; create `OPEN` | Reveals epoch timing; reject wrong secret or duplicate ID. |
| `registerRecord` | Admin secret; private record opening; private employee pseudonym value supplied by employee | Epoch ID and resulting randomized commitment; require `OPEN`, correct org/unit/policy, unused handle; insert | Reveals handle and registration timing; reject wrong admin, duplicate, malformed field or closed epoch. Employer can issue false payroll records: issuer trust remains. |
| `revokeRecord` | Admin secret | Epoch and handle; require `OPEN` and present; mark revoked | Reveals affected handle; reject absent/already revoked/closed. Employee must see revocation before claiming. |
| `proveEmployment` | Employee secret and complete record opening; circuit derives pseudonym and commitment | Epoch, request/context ID; require issued, unrevoked commitment and correct org/epoch; emit successful historical-membership claim | Reveals claim, context, and perhaps handle; reject wrong employee secret, org, epoch, salt, missing/revoked record. Does not assert current employment. |
| `proveIncomeTier` | Same employee secret/opening, private salary | Epoch, allowed tier ID, request/context ID; require issued/unrevoked record and salary >= policy tier in same unit | Reveals tier pass and context, never exact salary; reject low salary, arbitrary tier, bad opening, wrong identity, revocation. |
| `closeEpoch` | Admin secret | Epoch ID; require `OPEN`; mark `CLOSED` | Reveals closure; reject wrong admin, absent/already closed. Historical claims remain valid after close; mutations do not. |

**Validated compiler behavior:** the public commitment-map lookup requires `disclose(commitment)`; V1 claim receipts store that handle. Claims for the same record are linkable. A Merkle-root membership design may improve this later, but root updates, witness paths, and historical-root semantics need a separate validated design.

## 9–10. Commitment and identity construction

Use Compact's documented `persistentCommit<T>(value, rand: Bytes<32>)`, not a custom hash, over a typed record with an explicit PayDrip V1 domain, network/contract binding, organization ID, epoch ID, fixed unit, salary amount, tier-policy version, and employee pseudonym. Generate a fresh cryptographically random 32-byte `rand` per record; never reuse it. Test exact serialization, supported struct/tuple types, and whether contract-address binding is available at registration. If the address is unavailable inside Compact, bind an immutable deployment-specific domain chosen at deploy and test that cross-contract openings fail. The commitment is not encryption; the opening must be backed up securely.

Derive a fresh pseudonym with documented `persistentHash` domain separation from the employee's per-organization/per-epoch secret and the public domain. The employee gives the pseudonym, not the secret, to the employer. The employer knows compensation and commitment randomness, and can share the full non-secret opening with the employee; it cannot satisfy the proof's employee-secret preimage check. This blocks an unrelated holder of a record opening from claiming it. It does **not** prevent an employer from creating fake records, nor protect an employee who leaks their secret. Employer delivery and agreement on the record opening need an authenticated private channel and an employee-side equality check against the public commitment. Whether an employer can cause a malicious pseudonym substitution must be addressed by showing the derived pseudonym to the employee before registration.

Use fixed-width unsigned integer salary units and bound-check their range before comparison. Do not represent dollars with floating point. An organization cannot overwrite a commitment: revoke and reissue is visible. A real-world salary may change without PayDrip knowing; V1 proofs are about the committed epoch record.

## 11. Replay and nullifiers

Employment and threshold proofs are reusable claims. Repeating the same successful historical statement is not a double spend, so V1 has no employee or record nullifier. Every verifier request contains a fresh unpredictable context ID and identifies the contract, epoch, claim kind, tier, and verifier; the claimant reviews it before proving. A verifier must reject a transaction for a different context or an old context. If a service needs exactly one accepted receipt per request, a public consumed-request set may be added, but this creates a visible request identifier and should not become a global employee identifier. Chain-finalized claims remain on chain and can be replayed as screenshots; a verifier must query the chain and check its own context.

## 12. `disclose()` map

No `disclose()` call is approved merely because the compiler requests one. Expected disclosures are: admin authenticator at deployment (needed for access control; contract-scoped link), epoch ID/status (lifecycle; links an employer's epochs), randomized record commitment (membership anchor; may link proofs), revocation handle (state invalidation; reveals affected record), and claim context/tier/result (verifier interpretation; exposes proof activity). The first implementation must record each actual `disclose()` expression, its derived input, the ledger/call sink, a less revealing alternative, and linkage in a code-adjacent audit table. Exact salary, employee secret, private pseudonym opening, and commitment randomness are forbidden disclosures. `persistentCommit` outputs may be assignable publicly without `disclose()` under the current compiler; inspect the actual generated flow.

## 13–14. Threat model and threshold probing

| Threat | V1 control / residual risk |
| --- | --- |
| Forged salary or substituted org/epoch/identity | Recompute typed commitment and compare to an admin-registered handle; assert employee-secret-derived pseudonym. Dishonest issuer can still register a false salary. |
| Unauthorized mutation or post-close change | Admin secret preimage in every mutator; explicit epoch state machine; sealed deployment configuration. Admin compromise remains serious. |
| Another employee uses a record | Per-epoch employee secret preimage; private channel for opening. Secret theft remains possible. |
| Commitment guessing | Fresh 32-byte randomness and documented persistent commitment. Poor randomness or leaked opening defeats hiding. |
| Cross-epoch/org linkage | Fresh employee secret and randomness per context; no names/emails on chain. Public contract, timing, handle reuse, wallet and network metadata still correlate. |
| Replay | Context-bound claims, verifier queries finality; no global nullifier. |
| Stale proof / departure | Claim text says **included in epoch**, never “currently employed.” Revocation before close invalidates new claims; finalized historical claims cannot be erased. Departure after closure requires a new epoch or V2 status mechanism. |
| Threshold probing | Only published tiers such as 3,000 / 5,000 / 10,000 in one fixed currency/unit; employee manually approves each request; verifier context binds each claim. These limit resolution and surprise queries but repeated tier answers still reveal a band. |
| Verifier metadata and logs | Avoid public identity, URL query secrets, analytics payloads, remote proof servers, and verbose witness logs. A verifier can still identify an employee off chain and observe proof timing. |
| Employer knowledge | Employer necessarily knows compensation to issue its record. PayDrip hides it from public observers and unrelated verifiers, not from the issuer. |

The interface must display the exact tier and verifier before proving and say “This proves you meet the selected income tier for this payroll period.” No automatic background claims. Limit one claim per explicit user consent. An optional verifier request registry or rate limit cannot guarantee salary secrecy against colluding verifiers, screenshots, or employee-volunteered claims; document this plainly.

## 15–16. Frontend and repository map

**Organization:** Dashboard (epoch/status counts), Payroll (open/close and register), Contributors (private local labels, never sent to public state), Proof Requests (requests issued/received), History/Epochs (public lifecycle and revocations). **Employee:** My Payroll (locally decrypted records), period, issuer and status, “Prove employment,” “Prove income eligibility,” consent preview, proof receipt. **Verifier:** request builder and status page with issuer, epoch, tier, context, finalized verification result, and “Not disclosed: exact salary, bonus, employee secret.” Responsive layout with clear privacy annotations and no fake private data in a public API.

Repository root is `PayDrip/`. It currently contains the PayDrip Compact source and tests in `contract/`, Preview wallet and deployment scripts in `scripts/`, and this architecture document. A PayDrip API, employee client, and web app remain future work.

## 17–18. Implementation phases and test matrix

1. **Toolchain spike:** install the compatibility-matrix compiler; compile a minimal typed `persistentCommit` record and authenticated set membership; inspect generated bindings, verifier keys, ZKIR, public call data, and `disclose()` behavior. Resolve contract-domain availability and claim-handle linkage before freezing schema.
2. **Protocol:** six PayDrip circuits and focused off-chain tests are implemented. Maintain a field-by-field disclosure audit and extend negative tests for forged records and identity substitution.
3. **Client:** encrypted local employee/admin state, authenticated record delivery, explicit consent, verifier context checking; then a real wallet-connected web UX. No server receives secrets.
4. **Network:** the Preview constructor deployment and indexer state check are complete. Exercise all payroll circuits on Preview, inspect public transaction data and an explorer, then test Preprod if required by the current program.
5. **Independent security review and regression:** inspect witness trust, access control, compiled disclosure, public traces, and secret-handling paths; fix and rerun targeted tests.

| Area | Must-pass cases |
| --- | --- |
| Admin | Valid admin opens/registers/revokes/closes; wrong secret and employee attempt fail. |
| Commitment | Correct opening passes; wrong salary, randomness, pseudonym/secret, organization, epoch, unit, policy, or contract domain fails. |
| Threshold | Above and equal pass; below fails; unlisted tier and overflow/malformed amount fail. |
| Employment | Correct record passes; wrong holder, epoch, issuer, absent/revoked record fail; closed historical claim follows documented semantics. |
| Lifecycle | Duplicate epoch/record, invalid transitions, duplicate revocation, and post-close mutation fail. |
| Privacy | Inspect ledger, transaction payloads, generated public outputs, logs, URLs, analytics and screenshots for salary/secret leakage; test claim-handle linkage. |
| Replay/context | Old or mismatched verifier context is rejected by verifier; duplicate claims follow reuse policy. |

## 19–20. Deployment and evidence plan

Use the [official compatibility matrix](https://docs.midnight.network/relnotes/support-matrix) before installing: as checked on 29 September 2026 it lists Compact devtools `0.5.1`, compiler `0.31.1`, runtime `0.16.0`, Midnight.js/testkit `4.1.1`, wallet SDK `1.2.0`, connector API `4.0.1`, and proof server `8.1.0`. Locally, `compact --version` returned `0.5.1`, Node `v26.7.0`, npm `11.19.0`; PayDrip compiled with compiler `0.31.1` and used the local proof server image `8.1.0` for its Preview constructor deployment.

Build locally with full managed `contract/`, `keys/`, and `zkir/` artifacts, run off-chain adversarial tests, then deploy with the documented Midnight.js providers and a local proof server. Preview's [official endpoints](https://docs.midnight.network/relnotes/network) are the first target; a wallet needs test NIGHT and DUST registration for fees. Record the network, contract address returned by `deployContract`, deployment transaction ID, block height, explorer/indexer link, compiler and SDK versions, and the exact test/compile commands and outputs. Keep seeds in ignored local environment or wallet storage. Never substitute a wallet address for a contract address. Current Rise In challenge/submission rules and whether Preprod is mandatory remain **unverified**; obtain the current program page before submission.

## 21. V2 backlog

Confidential actual salary transfers; root-based private membership if validated; amendments and attestations; stronger revocation/current-employment semantics; multi-currency policy with authenticated conversion; organization key rotation and multi-admin controls; claim privacy against record-handle linkage; standardized verifier request service with abuse controls. Each is separately scoped and must not be described as a V1 feature.

## Open validation gates

- Verify exact Compact typed-record syntax, `persistentCommit` serialization, set/map operations, and public call payloads against compiler `0.31.1`.
- A membership lookup exposes the commitment handle in this implementation. Determine whether a root approach is viable within proving costs for V2.
- Verify a secure deployment-domain value available to both registration and claim circuits.
- Define authenticated employer-to-employee opening delivery and employee confirmation UX; on-chain logic alone cannot ensure the employer used the intended pseudonym.
- Verify current Rise In program requirements from its primary source. The August 2026 message is historical and its 24-hour deadline is not treated as current.

## Primary sources

- [Midnight Compact security: witnesses, disclosure, commitments, access control](https://docs.midnight.network/compact/smart-contract-security)
- [Midnight compatibility matrix](https://docs.midnight.network/relnotes/support-matrix)
- [Midnight deployment and provider guide](https://docs.midnight.network/guides/deploy-and-operate)
- [Midnight environments](https://docs.midnight.network/relnotes/network)
- [Midnight wallet funding](https://docs.midnight.network/guides/acquire-tokens)
- [Midnight Kapa MCP server setup](https://docs.midnight.network/ai-integration/kapa-mcp-server) — the server was not connected in this session; this proposal relies on directly reviewed official docs.
