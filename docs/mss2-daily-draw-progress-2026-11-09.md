# MSS2 Daily Draw — live verification progress

Updated 2026-11-09 UTC. Tracker: TheCryptoArborist/yield-vaccum #53.
Branch: `research/mss2-daily-draw-readiness`.

## Purchase mode is settled

Use a regular **Buy** to acquire **liquid MSS2**, not Buy & Stake. The purchased prize tokens remain liquid for the round; the later airdrop adds the award to the selected winner's staked position. Do not reopen this as a product decision or imply liquid buying is unavailable.

Tickets use **USDG on Robinhood** and **USDC on Arc**. The prize sender remains `0xE8b63245DdDAB73C7A276818942341D8Cfb7D7A7`. Existing administrator login ending 8789 and unrelated arcade funding are unchanged. This work does not approve prices, fee percentages, a new USDC/USDG receiver, combined versus separate draws, or any production release.

## Actual new result: live network reads now work

The local container continued to fail hostname resolution, including for GitHub. Instead of repeating local attempts, a bounded read-only GitHub Actions workflow was added on the research branch. It has no repository-token permissions, no configured secrets, no wallet keys, no package installs, no checkout credentials, no schedule, and no transaction/deployment steps. It downloads exact public script revisions and verifies their Git blob hashes before execution.

**Run 42554165659 completed successfully.** Its 17 fixtures passed, and both live metadata snapshots were collected. The script validates each chain ID and anchors/rechecks state reads against a recorded block hash. These are public-RPC observations, not independent verification of all contract behavior.

| Observation | Robinhood | Arc |
|---|---|---|
| Chain ID returned | 4663 | 5042 |
| Ticket token symbol returned | USDG | USDC |
| Ticket token address queried | `0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168` | `0x3600000000000000000000000000000000000000` |
| Ticket token decimals returned | 6 | 6 |
| MSS2 symbol / decimals returned | MSS2 / 18 | MSS2 / 18 |
| First observed block | `0x68a5aad` | `0x1ce1003` |
| Mainnet write transactions | None | None |

The MSS2 address queried on each chain was `0x091F0c7e675A787A4018eb47c30BeD3FA2013B65`. Both token deployments returned code and metadata. The complete normalized first-snapshot fields and scope are recorded in `docs/evidence/daily-draw-metadata-2026-11-09.json`; the original job log is the source of truth.

USDG's six-decimal result is now observed live rather than merely guessed or left unknown. Final acceptance still needs token provenance, proxy/source reconciliation and transfer-behavior review. The research checker intentionally does not convert observations into live-payment enablement.

The reserve address returned empty code in both snapshots. This is **not** proof of control, wallet ownership, or comprehensive account-type verification. No wallet-control signature was requested.

## Expanded run: 23 tests pass; source retrieval remains blocked

Run **42554430282**, commit `456f24fbbfdd08eee652193fe348322de194b962`, repeated the metadata reads successfully and passed **23/23 fixtures**. Six new tests check bounded public-explorer retrieval, allowed hosts, GET-only requests, response limits, malformed responses, and honest verification labels.

Both metadata snapshots agreed with the first run's token symbols, decimals and code fingerprints. This is a repeated observation using the same public RPCs, not an independent-provider confirmation. The later anchors were Robinhood `0x68a6132` and Arc `0x1ce1157`.

The public-explorer discovery step did **not** return usable ABI/source JSON for either chain. That step exited 1, so the expanded workflow's overall result is **failure**, despite passing fixtures and metadata checks. This must not be reported as an entirely successful integration run. The collector intentionally does not invent a gift function or signing calldata.

## What is and is not complete

| Task 3 component | Evidence status |
|---|---|
| Actual RPC connectivity and chain-ID checks | Observed on both chains |
| Payment/MSS2 symbol, decimals and code observations | Collected twice on both chains |
| Reproducible read-only runner | Implemented and executed |
| Checker/source-reader fixtures | 23 passed locally and in GitHub |
| Explorer-verified gift ABI and source | Still blocked in the attempted APIs |
| Staking proxy/implementation and current gift behavior | Not verified |
| USDG-to-liquid-MSS2 / USDC-to-liquid-MSS2 execution | Not simulated |
| Reserve-wallet-to-winner stake-credit execution | Not simulated |
| Randomness deployment and winner binding | Not verified |
| Production activation | Not authorized or enabled |

Task 3 remains open. No whole-application build/regression suite, security audit, live token purchase or airdrop has been claimed.

## Next acceptance test, now with a working execution environment

Obtain the authoritative deployed MSS2 token/staking interface and the exact swap router/route on each network using public deployed sources, without accessing MintStakeShare GitHub. Resolve the staking target and implementation at a pinned block and reconcile source/bytecode. Then execute isolated fork rehearsals with no real funds:

1. Spend a fixture budget of the correct chain's stablecoin and show the actual liquid MSS2 received; the purchase must not increase the purchaser's stake.
2. Use the designated reserve as the simulated sender and prove the exact winner's stake increment, token debit and remainder through the verified gift entry point. Impersonation in a local fork does not prove real signing authority.
3. Exercise existing/new stakers, minimum gift, insufficient funds, full/partial/zero capacity, unchanged referrals and ambiguous/duplicate/replaced transaction handling. A partial credit must never count as the full advertised prize.
4. Keep winner selection separate from delivery: preserve the same winner on a failed payout, and maintain a round-specific outstanding amount. Neither this test nor the metadata observations settles randomness availability or capacity-shortfall policy.

## Evidence and sources

- Initial successful run: https://github.com/TheCryptoArborist/yield-vaccum/actions/runs/42554165659 — job 128956065299, commit `98a15221935e41d91541c1fc527fbc1b260cff2c`.
- Expanded run: https://github.com/TheCryptoArborist/yield-vaccum/actions/runs/42554430282 — job 128956878178, commit `456f24fbbfdd08eee652193fe348322de194b962`.
- Robinhood network/address documentation: https://docs.robinhood.com/chain/connecting/ and https://docs.robinhood.com/chain/contracts/.
- Arc network and single-USDC-balance documentation: https://docs.arc.io/arc/references/connect-to-arc.
- MSS2 public integration documentation: https://www.mintstakeshare.com/docs/contracts.
- Topaz route integration documentation: https://www.topazdex.com/docs/developers/integration.

All RPCs used were read-only. No main-branch updates, merges, application-route changes, production configuration changes, wallet approvals or real fund movements were performed.
