# MSS2 Daily Draw — current two-chain readiness index

Updated 2026-11-09 UTC. Issue #53; Draft PR #54.
Research branch: `research/mss2-daily-draw-readiness`.
Application/main baseline: `c94d6a0f8a7884d818c907b86749eda1ff068237`.

**Latest completed milestone: read-only award/evidence ingestion is connected to durable Postgres records and the real-market private-fork rehearsal. Run 42628540736 passed 20 new reader cases plus 23 retained market/receipt/swap cases per fork (43/0 each), plus a separate rerun of 62 persistence checks and an actual database-server restart. This closes the initial synthetic-to-fork-receipt persistence integration, not public release or on-chain settlement. Task 3 remains open; paid entries and provider approval remain disabled.**

Start with [the chain-reader report](mss2-daily-draw-chain-reader.md) and [normalized evidence](evidence/daily-draw-chain-reader-2026-11-09.json). The previous complete index is preserved at commit `271f68b57c8acbc8a591adbc9fc413321d5e878d`. Earlier reports retain their failures, source revisions and scope limitations.

## Confirmed product direction

- Work stays in Yield Vacuum, not the MintStakeShare GitHub. Intended host: `www.yieldvaccum.com`; domain/TLS/deployment mapping remains a release check.
- Separate daily chain-local draws, tickets and prizes; one winner per participating chain; equal odds per ticket. No referral, streak or stake-size weighting in the first-version direction.
- USDG tickets on Robinhood; USDC tickets on Arc. A published allocation buys LIQUID MSS2 through ordinary Buy, not Buy & Stake. A separate allocation is developer revenue.
- Owner-signed prize delivery adds to the winner's stake from `0xE8b63245DdDAB73C7A276818942341D8Cfb7D7A7`. Administrator sign-in ending 8789 is separate from spending authority.
- Lock outcome-relevant inputs and ticket ownership before randomness. One accepted request/result; no administrator-selected winner, reroll, reopened entries or replacement winner after failure.
- Existing arcade allocations, funds, theme, dependencies and application behavior remain unchanged. Shared-wallet accounting is not escrow or authorization to consume arcade rewards.

Prices, allocation percentages, receiver addresses, operating payer/limits, schedule, eligibility, purchase timing, launch order, custody/backing, participant refunds, stake-cap shortfalls and on-chain settlement authority remain unresolved. Test quantities/percentages/confirmation counts do not approve production policy. D20DAO remains a candidate, not a production-approved provider.

## Evidence ledger — separate scopes

| Milestone | Accepted run | Scope |
|---|---|---|
| Live metadata | 42554165659 / 42554430282 | Metadata reads/checker tests; original explorer gap retained in history. |
| Direct-to-stake delivery | 42556404173 | 16 cases per fork; simulated sender, not real wallet control. |
| Original liquid purchase/gift | 42558269951 | Seven cases per fork; actual forked market and staking contracts, fixed beneficiary. |
| Mock winner prototype | 42563327635 | 36 categories twice plus two public-chain guards; mock token/coordinator. |
| Provider history/ownership | 42566437894 | Four historical samples, 20 rejected alterations; not independent cryptographic audit or future liveness. |
| Actual coordinator source integration | 42611914241 | 20 categories per local implementation, public test key/historical beacon signatures. |
| Standalone fee module | 42614410076 | 35 categories per mode; capped fees/payer credits/request refund accounts. |
| Initial integrated ledger | 42617426146 | 43 integrated + 35 fee cases per mode; actual provider source, fake tokens/purchase. |
| Real-market ledger/receipt forks | 42621984190 | 16 new + seven retained cases per fork; real forked assets, Arc native engine, mock randomness, in-memory book. |
| Durable payout store | 42626166537 | 62 database checks plus server restart; synthetic receipt evidence. |
| Durable read-only ingestion with fork receipts | 42628540736 | 20 new + 23 retained cases per fork; actual fork receipts and local Postgres, mock randomness. Separate 62-check regression/server restart rerun once. |

The latest suite has 40 new reader executions and 46 retained fork executions, not 86 unique scenarios. Its 62 synthetic-evidence persistence regressions remain separate. No actual-provider suite was rerun in this step. Do not sum unlike totals into a security certification.

## What is now connected

The private-fork path is stablecoin tickets -> close/allocate -> real Topaz liquid MSS2 purchase -> locked inputs -> capped fee request -> deterministic test result -> selected ticket owner -> durable reservation -> simulated reserve-signed stake gift -> read-only receipt ingestion -> persistent exact credit/unpaid remainder.

The worker derives the award from the selection transaction/event and block-qualified contract state, rather than accepting a browser-provided winner or amount. It checks deployment pins, stake implementation, configured targets, ticket ownership, recorded award and confirmations. Payout observation fetches fresh transaction/receipt/header/selection evidence through a strict read-only method boundary.

The original controller, fee contract, purchase adapter, database schema, base payout store and receipt verifier remain unchanged. New reader files add archived-evidence access and a fail-closed review transition. Source-pinned test hooks append cases without removing existing assertions.

