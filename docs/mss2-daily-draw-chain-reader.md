# MSS2 Daily Draw — read-only chain ingestion and persistent fork receipts

Recorded 2026-11-09 UTC. Issue #53; Draft PR #54. Research branch only.

## Execution record

**Accepted run 42628540736 succeeded on its first execution. Each fork passed 20 new durable-reader cases plus 23 retained market/receipt/swap cases: 43 passed, zero failed per fork. Separately, the unchanged 62-check persistence suite and an actual Postgres server restart passed once in the Robinhood CI job. No real funds moved or public transactions were submitted.**

| Evidence | Robinhood | Arc |
|---|---|---|
| Job | 129198517611 | 129198517127 |
| New reader cases | 20 passed / 0 failed | 20 passed / 0 failed |
| Retained fork cases | 23 passed / 0 failed | 23 passed / 0 failed |
| Artifact | 13680525665 | 13680550887 |

Workflow revision: `35a1f2974939ffb9105e64eac958acbc063abbb5`. Tested source: `5cff077d71796b4ce3f9c2f141d179d320bee2b3`. Both downloaded ZIP hashes match GitHub's recorded hashes, and their new source hashes and unchanged-base files were checked byte-for-byte. The artifacts preserve raw reports, run logs, executed sources, harness edits, database image identity and dependency lock. GitHub retention is 30 days; the [normalized evidence](evidence/daily-draw-chain-reader-2026-11-09.json) preserves identifiers, hashes and scenario results.

These are 40 new reader executions and 46 retained fork executions, not 86 unique scenarios. The 62 synthetic-evidence database regression checks remain a separate scope. Earlier D20 actual-source tests were not rerun or combined into this result. The prior standalone market negative variants remain nested inside their original cases.

The successful full-credit cases import the actual selected award, reserve its payout, execute a local MSS2 gift and credit exactly its observed stake increase in Postgres. Client recreation preserves both unresolved reservations and accepted credits. Four concurrent readers credit one receipt once. Partial/zero-capacity cases retain the winner and exact unpaid amount. The actual local snapshot reorganization restores the unpaid amount once and freezes the sender lane; a separately injected temporary missing receipt retains earlier credit pending review.

No assertion or existing contract was weakened. The first run passed; no failed attempt is omitted or relabeled. Snapshot-isolated cases may reuse a transaction hash; these are not distinct public payments.

## Connected path

The new reader loads the locked award from the selection transaction, its AwardPending event, and block-qualified controller state. It compares the ticket owner, winner and acquired prize amount, the configured payment/prize/reserve targets, reviewed runtime fingerprints, and the staking implementation slot. It requires the configured confirmation count and rechecks the selection/header observations before registration.

The caller supplies round ID and selection transaction hash, not a winner, amount, or confirmation override. The deployment configuration and ABI are trusted harness configuration. For this research their pins come from the local compiled deployment and the earlier source-record-checked fork targets; they are not independently reviewed production fingerprints.

A previously reserved payout attempt is observed using only its award/attempt identifiers and transaction hash. The reader fetches the transaction, receipt, reported canonical header, head and original selection block. The existing store/verifier performs the transaction, gift/transfer event, amount, uniqueness and confirmation checks. Credits, evidence and the held settlement outbox remain transactionally recorded in the unchanged base store.

## Files and boundaries

- `research/daily-draw/payout-store/chain-reader.mjs`: strict read-only method boundary, locked award import and payout evidence observation.
- `research/daily-draw/payout-store/reader-store.mjs`: additive access to archived verified evidence and a fail-closed review transition using the base store's sender/award/attempt lock order.
- `scripts/daily-draw-worker-cases.mjs`: 20 new categories connected to the existing private market rehearsal.
- `scripts/daily-draw-worker-fork.mjs`: source-pinned test extension retaining all 23 earlier market/receipt/swap scenarios.
- `.github/workflows/daily-draw-worker-fork.yml`: isolated PostgreSQL and chain forks, source pins and archived execution records.

