# MSS2 Daily Draw — liquid purchase integration

Recorded 2026-11-09 UTC. Yield Vacuum issue #53. Research branch only.

The purchase mode is settled: ordinary Buy delivers liquid MSS2; the later airdrop delivers the prize into the winner's stake. This document describes the direct-router integration under test, not a production launch or a change to existing arcade payments. Read `mss2-daily-draw-readiness.md` for accepted run results and remaining gates.

## Network-specific execution

| Field | Robinhood | Arc |
|---|---|---|
| Chain ID | 4663 | 5042 |
| Input token | USDG `0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168` | USDC `0x3600000000000000000000000000000000000000` |
| Input units observed | 6 decimals | 6 decimals through ERC-20 interface |
| Output | MSS2 `0x091F0c7e675A787A4018eb47c30BeD3FA2013B65`, 18 decimals | Same address and decimals, independent deployment |
| Route | USDG -> WETH -> MSS2 | USDC -> MSS2 |
| First pool | `0x8132252bd65E7C03F7B57739E1DB1c58d6Ee792F`, spacing 50 | `0x01A19Ee4688aac8918B99FaA6eCB6f2CC3a97a31`, spacing 2000 |
| Second pool | `0xdfCC6Ad671033f7d3ECEb24cBaE5c0F7f6f8d91e`, spacing 2000 | None |
| Intermediate asset | WETH `0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73` | None |
| Native transaction value | 0 | 0 |
| Expected liquid recipient | `0xE8b63245DdDAB73C7A276818942341D8Cfb7D7A7` | Same address on Arc |

Observed Topaz deployment addresses, independently checked on each chain:

- SwapRouter and operator's allowance spender: `0x2e7395A6E0De6eE1f390bEcE891069Cd18Ff8572`.
- QuoterV2: `0xA9Cd3aC90513663197E7Fd6c932f63f0C40701be`.
- CLFactory: `0xaa5865dC3A60b25D305226d66fd573021f0D8fFB`.
- Pool implementation referenced by the checked minimal proxies: `0x2DaA7cF731334b4Cd1c2E4E01E97Ca67F4B9C6AE`.

The factory returned the recorded pools; token pairs, tick spacing, factory association, fee and liquidity are read independently by the rehearsal. Router and quoter factory getters must agree with the reviewed factory. Tick spacing is not substituted for a fee; fees are mutable observations and need a fresh quote.

The Robinhood route's two hops are encoded in one router `exactInput` call. A participant still purchases tickets in USDG; this operator conversion does not require the ticket purchaser to execute two swaps or supply WETH. This does not decide whether ticket purchases and prize conversions are batched or scheduled.

## ABI-backed call shape

The retrieved SwapRouter ABI exposes:

```solidity
struct ExactInputParams {
    bytes path;
    address recipient;
    uint256 deadline;
    uint256 amountIn;
    uint256 amountOutMinimum;
}
function exactInput(ExactInputParams params) external payable returns (uint256 amountOut);
```

Pack each path as an address followed by repeated signed 24-bit tick spacing/address pairs, using the actual router's ABI and pool format. For these positive spacings the byte representation also matches uint24, but the documented integration uses int24 to match the contract type. Do not substitute the Uniswap fee-tier path convention.

For this integration the input is the chain-specific ERC-20 stablecoin and transaction value is zero. The operator approves the exact input amount to the reviewed router, simulates the purchase, then reviews/signs the call. Neither a Permit2 unlimited approval nor a native-asset wrapping command is needed for the tested purchase path. Participant ticket approvals are a separate, not-yet-implemented contract flow; never point their ticket approval at this DEX router.

Reject a stale review after an account, chain, amount, route, recipient, deadline or round change. A new quote and simulation must precede any eventual real authorization. The present research script has no mainnet signing/submission method.

## Accounting acceptance

Count the actual increase in the designated reserve's liquid MSS2, corroborated by the MSS2 Transfer event(s), not the quoter's estimate. The purchase must not change the purchaser's recorded stake. Keep the developer portion outside the approved purchase budget.

On Robinhood the USDG debit must equal amountIn; ETH fees are separate. On Arc USDC's native balance and ERC-20 balance are the same underlying funds. The ERC-20 balance is the native 18-decimal balance divided by 10^12 with integer truncation. Native debit includes both amountIn * 10^12 and transaction gas. Account for approval gas separately too; do not label gas as prize conversion or count the two USDC views twice.

