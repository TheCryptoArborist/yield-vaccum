# MSS2 Daily Draw — two-chain readiness record

Updated 2026-11-09 UTC (November 8 in America/Chicago).
Tracker: TheCryptoArborist/yield-vaccum #53.
Research branch: `research/mss2-daily-draw-readiness`.
Application/main baseline: `c94d6a0f8a7884d818c907b86749eda1ff068237`.

**Current result: the deployed airdrop interface is identified, its source/runtime links checked, and 16 isolated staking scenarios pass on each chain (32 scenario executions). Stablecoin purchase routes, randomness and the complete application are NOT yet verified. Task 3 remains open; neither chain is approved for paid draws.**

## Confirmed requirements

- USDG tickets on Robinhood; USDC tickets on Arc.
- A published revenue allocation purchases MSS2; a separate portion is developer revenue. Prices, percentages, fee receivers and timing are not approved.
- **Regular Buy produces liquid MSS2. Buy & Stake is not used for prize funding. This decision is settled.** The later airdrop credits the winner's permanent MSS2 stake.
- Prize sender: `0xE8b63245DdDAB73C7A276818942341D8Cfb7D7A7`. Administrator sign-in ending 8789 remains separate. No new ticket-payment or developer-fee receiver is implied.
- Existing arcade funds/rules remain unchanged. Draw funds and liabilities require separate chain/round records; a ledger is not escrow.
- Work remains in Yield Vacuum. No MintStakeShare GitHub access or modifications.
- Requested host: `www.yieldvaccum.com`; domain/origin migration is outside this work.

Separate chain-local rounds remain a recommendation, not an approved change to winner count. Eligibility, capacity/shortfall policy, timing, economics and launch sequence remain unresolved. Technical test results do not settle these policies.

## Accepted staking rehearsal

GitHub Actions run **42556404173**, job **128963005036**, workflow commit `2423dcdcd24e6b7d37110a9598f2903da0ed943e`, overall **success**.

Pinned test script: commit `cd5e9ac0c404d8c3e66541e891b1afa22ac07622`, blob `3f14c88d69d94485680476788dae5692d11f86fe`.

| Check | Robinhood | Arc |
|---|---|---|
| Chain ID | 4663 | 5042 |
| Pinning block | `0x68a9096` | `0x1ce1b5e` |
| Block hash | `0x4e6d2c6256732c65f88da631b1027f13325758f6f662c24e8b9d6939707df931` | `0xa119a5de25ece99760b2b15ce4f26aecf1613e9eb635ccd206e41624aefde4e0` |
| Real RPC `eth_call`, 1 MSS2 offered | 1 MSS2 accepted; no persisted state | 1 MSS2 accepted; no persisted state |
| Isolated staking scenarios | 16 passed / 0 failed | 16 passed / 0 failed |
| Mainnet transactions submitted | 0 | 0 |
| Upstream write/sign methods rejected in gateway checks | 5 / 5 | 5 / 5 |

These were latest-block observations with hash rechecks, not asserted finalized anchors. The script queries live data but executes state-changing tests only in a local in-process Hardhat fork.

### What the scenarios demonstrate

| Scenario group | Observed result on both chains |
|---|---|
| First stake | 1 MSS2 leaves the simulated reserve, 1 MSS2 reaches staking and the beneficiary's recorded stake grows by 1 MSS2; the beneficiary receives zero liquid tokens. Exact `StakeGifted` and token `Transfer` evidence agrees. No token approval transaction is performed. |
| Existing stake | A second gift adds the exact amount, preserves the existing accrual window and checkpoints earned rewards. The unset referrer and aggregate referral-credit total remain unchanged. |
| Repeat submission | Two independent valid transactions with identical gift arguments credit twice. This confirms a required application-level duplicate-payout safeguard; it is NOT proof that such a safeguard has already been implemented. |
| Partial capacity | Synthetic 0.5-MSS2 capacity and a 1-MSS2 offer credit 0.5 MSS2 and retain 0.5 with the sender. The full award is not paid. |
| Zero capacity | Synthetic capped recipient produces a successful receipt but no stake credit, gift event or debit. Receipt success alone must not mark an award paid. |
| Invalid requests | Below-minimum offer, self, zero, token/proxy/vault recipient, empty/mismatched arrays and duplicate recipients return the expected contract error. Checked application/token/staking state remains unchanged. |
| Insufficient tokens | The read-only simulation returns `ERC20InsufficientBalance`; checked state remains unchanged. |
| Wrong entry contract | Calling staking `gift` directly from the sender returns `OnlyToken`; use token `airdropStake` instead. |

Current observed stake cap: 25,000,000 MSS2 per wallet per chain. Minimum offered gift: 1 MSS2. Re-read mutable settings before payout. The test amount is not an approved prize size.

### Exact source and runtime evidence

The token entry point is `airdropStake(address[],uint256[]) returns (uint256 accepted)` on `0x091F0c7e675A787A4018eb47c30BeD3FA2013B65`. Token `staking()` returned proxy `0x1fD4AD5873443953DBbF403e541f546E829be489`; its ERC-1967 implementation slot returned `0xbe851D5ED304628Dc570A7A0bEB23Bb7ca5f587B` on each chain.