The existing database schema, base store, receipt verifier, controller, fee contract, purchase adapter, market cases and original launchers are unchanged. Mechanical test-only import/append edits are saved in the workflow artifact. Application packages, routes, automatic Netlify migrations and production databases are not touched.

## Recovery semantics

Missing evidence for an uncredited attempt remains pending; elapsed time does not authorize another payout. A missing receipt after an accepted credit triggers review without assuming payment disappeared.

For a positively contradicted archived payout inclusion, the reader retrieves the previously verified transaction/receipt from the store and compares the old inclusion height with a fresh canonical header. Archived evidence is used only to quarantine a contradicted credit, never to grant new credit. The existing store reverses that credit once and freezes new reservations for the sender on that chain. A changed block while reading, runtime/implementation mismatch, wrong header height, chain switch, or read error fails closed into review.

The test harness performs an actual local snapshot rollback, mines a replacement block and verifies that the old payout receipt disappears. This is a deliberate private-fork reorganization, not evidence of a public-chain incident. Capacity boundaries use explicit local staking-storage fixtures. Separate adverse-reader cases inject missing/contradictory responses and transport failures; these are labelled in the results.

The database race between two readers binding and reconciling the same receipt is handled without requesting another signature. A closed-attempt race is only retried through the normal existing verification path; it does not accept an arbitrary exception as successful settlement.

## Evidence scope

This suite connects real forked stablecoin ticket payments, Topaz liquid MSS2 purchases, selected fixture winners, simulated reserve-signed gifts and actual resulting receipts to isolated PostgreSQL storage. Arc uses the dedicated Circle Arc execution engine. Robinhood uses the existing local Hardhat compatibility and deterministic snapshot-clock handling.

Randomness in this suite remains the deterministic test coordinator. The actual D20 source/proof checks remain separate evidence. The reserve is impersonated only on the local fork, and this neither proves real wallet control nor establishes production finality, live oracle availability, custody or escrow.

The reader itself makes no chain writes and has no wallet key, broadcaster, HTTP endpoint, scheduled watcher, transaction-discovery daemon or automatic recovery/unfreeze path. It is invoked synchronously against explicit transaction references. Database writes are restricted by the existing loopback/research-name guards. Tests reset only the disposable local schema between snapshot-isolated scenarios.

## Settlement and release state

`PaidInDatabase` still means the verified operational database record, not on-chain discharge. The drawing contract remains at AwardPending with its full liability. The outbox stays HeldForAuthorityReview. No administrator mark-paid shortcut, settlement dispatcher, reserve attestation or new custody model has been approved or introduced.

A fresh read can become stale after the last check and before database commit. Rechecks reduce inconsistent observations, but they are not atomic with the blockchain and are not a receipt-inclusion/finality proof. Persistent post-credit monitoring, independent RPC policy, outage/reorg recovery, deployment pin provenance and production access control still require review.

The next scoped design gate is the on-chain settlement authority: preserve the direct-wallet sender requirement and explicitly choose how a verified off-chain gift reduces the drawing contract's liability. A reserve-signed accounting attestation would be operator-attested, not trustless proof; an atomic escrow payout or verified receipt-proof design changes trust, custody or implementation requirements. Do not silently introduce one in a reader-only milestone. Actual-provider behavior still needs reconnecting to the complete market/settlement path after that choice.

Ticket economics, receiver addresses, operating payer/limits, eligibility, timing, backed refunds, stake-cap shortfalls, real reserve control, arcade obligations, provider governance/liveness, domain mapping and independent security/applicable launch review remain open. Task 3 remains open overall.

## Primary references

- Accepted run: https://github.com/TheCryptoArborist/yield-vaccum/actions/runs/42628540736
- Existing scope: `docs/mss2-daily-draw-persistence.md` and `docs/mss2-daily-draw-market-ledger.md`.
- Ethereum JSON-RPC: https://ethereum.org/en/developers/docs/apis/json-rpc/
- PostgreSQL 16 locking: https://www.postgresql.org/docs/16/explicit-locking.html
