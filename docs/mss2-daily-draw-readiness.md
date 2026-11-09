# MSS2 Daily Draw — current two-chain readiness index

Updated 2026-11-09 UTC. Tracker: TheCryptoArborist/yield-vaccum #53. Draft review PR: #54.
Research branch: `research/mss2-daily-draw-readiness`.
Application/main baseline: `c94d6a0f8a7884d818c907b86749eda1ff068237`.

**Latest completed milestone: actual market routes now run through the unchanged integrated draw in private forks, followed by real forked MSS2 stake gifts and receipt reconciliation. Accepted run 42621984190 passed 16 new market-ledger/receipt categories plus 7 retained swap cases per fork: 23 passed / 0 failed on each. Arc uses its dedicated native-USDC engine. This suite uses a deterministic mock coordinator; it is not a single genuine-provider end-to-end test. Receipt records are in-memory, and on-chain awards remain pending. Task 3 and production/provider approval remain open.**

Start with [the market-ledger report](mss2-daily-draw-market-ledger.md) and [normalized evidence](evidence/daily-draw-market-ledger-2026-11-09.json). The preceding index is preserved at commit `37b4a6cd0fff6dbdec0ec2815426b6bfdb3dbecb`. Detailed reports retain their failures, source revisions and limitations.

## Confirmed product direction

- Work stays in Yield Vacuum, not the MintStakeShare GitHub. Intended host: `www.yieldvaccum.com`; domain/TLS/deployment mapping still needs release verification.
- Separate daily chain-local draws, tickets and prizes; one winner per participating chain and equal chance per ticket. No first-version referral, streak or stake-size weighting.
- USDG tickets on Robinhood; USDC tickets on Arc. A published portion buys LIQUID MSS2 through ordinary Buy, not Buy & Stake. A separate portion is allocated to the developer.
- Owner-signed prize delivery adds directly to the winner's MSS2 stake from `0xE8b63245DdDAB73C7A276818942341D8Cfb7D7A7`. Administrator sign-in ending 8789 is not spending authority.
- Freeze ticket ownership and outcome-relevant inputs; one accepted request/result per round; no manual winner, reopened entries, replacement outcome or failure-driven redraw.
- Keep existing arcade funds, allocation, theme and application behavior unchanged. Shared-wallet accounting is not escrow or permission to spend arcade rewards.

Ticket price, revenue percentages, payment/developer receivers, operating payer/limits, precise timing, eligibility, purchase timing, launch sequence, backed participant refunds and stake-cap shortfall policy remain unresolved. Fixture percentages/amounts do not settle them. D20DAO remains a candidate, not a production-approved dependency.

## Evidence ledger — retain separate scopes

| Milestone | Accepted evidence | Scope |
|---|---|---|
| Live metadata | 42554165659 and 42554430282 | Payment/MSS2 reads and checker tests; the latter's original explorer lookup failed, subsequently addressed. |
| Direct-to-stake delivery | 42556404173: 16 cases per chain | Isolated forks/simulated sender; not real wallet control or application deduplication. |
| Liquid purchase and gift | 42558269951: 7 cases per chain | Real forked market/staking contracts, fixed beneficiary. |
| Mock winner prototype | 42563327635: 36 categories twice plus 2 chain guards | Mock coordinator/token; 74 local executions. |
| Historical provider proofs/ownership | 42566437894: 4 samples, 20 rejected alterations | SDK replay plus historical chain checks; not independent crypto or future liveness. |
| Actual coordinator source integration | 42611914241: 20 categories per mode | Local verification/callbacks/recovery with public fixture key/signatures, not live keeper. |
| Standalone fee module | 42614410076: 35 categories per mode | Capped fees, payer credits and request-specific refund accounts. |
| Integrated initial ledger | 42617426146: 43 integrated + 35 fee regressions per mode | Actual provider source, but fake payment/prize/purchase contracts. |
| Real market-ledger and stake receipts | 42621984190: 16 new + 7 retained swap categories per fork | Real forked assets/router/staking, dedicated Arc engine, deterministic mock coordinator and in-memory receipt book. On-chain awards remain pending. |

