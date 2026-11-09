# MSS2 Daily Draw — real-market adapter and stake-receipt reconciliation

Updated 2026-11-09 UTC. Issue #53; Draft PR #54. Research only.

**Accepted run 42621984190 completed successfully. Each network fork passed 16 new market-ledger/receipt scenarios and 7 retained swap scenarios: 23 passed, 0 failed per fork, 46 executions total. The 12 altered-evidence checks per fork are included within one scenario, not additional top-level cases. No real funds or public transactions were used.**

## Accepted evidence

| Item | Value |
|---|---|
| Accepted run | 42621984190, success |
| Robinhood job | 129176184531; 23 passed / 0 failed |
| Arc job | 129176184833; 23 passed / 0 failed |
| Workflow commit | `d1012f24cdfedb7574635609036c4287e255f228` |
| Source/launcher commit | `05f954e7c6b4b0600e806f4f6f1dfeea08e5e50b` |
| Launcher Git blob | `43488a86352f83e5fce0142f420ab5f9567b708d` |
| Original swap runner Git blob | `5223d49fad11e0e5e314b4c47ff1e9d683e07e0c` |
| Resolved dependency lock SHA-256 | `88230302a70117882d7f63ba96cadb629c97be5615d2b5fadc51d00e46c85bf3` |

Robinhood artifact **13675689515**, SHA-256 `7c6fd847d109dff3893d2a1fb9b066baae4611c107002968582e9ff0f9d3b474`; Arc artifact **13675604823**, SHA-256 `39605ba9f091a9b13584df216014af419209f73479403ffb55d3b6e638c8f9dc`. Both downloaded archives were checked against GitHub's digests and their final `swap-*.json` reports. They preserve executed sources, case results, raw logs, dependency locks and mechanical harness edits. GitHub retention is 30 days. [Normalized evidence](evidence/daily-draw-market-ledger-2026-11-09.json) preserves identifiers, hashes and anchors.

Robinhood source anchor: `0x68fa417`, hash `0x53b867bc4725fbf3ebdea76e65e2e340a9162b4bf61d601ec46f0c6a547c47c2`. Arc source anchor: `0x1cf2584`, hash `0xd6ba8dc29e53ca5544d7fd5feafd6d99c41d59015978fc2c9cde31ece8c060ce`. Anchors were rechecked, but are not asserted finalized or independently consensus-verified.

## Scope of this step

The previous integrated controller used fake purchase/payment/prize contracts. This step connects a narrow purchase adapter to the real forked USDG/USDC, Topaz and MSS2 contracts, then initializes an off-chain receipt checker from the selected award. The original integrated controller and fee contract remain byte-identical.

The connected fork sequence is: **real forked stablecoin tickets -> close and allocate -> real router purchase of liquid MSS2 -> capped fee request -> deterministic test result -> locked winning ticket owner -> simulated reserve-signed MSS2 stake gift -> actual receipt/event reconciliation.**

The coordinator in THIS suite is explicitly a **deterministic mock**, not D20DAO proof verification or a live keeper. Earlier actual-provider source tests and historical proofs remain separate evidence. Do not describe these different suites as one complete real-provider payment-to-prize test.

Public traffic passes through the original read-only gateway. Five signing/write methods are rejected per fork; no public write is forwarded. Only private Hardhat or owned loopback Arc Anvil submits transactions. Local IDs 31337/31338 preserve the prototypes' public-deployment guards; source IDs remain Robinhood 4663 and Arc 5042. Arc explicitly uses Circle Arc Foundry v0.8.0-4 and asserts network `arc`, not a generic mock USDC.

## Fixed-route purchase adapter

`research/daily-draw/DailyDrawTopazPurchasePrototype.sol` pins the predicted controller address, source network, payment token, reserve and router. There is no generic call target/calldata, route replacement, administrator sweep or native-payment entry point.

Robinhood uses USDG -> WETH -> liquid MSS2 (tick spacings 50 and 2000); Arc uses USDC -> liquid MSS2 (spacing 2000). The recipient remains `0xE8b63245DdDAB73C7A276818942341D8Cfb7D7A7` in the fork.

The adapter pulls exactly the approved prize budget, gives only an exact router allowance, executes the actual `exactInput` ABI with minimum output/deadline protection and clears the allowance. The actual liquid reserve increase must equal the router return. The unchanged controller independently checks payment debit, reserve credit and its adapter allowance. Pre-existing reserve MSS2 is not counted as a new prize.

The source/runtime/factory/pool observations are refreshed through the earlier verified-source harness. This is consistency with retrieved source records at a pinned block, not independent recompilation, immutable deployment assurance or security review. Seven earlier swap/payout assertions are retained and rerun.

## Successful checks and actual stake credits

