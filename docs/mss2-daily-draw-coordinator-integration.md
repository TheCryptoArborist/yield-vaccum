# MSS2 Daily Draw — actual-coordinator local integration

Recorded 2026-11-09 UTC. Issue #53; Draft PR #54; research branch only.

**Accepted run 42611914241 completed successfully: 20 scenarios with the Robinhood coordinator code and the same 20 scenario categories with the Arc coordinator code, for 40 successful local executions. No public-chain transactions, real ticket payments, MSS2 purchases or prize airdrops occurred. This completes the initial local actual-coordinator integration milestone, not Task 3 as a whole or production approval.**

## Evidence and reproducibility

| Item | Value |
|---|---|
| Accepted GitHub Actions run | 42611914241 |
| Job | 129142191518 |
| Result | success; final test output 2026-11-09 11:50:13 UTC |
| Workflow commit | `20d2576097a71ec1ca60cc89524fff7f030d4b2a` |
| Runner commit | `8f578a26bb941aded203fe3494da4014ba09359e` |
| Runner Git blob | `4c01949f6034a2ff21c0193c9bb8a886d0ac9c79` |
| Provider source revision | `d20dao/d20-sdk@fc4b546c06017703b0508ef2182d2030d789c966` |
| Provider SDK | `@d20dao/vrf-sdk@0.6.2` |
| Original draw Git blob | `7c6471f8154d9b71d19aad1d3ad5c463135c5d9a` |
| Original draw SHA-256 | `dd52a15ad4c430594c4d75862007e4958ab7cf89dd425d854a3a179da1a51ce1` |
| Compiler | Solidity 0.8.28+commit.7893614a, Cancun, viaIR, optimizer 200 runs |

Files: `scripts/daily-draw-coordinator-integration.mjs` and `.github/workflows/daily-draw-coordinator-integration.yml`. Normalized results: [evidence record](evidence/daily-draw-coordinator-integration-2026-11-09.json). Raw executed commands, individual case results, source/import hashes and reports are in the completed run logs: https://github.com/TheCryptoArborist/yield-vaccum/actions/runs/42611914241

The branch-scoped workflow fetches immutable revisions, checks selected source Git blobs and installs exact direct dependency versions in an isolated temporary directory with install scripts disabled. Direct versions: ethers 6.15.0, Hardhat 2.26.3, solc 0.8.28, OpenZeppelin contracts and contracts-upgradeable 5.6.1, D20 SDK 0.6.2, noble/curves 1.9.7. It does not change the application package or lockfile. The temporary dependency lockfile is not archived: this is not a claim of complete transitive-dependency reproducibility.

## What replaces the earlier mock

The runner compiles the pinned provider's actual coordinator, proxy, VRF verification, beacon verification and mapping sources. The Arc mode additionally instantiates the actual EpochEntropy registry, registers a beacon and schedules its catalog. The Robinhood mode uses its round-based coordinator and linked proof/mapping libraries.

`research/daily-draw/DailyDrawPrototype.sol` is used unchanged, with its source hash asserted before compilation. It records paid fixture-ticket ownership, closes entries, commits an announced prize, requests randomness, authenticates the response and selects the recorded ticket owner. It still rejects public-chain construction and has no production withdrawal, participant refund, swap or payout implementation.

The cryptographic test uses a deliberately public VRF scalar of 1, newly constructed local request proofs, and already-published drand evmnet signatures under an artificial historical clock. The Solidity verifier must validate the proofs; the coordinator is not replaced with an arbitrary-word mock. The SDK independently recomputes each local proof before submission, but it is the provider's implementation, not an independent audit. The known test key and historical beacon values do not establish unpredictability or service liveness and must never be used for a public draw.

## Scope of the two environments

| Test mode | Local chain ID | Result | Important limitation |
|---|---:|---|---|
| Robinhood coordinator source | 31337 | 20 passed / 0 failed | ArbSys at 0x64 is an explicit local block-number shim, not a Nitro emulator. |
| Arc coordinator source | 31338 | 20 passed / 0 failed | Generic local native balances; Arc native-USDC/token-view accounting is not simulated here. |

These are 20 scenario categories exercised in two local implementations, not 40 distinct scenarios or 20 live tests on each public chain. Both networks' actual consensus, sequencer behavior, finality, production gas schedule and keeper operations remain outside this suite.

Only local in-process Hardhat providers are constructed; no fork or public RPC is used. Fetch is disabled during execution after dependency loading. Fixture accounts, payment tokens and native funds have no real value. The chosen real reserve address is not impersonated or authenticated in this suite. No claim is made about its balance, control or signing ability.

## Successful behavior

### Unchanged Daily Draw consumer: 15 scenarios per mode

The complete local positive path succeeds: two fixture buyers hold five tickets; the round closes; the actual coordinator accepts a valid local VRF proof with verified beacon evidence; the 120,000-gas callback stores its result; a separate permissionless call selects the ticket and owner matching an independent deterministic calculation. The ticket balance and announced prize remain unchanged. This is winner selection, not an MSS2 award or proof of funded escrow.

