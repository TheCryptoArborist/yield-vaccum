# MSS2 Daily Draw — current two-chain readiness index

Updated 2026-11-09 UTC. Tracker: TheCryptoArborist/yield-vaccum #53. Draft review PR: #54.
Research branch: `research/mss2-daily-draw-readiness`.
Application/main baseline: `c94d6a0f8a7884d818c907b86749eda1ff068237`.

**Latest completed milestone: a Postgres-backed research payout store passed 62 database checks and a separate actual database-server restart check in run 42626166537. It durably reserves attempts/nonces, binds matching replacements, credits verified receipts once and freezes ambiguous/reorganized payouts. These tests use synthetic receipt evidence, not new network forks. On-chain liability settlement remains unimplemented. Task 3 and production/provider approval remain open.**

Start with [the persistence report](mss2-daily-draw-persistence.md) and [normalized evidence](evidence/daily-draw-persistence-2026-11-09.json). The preceding market-ledger index is preserved at commit `1f9cb1e8984faaa3a5c7fb0547349e282bf74458`. Historical reports retain their source revisions, failures and limitations.

## Confirmed product direction

- Work stays in Yield Vacuum, not the MintStakeShare GitHub. Intended host: `www.yieldvaccum.com`; domain/TLS/deployment mapping still requires release verification.
- Separate daily chain-local draws, tickets and prizes; one winner per participating chain and equal chance per ticket. No first-version referral, streak or stake-size weighting.
- USDG tickets on Robinhood; USDC tickets on Arc. A published portion buys LIQUID MSS2 through ordinary Buy, not Buy & Stake. A separate portion is allocated to the developer.
- Owner-signed prize delivery adds directly to the winner's MSS2 stake from `0xE8b63245DdDAB73C7A276818942341D8Cfb7D7A7`. Administrator sign-in ending 8789 is not spending authority.
- Freeze ticket ownership and outcome-relevant inputs; one accepted request/result per round; no manual winner, reopened entries, replacement outcome or failure-driven redraw.
- Keep existing arcade funds, allocation, theme and application behavior unchanged. Shared-wallet accounting is not escrow or permission to spend arcade rewards.

Ticket price, revenue percentages, payment/developer receivers, operating payer/limits, precise timing, eligibility, purchase timing, launch sequence, backed participant refunds, stake-cap shortfall policy and on-chain settlement authority remain unresolved. Fixture percentages/amounts do not settle them. D20DAO remains a candidate, not a production-approved dependency.

## Evidence ledger — retain separate scopes

| Milestone | Accepted evidence | Scope |
|---|---|---|
| Live metadata | 42554165659 and 42554430282 | Payment/MSS2 reads and checker tests; latter's original explorer lookup failed, subsequently addressed. |
| Direct-to-stake delivery | 42556404173: 16 cases per chain | Isolated forks/simulated sender; not real wallet control or application deduplication. |
| Liquid purchase and gift | 42558269951: 7 cases per chain | Real forked market/staking contracts, fixed beneficiary. |
| Mock winner prototype | 42563327635: 36 categories twice plus 2 chain guards | Mock coordinator/token; 74 local executions. |
| Historical provider proofs/ownership | 42566437894: 4 samples, 20 rejected alterations | SDK replay plus historical chain checks; not independent crypto or future liveness. |
| Actual coordinator source integration | 42611914241: 20 categories per mode | Local verification/callbacks/recovery with public fixture key/signatures, not live keeper. |
| Standalone fee module | 42614410076: 35 categories per mode | Capped fees, payer credits and request-specific refund accounts. |
| Integrated initial ledger | 42617426146: 43 integrated + 35 fee regressions per mode | Actual provider source, but fake payment/prize/purchase contracts. |
| Real market-ledger and stake receipts | 42621984190: 16 new + 7 retained swap categories per fork | Real forked assets/router/staking, dedicated Arc engine, deterministic mock coordinator, original in-memory receipt book. |
| Persistent payout reservations | 42626166537: 62 checks plus server restart | Real local Postgres and competing/crashed processes, synthetic receipts, unchanged receipt verifier. No on-chain settlement. |

The persistence run did not rerun any earlier chain/provider/market suite. Its 62 checks are 29 categories repeated for local IDs 31337/31338 plus four shared checks. Do not combine unlike totals into a security certification.

## Connected behavior and limits

The previously tested fork flow is stablecoin tickets -> allocate -> real Topaz purchase of liquid MSS2 -> lock ticket/funding digest -> capped fee request -> known test result -> selected ticket owner -> owner-impersonated stake gift -> receipt/event reconciliation. Original controller/fee sources remain unchanged. The fixed-route adapter checks actual input/output and resets exact allowances. Arc's native/token balance relation was exercised in that purchase/request path.

The new Postgres store reuses the original receipt verifier, adds durable row-lock reservations, permanent chain/sender/nonce and transaction/log uniqueness, idempotency and exact integer accounting. Repeated or concurrent reconciliation credits once. A matching replacement belongs to the same attempt; altered instructions freeze the sender lane. Pending/unknown receipts never unlock a fresh signature merely because a worker restarted or time elapsed.

