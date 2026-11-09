# MSS2 Daily Draw — integrated local controller and funding ledger

Recorded 2026-11-09 UTC. Research only. Issue #53; Draft PR #54.

**Accepted run 42617426146 succeeded: 43 integrated scenario categories passed with each coordinator implementation, and the unchanged 35-case operating-fee suite passed again in each mode. This is 86 integrated executions plus 70 fee regression executions, not 156 unique scenarios or live-network tests. No real funds, public RPC calls, public transactions, market swaps or staking payouts occurred.**

## Accepted evidence

| Item | Value |
|---|---|
| Workflow run | 42617426146, success |
| Robinhood-code job | 129160678024: 43 integrated + 35 fee regressions passed, zero failed |
| Arc-code job | 129160678233: 43 integrated + 35 fee regressions passed, zero failed |
| Workflow revision | `f7fd00f71ecf6fa7ef181b05397b3df78300b8a2` |
| Source revision | `02ee08804abf7e4989166185f22a93cb2669e957` |
| Integrated contract Git blob | `57ae893df611287a4168f80f952cdbca5bada24b` |
| Integrated contract SHA-256 | `7746355a44e1d4b906449d15fb4efa6cf82844914d6255ce8526f49efe1e3076` |
| Integrated runner Git blob | `9a4b8a287979e9fae6f04e59f4da0c610e3752f6` |
| Unchanged fee contract Git blob | `37c4a19ae733387c41bf10b18d21334b9f2e6ef8` |
| Unchanged environment Git blob | `58de49be9ef50b3c199cfa72763fe30b380b671d` |
| Unchanged fee regression runner Git blob | `6d39235feb575f538a3a824dac5b23a2e000685f` |
| Provider revision | `d20dao/d20-sdk@fc4b546c06017703b0508ef2182d2030d789c966` |
| Resolved dependency-lock SHA-256 | `dc7ad8ea6847da5e03cd1b63ad63c3ebd06413ef459d366513bf27f9f9394edc` |

Downloaded archives were checked against GitHub's digests: Robinhood artifact 13674000012, SHA-256 `e63400d2e9549f29d7ddd708d25205ba9dc5a59cde101121de03197f9c0c7af4`; Arc artifact 13673416742, SHA-256 `eb13bb428ae447f51d089ace9513a4b32c6aaad1fd977a883f5542685ddb1ab7`. They preserve the executed sources, reports, logs and resolved dependency lock, with 30-day GitHub retention. The normalized evidence below preserves their identifiers and hashes.

Files: `research/daily-draw/DailyDrawIntegratedPrototype.sol`, `scripts/daily-draw-integrated.mjs`, `.github/workflows/daily-draw-integrated.yml`, and [normalized evidence](evidence/daily-draw-integrated-2026-11-09.json).

The first run, 42616955704, stopped combined-test compilation because two Solidity local declarations used comma-separated syntax. Commit 02ee088 split them into separate typed statements. No integrated scenarios ran in that failed attempt; the existing fee regression suite passed. The accepted rerun uses the same test assertions. No runtime safety check was removed to obtain passing results.

## What is now connected

The new DailyDrawIntegratedPrototype creates the already-tested operating-fee consumer with itself as the immutable controller. It is a separate local-only successor, not inheritance from the old exact-fee draw. The old prototypes and original fee-test environment remain unchanged.

The integrated path is:

**Paid fixture tickets -> entry cutoff -> fixed developer/prize allocation -> measured liquid fixture-token purchase into an external reserve -> locked actual ticket/funding digest -> one capped operating-fee request -> authenticated stored result -> recorded owner of the winning ticket -> AwardPending with outstanding token liability.**

Only the configured payer can fund the fee module. Permissionless sync reads that module's stored phase, round/request association and word. No caller supplies a winner or word. The old requestDraw/rawFulfillRandomness/onRefund entry points do not exist on this controller. Only its own funded round can authorize the corresponding fee budget; outsiders cannot inject another digest or authorize an alias for those tickets.

The locked digest includes chain/controller/token/round identity, ticket count and ownership digest, time boundaries, price, developer parameters, measured input/output amounts, external reserve, purchase boundary, payer, fee cap and fee-module address. Every ticket has equal selection weight. The mapping is independently recomputed in the positive test.

## Funding accounting

All payment and prize amounts are integers in their token base units. Each accounting key binds local chain ID, controller, payment token, prize token and round ID. A round fixes price, developer basis points and receiver before entries begin. Developer rounding is performed on aggregate receipts; the remainder goes to the purchase budget. This is an experimental accounting policy, not approved economics.

After closing:

- `received = developerAccrued + prizeBudget`
- `remaining payment liability = received - spent`
- `prize liability = measured acquired tokens`, not the reserve's total balance
- After selection: `awardOwed = acquired`

The prototype has no developer withdrawal and never marks an award paid. The developer allocation remains an encumbered recorded balance, not a completed payment. A service expiry does not erase the remaining payment balance or acquired-token obligation and does not implement a participant refund.

Operating funds live at a different contract address and only the fee call's msg.value funds randomness. Unused fee funding belongs to the payer. The integrated controller does not accept ordinary native deposits or expose a native/token sweep. Native Arc accounting is not established by this generic EVM test.