The 16 new categories cover measured purchase through the ledger; unauthorized/redirected calls; output and deadline rejection; duplicate purchase rejection; native/token liability separation; exact stake-credit evidence; partial and zero capacity; small unpaid remainders; idempotency; cross-award reuse; pending/confirmation states; altered evidence; and canonical-block mismatch review.

The full-credit case verified exact purchased MSS2 leaving the simulated reserve and increasing the selected wallet's stake, with no liquid delivery to the recipient. The reserve's pre-existing MSS2 remained intact. Both local receipt records reached zero unpaid balance. These are local transaction hashes and test quantities, not public payouts or future price quotes.

Partial-capacity and zero-capacity cases preserve the same winner and exact unpaid award. A successful receipt with zero credit is not marked paid. A remainder below the 1-MSS2 offered-gift minimum cannot be rounded up. Capacity boundaries use explicit local storage fixtures derived from the retrieved staking layout; no public stake is edited.

Arc's dedicated engine confirmed the controller's remaining USDC ticket/developer liability against the same underlying native balance and six-decimal token view. Operating credits were held at a different contract and reconciled separately. This closes this specific shared-balance purchase/request test, not all production Arc fee/refund behavior.

## Receipt verification and duplicate safeguards

`stake-award-reconciliation.mjs` contains a read-only collector and `ResearchAwardBook`, which rejects public chain IDs. A record locks chain/controller/token/round, sender, winner, amount and selection evidence. A prepared intent fixes recipient, offer, nonce and exact calldata. One unresolved intent blocks another; pending or missing receipts never unlock another signature automatically.

The checker matches transaction/receipt identity, sender/target/value/nonce/calldata, reported canonical block, confirmation count and payout ordering. It decodes the verified staking proxy's `StakeGifted` and the MSS2 `Transfer`, requiring matching sender, winner, quantity and unique logs. A transaction can satisfy only one award in a book; repeated reconciliation is idempotent. Each fork rejected 12 altered-evidence variants within its negative-test scenario.

A canonical-block mismatch moves the record to review and blocks automatic retry. These are RPC consistency and confirmation checks, not cryptographic inclusion/finality proofs. One or two local confirmations used in fixtures are not approved production policies.

## Settlement boundary that remains open

The book is **in-memory research state**, not a deployed API or durable database. It cannot prevent independently sent wallet transactions, coordinate multiple processes, survive an unrecorded restart, or guarantee exactly-once payout. Replacement matching exists, but a production nonce/replacement monitor and recovery service do not. No autonomous signer is added.

The unchanged on-chain draw still shows `AwardPending` and its full prize liability after a verified local gift. The receipt book does not mutate contract state. There is no administrator `markPaid` shortcut or claim that the contract inspects another transaction's receipt. Production requires a reviewed settlement-authority model and liability decrement, alongside durable atomic reservations and event uniqueness. Accumulating unreduced on-chain liabilities is not a finished operating design.

The reserve remains owner-controlled, not escrow. Initial balance quarantine is not an inventory of all arcade obligations. Wallet impersonation proves neither real control nor signing ability.

## Initial failed run and correction

Run **42620946853** had Arc 23 passed / 0 failed and Robinhood 10 passed / 13 failed. Robinhood's first real ledger purchase passed; later restored-snapshot cases returned `InvalidInput` (`0xb4fa3fb3`). The launcher was changed to mine each local Robinhood send at latest local timestamp + 1, preventing wall-clock jumps past short fixture windows after snapshot restoration. Public timestamps are not changed by this correction.

The accepted rerun passed both forks. Downloaded initial and accepted artifacts confirm byte-identical integrated/fee/adapter contracts, receipt verifier and case assertions. Only the launcher clock handling and workflow pin changed; earlier failures are retained rather than counted as successful.

## Remaining acceptance work

Next: durable payout reservations, restart/concurrency handling, transaction replacement monitoring and reorg review, together with the reviewed on-chain/off-chain settlement transition. Retain the original winner/unpaid remainder and block ambiguous retries. Reconnect actual-provider behavior to the full market/settlement path rather than combining unlike tests.

Ticket prices, percentages, payers/limits, receivers, deadlines, eligibility, backed refunds, cap-shortfall policy, real wallet authority, current governance/provider liveness and independent security/applicable launch review remain unresolved release gates. Five tickets, 20% developer allocation and a tiny fixture service fee in this suite are test inputs only. No public paid utility is enabled.

No main merge, existing application/arcade/dependency change, public smart-contract deployment, real approval/purchase/airdrop, production setting or MintStakeShare repository access occurred.

## References

- Accepted run: https://github.com/TheCryptoArborist/yield-vaccum/actions/runs/42621984190
- [Purchase routes](mss2-daily-draw-purchase-integration.md), [integrated controller](mss2-daily-draw-integrated-ledger.md), [stake interface](mss2-daily-draw-staking-interface.md)
- https://www.topazdex.com/docs/developers/integration
- https://www.mintstakeshare.com/docs/team-airdrops
- https://github.com/circlefin/arc-foundry
