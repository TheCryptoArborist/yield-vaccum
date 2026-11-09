# MSS2 Daily Draw — current two-chain readiness index

Updated 2026-11-09 UTC. Tracker: TheCryptoArborist/yield-vaccum #53. Draft review PR: #54.
Research branch: `research/mss2-daily-draw-readiness`.
Application/main baseline: `c94d6a0f8a7884d818c907b86749eda1ff068237`.

**Latest completed milestone: the new integrated local controller links paid fixture-ticket records, per-round allocations, measured fixture prize purchases, the capped fee module and immutable winner selection. Run 42617426146 passed 43 integrated categories and 35 unchanged fee regressions in EACH local provider-code mode. That is 86 integrated executions plus 70 regressions, not live-network tests or a complete paid utility. The website, real-router integration and actual staking-payout reconciliation remain unconnected. Task 3 and production/provider approval remain open.**

Start with [the integrated-ledger report](mss2-daily-draw-integrated-ledger.md) and [normalized evidence](evidence/daily-draw-integrated-2026-11-09.json). The prior fee-component index remains preserved at commit `392fbec8946c7f8d72ea615df223409b269cf903`; the earlier full purchase/staking snapshot is at commit `0a4d782abb95241e92163fadb520ac1862d319d9`. Detailed reports retain their failures, source revisions and limitations.

## Confirmed product direction

- Work stays in Yield Vacuum, not the MintStakeShare GitHub. Intended host: `www.yieldvaccum.com`; domain/TLS/deployment mapping still needs release verification.
- Separate daily chain-local draws, tickets and prizes; one winner per participating chain and equal chance per ticket. No first-version referral, streak or stake-size weighting.
- USDG tickets on Robinhood; USDC tickets on Arc. A published portion buys LIQUID MSS2 through ordinary Buy, not Buy & Stake. A separate portion is allocated to the developer.
- Owner-signed prize delivery adds directly to the winner's MSS2 stake from `0xE8b63245DdDAB73C7A276818942341D8Cfb7D7A7`. Administrator sign-in ending 8789 is not spending authority.
- Freeze ticket ownership and outcome-relevant inputs; one accepted request/result per round; no manually selected winner, reopened entries, replacement outcome or failure-driven redraw.
- Keep existing arcade funds, allocation, theme and application behavior unchanged. A shared-wallet ledger is not escrow or permission to spend arcade rewards.

Ticket price, revenue percentages, payment/developer receivers, operating payer and limits, timing, eligibility, purchase timing, launch sequence, backed participant refunds and stake-cap shortfall policy remain unresolved. Test values, including the integrated suite's 20% developer fixture, do not settle those decisions. D20DAO remains a candidate, not a production-approved dependency.

## Evidence ledger — retain separate scopes

| Milestone | Accepted evidence | Scope |
|---|---|---|
| Live metadata | 42554165659 and 42554430282 | Payment/MSS2 reads and checker tests; the latter's initial explorer lookup failed, subsequently addressed. |
| Direct-to-stake delivery | 42556404173: 16 scenarios per chain | Isolated forks and simulated sender, not real signing control or application payout deduplication. |
| Liquid purchase and combined gift | 42558269951: 7 scenarios per chain | USDG -> WETH -> MSS2 on Robinhood; USDC -> MSS2 on Arc; fixed test beneficiary, not random winner accounting. |
| Mock winner prototype | 42563327635: 36 categories twice plus 2 chain guards | Mock coordinator/token; 74 local executions. |
| Historical provider proofs/ownership | 42566437894: 4 historical samples and 20 rejected alterations | Provider SDK replay plus separately checked historical chain evidence; not independent crypto/audit or future liveness. |
| Actual coordinator source integration | 42611914241: 20 categories per mode | Local proof verification, callbacks and recovery using public fixture key/signatures; not a live keeper request. |
| Standalone fee module | 42614410076: 35 categories per mode | Capped service spending, payer credits, per-request refund accounts; no original draw wiring. |
| Integrated controller and initial funding ledger | 42617426146: 43 integrated + 35 fee regressions per mode | New controller owns the unchanged fee module, binds actual ticket/funding records, selects the winner and retains award liability. Tokens/purchase adapter are FAKE fixtures; no actual stake payout or native Arc test. |

Only the fee regressions were rerun with the latest integrated suite. Do not combine unlike historical totals into a security certification.

## What is now linked, and what is not

The integrated local path is tickets -> close/allocate -> measured fixture purchase -> lock inputs -> capped fee request -> stored authenticated result -> ticket owner -> AwardPending. It does not inherit the old exact-fee prototype; there is no alternative requestDraw or direct callback entry on the new controller. Anyone can synchronize the linked stored result, but cannot supply a word or winner.

