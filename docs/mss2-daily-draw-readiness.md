# MSS2 Daily Draw — current two-chain readiness index

Updated 2026-11-09 UTC. Tracker: TheCryptoArborist/yield-vaccum #53. Draft review PR: #54.
Research branch: `research/mss2-daily-draw-readiness`.
Application/main baseline: `c94d6a0f8a7884d818c907b86749eda1ff068237`.

**Latest completed milestone: the separate operating-fee budget/refund-credit component passed 35 scenario categories with each provider-source implementation, for 70 local executions, in run 42614410076. It is not yet connected to the original DailyDrawPrototype or website. Next: combined draw/fee integration and segregated per-round fund accounting. Task 3, provider acceptance and public release remain open; paid entries remain disabled.**

This index distinguishes completed research from application readiness. Detailed reports retain source revisions, failed runs, assumptions and simulation limitations. The earlier full purchase/staking snapshot is preserved at [commit 0a4d782](https://github.com/TheCryptoArborist/yield-vaccum/blob/0a4d782abb95241e92163fadb520ac1862d319d9/docs/mss2-daily-draw-readiness.md).

## Confirmed product direction

- Work is confined to Yield Vacuum, not the MintStakeShare GitHub repository. Intended host: `www.yieldvaccum.com`; domain/TLS/deployment mapping is still a release check.
- Separate daily chain-local rounds, tickets and prizes; one winner per participating chain and equal chance per purchased ticket. No referral/streak/stake-size odds multipliers in the approved first-version direction.
- Participants pay USDG on Robinhood and USDC on Arc. A published allocation buys liquid MSS2 through ordinary Buy; Buy & Stake is not the funding action. A separate allocation is developer revenue.
- The selected winner receives MSS2 directly into their stake, with operator-signed delivery from `0xE8b63245DdDAB73C7A276818942341D8Cfb7D7A7`. The existing administrator sign-in ending 8789 is separate from spending authority.
- Ticket ownership is locked before requesting randomness. One accepted request binds one result; no manual winner override, reopening entries or reroll after a failure. Prize delivery is separate from winner selection.
- Existing arcade allocation, funds, appearance and application behavior remain unchanged. A shared wallet ledger is not escrow or permission to spend existing arcade rewards.

Ticket price, revenue percentages, receivers, precise cutoff, launch sequence, eligibility, purchase timing, operating-cost treatment, authorized operating payer/limits, backed participant refunds and stake-cap shortfall policy remain unresolved. No test fixture settles those decisions. D20DAO is a candidate under evaluation, not an approved production dependency.

## Evidence ledger — keep test scopes distinct

| Milestone | Accepted evidence | Scope and limitation |
|---|---|---|
| Live metadata | Runs 42554165659 and 42554430282 | Payment/MSS2 metadata reads and checker tests; the latter run's original explorer lookup failed, subsequently addressed. |
| Direct-to-stake delivery | Run 42556404173: 16 scenarios per chain | Isolated forks, synthetic fixtures and simulated sender. Not real signing authority or app payout deduplication. |
| Liquid purchase and combined gift | Run 42558269951: 7 scenarios per chain | Robinhood USDG -> WETH -> MSS2; Arc USDC -> MSS2; exact purchased amount gifted to fixed test beneficiary. Not random winner selection or ticket accounting. |
| Winner lifecycle prototype | Run 42563327635: 36 scenarios on each local instance plus 2 chain guards | Mock coordinator/token. 74 executions, not 74 unique cases or live-chain tests. |
| Historical provider proofs and ownership | Run 42566437894: 4 historical samples and 20 rejected alterations | Provider SDK replay plus separately checked chain context; not independently authored crypto, future liveness or application consumer fulfillment. |
| Actual-coordinator consumer integration | Run 42611914241: 20 scenarios in each local coordinator mode | Pinned actual provider source/verifiers with public test key and historical beacon signatures; generic local EVM, explicit Robinhood ArbSys shim. |
| Operating-fee budget/refund-credit component | Run 42614410076: 35 categories per mode, 70 executions | Actual provider-source local tests; payer/round credits, caps and conservation. Separate component, not integrated ticket-to-prize application or native-Arc accounting. |

Earlier suites were not rerun as part of the fee-module workflow. The fee report and artifacts preserve an initial 33-pass/2-failure run per mode and the corrected plain-value assertion helper; contract code was unchanged.

## Integration targets already identified

Historical observations require fresh validation before public authorization:

| Target | Robinhood | Arc |
|---|---|---|
| Public chain ID | 4663 | 5042 |
| Payment token | USDG `0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168` | USDC ERC-20 view `0x3600000000000000000000000000000000000000` |
| Payment decimals | 6 | 6; native USDC uses 18-decimal units over the same underlying balance |
| MSS2 | `0x091F0c7e675A787A4018eb47c30BeD3FA2013B65`, 18 decimals | Same recorded address and decimals on its own chain |
| Stake gift entry point | Token `airdropStake(address[],uint256[])` | Same interface, chain-local state |

The gift interface needs no separate MSS2 spending allowance; the sender still signs. The observed minimum offered gift is 1 MSS2 and the observed mutable stake cap is 25,000,000 MSS2 per wallet per chain. Partial or zero capacity can produce less than the requested stake credit. Independent repeat gift transactions can pay twice. Verify actual stake-credit evidence and implement duplicate-payout controls; do not equate a successful transaction with a fully paid prize.

The staking proxy was `0x1fD4AD5873443953DBbF403e541f546E829be489`, with observed implementation `0xbe851D5ED304628Dc570A7A0bEB23Bb7ca5f587B`. Source-record/runtime limitations, including the absent Arc proxy verification entry and checked identical runtime, remain in the staking report and earlier snapshot.

## Provider review status

The Robinhood coordinator owner mismatch is explained by a checked October 21, 2026 on-chain transfer at block 94,329,459. The manifest still lists the former owner; its value was not silently replaced to manufacture a passing comparison. Effective upgrade authority, owner implementation/modules/guards and request-specific authority remain review items.

Four historical samples passed the implemented proof and chain-context checks. The consumer and fee-module local suites separately exercise the actual pinned provider code. None proves future live fulfillment, independence of controllers, current bytecode equivalence or absence of upgrades/withholding risk. Provider approval remains false.

## Next scoped implementation

**Connect the fee component to one locally tested draw lifecycle and implement a per-chain/token/round funding ledger.**

The new component takes an explicitly authorized payer, maximum and input digest; pays the same-transaction fee; credits unused funding; and reconciles service refunds through per-request accounts. It cannot spend another round's credit. Its controller is a fixture, not the actual draw. Do not describe the module as already fixing the original draw interface.

The combined controller must derive the digest from locked paid tickets and prize information, authorize one request path, match the accepted result to that exact round, and prevent alternate requests through the older permissionless exact-fee entry point. Exercise same-result delivery recovery and terminal expiry across the combined system. Test native-USDC isolation with Arc's dedicated execution model; the generic local fee suite does not supply that evidence.

The accounting layer must distinguish ticket receipts, developer allocation, prize purchase budget, confirmed liquid MSS2 acquired, winner liabilities, actual stake credit and participant refunds. Keep operating funds and existing arcade obligations separate. Use explicit parameters and unresolved gates rather than inventing prices, percentages or destinations.

The provider's service-fee refund is not a participant ticket refund; transaction gas remains separate. An external reserve wallet is not contract-enforced escrow. Above-cap fees currently stop a request; safe pre-request amendment/cancellation policy has not been selected and must not permit duplicate draw identities or rerolls.

## Open feasibility and release checks

1. Revalidate current deployments, effective provider/owner authority, fee behavior and availability assumptions before a separately approved public test. Local component milestones do not complete Task 3.
2. Integrate the fee/draw lifecycle; implement real ticket/prize/developer accounting, swap receipt reconciliation, event uniqueness and dropped/replaced/reorganized transaction handling.
3. Protect shared-reserve liabilities and confirm exact stake credit; prevent duplicate payouts. Set backed participant-refund and stake-cap shortfall rules without replacing the winner.
4. Verify real reserve control, signing, wallet/network UX and funding. Complete the already-bound nonzero-referrer fixture; review mutable token/router/pool permissions, liquidity and trade limits.
5. Approve economics, eligibility, operating payer/limits, cutoff, receivers and release sequence. Run whole-application/arcade regressions, independent security and applicable legal launch review; verify the intended domain before paid entry.

## Detailed records

- [Metadata observations](evidence/daily-draw-metadata-2026-11-09.json)
- [Initial progress and corrections](mss2-daily-draw-progress-2026-11-09.md)
- [Stake interface](mss2-daily-draw-staking-interface.md)
- [Purchase integration](mss2-daily-draw-purchase-integration.md) and [purchase evidence](evidence/daily-draw-swap-2026-11-09.json)
- [Winner prototype](mss2-daily-draw-winner-selection.md) and [prototype/provider snapshot](evidence/daily-draw-winner-2026-11-09.json)
- [Provider historical review](mss2-daily-draw-provider-review.md) and [historical evidence](evidence/daily-draw-provider-history-2026-11-09.json)
- [Actual-coordinator integration](mss2-daily-draw-coordinator-integration.md) and [results](evidence/daily-draw-coordinator-integration-2026-11-09.json)
- [Operating-fee component](mss2-daily-draw-operating-fees.md) and [accepted evidence](evidence/daily-draw-operating-fees-2026-11-09.json)

No main merge, existing application/arcade change, public deployment, wallet approval, real purchase, prize payout or production-setting change is authorized by these research results. The draft PR remains for review, not release.
