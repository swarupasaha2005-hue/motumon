# Level 4 Preprod readiness — preparation only

**No Preprod deployment, wallet address or circuit execution is claimed.** Preview remains the active app network. Do not run `preview:deploy` for Preprod or edit `deployment.preview.json` to relabel it.

## Verified documentation baseline

The official [compatibility matrix](https://docs.midnight.network/relnotes/support-matrix), reviewed 2026-09-30, lists compiler 0.31.1, Compact runtime 0.16.0, Midnight.js/testkit 4.1.1, wallet SDK 1.2.0 and proof server 8.1.0 for Preprod, matching current core tooling. This is documentary compatibility, not a runtime test. Preprod's node/indexer releases differ from Preview.

The official [endpoint list](https://docs.midnight.network/relnotes/network) gives Preprod RPC `https://rpc.preprod.midnight.network` and GraphQL `/api/v4/graphql` on `https://indexer.preprod.midnight.network`. Shared `scripts/lib/network-config.mjs` prepares consistent network IDs, HTTP/WS endpoints and local prover. Tests reject assigning the Preview manifest to Preprod.

## Required implementation and runtime gates, in order

1. Close the real Preview operator/circuit evidence gap and Level 3 submission/product gates.
2. From an authorized environment verify current Preprod node, GraphQL/provider behavior and wallet Connector capabilities; do not guess queries or derive compatibility from HTTP health.
3. Introduce separately named Preprod wallet/admin/password/private-state stores and a Preprod manifest. Add duplicate-deployment guards and network checks before any wallet transaction. Preserve Preview.
4. Derive a public Preprod funding address locally with supported SDK tooling. Never paste or upload its seed. Fund native resources and verify DUST registration/spendability according to the current official [funding guide](https://docs.midnight.network/guides/acquire-tokens).
5. Compile the unchanged PayDrip contract; deploy only through a verified supported provider path. Record SDK transaction ID and block hash as different fields when both are available; do not overwrite one with the other without API evidence.
6. Independently fetch deployment/current state, decode the actual PayDrip schema and retain only public metadata. Record genuine address/network/tx/block/time returned by tools.
7. Enable a Preprod frontend only with correct manifest, wallet network validation, provider/artifact compatibility and honest signer identity. The current hosted-static app is insufficient for a production transaction flow.
8. Execute the three-circuit demo; read accepted receipt and inspect public transaction/ledger privacy. Update README only after actual success.

There are no `preprod:*` scripts yet. New deployment tooling must be implemented and tested after these gates; this runbook deliberately does not present Preview commands as Preprod commands.

## Present blockers

No completed Level 3 prerequisite, authorized/funded Preprod operator, verified Preprod wallet/provider runtime, deployment manifest, Preprod app route, or network evidence. Agent network limitations remain distinct from network service health.