Ticket receipts, developer accrual, unspent purchase budget, measured acquired tokens, outstanding award and operating credits have distinct records. The controller never sweeps operating funds, withdraws developer funds or marks an award paid. Service expiry leaves acquired tokens and remaining payment obligations recorded, rather than inventing a participant refund.

The initial reserve balance is excluded from prize acquisition; aggregate backing is checked before new purchases/authorizations. This does NOT reserve external wallet funds until payout or inventory all later arcade liabilities. Funds may leave the wallet after authorization. An accepted result is still mapped to its original winner even when reserveCoverage reports a shortfall.

The fixed-rate fixture purchase ABI is not Topaz's production interface. The new combined suite does not supersede or repeat the earlier live-contract fork purchase evidence. Native Arc shared USDC/token accounting requires its dedicated engine, not generic local ETH-like balances.

## Existing integration targets

Historical observations, requiring fresh validation before public authorization: chain IDs Robinhood 4663 and Arc 5042; USDG on Robinhood `0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168`; Arc USDC ERC-20 view `0x3600000000000000000000000000000000000000`; observed payment decimals 6. Arc's native view uses 18-decimal units over the same underlying balance, not a second asset balance.

Observed MSS2 token on each chain: `0x091F0c7e675A787A4018eb47c30BeD3FA2013B65`, 18 decimals. Stake gift: token `airdropStake(address[],uint256[])`, without a separate MSS2 allowance, but with sender authorization. Historical minimum offered gift: 1 MSS2; mutable cap: 25,000,000 MSS2 per wallet/chain. Partial or zero credit may accompany a successful transaction. Repeated independent gift transactions may pay twice. Detailed source/runtime qualifications and exact event/receipt requirements remain in the staking report.

## Provider review

The Robinhood manifest/current-owner mismatch was explained by the checked October 21, 2026 transfer at block 94,329,459; the manifest still lists the former owner. Four historical samples passed implemented proof and chain-context checks. Local source integration now additionally links fees to the drawing controller. None establishes future fulfillment, complete upgrade/module/guard authority, live deployment equivalence or an independent audit.

## Next scoped milestone and release gates

1. Replace the fixed-rate purchase fixture with the verified chain-specific purchase adapters in isolated forks. Recheck source/runtime, allowances, minimum output, exact stablecoin debit and liquid MSS2 delivery. Test native Arc shared-balance isolation with its dedicated engine.
2. Connect the outstanding award to owner-signed stake delivery and a receipt/evidence reconciler. Preserve the same winner and unpaid remainder; require exact stake credit and prevent duplicate payment or duplicate event attribution. Do not add a trust-based mark-paid shortcut.
3. Resolve external reserve custody/backing, the authorization-to-request funding interval, complete arcade obligations and backed ticket-refund/stake-cap policies. A service-fee refund does not reimburse ticket revenue converted to MSS2.
4. Verify real reserve control and wallet/network UX, provider governance/liveness assumptions and mutable token/router behavior. Complete the bound-referrer fixture and comprehensive application/arcade regressions.
5. Approve economics, eligibility, schedule, destinations and release sequence; obtain independent security and applicable legal release review; verify the intended domain. Keep paid entries disabled until approval.

## Detailed records

- [Metadata](evidence/daily-draw-metadata-2026-11-09.json) and [initial progress](mss2-daily-draw-progress-2026-11-09.md)
- [Stake interface and evidence requirements](mss2-daily-draw-staking-interface.md)
- [Purchase integration](mss2-daily-draw-purchase-integration.md) and [purchase evidence](evidence/daily-draw-swap-2026-11-09.json)
- [Winner prototype](mss2-daily-draw-winner-selection.md) and [prototype/provider snapshot](evidence/daily-draw-winner-2026-11-09.json)
- [Provider historical review](mss2-daily-draw-provider-review.md) and [history evidence](evidence/daily-draw-provider-history-2026-11-09.json)
- [Coordinator integration](mss2-daily-draw-coordinator-integration.md) and [coordinator evidence](evidence/daily-draw-coordinator-integration-2026-11-09.json)
- [Operating fees](mss2-daily-draw-operating-fees.md) and [fee evidence](evidence/daily-draw-operating-fees-2026-11-09.json)
- [Integrated ledger](mss2-daily-draw-integrated-ledger.md) and [integrated evidence](evidence/daily-draw-integrated-2026-11-09.json)

No main merge, existing application/arcade/dependency change, public deployment, real approval/purchase/airdrop or production-setting change is authorized by these research results. Draft PR #54 remains review only.
