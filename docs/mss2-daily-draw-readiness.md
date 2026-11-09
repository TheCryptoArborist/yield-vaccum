# MSS2 Daily Draw — current two-chain readiness index

Updated 2026-11-09 UTC. Tracker: TheCryptoArborist/yield-vaccum #53. Draft review PR: #54.
Research branch: `research/mss2-daily-draw-readiness`.
Application/main baseline: `c94d6a0f8a7884d818c907b86749eda1ff068237`.

**Latest completed milestone: actual-coordinator local integration passed 20 scenarios with Robinhood's coordinator code and 20 with Arc's coordinator code (40 local executions) in run 42611914241. This is not a live provider request or a complete payment-to-stake application. Task 3 remains open; provider approval and paid entries remain disabled.**

This index supersedes the old status that listed winner selection as the next unstarted step and separate chain rounds as an unapproved proposal. Detailed historical reports and failed-run records remain linked below. The previous full purchase/staking readiness snapshot is preserved at [commit 0a4d782](https://github.com/TheCryptoArborist/yield-vaccum/blob/0a4d782abb95241e92163fadb520ac1862d319d9/docs/mss2-daily-draw-readiness.md).

## Confirmed product direction

- Work is confined to Yield Vacuum, not the MintStakeShare GitHub repository. Intended host: `www.yieldvaccum.com`; domain/TLS/deployment mapping is still a release check.
- Separate daily chain-local rounds, tickets and prizes; one winner per participating chain and equal chance per purchased ticket. No referral/streak/stake-size odds multipliers in the approved first-version direction.
- Participants pay USDG on Robinhood and USDC on Arc. A published allocation buys liquid MSS2 through ordinary Buy; Buy & Stake is not the funding action. A separate allocation is developer revenue.
- The selected winner receives MSS2 directly into their stake, with operator-signed delivery from `0xE8b63245DdDAB73C7A276818942341D8Cfb7D7A7`. The existing administrator sign-in ending 8789 is separate from spending authority.
- Ticket ownership is locked before requesting randomness. One accepted request binds one result; no manual winner override, reopening entries or reroll after a failure. Prize delivery is separate from winner selection.
- Existing arcade allocation, funds, appearance and application behavior remain unchanged. A shared wallet ledger is not escrow or permission to spend existing arcade rewards.

Ticket price, revenue percentages, receivers, precise cutoff, launch sequence, eligibility, purchase timing, operating-cost treatment, backed participant refunds and stake-cap shortfall policy remain unresolved. No test fixture settles those decisions. D20DAO is a candidate under evaluation, not an approved production dependency.

## Evidence ledger — distinguish scopes rather than adding unlike test totals

| Milestone | Accepted evidence | Scope and limitation |
|---|---|---|
| Live metadata | Runs 42554165659 and 42554430282 | Payment/MSS2 metadata reads and checker tests; the latter run's original explorer lookup failed, subsequently addressed. |
| Direct-to-stake delivery | Run 42556404173: 16 scenarios per chain | Isolated forks, synthetic fixtures and simulated sender. Not real signing authority or app payout deduplication. |
| Liquid purchase and combined gift | Run 42558269951: 7 scenarios per chain | Robinhood USDG -> WETH -> MSS2; Arc USDC -> MSS2; exact purchased amount gifted to fixed test beneficiary. Not random winner selection or ticket accounting. |
| Winner lifecycle prototype | Run 42563327635: 36 scenarios on each local instance plus 2 chain guards | Mock coordinator/token. 74 executions, not 74 unique cases or live-chain tests. |
| Historical provider proofs and ownership | Run 42566437894: 4 historical samples and 20 rejected alterations | Provider SDK replay plus separately checked chain context; not independently authored crypto, future liveness or application consumer fulfillment. |
| Actual-coordinator consumer integration | Run 42611914241: 20 scenarios in each local coordinator mode | Real pinned provider source/verifiers with public test key and historical beacon signatures; generic local EVM, explicit Robinhood ArbSys shim, no native Arc accounting or live keeper. |

Earlier suites were not rerun as part of the latest integration run. Every report retains its own failed runs, assumptions, source revisions and simulation limitations.

## Integration targets already identified

Historical observations below require fresh validation before any public authorization:

| Target | Robinhood | Arc |
|---|---|---|
| Public chain ID | 4663 | 5042 |
| Payment token | USDG `0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168` | USDC ERC-20 view `0x3600000000000000000000000000000000000000` |
| Payment decimals | 6 | 6; native USDC uses 18-decimal units over the same underlying balance |
| MSS2 | `0x091F0c7e675A787A4018eb47c30BeD3FA2013B65`, 18 decimals | Same recorded address and decimals on its own chain |
| Stake gift entry point | Token `airdropStake(address[],uint256[])` | Same interface, chain-local state |

The gift interface needs no separate MSS2 spending allowance; the sender still signs. The observed minimum offered gift is 1 MSS2 and the observed mutable stake cap is 25,000,000 MSS2 per wallet per chain. Partial or zero capacity can produce less than the requested stake credit. Independent repeat gift transactions can pay twice. Verify actual stake-credit evidence and implement duplicate-payout controls; do not equate a successful transaction with a fully paid prize.

The staking proxy was `0x1fD4AD5873443953DBbF403e541f546E829be489`, with observed implementation `0xbe851D5ED304628Dc570A7A0bEB23Bb7ca5f587B`. Source-record and runtime limitations, including the absent Arc proxy verification entry and checked identical runtime, are preserved in the staking report and historical readiness snapshot.

## Provider review status

The previously unexplained Robinhood coordinator owner mismatch is explained by a checked October 21, 2026 on-chain transfer at block 94,329,459. The published manifest still lists the old owner; it has not been silently overwritten to manufacture a passing comparison. Owner-contract implementation/modules/guards and complete effective upgrade authority remain review items.

Four historical randomness samples passed mathematical replay and implemented historical receipt/state/configuration checks. The latest local consumer suite additionally proves the tested fee/request/fulfillment and recovery paths against the actual pinned coordinator implementations. This does not prove the live provider will fulfill a future request or that its current implementation cannot be upgraded.

## Next scoped implementation

**Implement a local-only capped operating-fee budget/refund-credit adapter, followed by a per-chain/token/round funding ledger.**

The current prototype's exact-value requirement rejects stale or excessive fees safely but is not a smooth variable-fee interface. Quote inside the request transaction, cap the approved operating spend and conserve unused funds. Explicitly bind who funded a request and who receives its excess/expiry refund. Do not spend participant prize/refund liabilities or arcade reserves. Test rejected refund recipients, reentrancy, unauthorized withdrawals, duplicate requests and balance conservation before changing the draw's production-facing design.

The provider's service-fee refund is not a participant ticket refund. The latest recovery-probe tests do not implement production recovery UI/automation or move any real prize. Final prices/percentages and funding destinations are still approval gates, not defaults to invent in this adapter.

## Open feasibility and release checks

1. Revalidate deployed implementations, provider/owner authority, fee behavior and operating assumptions before any separately approved public test. The initial local actual-code milestone is complete; whole Task 3 is not.
2. Complete the fee adapter, real ticket/funding accounting, swap receipt reconciliation, award ledger, event uniqueness and reorg/replacement handling. A passing controlled sequence does not supply those controls.
3. Protect shared-reserve liabilities, reconcile exact stake credit and stop duplicate payouts. Set a backed participant-refund and stake-cap shortfall policy that never substitutes another winner.
4. Verify the real reserve's signing authority, wallet/network UX and funding; simulation does not prove control. Complete the already-bound nonzero-referrer fixture and review mutable token/router/pool permissions and trade-size constraints.
5. Approve economics, eligibility, schedule, receivers and release sequence; perform whole-application/arcade regression tests, independent security and applicable legal launch review. Verify the intended domain before enabling payments.

## Detailed records

- [Metadata observations](evidence/daily-draw-metadata-2026-11-09.json)
- [Initial progress and corrections](mss2-daily-draw-progress-2026-11-09.md)
- [Stake interface and payout evidence requirements](mss2-daily-draw-staking-interface.md)
- [Purchase integration](mss2-daily-draw-purchase-integration.md) and [purchase evidence](evidence/daily-draw-swap-2026-11-09.json)
- [Winner prototype](mss2-daily-draw-winner-selection.md) and [prototype/provider snapshot](evidence/daily-draw-winner-2026-11-09.json)
- [Provider historical review](mss2-daily-draw-provider-review.md) and [historical evidence](evidence/daily-draw-provider-history-2026-11-09.json)
- [Latest actual-coordinator integration](mss2-daily-draw-coordinator-integration.md) and [accepted results](evidence/daily-draw-coordinator-integration-2026-11-09.json)

No main merge, existing application/arcade change, public deployment, wallet approval, real purchase, prize payout or production-setting change is authorized by these research results. The draft PR remains for review, not release.
