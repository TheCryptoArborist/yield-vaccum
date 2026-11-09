# MSS2 Daily Draw — two-chain readiness record

Updated 2026-11-09 UTC (November 8 in America/Chicago).
Tracker: TheCryptoArborist/yield-vaccum #53.
Research branch: `research/mss2-daily-draw-readiness`.
Application/main baseline: `c94d6a0f8a7884d818c907b86749eda1ff068237`.

**Current result: the liquid-purchase and purchase-to-stake rehearsal passed 7 scenarios on Robinhood and 7 on Arc. The earlier staking-only suite passed 16 scenarios on each chain. These are scoped, isolated fork tests, not a complete Daily Draw application or release approval. Task 3 stays open; verifiable winner selection is the next technical milestone. No real funds moved.**

## Confirmed requirements

- Tickets use USDG on Robinhood and USDC on Arc.
- A published portion of ticket revenue purchases MSS2; a separate portion is developer revenue. Prices, percentages, receiving addresses, fee denomination and timing remain undecided.
- Ordinary Buy delivers liquid MSS2. Buy & Stake is not used for prize funding; the later airdrop credits the selected winner's permanent stake.
- Intended prize sender: `0xE8b63245DdDAB73C7A276818942341D8Cfb7D7A7`. Administrator login ending 8789 remains separate. The sender selection does not approve ticket-payment/developer-fee receivers or authorize wallet spending.
- Existing arcade funds and rules remain unchanged. Draw liabilities require separate per-chain/per-round accounting; a wallet ledger is not escrow.
- Work stays in Yield Vacuum. No MintStakeShare GitHub access or modifications.
- Requested host: `www.yieldvaccum.com`; domain and origin migration are outside this investigation.

Separate chain-local rounds remain a recommendation, not an approved winner-count change. Eligibility, capacity/shortfall rules, cutoff, buy timing, custody, economics and launch sequence remain open. Successful tests do not approve these policies.

## Accepted liquid-purchase and combined payout rehearsal

Completed GitHub Actions run **42558269951**, job **128968762734**, overall **success**.
Workflow commit: `a012cb84be4d865100afe9d21df25d04665d2f76`.
Pinned script commit: `3912142e347b576704f5a37cebc2b0b12df093f4`, blob `5223d49fad11e0e5e314b4c47ff1e9d683e07e0c`.

| Check | Robinhood | Arc |
|---|---|---|
| Chain ID | 4663 | 5042 |
| Purchase path | USDG -> WETH -> liquid MSS2 | USDC -> liquid MSS2 |
| Cases | 7 passed / 0 failed | 7 passed / 0 failed |
| Successful local purchases | 1, 10 and 100 USDG | 1, 10 and 100 USDC |
| Minimum-output protection | Rejected local call below required output | Same |
| Expired transaction | Rejected; fresh-deadline positive control passed | Same |
| No allowance | Rejected local call | Same |
| Bought tokens then direct stake gift | Exact purchased amount credited to test beneficiary's stake | Same |
| Real-chain transactions | 0 | 0 |

The purchase tests verified the actual liquid MSS2 balance increase and Transfer evidence, unchanged purchaser stake, expected stablecoin debit, positive minimum output and zero remaining exact-size allowance after the swap. On Arc, payment and gas were reconciled against the same native-USDC balance and its six-decimal ERC-20 view; they were not double-counted.

The combined test used a fixed test beneficiary, NOT a random winner. It spent 1 unit of the stablecoin, purchased liquid MSS2 into the designated reserve and airdropped exactly those newly acquired tokens. The beneficiary's recorded stake rose by that amount, their liquid MSS2 balance did not rise, the StakeGifted event agreed, and the reserve's pre-existing liquid MSS2 was preserved. This demonstrates this controlled sequence; it does not implement an award ledger or stop the real wallet owner spending other reserve allocations.

The 1/10/100 amounts, 1% test output margin and 600-second test deadline are fixtures, not approved ticket prices or production policy. Historical fork outputs are not advertised prices or prize values.

### Network-specific test models

Robinhood used a pinned-state Hardhat 2.26.3 EVM fork. The local model defaults absent blobGasUsed/excessBlobGas header fields to zero. For test funding only, synthetic local ETH was wrapped through the verified WETH proxy/implementation and swapped for actual USDG on the fork. That setup changes the local USDG/WETH pool, so each purchase was requoted in its fixture state. It is not a real swap or an additional participant action required by the intended USDG flow. No token code was mocked and no stablecoin storage was overwritten.

Arc used checksum-pinned Circle Arc Foundry v0.8.0-4 and asserted Arc execution mode. Synthetic local native USDC also funded its ERC-20 view. The test used real forked token/pool contracts and Arc execution semantics, not a mock USDC. Neither simulator validates real network consensus, current production gas charges, finality, competing transactions or adverse market conditions.

All real-chain requests passed through an explicit read-only gateway. Five signing/transaction methods were tested for rejection per chain. No private keys or production credentials were used. Source records and runtimes were checked at pinned blocks with hash rechecks; these are not asserted finalized blocks.

### Purchase provenance and corrections

The checked Topaz router/quoter/factory/pool implementation source records report Sourcify `match`, not `exact_match`. Their recorded on-chain bytecode was compared with live runtime. This preserves the distinction between functional compilation equivalence excluding metadata and exact metadata matches; no independent recompilation or security audit is claimed.

