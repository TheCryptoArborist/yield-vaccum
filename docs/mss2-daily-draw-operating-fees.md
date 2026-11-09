# MSS2 Daily Draw — operating-fee budget and refund-credit prototype

Recorded 2026-11-09 UTC. Issue #53; Draft PR #54. Research branch only.

**Completed: 35 scenario categories passed with each of the two actual provider-source implementations, for 70 local executions, in run 42614410076. No public-chain transactions or real funds were used. This is a separate operating-fee component; it is not yet connected to the original DailyDrawPrototype or the website. Task 3 and provider production acceptance remain open.**

## Practical improvement

The earlier draw required the caller to send the exact randomness fee. This component accepts an explicitly authorized maximum budget, obtains the exact service quote inside the requesting transaction, pays only that fee, and records the unused amount as credit belonging to the payer. A service price above the maximum stops the request atomically instead of increasing spend or taking funds from another balance.

The controller and payer are distinct roles. Each round authorization fixes its payer, maximum and locked-input digest. Only that payer can fund the request. Neither the controller nor another wallet can withdraw that payer's credit. There is no assumed production payer or fee maximum: test values are fixtures, and operating-cost policy remains unresolved.

A separate refund account is created for each accepted request. The service sends that request's refund to this account, preventing ambiguity when several rounds expire in a different order. Reconciliation credits only the snapshotted refundable amount, once, to the original payer. Anybody may perform reconciliation, but cannot redirect the credit. A rejected withdrawal restores the credit; the payer can choose an accepting recipient.

## What was built

- `research/daily-draw/DailyDrawOperatingFeesPrototype.sol`: local-only fee consumer plus per-request refund account.
- `scripts/daily-draw-fee-test-environment.mjs`: isolated actual-provider source compilation and fixture setup.
- `scripts/daily-draw-operating-fees.mjs`: 35 scenario categories, executed separately for each provider implementation.
- `.github/workflows/daily-draw-operating-fees.yml`: pinned research workflow and archived source/results/dependency-lock evidence.
- [Normalized evidence](evidence/daily-draw-operating-fees-2026-11-09.json).

Neither the existing DailyDrawPrototype nor its earlier integration runner was changed. Application routes, package/lockfiles, arcade allocations and production configuration were not touched.

## Accounting and request controls

For each round, all native amounts are integer base units:

`provided + service_refund_collected = service_fee_charged + remaining_credit + withdrawn_credit`

The tests check this conservation equation and that the module's native balance backs its total credits. Each request can use only its own call's `msg.value`; pre-existing credits and unsolicited balance cannot fund it. There is no ERC-20 spending or withdrawal function, no generic call execution, no administrator sweep and no prize-wallet access.

The request seed binds the local chain, fee consumer, controller, round ID, locked-input digest, authorized payer, maximum fee and coordinator. One accepted request is allowed per authorization. A valid authenticated result is stored once. Expiry becomes terminal Unfulfilled, not permission to reroll. Insufficient funding or a fee above the cap reverts the attempted request without accepting a randomness request.

The refund amount is derived from the service's recorded request fee and snapshotted refund ratio. A notification alone does not create spendable credit: reconciliation must receive the native value from the associated refund account. Failed direct service transfers can be recovered through the provider's backed refund-credit mechanism. Forced native value and other unsolicited amounts remain unassigned rather than being swept into a payer's credit.

**These are randomness-service fee refunds, not participant ticket refunds.** Transaction gas remains payable separately. A partial service refund does not imply a full refund of operating cost, and none of this backs ticket revenue already converted to MSS2.

## Accepted execution evidence

| Item | Value |
|---|---|
| Accepted run | 42614410076, success |
| Robinhood-code job | 129150589708: 35 passed, 0 failed |
| Arc-code job | 129150590168: 35 passed, 0 failed |
| Workflow commit | `74afdb059decbf005312d5d47b9eae9259b12d57` |
| Runner/source commit | `077f680a6a38eb3e5e6655deb444cc15106b5507` |
| Fee contract Git blob | `37c4a19ae733387c41bf10b18d21334b9f2e6ef8` |
| Fee contract SHA-256 | `a470605471052b9c4b0428b1bd9d9b6a0577cfbfbf11534eef2c73b0a21f9482` |
| Provider revision | `d20dao/d20-sdk@fc4b546c06017703b0508ef2182d2030d789c966` |
| Provider SDK | 0.6.2 |
| Compiler | Solidity 0.8.28, Cancun, viaIR, optimizer 200 runs |
| Resolved dependency-lock SHA-256 | `af9d7c99ae7780bff99532228a458374bad174aaf254f94dd9a29b07f5f41dad` |

The same 35 scenario categories were exercised in fresh local chain IDs 31337 and 31338. This is 70 executions, not 70 unique tests and not live transactions on Robinhood or Arc. Earlier suites were not rerun as part of this workflow.

