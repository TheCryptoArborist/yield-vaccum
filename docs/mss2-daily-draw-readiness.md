# MSS2 Daily Draw — two-chain readiness record

Review date: 2026-11-09 UTC (November 8 in America/Chicago).
Tracker: TheCryptoArborist/yield-vaccum #53.
Repository baseline: c94d6a0f8a7884d818c907b86749eda1ff068237.

**Status: documentation mapping and a locally tested read-only checker are complete. Live contract/route/payout verification is incomplete. Neither chain is approved for paid draws.**

## Confirmed requirements, not new policy decisions

Tickets use USDG on Robinhood and USDC on Arc. Part of revenue purchases MSS2; part is developer revenue. The selected winner receives a direct addition to their permanent MSS2 stake from `0xE8b63245DdDAB73C7A276818942341D8Cfb7D7A7`. Administrator sign-in ending 8789 is separate. Existing arcade funds and rules remain unchanged. Work stays in Yield Vacuum; do not access MintStakeShare GitHub.

Separate chain-local rounds remain a recommendation, not an approved change to winner count. Ticket prices, fee percentages, receivers, deadlines, purchase timing, launch order and eligibility are still undecided. Requested host remains www.yieldvaccum.com; this review does not verify or change its domain mapping.

## Documentation-supported network map

| Field | Robinhood | Arc |
| --- | --- | --- |
| Mainnet chain ID | 4663 [1] | 5042 [4] |
| Ticket asset | USDG | USDC |
| Published payment address | `0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168` [2,3] | `0x3600000000000000000000000000000000000000` [5] |
| Decimal handling | Still needs an independent live read; checker deliberately has no approved numeric expectation | 6-decimal ERC-20 interface; 18-decimal native gas view; same underlying balance [4,6] |
| Gas asset | ETH [1] | USDC [4] |
| MSS2 token | `0x091F0c7e675A787A4018eb47c30BeD3FA2013B65`, documented 18 decimals [7] | Same published address, separate deployment [7] |
| Documented MSS2 market | MSS2/WETH [8] | MSS2/USDC [8] |
| Execution evidence | No executable USDG-to-MSS2 route verified | No executable USDC-to-MSS2 route verified |

The USDG token address agrees between Robinhood's token list and Paxos's indexed mainnet address table. Paxos also lists a distinct OFT address; that bridge endpoint must not be substituted for the ticket token. Direct retrieval of the Paxos page returned 403, while its indexed official result was readable. Documented addresses are discovery anchors, not bytecode or execution proofs.

## Purchase and payout integration decisions exposed

**Keep prize MSS2 liquid until payout.** The documented Buy & stake option stakes into the purchaser's position [8]. That is not the requested prize-pool flow. A normal purchase must deliver liquid MSS2 to the approved round funding location; after the draw, the verified gift path credits the winner. The final purchase receiver and execution wallet still require approval.

**Do not treat a price feed as an executable route.** Topaz documents different routing and approval paths [9,10]. For Robinhood, USDG -> WETH -> MSS2 is only a route hypothesis, not a confirmed liquid path. For Arc, use the six-decimal ERC-20 path; native/wrapped-native routing is not interchangeable [6]. Verify every pool, router, input amount, output recipient, minimum output, deadline, spender and fee against current deployed contracts. Reject any route that introduces an unapproved bridge.

**Separate participant and operator permissions.** Ticket approvals must target the reviewed draw entry contract, not a DEX router. Prize swaps are a separate operator operation. Do not copy Topaz's broad Permit2 defaults into ticket purchasing. The exact operator swap permissions also need review [9].

**The gift path is suitable in the published rules, not yet proven in a simulation.** Direct Airdrop can reach a non-team wallet or first-time staker. Minimum gift is 1 MSS2; self-gifts are prohibited. Gifts do not alter referrals. Recipient capacity can limit accepted tokens [11]. The actual deployed ABI, staking target, current cap, precise events and accepted-credit evidence remain unverified. Do not invent a gift signature or prepare signing calldata from this document.

**Capacity and custody remain launch blockers.** Entry-time checks do not reserve staking space. A capacity shortfall needs an approved pre-entry rule; no reroll, unannounced liquid substitute or forfeiture. The reserve wallet also contains unrelated arcade obligations. Accounting must distinguish each draw's funds; an operator-controlled wallet is not escrow. Failed payout attempts retain the same winner and outstanding award until safely reconciled.

## Randomness status

No supported deployment on either target chain was verified. The retrieved Chainlink VRF v2.5 list did not list Robinhood or Arc [12]. Pyth's retrieved deployment table remained at “Loading” [13]. Neither observation proves that no suitable provider exists. MSS2's browser team draw is explicitly not publicly verifiable [11] and is not an acceptable fallback for the proposed verified paid draw.