Early discovery run 42557126218 stopped because the checker demanded exact metadata matches. The corrected discovery records the actual match type and still requires identical live/runtime-record code. Discovery run 42557245112 returned both routes and live quotes.

Purchase run 42557578365 failed script syntax validation before any scenario. Run 42557759189 stopped Robinhood fixture setup because it used only the WETH proxy ABI, and Arc passed 6 scenarios while its deadline-rejection test expected an incorrect literal error string. Source inspection run 42558048847 identified the proxy ABI and bare deadline require. The final script resolves/checks WETH's implementation and pairs an expired call with an otherwise identical successful fresh-deadline control. All state/output assertions remain. Only the final run provides the accepted 7/7 results.

Full route/permission/accounting requirements: [purchase integration](mss2-daily-draw-purchase-integration.md).
Normalized accepted output, anchors, amounts and limitations: [swap evidence](evidence/daily-draw-swap-2026-11-09.json).
Original completed run: https://github.com/TheCryptoArborist/yield-vaccum/actions/runs/42558269951

## Earlier accepted staking rehearsal

Run **42556404173**, job **128963005036**, overall success. Workflow commit `2423dcdcd24e6b7d37110a9598f2903da0ed943e`; script commit `cd5e9ac0c404d8c3e66541e891b1afa22ac07622`, blob `3f14c88d69d94485680476788dae5692d11f86fe`.

**16 passed / 0 failed on each chain**, with zero real-chain transactions. Cases cover first and existing stakes, exact token debit/credit/events, unchanged existing accrual window, no referral credit, below-minimum and invalid-recipient rejection, insufficient funding, wrong entry contract, partial and zero capacity, and repeat calls.

The entry point is `airdropStake(address[],uint256[]) returns (uint256 accepted)` on MSS2 token `0x091F0c7e675A787A4018eb47c30BeD3FA2013B65`. It calls staking proxy `0x1fD4AD5873443953DBbF403e541f546E829be489`; its observed implementation was `0xbe851D5ED304628Dc570A7A0bEB23Bb7ca5f587B` on each chain. This payout needs no separate ERC-20 allowance; the sender still authorizes the transaction. Ticket and purchase approvals are separate.

Token/implementation records report exact runtime matches on both chains, checked against live bytecode. Arc proxy source lookup was absent (404); its actual runtime matched the verified Robinhood proxy byte-for-byte, with Arc's own implementation slot/code checked separately. This is not a claim of an Arc proxy verification entry or audit.

Minimum offered gift observed: 1 MSS2. Stake cap observed: 25,000,000 MSS2 per wallet per chain, mutable by protocol owner. Partial capacity credits less; zero capacity can yield a successful receipt but no prize credit. A gift does not reset an existing accrual window. Repeating valid independent gift calls pays twice: application deduplication is essential and not implemented yet.

Capacity cases used synthetic local storage fixtures. The original suite's referrer was unset; a dedicated already-bound nonzero-referrer fixture remains needed. Prior harness failures, simulator adjustments and state comparisons are preserved in the pre-purchase readiness record at commit `dbe1f9cb8147807e956920467b70cc0d9804a449` and run history. Detailed interface and required receipt evidence: [staking integration](mss2-daily-draw-staking-interface.md).

## Earlier metadata evidence

Payment tokens return 6 decimals: USDG on Robinhood `0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168`; USDC on Arc `0x3600000000000000000000000000000000000000`. MSS2 returns 18 decimals on both. The initial metadata run 42554165659 passed with 17 checker fixtures. Run 42554430282 passed 23 checker/source-reader fixtures and live metadata but failed the old explorer lookup, later resolved through Sourcify. Those 23 fixtures were not newly rerun as application regression tests in the purchase workflow.

Historical reports: [metadata](evidence/daily-draw-metadata-2026-11-09.json), [progress](mss2-daily-draw-progress-2026-11-09.md).

## Remaining Task 3 and release gates

1. **Next technical milestone: verifiable winner selection.** Identify and verify a compatible randomness mechanism for each enabled network; lock ticket ownership and outcome-relevant inputs before randomness, enforce one binding result and prohibit rerolls. No randomness provider or draw implementation is approved yet.
2. Build and test ticket collection and the separate per-chain/per-round accounting, refund and award ledger. Enforce exact allocations, confirmed receipt verification, concurrency controls, transaction/event uniqueness, and reconciliation of dropped/replaced/reorganized transactions. A passing swap/payout sequence does not provide these controls.
3. Review token pause/freeze/upgrade behavior, mutable routers/pools, liquidity/trade-size limits, fresh quoting, adverse execution and operating/gas funding. Recheck runtime/implementation settings before any future authorization and stop for review on unapproved changes.
4. Verify real sender control/signing capability, wallet UX and account/network switching. Fork impersonation proves none of these. Complete the bound-referrer test and capacity/shortfall policy, including unpaid residuals below the minimum gift.
5. Resolve draw structure, prices/splits, destinations, fee treatment, eligibility, timings, custody and original-token refund policy. Preserve existing arcade allocations. Complete whole-application tests, independent security review and applicable launch approval before paid entry.

No application routes, existing arcade contracts, app dependency/lockfiles, wallet permissions, main branch or production settings were changed. Research scripts/workflows and documentation only. No real stablecoin approvals, purchases, gifts or deployments occurred. Task 3 remains open; the initial two-chain purchase and payout feasibility portions now have execution evidence.