Both downloaded result archives were checked against GitHub's recorded SHA-256 digests. They preserve individual test results, run output, the executed source files and the generated dependency lock. Source and lock hashes agreed across modes. Raw artifact IDs are 13672470433 (Robinhood-code mode) and 13672690160 (Arc-code mode), with 30-day GitHub retention. The normalized record preserves their hashes.

Coverage includes exact/current fee handling, caps, zero/excess funding, multiple payers and rounds, unauthorized requests/withdrawals, immutable authorizations, duplicate requests, actual source-level proof verification, forged callbacks, expired requests, partial/full service refunds, refund-ratio changes, out-of-order reconciliation, rejected recipients, reentrancy, forced native transfers, unchanged fixture-token balances and conservation.

The positive local request consumed 605,560 gas in Robinhood-code mode and 689,400 in Arc-code mode, including refund-account creation. These are fixture observations, not production cost estimates or approved gas budgets. The per-request account has an added deployment cost that must be assessed against a simpler alternative before production selection.

### Initial run and correction

Initial run 42614019405 produced 33 passes and 2 failures in each mode. The rejected overwrite and duplicate-request transactions behaved as expected, but `assert.deepEqual` compared two ethers Result proxies instead of their plain decoded field values. The corrected read helper uses `toObject()` and retains every named budget field and all original assertions. The accepted rerun passed all 35 in each mode.

The contract and environment files are byte-for-byte unchanged between the initial and accepted artifacts. Only the runner's decoded-value helper and its workflow pin changed. The initial failures remain recorded and are not counted as accepted evidence.

## Scope and explicit limitations

The suite compiles the actual pinned provider coordinator, proof verifier, beacon verifier and Arc epoch-registry sources. It uses a deliberately public local test VRF scalar, recorded public beacon signatures, an artificial historical clock and synthetic balances. It is not an arbitrary-word coordinator mock, but it also does not test a live keeper or unpredictable production results.

Robinhood mode uses an explicit local ArbSys block-number shim, not a Nitro network emulator. Arc mode uses generic local native balances, not Arc's native-USDC/ERC-20 shared-balance implementation. An ERC-20 fixture remaining untouched does not establish Arc native-USDC isolation. That requires the dedicated Arc engine/fork test during integration.

One recovery case explicitly substitutes a reverting implementation at the local refund-account address to force a failed service transfer, then restores the exact original runtime before testing credit recovery. This is failure injection, not a claim that the normal account failed. The module and coordinator code are unchanged in that test.

The module is a separate research consumer, not a drop-in replacement for the current draw's fixed-refund-recipient interface. Its fixture controller supplies a digest; this alone does not prove paid tickets or reserved prizes. It does not receive ticket revenue, choose a winning ticket, swap tokens, credit an MSS2 stake or establish custody of the real reserve.

Authorizations are immutable. An above-cap fee stops the request; there is not yet an approved pre-request amendment/cancellation policy. A future integration must not evade this by authorizing another ID for an already requested draw. Missing callbacks require provider same-result or refund-notification retries before the component can advance; production recovery UI/automation remains to be built.

Provider upgrade authority, withholding/liveness, real wallet control, independent security review, legal/eligibility review, token behavior, operating-cost policy and deployment approval remain open. Neither providerApproved nor livePaymentEnabled is enabled.

## Next scoped step

**Connect the budget component to one locally tested draw lifecycle and implement the chain/token/round-qualified funding ledger.**

The draw controller must derive the actual locked ticket/prize digest, authorize one request path, authenticate and associate the returned result, and prevent bypass through the original permissionless exact-fee entry point. Test normal delivery, delayed delivery, expiry and same-result recovery through the combined system. The standalone fee module has not completed that wiring.

The ledger must distinguish ticket receipts, developer allocation, prize purchase budget, confirmed liquid MSS2 acquired, amounts owed to the locked winner, exact stake credit and participant-refund liabilities. Operating credits remain separate. Use explicit parameters and unresolved release gates for price, percentages and destinations; do not invent production defaults. Preserve the shared reserve's existing arcade obligations.

The agreed product remains USDG tickets on Robinhood, USDC tickets on Arc, ordinary liquid MSS2 purchases, separate chain-local draws and owner-signed direct-to-stake payout from `0xE8b63245DdDAB73C7A276818942341D8Cfb7D7A7`.

No main merge, public deployment, live wallet approval, real purchase, prize payout or production-setting change occurred. Draft PR #54 remains a review artifact.

## References

- Accepted run: https://github.com/TheCryptoArborist/yield-vaccum/actions/runs/42614410076
- Prior integration: [actual coordinator](mss2-daily-draw-coordinator-integration.md)
- Provider request/fee contract: https://d20dao.org/docs/integration
- Provider service-refund semantics: https://d20dao.org/docs/service-rules
- Solidity external-call safety: https://docs.soliditylang.org/en/latest/security-considerations.html
