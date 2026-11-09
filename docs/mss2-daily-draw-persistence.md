# MSS2 Daily Draw — durable payout reservations and settlement records

Recorded 2026-11-09 UTC. Issue #53; Draft PR #54. Research branch only.

**Accepted run 42626166537 / job 129190400734 succeeded: 62 database checks passed, zero failed, followed by a separate successful restart of the actual Postgres server.** The 62 checks comprise 29 categories repeated in each local-chain namespace plus four shared checks. These are not live-network transactions, new market-fork tests or a production security audit.

## What was implemented

The new Postgres-backed payout store replaces in-memory-only tracking for this research component. It reuses the previous `ResearchAwardBook` receipt verifier unchanged, but commits reservations, transaction associations, credited amounts, consumed logs and settlement-review records transactionally.

Files:

- `research/daily-draw/payout-store/schema.sql`
- `research/daily-draw/payout-store/store.mjs`
- `scripts/daily-draw-persistence.mjs`
- `.github/workflows/daily-draw-persistence.yml`
- [Normalized evidence](evidence/daily-draw-persistence-2026-11-09.json)

The repository already contains Netlify Database dependencies and SQL migrations. This implementation uses Postgres rather than local JSON files or process memory. **The research SQL is deliberately NOT in `netlify/database/migrations` and is not applied to the application's database.** The runtime accepts only `127.0.0.1`, the database name `mss2_draw_research`, and chain IDs 31337/31338. No production connection, migration, API, dependency change or deployment was made.

## Durable reservation and transaction rules

Each award preserves its chain, controller, round, token, staking contract, sender, winner, amount, selection block/hash/transaction and explicit confirmation requirement. Registration is idempotent only when all immutable values agree. Database-level identity protection rejects rewriting that award.

A transaction locks the sender's chain-specific row and the award row in a consistent order. Only one active attempt can exist for an award. The database permanently assigns each `(chain, sender, nonce)` to an attempt and each `(chain, transaction hash)` to one attempt. Consumed log indices are also unique within their chain/transaction. Uniqueness records have no TTL expiration.

Reservation idempotency keys recover the same attempt after a lost response. A different offer or nonce using the same key is rejected. The record is committed before any future wallet handoff could occur. An unresolved prepared or submitted record has no timeout-based unlock. This conservative rule also leaves an abandoned pre-signature reservation blocked: a reviewed cancellation/recovery procedure is still needed before a public interface.

Replacement transaction hashes may join the same attempt only when the chain, sender, nonce, target, zero native value and exact payout calldata match. A changed payout instruction requires review and freezes new reservations from that sender on that chain. This is replacement association/validation, not an implemented RPC replacement-discovery daemon.

## Receipt credit and atomic settlement bookkeeping

The store reuses the earlier verifier's sender/recipient, transaction/receipt, calldata, canonical-block, confirmation, StakeGifted and MSS2 Transfer checks. A caller cannot supply a bare credited amount. The new stored confirmation policy cannot be weakened at reconciliation time. Selection-block consistency is checked separately.

For a verified receipt, one database transaction records its evidence and log uniqueness, increases credited MSS2, closes the attempt, and creates a settlement-review outbox record. If any assertion or insert fails, those changes roll back together. Concurrent processing of the same receipt credits it once. Partial and zero credits preserve the original winner and exact unpaid remainder; a subminimum remainder cannot be rounded up.

A confirmed reverted transaction leaves the award unpaid. Its nonce remains permanently associated with the failed attempt, while a subsequent distinct-nonce attempt is possible. A missing receipt or insufficient confirmations does not close an unresolved attempt.

All token amounts use exact integer strings/BigInt and unconstrained Postgres numeric columns with integer/range checks. A test exercises a value above 2^250 without rounding through JavaScript Number.

## Reorganization and uncertainty handling

A positively contradicted payout inclusion after recording reverses that settlement's local credit exactly once, restores the corresponding unpaid amount and records a `ReceiptOrphaned` review event. It freezes the sender's reservation row on that chain, including when another attempt was already prepared after an earlier partial credit. Historical evidence and transaction ownership are retained.

Temporary loss of previously credited evidence is different: it triggers review but does NOT automatically erase the earlier payment or authorize another send. A changed selection block also requires review; it never chooses a different winner.

The prototype intentionally has no automatic sender-unfreeze or recredit/retry procedure after a reorg. It cannot determine production finality from synthetic evidence or prove which RPC is truthful. A reviewed chain-reading, revalidation and incident-resolution service is still required. Database atomicity is not blockchain consensus.

## Evidence and tests

