# MSS2 Daily Draw — two-chain readiness record

Updated 2026-11-09 UTC (November 8 in America/Chicago).
Tracker: TheCryptoArborist/yield-vaccum #53.
Research branch: `research/mss2-daily-draw-readiness`.
Application baseline: `c94d6a0f8a7884d818c907b86749eda1ff068237`.

**Current status: both networks have now returned successful live read-only metadata snapshots from GitHub Actions. All 23 checker/source-reader fixtures pass. The attempted explorer APIs still did not return usable gift ABI/source. Actual swap/payout rehearsals and randomness verification remain outstanding. Neither chain is approved for paid draws.**

## Confirmed requirements

- USDG tickets on Robinhood; USDC tickets on Arc.
- A published revenue allocation purchases MSS2; a separate portion is developer revenue. No price or percentage is approved yet.
- **Regular Buy produces liquid MSS2. Buy & Stake is not used for prize funding. This purchase-mode decision is settled.** Purchased prize tokens stay liquid until the selected winner receives a direct addition to their permanent MSS2 stake.
- Intended prize sender: `0xE8b63245DdDAB73C7A276818942341D8Cfb7D7A7`. Administrator sign-in ending 8789 is separate. Choosing the sender does not approve new stablecoin-payment or developer-fee destinations.
- Existing arcade funds, allocation rules and interfaces remain unchanged. Shared-wallet draw funding requires separate chain/round accounting, not treating the whole reserve balance as the draw prize pool.
- Work stays in Yield Vacuum. Do not access or modify MintStakeShare GitHub.
- Requested host: `www.yieldvaccum.com`; domain/origin migration is not part of this verification.

Separate chain-local rounds remain a recommendation, not an approved winner-count change. Prices, splits, fee denomination/destinations, deadlines, eligibility, purchase timing and launch sequence remain open. No new policy is inferred from successful metadata reads.

## New live observations

| Field | Robinhood | Arc |
|---|---|---|
| Chain ID returned | 4663 | 5042 |
| Payment symbol returned | USDG | USDC |
| Payment address queried | `0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168` | `0x3600000000000000000000000000000000000000` |
| Payment decimals returned | 6 | 6 (ERC-20 interface) |
| MSS2 symbol / decimals returned | MSS2 / 18 | MSS2 / 18 |
| Initial recorded block | `0x68a5aad` | `0x1ce1003` |
| Liquid purchase rehearsal | Not run | Not run |
| Direct-to-stake payout rehearsal | Not run | Not run |

MSS2 was queried at `0x091F0c7e675A787A4018eb47c30BeD3FA2013B65` on each chain. Each snapshot records code fingerprints and a block hash and rechecks the block/chain after its reads. USDG decimals are now observed live rather than unknown; final source/proxy/transfer-behavior acceptance remains open. The latest block is not asserted finalized. Empty code at the sender does not prove wallet control. SHA-256 code fingerprints are not Ethereum Keccak code hashes.

## Executed checks and precise result

1. Run **42554165659** / commit `98a15221935e41d91541c1fc527fbc1b260cff2c`: **success**, 17 fixtures passed, both public-RPC metadata snapshots collected.
2. Run **42554430282** / commit `456f24fbbfdd08eee652193fe348322de194b962`: **23/23 fixtures passed and both metadata reads passed**, but explorer ABI/source discovery failed for both networks. Overall workflow conclusion: **failure**, intentionally not masked. Repeat metadata matched the first run's symbols, decimals and code fingerprints but used the same providers, so this is not independent-provider confirmation.
3. Local combined test run: **23/23 passed**. Local network reads remain blocked by the container's DNS environment; this is no longer the hosted-runner connectivity blocker.

The workflow is research-branch-only, without repository-token permissions, configured secrets, wallet keys, package installs, schedules, production changes or transaction/deployment steps. Public scripts are fetched at the triggering commit and their reviewed blob hashes are checked before execution. No whole-application build or security audit is claimed.

Full results and next rehearsal criteria: [progress report](mss2-daily-draw-progress-2026-11-09.md).
Normalized first-snapshot data: [metadata evidence](evidence/daily-draw-metadata-2026-11-09.json).
Original pre-hosted-run investigation remains in commit `a12faef53d628afc440026b96c55fd2873d4a931` for history; its all-networks-blocked status is superseded by these hosted observations.

## Remaining Task 3 acceptance evidence

- Retrieve authoritative deployed token/staking ABI and source, resolve the current staking proxy/implementation at a pinned block, and reconcile deployed bytecode. Explorer failures do not justify inventing a gift ABI.
- Verify the complete executable USDG-to-liquid-MSS2 route on Robinhood and USDC-to-liquid-MSS2 route on Arc. A market price is not an execution quote. Verify spender, input/output tokens, recipient, minimum output, deadline, fees and every hop; no unapproved bridging.
- Run isolated no-real-funds fork rehearsals for liquid purchases and actual stake delivery from the selected reserve. Prove exact debit/credit/remainder for existing and first-time stakers, capacity limits, minimum gifts and failures. Fork impersonation is not real wallet-control proof.
- Verify a deployed randomness mechanism and binding ticket-owner/result mapping on each enabled network, without rerolls.
- Retain capacity/shortfall policy, operator custody, signing authority, economics and legal/security review as pre-release gates. Wallet accounting is not escrow. A failed delivery retains the same winner and outstanding award; a partial stake credit does not complete the full prize.

No application routes, existing arcade contracts, wallet configuration, production settings, approvals or funds were changed. Task 3 remains open.

## Primary references

- https://github.com/TheCryptoArborist/yield-vaccum/actions/runs/42554165659
- https://github.com/TheCryptoArborist/yield-vaccum/actions/runs/42554430282
- https://docs.robinhood.com/chain/connecting/
- https://docs.robinhood.com/chain/contracts/
- https://docs.paxos.com/guides/stablecoin/usdg/mainnet
- https://docs.arc.io/arc/references/connect-to-arc
- https://developers.circle.com/stablecoins/usdc-contract-addresses
- https://www.mintstakeshare.com/docs/contracts
- https://www.mintstakeshare.com/docs/buying-and-selling
- https://www.mintstakeshare.com/docs/team-airdrops
- https://www.topazdex.com/docs/contracts
- https://www.topazdex.com/docs/developers/integration
- https://docs.chain.link/vrf/v2-5/supported-networks
- https://docs.pyth.network/entropy/chainlist
- https://eips.ethereum.org/EIPS/eip-1967