Token and active implementation source records report exact runtime matches on both networks. Their recorded runtime was compared byte-for-byte with pinned live code. Robinhood proxy source is also exact-verified. Arc's proxy record is absent (HTTP 404); its actual runtime matches the verified Robinhood proxy byte-for-byte, with Arc's own implementation slot/code separately checked. This is not an Arc proxy verification-entry claim or an independent recompilation/audit.

Detailed source provenance, runtime fingerprints and payout acceptance requirements: [staking integration note](mss2-daily-draw-staking-interface.md).

### Simulation limitations and corrected test failures

- Native gas balances and reserve impersonation exist only in the fork; no private key was used and no ownership/signing authority was proven.
- Capacity boundary cases use explicit synthetic local storage fixtures based on verified storage layout, not real capped winners.
- Robinhood's fork model defaults absent `blobGasUsed` and `excessBlobGas` header fields to zero so the local Cancun EVM can execute non-blob staking calls. Arc required no such defaults in the accepted run. Mainnet code, anchor and `eth_call` checks were unmodified. This is not network-consensus, blob-transaction or system-token swap validation.
- The first fork run 42555694497 failed before scenario tests: missing blob-header compatibility on Robinhood and HTTP 429 on Arc. Read pacing, caching and bounded Retry-After handling were added.
- Run 42555974429 passed the five credit/boundary cases and the caller-permission case on each chain but failed ten unchanged-state assertions because decoded ethers `Result` proxies were compared as objects. The final script converts stake tuples to plain arrays, adds a comparison fixture and retains every state-value assertion. The final run, not the earlier runs, supplies the 16/16 results.
- Tests cover an unset referrer; an already-bound nonzero-referrer fixture, account switching, replacement/reorg handling and the eventual application's duplicate-payout controls still need explicit tests.
- Tools are pinned and installed in an isolated runner temporary directory with lifecycle scripts disabled. No application dependency or lockfile changed. This is not a dependency-security audit.

## Earlier completed metadata work

Both chains returned payment-token symbols/decimals and MSS2 metadata. USDG on Robinhood is `0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168`, observed 6 decimals. Arc USDC is `0x3600000000000000000000000000000000000000`, observed 6 ERC-20 decimals. MSS2 has 18 decimals on each chain. Arc native gas and its ERC-20 interface must not be counted as separate balances.

Historical runs: 42554165659 succeeded with metadata and 17 checker fixtures. Run 42554430282 passed 23 checker/source-reader fixtures and metadata but failed the old explorer lookup. That ABI-retrieval gap is now superseded by the Sourcify results above. These earlier 23 fixtures are not being represented as newly rerun application tests.

Original normalized metadata: [evidence](evidence/daily-draw-metadata-2026-11-09.json). Earlier progress: [historical report](mss2-daily-draw-progress-2026-11-09.md).

## Remaining Task 3 and release acceptance

1. **Next technical milestone:** verify and rehearse the complete same-chain USDG-to-liquid-MSS2 route on Robinhood and USDC-to-liquid-MSS2 route on Arc. Check actual spender/router, all hops, input/output units, recipient, minimum output, deadline and fees. Preserve ordinary Buy mode and prohibit unapproved bridging. No stablecoin swap was simulated in the staking run.
2. Verify the randomness deployment and immutable ticket-owner/result mapping on each enabled network. No provider or fully verified draw is claimed yet.
3. Implement and test the future award ledger and receipt verifier, including concurrency, exact credited amounts, partial obligations, duplicate transaction reuse, dropped/replaced transactions and reorgs. The verified protocol accepts repeated independent gifts.
4. Verify real control/signing capability of the selected sender; simulations do not do this. Resolve operator custody, capacity/shortfall rules, prices, revenue split, eligibility and operating procedures before accepting ticket payments.
5. Complete full application regression/end-to-end tests, independent security review and applicable launch approvals.

No application routes, existing arcade contracts, wallet permissions, main branch, production configuration, purchases or real airdrops were changed. Task 3 remains open; the staking interface and initial two-chain rehearsal portion is now evidenced.

## Primary references

- https://github.com/TheCryptoArborist/yield-vaccum/actions/runs/42556404173
- https://github.com/TheCryptoArborist/yield-vaccum/actions/runs/42555974429
- https://github.com/TheCryptoArborist/yield-vaccum/actions/runs/42555694497
- https://github.com/TheCryptoArborist/yield-vaccum/actions/runs/42555135706
- https://sourcify.dev/server/v2/contract/4663/0x091F0c7e675A787A4018eb47c30BeD3FA2013B65?fields=all
- https://sourcify.dev/server/v2/contract/5042/0x091F0c7e675A787A4018eb47c30BeD3FA2013B65?fields=all
- https://www.mintstakeshare.com/docs/contracts
- https://www.mintstakeshare.com/docs/team-airdrops
- https://www.mintstakeshare.com/docs/buying-and-selling