| Item | Accepted value |
|---|---|
| Run / job | 42626166537 / 129190400734 |
| Workflow revision | `9618241888ddcc17029e650923a9eee567e3976b` |
| Tested source revision | `adfe3471c6c04e22caaf63477da553fd0f1fb233` |
| Database | PostgreSQL 16.6, isolated CI service |
| Database checks | 62 passed / 0 failed |
| Separate database-server restart | Passed; submitted attempt and duplicate-preparation block survived |
| Artifact | 13678741787 |
| Downloaded ZIP SHA-256 | `c6928bcff3c41510e630820e21866c62858c5ebabc069720e8b905f3b3c28de8` |
| Existing receipt verifier Git blob | `c4b9bdddb57a12984d46018dee7ceefa98e061c9`, unchanged |

The downloaded artifact digest was checked against GitHub's recorded digest. Its JSON reports show 62/0 and the separate successful server-restart result. It includes executed source, raw results, source hashes, Docker image identity and the resolved temporary dependency lock. Exact direct dependencies are ethers 6.15.0 and pg 8.16.3. GitHub artifact retention is 30 days.

Tests use real competing Node processes and database connections. Processes are terminated with SIGKILL immediately before COMMIT and immediately after COMMIT to distinguish rollback from a committed request whose reply was lost. Separate tests reconnect application clients, then the workflow restarts the Postgres server and checks that an unresolved submitted attempt still blocks another reservation.

Other checks cover immutable registration, exact arithmetic, cross-award/chain isolation, parallel receipt processing, matching/changed replacements, reverted/partial/zero payouts, dust, altered evidence, duplicated logs, missing receipts, confirmation policy, selection/payout reorgs and rejection of public-chain/remote-database configuration. The first execution of this new suite passed; no failed run was relabeled or omitted.

These checks simulate chain evidence; they do not execute EVM transactions. Earlier market forks, actual D20 source integration and randomness history were NOT rerun here. A graceful database-server restart and abrupt application-process kills do not establish recovery from disk loss, multi-region failover, database corruption or restoring an old backup.

## Settlement authority — explicitly still a release decision

**`PaidInDatabase` means the receipt passed this local operational record's checks. It does not mean the on-chain drawing contract decremented its liability.** That contract remains unchanged at `AwardPending` with its original obligation.

The outbox has only `HeldForAuthorityReview` records. There is no dispatcher, signed transaction, `markPaid` endpoint or hidden administrative bypass. The records carry the verified credited amount and receipt identifiers as inputs for a future reviewed settlement design.

The current reserve signs a direct call to the existing MSS2 token. Under this arrangement, copying a receipt hash into a different contract is not itself proof of the receipt's execution. A narrowly scoped reserve-signed settlement attestation could preserve this sender model, but would be an explicitly operator-attested accounting update, not trustless receipt verification. An escrow/atomic-payout redesign or verified receipt-proof system has different trust and implementation consequences. **No new settlement authority or custody model is selected by this milestone.**

The recommended immediate next implementation is a read-only integration worker that loads the locked award from the draw, collects fresh chain evidence, and feeds this durable store in the existing isolated market rehearsal. It must not expose a browser `confirm paid` endpoint. This will test persistence with actual fork receipts, rather than adding unlike prior test results together. The separate attestation/proof/custody decision must be approved and reviewed before on-chain obligations are reduced.

## Remaining boundaries

The code is an internal research library, not an authenticated public service. Inputs must come from a trusted chain reader; this milestone does not implement selection ingestion, operator authentication, scheduled monitoring, nonce discovery, signing UI, replacement scanning, database roles/backups or production deployment. Constraints do not stop independent wallet transactions or a privileged database administrator changing the database.

The reserve is still owner-controlled, not escrow. Existing arcade obligations remain separate and unchanged. Ticket pricing, revenue percentages, operating payer/limits, receivers, timing, eligibility, backed participant refunds, stake-cap policy, provider governance/liveness, real wallet control and independent security/applicable legal launch review remain open. Task 3 remains open overall; this scoped persistence milestone is complete.

No main merge, existing app/arcade behavior, application package/lockfile, production DB/migration, public contract deployment, wallet approval, purchase, airdrop or MintStakeShare repository change occurred.

## Primary references

- Accepted run: https://github.com/TheCryptoArborist/yield-vaccum/actions/runs/42626166537
- Existing receipt flow: [market-ledger report](mss2-daily-draw-market-ledger.md)
- Postgres row locking: https://www.postgresql.org/docs/current/explicit-locking.html
- Netlify Database architecture: https://docs.netlify.com/build/data-and-storage/netlify-database/
