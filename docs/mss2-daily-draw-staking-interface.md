# MSS2 Daily Draw — verified staking interface and payout requirements

Recorded 2026-11-09 UTC. Yield Vacuum issue #53. Research only; no paid-entry activation, wallet spending authorization or production change.

## Integration result

The deployed MSS2 token exposes:

```solidity
function airdropStake(address[] recipients, uint256[] amounts)
    external returns (uint256 accepted);
```

The payout sender calls this function on the MSS2 TOKEN, not `gift` on the staking proxy. For a single winner the arrays each contain one element. Amounts use 18-decimal MSS2 base units. The function transfers only the accepted quantity of the caller's liquid MSS2 to the staking contract. The verified implementation uses an internal token transfer; it does not require a separate ERC-20 allowance for this payout. This does not remove the separate approval requirements of ticket payments or market purchases.

Source-backed entry path:

1. Token checks that the protocol has launched and totals the offered amounts.
2. Token calls `staking.gift(msg.sender, recipients, amounts)`.
3. Staking validates the recipients, applies remaining capacity, credits their recorded stakes and emits `StakeGifted` for accepted quantities.
4. Token rejects an accepted total above the offer and internally transfers the accepted total from the caller to staking.
5. A failure of the final token transfer reverts the transaction, including the preceding credits.

The intended sender remains `0xE8b63245DdDAB73C7A276818942341D8Cfb7D7A7`. No transaction was broadcast from this address. A simulation naming an address is not proof that the utility controls it.

## Observed deployments and verification provenance

| Role | Robinhood, chain 4663 | Arc, chain 5042 |
|---|---|---|
| MSS2 token | `0x091F0c7e675A787A4018eb47c30BeD3FA2013B65` | Same address, separate chain |
| Staking proxy returned by token | `0x1fD4AD5873443953DBbF403e541f546E829be489` | Same address, separate chain |
| Active implementation read from ERC-1967 slot | `0xbe851D5ED304628Dc570A7A0bEB23Bb7ca5f587B` | Same address, separate chain |

The token and active staking implementation have Sourcify `exact_match` runtime records on each chain. Their recorded on-chain runtime was compared byte-for-byte with the RPC's `eth_getCode` at pinned blocks. This uses the verification service's source/compilation result; it is not a claim of an independent local recompilation or security audit.

Robinhood's proxy also has an exact-match source record. Arc's proxy lookup returned HTTP 404, but the Arc proxy runtime was independently read and matched byte-for-byte with the verified Robinhood proxy runtime. Arc's own implementation slot and implementation code were checked separately. Do not describe this as an existing Arc proxy verification entry.

Observed Keccak-256 runtime fingerprints:

- Robinhood token: `0x3efa61c430950a9fc595070b810197b4135ca3b4092addf8b19ad24c316697dc`.
- Arc token: `0x950232c631bfa588f76d4ea5f252519700ab361030cb986972bfd85733c4aedb`.
- Staking implementation, both chains: `0xfa993e9a8ab10ddbd9ea65f536aa85e0021789ec6178af44535487fe852750e3`.
- Staking proxy, both chains: `0x6311d5805b189afda01843114a141b49032c658dfbb0b29d33a098883ba830ba`.

These observations are pinned-block evidence, not immutable future configuration. Recheck the active implementation and relevant settings before authorizing a payout; pause the integration for review if they change.

## Observed rules

The retrieved implementation requires 1–200 recipients, matching array lengths, and recipients in strictly increasing address order. It rejects self-gifts, zero addresses, the MSS2 token, the staking proxy and the liquidity vault as recipients. Each offered amount must be at least 1 MSS2. A single-winner array satisfies the ordering requirement without introducing batch sorting.

The observed stake cap was 25,000,000 MSS2 per wallet per chain. The owner can change it, so it must not be hard-coded as a permanent rule. Actual credit is the minimum of the offer and the recipient's remaining capacity. An offer of at least 1 MSS2 may therefore credit less than 1 MSS2. At zero capacity the call can succeed while crediting zero and emitting no `StakeGifted` event.