Additional scenarios cover tampered VRF and wrong beacon signature rejection; insufficient or excessive exact fees; a changed price followed by a freshly quoted successful request; a dynamic base-fee charge; forged wallet callbacks; duplicate requests; early refund rejection; valid proofs arriving after expiry; preservation of a selected result against repeated fulfillment/refund/selection; an empty round; and a request's snapshotted refund ratio despite a later administrator change.

The expiry test confirms that the randomness service fee returns to the configured refund recipient and the draw becomes terminal Unfulfilled. Its fixture ticket tokens remain in the draw contract. That is intentionally NOT a participant-refund implementation or an acceptable real-money terminal design.

### Separate recovery probe: 5 scenarios per mode

A test-only RecoveryProbe deliberately rejects delivery or refund notifications, or requests too little callback gas. It demonstrates the actual coordinator's behavior when:

- A proof is accepted but delivery fails: retry delivers the same stored word without another randomness request or a second service charge. Retry transactions still consume gas.
- A callback exhausts its original 30,000-gas budget: retry with 120,000 gas delivers the same accepted result.
- A refund notification fails: retry delivers the notification without paying the refund twice.
- A refund recipient rejects native transfers: the service records backed credit, which the recipient can withdraw to an accepting address.
- A consumer forwards excess fee funding: the excess is credited to its chosen refund address, not booked as earned service revenue.

These failures are injected through the separate probe, not through modified Daily Draw callback code. They establish the tested coordinator recovery behavior, not completed scheduler/UI recovery for the application.

### Local gas observations

The successful main-draw callback used a 120,000-gas allowance. Entire local fulfillment transactions consumed 569,431 gas in the Robinhood mode and 405,437 gas in the Arc mode in the accepted run. These are fixture observations, not production fee estimates, sufficient worst-case margins or live-chain gas certifications. Local Arc block hashes affect its proof and can change fixture outputs across runs.

## First run and harness correction

Run 42611289890 / job 129140078225 completed with 8 passes and 12 failures per mode. The full positive draw path passed in both. Rejected sends were surfaced by Hardhat/ethers as UNKNOWN_ERROR wrapping explicit EVM reverts, while the negative-test helper required CALL_EXCEPTION. Those failures were retained, not counted as successes.

Commit `8f578a26bb941aded203fe3494da4014ba09359e` changes the local network to mine reverted transactions (`throwOnTransactionFailures: false`). The helper still requires CALL_EXCEPTION and now checks status 0 on a mined receipt; estimation failures must specifically be estimateGas call exceptions. It does not accept arbitrary errors. A deployment-only empty ABI avoids a library-enum warning without changing library bytecode or linking. All original scenario assertions and the actual provider/draw contracts are preserved.

The completed corrected run provides the accepted 20/20 results. The old run is not rewritten or counted toward them.

## Implementation finding: exact-fee safety is not a smooth funding interface

The current draw prototype requires msg.value to equal the same-transaction quote exactly. Tests show it safely rejects both underpayment and overpayment; a stale quote leaves the round closed with no accepted request, so a correctly funded retry is possible. They do not show that this is a robust user interface for changing native gas fees.

**Next scoped implementation recommendation:** build a local-only operating-fee budget and refund-credit adapter, then a chain/token/round-qualified funding ledger. Quote inside the request transaction, enforce an explicit maximum approved operating spend, account for every unused amount and service refund, and never consume participant prize/refund liabilities or existing arcade reserves. The fixed prototype refund recipient is not necessarily the caller who funded a permissionless request; production must explicitly bind the funding account, authorized payer and refund destination rather than silently redirecting someone else's refund.

Do not add a production fee buffer by merely weakening the exact-value check. The adapter needs its own balance-conservation, rejected-recipient, unauthorized-withdrawal, duplicate-request and reentrancy tests. A fee or delivery failure must not allow a new draw result. Prices, developer/prize percentages, account destinations and the payer/refund policy remain unapproved and must be parameters or unresolved gates, not invented defaults.

After that, the implementation needs real ticket/prize/developer accounting, confirmed swap receipts, protected prize liabilities, same-winner payout reconciliation, duplicate-payout prevention, backed participant refunds and stake-cap shortfall rules. Existing wallet custody does not become contract-enforced escrow merely because a ledger exists.

## Remaining gates and current status

The original product direction is unchanged: USDG on Robinhood, USDC on Arc; ordinary Buy of liquid MSS2; separate draws with equal chances per ticket; operator-signed direct-to-stake award from `0xE8b63245DdDAB73C7A276818942341D8Cfb7D7A7`.

Local integration is now demonstrated for the tested provider source revision. It is not a new live randomness request from this application. Recheck deployed implementations and governance before any public test authorization. Effective upgrade powers, modules/guards, request-specific authority, operational liveness/withholding assumptions and independent security review remain open. A proof-valid result does not compel the operator to deliver it.

Previous purchase/staking fork tests and historical provider proof checks remain separate evidence and were not rerun here. No complete payment-to-prize application, legal eligibility, economics, domain migration, wallet authority or release is established. Task 3 remains open; providerApproved and livePaymentEnabled remain false.

This work changes only research scripts/workflow and documentation on the existing research branch. No main merge, MintStakeShare repository access, public deployment, production setting, arcade allocation, real approval, purchase or payout is part of it.