The fork uses 1, 10 and 100 units of the stablecoin as test inputs, a 1% minimum-output margin and a 600-second test deadline. These are test fixtures, NOT approved ticket prices, trade-size limits, slippage policy or production deadlines. Runtime quote/output amounts are historical snapshots and do not advertise a future prize amount.

The completed round ledger must separately track payment revenue, protected refunds, developer liabilities, conversion spending, purchased MSS2, delivered MSS2 and outstanding prizes for each chain/round. These ledger controls are not implemented by a passing swap test. Sharing the arcade reserve address is not permission to consume arcade allocations or a guarantee of escrow.

## Source/runtime provenance

The checked router, quoter, factory and pool implementation records return Sourcify `match`, not `exact_match`. Each recorded on-chain runtime is compared byte-for-byte with live `eth_getCode` at the pinned block. A Sourcify `match` establishes compilation equivalence excluding metadata; it is not described here as an exact metadata match or an independent recompilation/security audit.

The USDG and WETH proxy source records do not themselves contain the token/wrapping function ABI. Resolve each active ERC-1967 implementation, check its deployed code against its source record, then use that implementation ABI at the proxy address. The first Robinhood rehearsal stopped because it mistakenly tried to encode `deposit()` using only the WETH proxy ABI; this was a harness issue before purchase cases, not evidence that liquid MSS2 purchases were unavailable.

The router's verified PeripheryValidation source enforces `require(_blockTimestamp() <= deadline)` without a reason string. A test expecting a literal `Transaction too old` string was incorrect. The corrected test first proves an otherwise identical fresh-deadline call succeeds, changes only the deadline, requires an EVM revert, and checks state remains unchanged. It does not turn arbitrary transport failures into expected contract reverts.

Arc USDC's system interface has no retrieved Sourcify record. Its native/ERC-20 behavior is exercised using Circle's Arc-enabled execution engine rather than replacing it with a normal mock token. This is execution evidence, not a claim that the system token's complete source/security review is finished.

## Rehearsal model and safety boundaries

`scripts/daily-draw-swap-rehearsal.mjs` permits real-chain reads only. All state-changing calls target either an in-process Hardhat fork or the owned, loopback-only Arc Anvil child process. Five upstream signing/transaction methods are explicitly tested for rejection. No private keys or configured repository secrets are used.

Robinhood uses Hardhat 2.26.3, pinned state and the documented zero defaults for absent blob header fields. Local ETH is synthetic. For fixture funding only, it is wrapped through the verified WETH implementation and exchanged for actual USDG using the real forked pool. This preliminary reverse swap changes that fork's USDG/WETH pool; each purchase is requoted against that fixture state. It is not a real market purchase or a native-asset step required in the future USDG prize-conversion flow. No token code is mocked and stablecoin storage is not overwritten.

Arc uses the official `circlefin/arc-foundry` v0.8.0-4 Linux archive, SHA-256 `78330505af7dc0d2c9b55fc1aed00d9d063581bb57054949d31ef1c1b4bdbc5e`. The test asserts `anvil_nodeInfo.network == arc`. Local native USDC funding is synthetic; its ERC-20 view must agree. Real network finality, fee schedules, transaction ordering and competing trades are not proven by a local fork.

The purchase-to-payout case buys liquid MSS2, observes the exact increase, and then calls token `airdropStake` for a fixed test beneficiary using exactly that increase. It must leave the reserve's pre-existing liquid MSS2 intact, increase the beneficiary's stake by the purchased amount, emit a matching StakeGifted event and deliver no liquid MSS2 to the beneficiary. This case does not choose a random winner or prove authority to use the real reserve wallet.

## Acceptance still outside this document

Verifiable winner selection, ticket collection/contracts, complete financial ledger, concurrency/replay protection, wallet signing/control, capacity shortfall policy, original-token refunds, token pause/freeze/upgrade behavior, live liquidity limits and independent review remain separate work. Tests at one block do not approve paid entry.

## Evidence and primary references

- Successful read-only discovery: https://github.com/TheCryptoArborist/yield-vaccum/actions/runs/42557245112
- Exact wrapper/deadline inspection: https://github.com/TheCryptoArborist/yield-vaccum/actions/runs/42558048847
- Purchase rehearsal workflow: `.github/workflows/daily-draw-swap-rehearsal.yml`; accepted run/counts are in the readiness record.
- https://www.topazdex.com/docs/contracts
- https://www.topazdex.com/docs/developers/integration
- https://www.mintstakeshare.com/docs/buying-and-selling
- https://github.com/circlefin/arc-foundry/releases/tag/v0.8.0-4
- https://docs.sourcify.dev/docs/exact-match-vs-match/
