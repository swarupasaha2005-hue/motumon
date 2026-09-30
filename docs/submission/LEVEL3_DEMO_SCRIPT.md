# PayDrip — Level 3 One-Minute Demo

**Recording status: Not recorded. Runtime gate: a successful Preview claim and verifier lookup remain unverified.** Do not present this plan as a completed demonstration.

## Before Recording

- Start the existing loopback terminal/proof server; verify the existing deployment. Do not redeploy.
- Confirm the local operator has synchronized and the SDK can fund/prove the actual transaction.
- Use one synthetic demo payroll record; open its period and register its commitment through the real app. Save private files locally, outside Git.
- Confirm at least one real income claim and independent public receipt; inspect public state/payload before asserting runtime privacy.
- Choose a new verifier context for a new claim. Never blindly retry an ambiguous transaction.
- Have the real public contract/transaction/block evidence ready. Run `npm run paydrip:test -- --reporter=verbose` for the actual test output.
- Keep seed, administrator/employee secrets, randomness, password and private file contents off screen. A deliberately revealed synthetic salary is the only compensation shown.

## Approximately 60 Seconds — Exact Narration

| Time | Screen / action | Narration |
|---|---|---|
| 0–5 | PayDrip landing page | “PayDrip: payroll belongs on-chain. Salaries don't.” |
| 5–12 | Launch App; show Preview and 1AM connected state after real approval | “This is Private Payroll / Splits on Midnight. 1AM is the browser session; the local Preview operator executes these circuits.” |
| 12–22 | Local terminal: real open period and registered commitment | “The employer authorizes a commitment to a private payroll record. The public ledger stores its handle and period.” |
| 22–35 | My payroll: checked imported demo record; reveal only marked synthetic salary locally | “This synthetic record contains five thousand dollars monthly. The employee keeps its opening and identity private.” |
| 35–48 | Create a claim: Monthly income eligibility, At least $3,000, fresh context, Privacy Preview; actual submission and confirmed result | “Compact checks ownership, registration, revocation and the private comparison. I disclose the three-thousand-dollar tier, context and handle—not the salary.” |
| 48–55 | Verify a claim: same context → Check contract receipt | “The verifier reads the accepted claim. Exact salary is absent from this public receipt.” |
| 55–60 | Actual tx/block/contract; real tests and hosted CI only if verified | “The real Preview transaction is shown here. Tests cover authorization, boundaries and invalid openings.” |

## Proof Latency and Editing

Real proving/confirmation may exceed one minute. Keep the unedited source recording. If editing to approximately 60 seconds, visibly label the omitted wait with its **actual** elapsed duration and show the genuine resulting transaction/block and verifier receipt. Do not use fake progress, switch to another context unnoticed, or describe a mocked result as confirmed. If the gate fails, stop and record sanitized diagnostic evidence instead; that is not a full-functionality submission video.

## Evidence to Retain

Real public transaction IDs/hash, blocks, contract/network, context, tier, commitment, matching verifier result, and genuine video URL after upload. No private opening contents. Record wallet disconnect if time allows or retain it in the longer source recording. Test screenshot and proposal approval are separate submission artifacts.