A first gift can establish a first stake. Gifts do not call the referrer-binding or referral-credit paths. Existing rewards are checkpointed; a gift does not extend an existing accrual window. A newly established stake starts its window. The current test fixture's referrer is unset; preservation of an already-bound nonzero referrer is source-supported but should also receive a dedicated integration fixture before release.

The entry point has no draw ID and no payout deduplication. Two separate valid transactions carrying the same gift arguments can credit the recipient twice. This is expected behavior for a general-purpose airdrop function, not a fault in that protocol.

## Required Daily Draw acceptance behavior — not implemented application features

- Bind an award permanently to its round, chain, token, beneficiary and amount before payout preparation. A payout error must not select a new winner.
- Maintain outstanding-prize and arcade-reserve liabilities separately. Do not equate the reserve wallet's entire balance with available Daily Draw funding.
- Before offering signing, check the full connected sender, network, actual liquid funding, current staking target/implementation, recipient validity, available capacity and the simulated accepted amount. Admin sign-in is not permission to spend.
- Require the selected sender to authorize its own transaction. Do not place a seed phrase or private key in the application or runner. No autonomous signer or delegated spending has been approved.
- Use a unique award record and an atomic state transition to prevent concurrent payout preparation. Track submitted transaction hash, chain and nonce; reconcile replacements, dropped transactions and uncertain outcomes before allowing another attempt. The protocol itself does not provide a draw-specific exactly-once guard.
- Verify the successful receipt on the correct chain and decode `StakeGifted(sender, recipient, amount)` from the verified staking proxy together with the matching MSS2 `Transfer` from sender to proxy. Match the actual credited amount, not only the amount in calldata. Prevent the same transaction/event from satisfying multiple awards.
- A successful receipt with zero or partial credit is not full payment. Keep the unpaid amount outstanding under the pre-published shortfall policy. Entry-time capacity checks do not reserve capacity. Any residual below the 1-MSS2 minimum offer requires a defined policy; blindly re-offering a larger amount could overpay.
- Source review and fork tests do not make a personally controlled payout wallet escrow. The operator can still move funds outside the application. Describe this custody and signing model accurately.

## Rehearsal scope and references

`scripts/daily-draw-stake-rehearsal.mjs` tests the observed code in isolated, pinned-block EVM state forks. Mainnet access is behind a read-only method allowlist; signing and transaction submission methods are denied upstream. Simulated gas balances and impersonation are local only. Capacity boundary fixtures modify only local storage using the retrieved storage layout.

The Robinhood simulator needs zero defaults for missing Ethereum blob-header fields. The report records that compatibility adjustment; raw mainnet code, anchor and `eth_call` checks remain unmodified. This staking-only model does not establish consensus equivalence, gas estimates, native-system-token behavior, swaps or full application security.

Read the current [readiness record](mss2-daily-draw-readiness.md) for the final accepted run and test counts. Earlier failed runs remain in history and are not counted as passing suites.

Primary evidence:

- Source inspection: https://github.com/TheCryptoArborist/yield-vaccum/actions/runs/42555135706
- Live staking resolution and Robinhood read-only call: https://github.com/TheCryptoArborist/yield-vaccum/actions/runs/42555312930 (overall failure at the separate Arc proxy lookup).
- Source/runtime records: https://sourcify.dev/server/v2/contract/4663/0x091F0c7e675A787A4018eb47c30BeD3FA2013B65?fields=all and the corresponding chain 5042 endpoint.
- Active implementation records: https://sourcify.dev/server/v2/contract/4663/0xbe851D5ED304628Dc570A7A0bEB23Bb7ca5f587B?fields=all and the corresponding chain 5042 endpoint.
- Published rules: https://www.mintstakeshare.com/docs/team-airdrops

Task 3 remains open for stablecoin-to-liquid-MSS2 swaps, randomness, remaining acceptance evidence and release decisions. Purchase mode is already settled; this work does not reconsider Buy versus Buy & Stake.