The principal fixture used five tickets, a six-decimal test payment asset, an eighteen-decimal prize asset and a 20% developer allocation. These are deliberately test parameters, NOT approved ticket pricing, percentages, token contracts or production receiver addresses. Another case exercises aggregate rounding with a different price and percentage.

## Successful checks

The 43 categories cover exact paid ticket ranges, cutoff enforcement before a keeper closes, failed/short payments, unauthorized operations, reentrancy, rounding, measured purchase amounts, finite approval reset, rejected swaps, insufficient output, expired purchase deadlines, unchanged pre-existing reserve balances, unsolicited donations, immutable funding inputs, one request path, payer restrictions, capped fees, pending/delayed results, immutable winner selection, separate service refunds, round isolation and balance conservation.

Recovery tests also check same-word redelivery through the combined system, retried refund notifications without reopening the draw, and out-of-order expiry/refund linkage for multiple rounds. Returning a randomness-service fee does not reimburse tickets or release the acquired prize tokens from their recorded obligation.

## External reserve limitations

The fixture conservatively snapshots all prize tokens present in the reserve at construction and excludes that initial amount from its prizes. Each purchase measures the actual increase in the reserve and exact decrease in the payment balance. The snapshot is not an inventory of real arcade obligations. Later outside obligations are not discovered. The external wallet can still spend tokens: this code is not escrow and does not change its authority.

New purchase/authorization operations check aggregate backing. A successful check does not reserve funds through future payout. The payer can fund an already-authorized fee budget later, after outside-wallet balances have changed. Production custody and the interval between authorization and fee funding remain explicit review items, not hidden guarantees.

Once randomness is accepted, an underfunded reserve must NOT suppress winner recording. The tested controller retains the fixed winner and full outstanding amount, while reserveCoverage reports the shortfall. It neither redraws nor silently reduces the award. There is no stake-credit or mark-paid function in this milestone.

## Precise test environment

Actual pinned D20 coordinator, proof-verifier and beacon code runs on fresh local Hardhat IDs 31337/31338, using the unchanged original fee-test environment. The compiler is Solidity 0.8.28, Cancun, viaIR with optimizer 200 runs. A deliberately public test VRF scalar and already-published beacon signatures under an artificial clock are fixtures. Robinhood uses the earlier explicit ArbSys shim. Arc uses generic native funds, not its native-USDC engine.

The new token and purchase contracts are deliberately FAKE fixtures: mintable tokens, fixed arithmetic output and injected failures. Their buy ABI is NOT Topaz's live router ABI. This work is accounting/control-flow integration, not a new real-market swap test. Earlier forked swap and stake tests remain separate evidence, not combined into this result. Local reserve/receiver accounts do not impersonate or authenticate the selected real reserve wallet.

Two recovery cases temporarily install a reverting local runtime at the fee consumer address, check accepted-proof or refund-notification failure, and restore the exact original runtime before recovery. Provider and integrated-controller code are not rewritten in those cases. Retries keep the same accepted word/request; transaction gas remains payable on real networks.

A valid proof in this test does not establish unpredictable production entropy, future provider liveness, consensus/finality, current deployment fingerprints or an independent cryptographic/security audit. Only the fee regression suite was newly rerun alongside this integration; other prior suites were not.

## Not implemented or approved

No actual MSS2 airdrop, paid website, participant refund, developer withdrawal, stake-credit receipt reconciler, payout deduplication, finalized custody model, native Arc integration or provider production approval. Ticket prices, splits, operating payer/limits, receivers, deadlines, eligibility and shortfall/refund rules remain unresolved production gates. The selected real reserve remains `0xE8b63245DdDAB73C7A276818942341D8Cfb7D7A7`; its balance/control was not tested here.

The source deliberately restricts construction to local chain IDs. This run did not repeat the earlier standalone prototype's public-chain-ID guard tests, and those counts are not included here. Absence of production withdrawal/refund paths makes this code unsuitable for actual deposits even on a network whose ID is changed to a local one.

## Next milestone

Replace the fixed-rate test purchase boundary with the verified chain-specific purchase adapters in isolated forks and connect an evidence-backed award ledger to the owner-signed stake gift. Mark an award paid only on exact confirmed stake credit; preserve the original winner and unpaid remainder on partial/zero credit. Keep native Arc shared-balance testing, backed participant refunds and economic/eligibility policy as release gates.

Task 3 remains open overall. This local integration milestone does not authorize release. Work stays on the Yield Vacuum research branch. No main merge, application/arcade/dependency change, real wallet approval, market purchase, stake gift, production configuration or MintStakeShare repository access occurred.

## References

- Accepted execution: https://github.com/TheCryptoArborist/yield-vaccum/actions/runs/42617426146
- Earlier fee component: [operating-fee report](mss2-daily-draw-operating-fees.md)
- Earlier coordinator integration: [coordinator report](mss2-daily-draw-coordinator-integration.md)
- Provider integration: https://d20dao.org/docs/integration
- External-call considerations: https://docs.soliditylang.org/en/latest/security-considerations.html
