# MSS2 Daily Draw — winner-selection prototype and review gates

Recorded 2026-11-09 UTC (November 8 in America/Chicago). Issue #53. Research branch only.

## Approved direction versus release approval

The owner's instructions to proceed with the winner-selection recommendations approve this design direction for the first version:

- Separate daily rounds, ticket ownership and prize pools on Robinhood and Arc; one winner per participating chain, not one cross-chain winner. Activation sequence and exact cutoff are still undecided.
- USDG ticket payments on Robinhood; USDC on Arc. Each purchased ticket has the same chance, without referral, streak, stake-size or team weighting.
- Record ticket ownership in the utility's contract at successful payment, close entries and freeze outcome-relevant inputs, request one verifiable result, then bind the winning ticket to its recorded owner.
- No administrator-selected winner, replacement random request for an accepted request, reroll, reopening entries or payout-failure redraw.
- Select and record the winner independently of prize delivery. Purchase liquid MSS2 first; the later operator-signed prize airdrop adds to the winner's stake from `0xE8b63245DdDAB73C7A276818942341D8Cfb7D7A7`.
- Evaluate D20DAO first, without treating this as final approval of the provider's governance, cryptography, availability or production use.

This supersedes older Issue #53/readiness wording that described separate rounds and equal ticket weighting as unapproved proposals. It does NOT approve deployment, paid entries, a price, revenue split, receiving addresses, payout automation, real wallet spending, or public launch. Eligibility, minimum participation, exact schedule, reserve shortfall/refund rules and applicable launch review remain open. Test cases for one participant or an empty round establish behavior of fixtures, not a final commercial policy.

## Completed local prototype

`research/daily-draw/DailyDrawPrototype.sol` compiles with Solidity 0.8.28 / Cancun and accepts only local chain IDs 31337 and 31338. Its constructor rejects public Robinhood 4663 and Arc 5042. It is deliberately unsuitable for real money: fixture payments cannot be withdrawn, swapped or refunded; a prize commitment is an announcement, NOT escrow or proof of reserve funding.

The contract uses the D20 consumer callback interface and deterministic NumberRange mapping from SDK commit `fc4b546c06017703b0508ef2182d2030d789c966`. Test coordinator and token are explicit fixtures. The coordinator can inject chosen words to exercise state transitions; these words are NOT cryptographically verified D20 results.

### Implemented application behavior

Ticket purchases create consecutive zero-based ranges only after exact payment succeeds. Ownership uses end-exclusive boundaries and binary search. A rolling digest commits the ownership sequence. The cutoff rejects purchases even before a keeper calls close. Ticket count, digest, payment token, chain, consumer address, schedule, price, round, announced prize and prize sender bind the request seed.

Only the configured coordinator can deliver a result or refund notification. Unknown, duplicate or changed results are rejected. Zero is a legitimate random word. The callback stores the result only; a separate permissionless operation computes the ticket and owner. NumberRange supports more than 256 tickets and uses rejection sampling rather than an uncorrected modulo operation. Distribution fairness still depends on the input randomness assumptions; matching deterministic calculations is not proof of unbiased provider behavior.

An accepted result awaiting delivery is retried with the same stored word. An expiry notification puts the fixture round into Unfulfilled and does not enable another request or return ticket money. Fee refunds are distinct from ticket refunds. There is no winner override, payout call, mark-paid function, manual ticket edit or post-request cancellation interface.

## Accepted test evidence

Completed run: https://github.com/TheCryptoArborist/yield-vaccum/actions/runs/42563327635
Job: `128984327367`. Overall conclusion: **success**.
Workflow commit: `0971e07f18651f7821d97da78429f4ec35c3b96c`.
Pinned runner commit: `a2be329e04eea46ccffade86feb560ab108e3f24`; runner blob `eac0716e805e00c54e0564ab0958da19df135f35`.
Contract blob: `7c6471f8154d9b71d19aad1d3ad5c463135c5d9a`; SHA-256 `dd52a15ad4c430594c4d75862007e4958ab7cf89dd425d854a3a179da1a51ce1`.

| Environment | Result | Exact scope |
|---|---|---|
| Fresh local chain 31337 | 36 passed, 0 failed | Fixture payment/coordinator lifecycle |
| Fresh local chain 31338 | 36 passed, 0 failed | Same scenarios in a separate local instance |
| Local emulator using chain ID 4663 | 1 passed | Constructor rejected public-chain ID |
| Local emulator using chain ID 5042 | 1 passed | Constructor rejected public-chain ID |

This is **36 unique lifecycle scenarios repeated twice plus two deployment-guard checks: 74 successful executions**, not 74 unique fairness tests and not 36 live-chain tests per network. No public RPC is used by this test runner, and no mainnet transaction was submitted.