The uploaded SUITRUMP reference is Sui-specific, uses administrator registration and winner claims, and explicitly says it is not production configuration (lines 8–11, 141–151). Its payout code is not copied into this implementation.

## Completed engineering work

Added standalone `scripts/daily-draw-readiness.mjs` and its test file. No dependencies, application routes, existing contracts, wallet configuration or deployment settings are changed.

The checker restricts RPC calls to read-only methods, checks the exact network ID, anchors state reads to one block and rechecks its hash, reads payment/MSS2 decimals and symbols, records code fingerprints and the ERC-1967 implementation-slot candidate [14], and observes the configured sender's code. Fingerprints are SHA-256, not Ethereum Keccak code hashes. An empty sender code result does not prove ownership or exhaust account-type possibilities.

It does not request accounts, read keys, sign, approve, transfer, swap, stake, select winners or enable payments. It does not guess gift ABI functions. Even a successful run returns `livePaymentEnabled: false` and means only metadata was observed. RPC-provider responses must still be cross-checked; the latest block is not asserted finalized. USDG decimal approval stays open until reviewed live evidence is obtained.

### Validation performed

- Node 22.16.0; 17/17 fixture tests passed, including wrong-chain rejection, decimal mismatches, malformed responses, secret redaction, read-only restrictions, missing token code and changed block hashes.
- These are checker tests, not application regression tests or deployed-contract simulations.
- Live run on 2026-11-09 returned `blocked` for both networks and exit code 1. No chain ID, token metadata or stake credit was retrieved.
- Separate probes of the public RPCs and two documented Arc alternatives failed hostname resolution in this environment. Explorer/source and Topaz API retrieval did not yield usable evidence. This is not evidence of a chain-wide outage.
- No fork rehearsal, swap quote, gift call, randomness request or wallet-control signature was completed.

### Reproduce without changing the application

```bash
node --test scripts/daily-draw-readiness.test.mjs
# Optional: supply trusted HTTPS endpoints through these environment variables.
# Do not paste RPC credentials into issues, logs, commits or chat.
# DAILY_DRAW_ROBINHOOD_READ_RPC
# DAILY_DRAW_ARC_READ_RPC
node scripts/daily-draw-readiness.mjs readiness-observations.json
```

Without overrides the checker uses the documented public endpoints. Exit code 0 means both metadata snapshots were collected, NOT that either draw is release-ready. Exit code 1 means a read failed. Keep generated provider evidence out of source control until reviewed for sensitive information.

## Exact remaining acceptance evidence

1. Obtain both live metadata snapshots using working trusted endpoints; independently reconcile chain, token identity/decimals, source and proxy/code evidence. Review stablecoin transfer restrictions and upgrade controls.
2. Retrieve verified MSS2 token/staking ABI and source and resolve the current staking implementation at the same pinned block; verify the true gift entry point and sender/recipient restrictions.
3. In an isolated no-real-funds fork, prove both full payment-asset-to-liquid-MSS2 swaps and direct-to-stake payouts using the approved sender. Include first/existing stake, full/partial/zero capacity, insufficient funding, minimum size, exact credited amount, preserved referrals, failures and safe retries. Fork impersonation is not proof of control of a real wallet.
4. Verify a randomness provider and deployed verifier/coordinator for each enabled chain; bind frozen ticket ownership to a single result with no rerolls.
5. Resolve pending economics, draw structure, capacity/shortfall rules, operational custody and legal/security approval before paid entry.

Task 3 stays open. The metadata checker is a reproducible first probe, not a replacement for the remaining integration tests.

## Primary sources

[1] https://docs.robinhood.com/chain/connecting/
[2] https://docs.robinhood.com/chain/contracts/
[3] https://docs.paxos.com/guides/stablecoin/usdg/mainnet (indexed official content; direct fetch blocked)
[4] https://docs.arc.io/arc/references/connect-to-arc
[5] https://developers.circle.com/stablecoins/usdc-contract-addresses
[6] https://www.topazdex.com/docs/contracts (Arc deployment section)
[7] https://www.mintstakeshare.com/docs/contracts
[8] https://www.mintstakeshare.com/docs/buying-and-selling
[9] https://www.topazdex.com/docs/trading/swaps
[10] https://www.topazdex.com/docs/developers/integration
[11] https://www.mintstakeshare.com/docs/team-airdrops
[12] https://docs.chain.link/vrf/v2-5/supported-networks
[13] https://docs.pyth.network/entropy/chainlist
[14] https://eips.ethereum.org/EIPS/eip-1967