The latest run reexecutes the seven original swap cases. Earlier provider, standalone-fee and 43-case fixture-ledger suites were not rerun in it. Do not sum unlike scopes into a security certification. Twelve altered-receipt checks per fork are nested inside one case.

## Connected behavior and limits

The current fork flow is stablecoin tickets -> allocate -> real Topaz purchase of liquid MSS2 -> lock ticket/funding digest -> capped fee request -> known test result -> selected ticket owner -> owner-impersonated stake gift -> receipt/event reconciliation.

The original controller/fee sources are unchanged. The new fixed-route adapter pins its controller, network route and reserve. It verifies actual input/output and resets exact allowances. Ticket receipts, developer accrual, prize acquisition/obligations and operating credits stay distinct. Arc's real native/token balance relation is exercised in the selected purchase/request path, not assumed from a mock token.

The receipt book locks sender/winner/round/amount/nonce/calldata, checks canonical receipt data and confirmations, and compares StakeGifted with matching MSS2 Transfer evidence. Partial/zero credit preserves the original winner and unpaid remainder. Reprocessing is idempotent; an already assigned transaction cannot satisfy another award in the same book. Pending/unknown attempts block resending, and canonical mismatch requires review.

**The receipt book is not durable production storage.** It does not coordinate workers, survive an unrecorded restart, monitor all replacements or stop independent wallet sends. The current on-chain draw still records AwardPending and the full liability after a locally verified gift. Production needs a reviewed settlement-authority/liability-decrement design; there is no trusted mark-paid shortcut hidden here.

External reserve balances are not escrow. Initial balance quarantine is not a full inventory of later arcade obligations. The reserve can be depleted after authorization. The fixed winner must still be recorded and its unpaid award retained. Randomness-service refunds are not participant refunds.

## Existing integration targets

Revalidate before public authorization: Robinhood chain 4663, USDG `0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168`; Arc chain 5042, USDC ERC-20 view `0x3600000000000000000000000000000000000000`. Payment decimals observed 6; Arc native units use 18 decimals over the same balance.

MSS2: `0x091F0c7e675A787A4018eb47c30BeD3FA2013B65`, 18 decimals on each chain. Gift entry: token `airdropStake(address[],uint256[])`, no separate MSS2 allowance but explicit sender authorization. Historical minimum offer 1 MSS2 and mutable 25,000,000 stake cap. Successful receipts may credit partially or not at all; repeated independent gifts can pay twice. Detailed source/runtime qualifications remain in the staking report.

## Provider review

The former Robinhood owner discrepancy is explained by the checked October 21, 2026 transfer at block 94,329,459; the manifest still lists its old owner. Historical samples and actual-source local callbacks have separate evidence. They do not establish complete upgrade/module/guard authority, current live operational equivalence, future fulfillment or independent audit. The newest fork's deterministic fixture must not be confused with those provider tests.

## Next scoped milestone and release gates

1. Implement durable atomic payout reservations and receipt/event uniqueness, then test restart, concurrency, replacement, uncertain outcomes and reorganization handling. Resolve the on-chain/off-chain settlement authority and liability decrement without fabricating receipt proofs or a trustless guarantee.
2. Exercise the combined market and settlement path with actual-provider behavior under appropriate isolated/separately authorized test conditions. Preserve one result, original winner and exact unpaid remainder.
3. Resolve custody/backing, authorization-to-request timing, complete arcade obligations, backed ticket refunds and cap-shortfall policies. Revalidate token/router/provider implementation and governance behavior.
4. Verify real reserve control, wallet/network UX and bound-referrer behavior; complete comprehensive application/arcade regressions and provider liveness/withholding review.
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
- [Market-ledger/receipts](mss2-daily-draw-market-ledger.md) and [accepted fork evidence](evidence/daily-draw-market-ledger-2026-11-09.json)

No main merge, existing application/arcade/dependency change, public smart-contract deployment, real approval/purchase/airdrop or production-setting change is authorized by these research results. Draft PR #54 remains review only.