Coverage includes exact paid ownership, short/false/missing payment rejection, timing boundaries, empty rounds, a single ticket, more than 256 tickets, first/last ticket selection, operator-only setup, write-once prize commitment, fee mismatch, request rollback, one successful request per round, seed replay, forged/unknown/duplicate callbacks, out-of-order rounds, independent ticket mapping, same-word delivery retry, expiry without reroll, forged refund rejection and terminal result preservation. The configured 120,000 callback-gas fixture succeeds locally; production gas headroom requires a separate integration test.

Earlier run 42563015350 failed 17 of 32 scenarios per local instance because cached provider reads/estimates crossed synchronous snapshot resets. The corrected runner disables ethers provider caching, checks snapshot restoration, retains contract assertions, requires negative tests to fail with EVM CALL_EXCEPTION and adds four lifecycle scenarios. The contract was not relaxed to make tests pass. Only the completed corrected run supplies accepted counts.

The no-referrer-binding and direct-to-stake integration tests from earlier work are separate evidence. This prototype does not yet connect ticket sales, swaps, genuine randomness, winner selection and payout as one application.

## D20DAO provider acceptance is NOT complete

Official documentation identifies single-operator availability and upgrade-authority assumptions. A valid output proof does not force fulfillment or remove selective withholding. Coordinator authentication means this prototype trusts that proxy's current implementation; an owner-authorized upgrade can change its behavior. No independent cryptographic audit or service guarantee has been established by this work.

The read-only probe compares selected deployed runtimes, active implementation slots, pricing and roles with public manifests. The ABI JSON is read from pinned `@d20dao/vrf-sdk@0.6.2` exports and matched to hashes published in its API reference. It does not execute SDK JS entrypoints or submit a randomness request. All write/sign methods are rejected before network access.

### Robinhood review finding

Run 42563488083 at block `0x68b3fdb` found the coordinator owner to be `0xE953671bf063CF21F89BbA3bfdB4AFc5FE71078A`, while the published manifest lists `0x7ad78fc8097DFEA5c12DBb503D6EB6E60f34B40B`. Compared code, implementation, keeper and pricing fields matched. The overall check remains failed on the discrepancy; the expected owner has NOT been replaced with the observed address to manufacture a passing result.

This may be a legitimate ownership transfer with stale deployment documentation. It is NOT, by itself, evidence of compromise. Before adoption, reconcile the ownership-transfer history, current owner's control/upgrade powers and published configuration. Obtain independent current-chain evidence rather than relying on a static address list.

### Arc checker correction

The same run compared Arc's coordinator/registry runtime and implementation fields successfully but stopped when this research checker incorrectly tried Robinhood's `keeper()` getter on Arc's epoch coordinator. That is a checker assumption, not a demonstrated Arc contract failure. The corrected probe treats the two ABIs separately and explicitly leaves Arc epoch committer/backup authorization and registry-owner review outstanding. Do not represent partial prior output as complete Arc approval.

## Remaining acceptance work

1. Complete/reconcile provider deployment and ownership evidence, including historical implementation and request-specific authorization. Preserve failures in the report rather than silently accepting changed configuration.
2. Replay genuine recorded proof evidence from each network, checking actual inclusion and historic chain context as well as mathematical validity; negative/tampered proof tests must fail. No such proof replay is claimed here.
3. Exercise this consumer with the actual coordinator behavior in a suitable isolated/funded-test environment under separate authorization. Confirm fee quoting, sufficient callback gas, failed delivery recovery using the same result, expiry notification recovery and withheld fulfillment. Local mock callbacks do not establish this.
4. Build and review the real ticket escrow/allocation, purchase records, award ledger and receipt verification. An operator-owned external prize wallet is not contract-enforced escrow. A locked announced prize alone does not prove funds are reserved.
5. Set a backed failure/refund policy before entries open. Converting ticket funds into MSS2 does not preserve a guaranteed stablecoin refund; a randomness-fee refund is not ticket reimbursement. A capped winner must not be silently replaced or paid a different prize.
6. Complete production eligibility, economics, schedule, wallet authority, application end-to-end/regression tests and independent security/legal release review. No production flag is enabled by a successful fixture run.

## References

- D20 security model: https://d20dao.org/docs/security
- Integration: https://d20dao.org/docs/integration
- Service rules: https://d20dao.org/docs/service-rules
- Verification evidence: https://d20dao.org/docs/verification
- SDK API at the pinned revision: https://github.com/d20dao/d20-sdk/blob/fc4b546c06017703b0508ef2182d2030d789c966/API.md
- Initial live observation with ownership discrepancy and Arc checker stop: https://github.com/TheCryptoArborist/yield-vaccum/actions/runs/42563488083

Task 3 remains open. Research scripts, tests and documentation are review work only. No MintStakeShare repository access, main-branch merge, existing arcade change, live wallet approval, purchase, airdrop or production deployment is part of this work.