Four concurrent reader instances credit one actual fork receipt once. Client recreation preserves reservations and credits. Partial/zero stake credits retain the original winner and exact unpaid amount. An actual local snapshot rollback is detected through fresh headers; archived verified inclusion is used only to reverse a positively contradicted local credit once and freeze the sender. Missing evidence alone does not erase earlier payment or authorize resending.

The reader is an internal, synchronously invoked research component—not a production RPC watcher, replacement-discovery daemon, wallet UI or authenticated public API. Postgres remains loopback-only with research-name guards; SQL is outside automatic Netlify migration paths. Runtime pins and 1/2-confirmation fixture policies are not production approvals.

## Settlement boundary — next design gate

A proposed, non-binding [settlement decision record](mss2-daily-draw-settlement-decision.md) now compares receipt-derived public status, operator-signed on-chain attestation, atomic escrow payout and receipt-proof verification. It recommends the receipt-first display model for review because a genuine gift from the chosen external sender cannot be trustlessly observed by the existing draw contract. **No alternative is approved; no production settlement code is enabled.**

**A verified database credit is not an on-chain liability decrement.** The unchanged contract still records AwardPending and the full obligation. Outbox entries remain HeldForAuthorityReview. No signer, dispatcher, force-paid endpoint or new attestation/custody authority was introduced.

The next scoped work is a settlement-authority design for developer/user review, preserving the chosen direct-wallet sender. A narrowly scoped reserve-signed accounting acknowledgment is operator-attested, not trustless receipt proof. Atomic escrow payout and verified receipt-proof designs have different custody, trust and implementation requirements. Do not silently choose one through a reader update.

After that decision, connect the reviewed settlement transition and actual-provider behavior to the complete market/database acceptance path. Public rollout additionally requires production authentication, wallet handoff, replacement discovery, durable post-credit monitoring, reviewed unfreeze/cancellation procedures, database roles/backups and incident recovery.

## Existing targets and material limitations

Historical integration targets must be revalidated before public authorization:

| Item | Robinhood | Arc |
|---|---|---|
| Source chain ID | 4663 | 5042 |
| Ticket token | USDG `0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168` | USDC `0x3600000000000000000000000000000000000000` |
| Payment units | Six decimals | Six-decimal token view and 18-decimal native view of the same underlying balance |
| Purchase route | USDG -> WETH -> liquid MSS2 | USDC -> liquid MSS2 |

MSS2 token on each chain: `0x091F0c7e675A787A4018eb47c30BeD3FA2013B65`, 18 decimals. Gift entry is token `airdropStake(address[],uint256[])`; no separate MSS2 allowance is needed, but the sender signs. Historical minimum offer is 1 MSS2, and the observed mutable stake cap is 25,000,000 per wallet/chain. Successful receipts can credit partially or zero. Independent repeated transactions can pay twice. Detailed source/runtime and event checks remain in the staking/purchase reports.

The external reserve remains owner-controlled, not escrow. Initial balance quarantine is not a complete inventory of arcade obligations. Funds can leave after authorization. Existing obligations, protected refund funding and the authorization-to-request interval still need resolution.

Robinhood provider ownership history explains the October 21, 2026 transfer at block 94,329,459; the published manifest remains stale. Complete effective upgrade/module/guard authority, future fulfillment/withholding and independent security review remain open. Historical proof and local coordinator success are not live service guarantees.

## Remaining release gates

1. Approve and test settlement authority/liability reduction and reconnect genuine provider behavior to the full isolated acceptance path.
2. Resolve economics, eligibility, timing, receivers, operating costs, custody/backing, arcade liabilities, backed participant refunds and stake-cap shortfalls.
3. Verify real reserve control, account/network signing UX, bound-referrer behavior and current token/router/provider implementations and authority.
4. Add reviewed operational monitoring, nonce/replacement discovery, authentication/roles, backup restoration and recovery procedures; rechecks are not blockchain-atomic or cryptographic finality proofs.
5. Complete full application/arcade regressions, independent security and applicable legal launch review, and intended-domain verification. Keep paid entries disabled until authorized.

## Detailed records

- [Metadata](evidence/daily-draw-metadata-2026-11-09.json) and [initial progress](mss2-daily-draw-progress-2026-11-09.md)
- [Staking interface](mss2-daily-draw-staking-interface.md) and [purchase integration](mss2-daily-draw-purchase-integration.md)
- [Winner prototype](mss2-daily-draw-winner-selection.md) and [provider historical review](mss2-daily-draw-provider-review.md)
- [Coordinator integration](mss2-daily-draw-coordinator-integration.md) and [operating fees](mss2-daily-draw-operating-fees.md)
- [Initial ledger](mss2-daily-draw-integrated-ledger.md) and [real-market/receipt forks](mss2-daily-draw-market-ledger.md)
- [Persistence](mss2-daily-draw-persistence.md) and [durable chain reader](mss2-daily-draw-chain-reader.md)

No main merge, existing application/arcade/dependency change, production database/migration, public contract deployment, real approval/purchase/airdrop or production-setting change is authorized by these research results. Draft PR #54 remains review only.
