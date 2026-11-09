# MSS2 Daily Draw — real-market adapter and stake-receipt reconciliation

Recorded 2026-11-09 UTC. Issue #53; Draft PR #54. Research only.

## Execution status

Initial workflow **42620946853** is being evaluated. This document does not yet claim passing fork cases. The final result and any corrections must be recorded before this milestone is accepted.

## Scope of this step

The preceding integrated controller used fake purchase/payment/prize contracts. This step adds a narrow purchase adapter that executes against the real forked USDG/USDC, Topaz and MSS2 contracts, then an off-chain receipt checker initialized from the controller's selected award. The original integrated controller and operating-fee contract remain byte-identical.

The fork extension deliberately uses a **deterministic mock coordinator**, not a D20DAO proof or live keeper. Earlier actual-provider source tests and historical proofs remain separate evidence. A successful market/payout test must not be described as a single run combining live-market execution and genuine oracle fulfillment.

Public chain access remains behind the original allowlisted, read-only RPC gateway. Only an in-process Hardhat fork or an owned loopback Arc Anvil can submit transactions. The execution chain IDs are 31337/31338, preserving the prototypes' public-deployment guards; source chain IDs remain Robinhood 4663 and Arc 5042. Arc must explicitly select and report its Arc execution engine. No real key, public write, approval or funds are used.

## Fixed-route purchase adapter

`research/daily-draw/DailyDrawTopazPurchasePrototype.sol` pins the controller's predicted deployment address, source network, payment token, reserve and router. There is no generic call target, arbitrary calldata, route replacement, administrator sweep or native-payment entry point.

- Robinhood: USDG -> WETH -> liquid MSS2, using tick spacings 50 and 2000.
- Arc: USDC -> liquid MSS2, using tick spacing 2000.
- The local deployment uses the selected real reserve address as recipient: `0xE8b63245DdDAB73C7A276818942341D8Cfb7D7A7`.
- The adapter pulls exactly the controller's authorized prize budget, grants only an exact-size router allowance, executes the real `exactInput` ABI with caller-supplied minimum output/deadline, and clears the allowance.
- Actual liquid output must equal the router return and meet the minimum. The adapter's previous payment balance must remain unchanged. The unchanged controller separately checks its payment debit, reserve credit and adapter allowance.

Reviewed deployment constants and source/runtime checks are inherited from the earlier purchase rehearsal. They are observations at a pinned block, not immutable future deployment guarantees or an independent recompilation. The source chain's anchor is rechecked at completion. The old seven swap/payout cases are retained; only explicit mechanical harness edits select safe local execution IDs, request storage layout, and append the extension.

## Receipt verification and award identity

`research/daily-draw/stake-award-reconciliation.mjs` contains a read-only evidence collector and `ResearchAwardBook`. It deliberately rejects public chain IDs. The award key includes chain, controller, token and round; it locks the sender, winner, amount and selection evidence.

A prepared intent fixes one recipient, exact offered amount, token call and sender nonce. One unresolved intent blocks another. Submitted replacements must retain the same sender, nonce, target, zero native value and exact calldata. A pending/missing receipt never counts as a failed payment and does not unlock another signature automatically.

The checker requires matching transaction/receipt block and transaction identity, the RPC-reported canonical block, an explicit confirmation threshold, and a payout block after the selected award. It decodes the actual staking proxy's `StakeGifted` event and the actual MSS2 `Transfer`, checking sender, winner, amount, target and log uniqueness. A transaction can be assigned to only one award in a book; reprocessing an accepted receipt is idempotent.

Partial credit leaves the same winner and exact unpaid remainder. Zero credit is not payment even if receipt status is successful. A remainder below the minimum offered gift cannot be silently rounded up. A reported canonical-block mismatch moves the record to manual review and blocks automatic retry. These are RPC consistency/confirmation checks, not cryptographic inclusion or finality proofs.

## Crucial settlement boundary

The book is **in-memory research state**, not a deployed API or durable database. It cannot prevent a wallet owner sending independently, coordinate multiple processes, survive an unrecorded restart, or guarantee exactly-once payout. No autonomous sender is added.

The original on-chain draw deliberately continues to show `AwardPending`, with its full prize liability. A local receipt record does not mutate those contract balances. There is no administrator `markPaid` shortcut or claim that the contract can inspect another transaction's receipt. Production needs a reviewed settlement-authority model plus durable atomic reservations, receipt/event uniqueness, replacement monitoring and reorg handling. Continuing to accumulate unreduced on-chain liabilities is not a finished operating design.

The external reserve remains owner-controlled, not escrow. Its initial balance quarantine is not a complete inventory of arcade obligations. Choosing this address never authorizes spending existing arcade rewards.

## Planned test categories

The extension covers measured acquisition through the draw, unauthorized/redirected adapter calls, output/deadline protections, duplicate purchase prevention, native/token separation, exact owner-signed gift receipt reconciliation, partial/zero capacity, sub-minimum remainder handling, idempotency, cross-award attribution, pending/confirmation states, altered evidence and canonical-block review. The capacity-boundary cases use explicit local storage fixtures derived from the retrieved staking storage layout; they do not alter public state.

The end-to-end test uses five test tickets, a 20% fixture developer allocation and a fixed tiny fixture randomness fee. These do not approve price, splits, real payers, limits, recipients or refunds. Test draw winners are selected from a known mock result, not unpredictable production randomness. Local wallet impersonation establishes neither control nor signing capability of the real reserve.

## Next acceptance boundary

After execution evidence is accepted, implement durable settlement records and resolve the on-chain/off-chain liability transition without a trustless-payout claim. Retain original winner and unpaid remainder, block ambiguous retries, and test restart/concurrency/replacement/reorganization paths. Actual-provider integration, deployed governance review, provider liveness, fee/market risk, backed participant refunds, eligibility, economic parameters, real wallet authority and independent security/applicable launch review remain release gates.

No website/application route, existing arcade allocation, application dependencies, main branch, production setting or MintStakeShare repository is changed by this work.

## References

- Original purchase integration: [purchase routes](mss2-daily-draw-purchase-integration.md)
- Original integrated controller: [local ledger](mss2-daily-draw-integrated-ledger.md)
- Stake event requirements: [staking interface](mss2-daily-draw-staking-interface.md)
- Topaz direct integration: https://www.topazdex.com/docs/developers/integration
- MSS2 gift rules: https://www.mintstakeshare.com/docs/team-airdrops
- Arc execution tooling: https://github.com/circlefin/arc-foundry