A positively contradicted payout inclusion restores its local unpaid amount once and freezes new reservations from the sender on that chain. Missing evidence after credit triggers review without pretending the payment never happened. Reorg unfreezing/recrediting and abandoned pre-signature cancellation are not implemented recovery procedures. Original winner and historical evidence remain recorded.

**Persistence is now tested, but not connected to the full live/fork application flow.** SQL stays under research, outside automatic Netlify migrations. The runtime rejects remote/production database configuration and public chain IDs. No application database was accessed.

**On-chain settlement remains open.** A receipt can be `PaidInDatabase`, while the unchanged contract still shows `AwardPending` with full liability. The transactional settlement outbox is held for authority review and cannot dispatch. No administrator mark-paid shortcut or receipt-proof claim was added. A reserve-signed attestation would be explicitly operator-attested accounting, not trustless proof; no new authority/custody policy is approved here.

External reserve balances remain owner-controlled. Initial quarantine is not a full inventory of later arcade obligations. The reserve can be depleted after authorization. The fixed winner must still be recorded and its unpaid award retained. Randomness-service refunds are not participant refunds.

## Existing integration targets

Revalidate before public authorization: Robinhood chain 4663, USDG `0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168`; Arc chain 5042, USDC ERC-20 view `0x3600000000000000000000000000000000000000`. Observed payment decimals are 6; Arc native units use 18 decimals over the same balance.

MSS2: `0x091F0c7e675A787A4018eb47c30BeD3FA2013B65`, 18 decimals on each chain. Gift entry: token `airdropStake(address[],uint256[])`, no separate MSS2 allowance but explicit sender authorization. Historical minimum offer 1 MSS2 and mutable 25,000,000 stake cap. Successful receipts may credit partially or not at all; repeated independent gifts can pay twice. Source/runtime qualifications remain in the staking report.

## Provider review

The former Robinhood owner discrepancy is explained by the checked October 21, 2026 transfer at block 94,329,459; the manifest still lists its old owner. Historical samples and actual-source local callbacks have separate evidence. They do not establish complete upgrade/module/guard authority, current live operational equivalence, future fulfillment or independent audit. Neither deterministic fork outcomes nor synthetic database receipt fixtures are live-provider acceptance evidence.

## Next scoped milestone and release gates

1. Connect a read-only award/evidence ingestion worker and this durable store to the existing isolated market rehearsal. Use actual fork receipts; do not accept a browser-provided paid amount. Verify durable duplicate prevention and source selection anchors across that complete path.
2. Review and approve the on-chain/off-chain settlement authority and liability decrement model. The held outbox is not authorization to mutate contracts. Add explicit reorg and abandoned-attempt incident procedures, production database roles/backups and signer handoff controls.
3. Exercise the market/settlement path with actual-provider behavior under appropriate isolated/separately authorized test conditions. Preserve one result, original winner and exact unpaid remainder.
4. Resolve custody/backing, authorization-to-request timing, complete arcade obligations, backed ticket refunds and cap-shortfall policies. Revalidate token/router/provider implementations and governance. Verify real reserve control, wallet/network UX, bound-referrer behavior, application/arcade regressions and provider liveness/withholding.
5. Approve economics, eligibility, schedule, destinations and release sequence; obtain independent security/applicable legal review and verify the intended domain. Paid entries remain disabled.

## Detailed records

- [Metadata](evidence/daily-draw-metadata-2026-11-09.json) and [initial progress](mss2-daily-draw-progress-2026-11-09.md)
- [Stake interface](mss2-daily-draw-staking-interface.md)
- [Purchase integration](mss2-daily-draw-purchase-integration.md) and [purchase evidence](evidence/daily-draw-swap-2026-11-09.json)
- [Winner prototype](mss2-daily-draw-winner-selection.md) and [provider snapshot](evidence/daily-draw-winner-2026-11-09.json)
- [Provider history](mss2-daily-draw-provider-review.md) and [history evidence](evidence/daily-draw-provider-history-2026-11-09.json)
- [Coordinator integration](mss2-daily-draw-coordinator-integration.md) and [coordinator evidence](evidence/daily-draw-coordinator-integration-2026-11-09.json)
- [Operating fees](mss2-daily-draw-operating-fees.md) and [fee evidence](evidence/daily-draw-operating-fees-2026-11-09.json)
- [Initial integrated ledger](mss2-daily-draw-integrated-ledger.md) and [integrated evidence](evidence/daily-draw-integrated-2026-11-09.json)
- [Market-ledger/receipts](mss2-daily-draw-market-ledger.md) and [fork evidence](evidence/daily-draw-market-ledger-2026-11-09.json)
- [Durable payouts](mss2-daily-draw-persistence.md) and [persistence evidence](evidence/daily-draw-persistence-2026-11-09.json)

No main merge, existing application/arcade/dependency change, production database/migration, public contract deployment, real approval/purchase/airdrop or production-setting change is authorized by these results. Draft PR #54 remains review only.
