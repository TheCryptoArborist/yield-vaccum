# MSS2 Daily Draw — provider ownership and historical proof review

Updated 2026-11-09 UTC. Issue #53; Draft PR #54. Research only. This supplements the earlier winner-selection report; earlier unresolved findings remain historical records, not the latest status.

**Accepted run 42566437894 completed successfully: two historical randomness samples per network passed the implemented proof and chain-evidence checks; all 20 altered-evidence checks were rejected. Robinhood's owner discrepancy is explained by an evidenced ownership transfer. Provider production approval and Task 3 completion remain false.**

## Decision boundary

The approved utility design remains separate daily chain-local rounds, equal chances per purchased ticket, one immutable result and one winner per active chain. Tickets use USDG on Robinhood and USDC on Arc. The prize allocation buys liquid MSS2; the later owner-signed gift comes from `0xE8b63245DdDAB73C7A276818942341D8Cfb7D7A7` into the winner's stake.

This review does not approve a public deployment, paid entries, prices, revenue percentages, receivers, refund backing, wallet spending or D20DAO as a production dependency. No current application payment or payout behavior changed.

## Accepted execution and reproducibility

- Run: **42566437894**, job **128993827671**, conclusion **success**; completed 2026-11-09 05:23:00 UTC.
- Workflow commit: `a1465eae4cfd42132a279877a1732974a69e255e`.
- Checker commit: `32b0d96f1d7e065f7a4b83b3023e7744d0720f47`; blob `32118afea1081324039f0a947fba649f1f17aedd`.
- Verification package: `@d20dao/vrf-sdk@0.6.2`; source commit `fc4b546c06017703b0508ef2182d2030d789c966`; fixtures pinned by exact Git blob and ABI data by documented SHA-256.
- The workflow's small wrapper adds 1,400 ms before each HTTP fetch. The pinned checker and every assertion are unchanged. Original bounded Retry-After handling remains enforced.
- All upstream RPC methods are read-only. Five signing/transaction methods were rejected before network access. No private keys, paid accounts, production credentials or new randomness requests were used.

This is verification using the provider's published cryptographic implementation, not independently authored cryptography or a security audit. Fixture integrity and mathematical replay are checked separately from public-chain evidence.

## Ownership discrepancy: on-chain transition identified

The published Robinhood manifest still names `0x7ad78fc8097DFEA5c12DBb503D6EB6E60f34B40B` as coordinator owner. The observed current owner is `0xE953671bf063CF21F89BbA3bfdB4AFc5FE71078A`.

The accepted run verified a transfer between exactly these addresses:

| Evidence | Value |
|---|---|
| Coordinator | `0xEc8b95B168c87294c45727Bd2ac903d09316D132` |
| Transfer block | **94,329,459** (`0x59f5a73`) |
| Timestamp | **2026-10-21 13:49:33 UTC** (`1792590573`) |
| Transaction | `0xa01c7700727aefe777701df47104cf1e88745179ab29f71b2f91475341835966` |
| Block hash | `0x0f16d7c5594f8d6db016cbc9d51bb73a5317ea63ba1eba30b7086e5ef272b47d` |

In the preceding block, owner() returned the old address and pendingOwner() the new address. At the transfer block, owner() returned the new address. A successful receipt contains the coordinator's OwnershipTransferred event; the transaction belongs to the reported block and a second RPC endpoint returns the same block hash. The coordinator's historical implementation slot and runtime also match the recorded implementation at the transfer block.

The outer transaction calls the new owner contract with selector `0x6a761202`, from `0x58E96263b410Ee407f8CDa1348c192f0E8a3D458`.

**Conclusion:** the different owner addresses have an evidenced on-chain explanation. The manifest is not treated as an accurate current owner list, and its old value was not silently replaced in the original comparison test. This is not proof of real-world controller identities, an exhaustive ownership-history scan, full multisig authorization review, absence of compromise, or provider approval. Bisection located one old-owner transition and verified the surrounding states and event.

### Current owner-contract observations

Both networks' owner contracts return these two owner addresses and threshold **2**:

- `0xcA35c280c5DF22958Adb74DD03911C8A0ec3eA03`
- `0x58E96263b410Ee407f8CDa1348c192f0E8a3D458`

| Network | Coordinator owner | Reported master copy |
|---|---|---|
| Robinhood | `0xE953671bf063CF21F89BbA3bfdB4AFc5FE71078A` | `0xEdd160fEBBD92E350D4D398fb636302fccd67C7e` |
| Arc | `0xB57f656149749eff6b496dF090336491f977E744` | `0x29fcB43b46531BcA003ddC8FCB67FFE91900C762` |

These are getter observations, not proof that the signers are independent people or that no module, guard or alternate authorization path exists. Sourcify entries for the owner contracts were unavailable in this review. Arc's registry owner matched the coordinator owner. Its primary committer was `0xA5496Bb35905Bfe0Bac7D23Ca18c008F5E6Eb13e`, with one backup reported; complete backup and historical request-specific authority review remains outstanding.

## Historical randomness checks

| Network | Historical provider request IDs | Mathematical replay | Implemented historical chain checks | Altered-evidence rejections |
|---|---|---|---|---|
| Robinhood | 1 and 2 | 2 passed | 2 passed | 10 of 10 |
| Arc | 40 and 41 | 2 passed | 2 passed | 10 of 10 |

These are **four historical provider requests**, not four new MSS2 draws. The five negative cases per sample alter the VRF scalar, recorded randomness, client seed, acceptance time beyond the deadline, or beacon signature/evidence packet. All were rejected. Previous local prototype and purchase/staking suites were not rerun and are not included in these counts.

For each sample the checker requires:

1. Exact pinned source fixture and ABI data; successful SDK verification of proof, external-beacon evidence, request binding, time limits, recorded result and deterministic mapping.
2. Matching historical getRequest/getRoundRequest state and mapping hash, successful request/fulfillment receipts, exact emitted proof packet and transcript, and matching request/acceptance timestamps.
3. The transaction's membership in its reported block and the event's membership in its receipt, with relevant block hashes corroborated by a second endpoint.
4. The expected coordinator implementation slot/runtime at request and acceptance, and matching historical public key, configuration hash and initial configuration values.
5. Robinhood: historical beacon registration and verification, plus the beacon schedule rebuilt from chain events from coordinator initialization through the request block. Arc: epoch publication receipt/packet, historical epoch record, catalog/recipes/beacon settings, source and target block bindings, and registry implementation/runtime.

The original requests reported successful callback delivery at acceptance. That is the historical provider consumer's result, not evidence that our Daily Draw consumer has made or received a genuine request.

### RPC provenance and anchors

| Network | Historical state/receipts | Header corroboration | Rechecked observation anchor |
|---|---|---|---|
| Robinhood | `https://robinhood.rpc.pinax.network` | `https://rpc.mainnet.chain.robinhood.com` | `0x68b8901`, `0x389e9466b57d5a9ed74950c6bb8daa5bddf2d3e1d33fe353bfbbefb162523457` |
| Arc | `https://rpc.drpc.mainnet.arc.io` | `https://rpc.mainnet.arc.io` | `0x1ce4ff0`, `0x762a02573fbe39c0c13c2daeccaabe5e89a7662685bb18a837e9ef9ebbb6568f` |

Both observation-anchor hashes were reread at the end. They are latest-block observations, not asserted finalized anchors. RPC-reported block agreement is not cryptographic inclusion proof, independent-provider-operator proof, consensus verification or rollup/L1 finality verification. The code comparisons use recorded deployment fingerprints, not independent compiler reproduction. Future upgrades remain possible.

## Retained failed runs and data-access findings

- **42565416479:** initial harness defects involving leading-zero RPC quantities, beacon-log envelope handling, padded receipt-status encoding and an inappropriate Arc getter selection. Corrections preserved proof, receipt, timestamp and state checks.
- **42565646661:** all four mathematical proofs and 20 negative checks passed, but the default Robinhood RPC lacked old state and default Arc RPC lacked selected receipts. Partial chain checks were not counted as completed samples.
- **42566022679:** a bounded endpoint probe identified usable Pinax history and dRPC Arc receipts. BlockReq's public route explicitly limited access to 1,024 recent blocks; no registration or access-control bypass was attempted. The other probed Arc endpoints returned null for the missing receipts.
- **42566220668:** ownership transfer and both complete Arc samples passed; Robinhood's archive rate limit stopped the remaining sample checks. The checker respected its bounded backoff rather than ignoring the provider's response.
- **42566437894:** final accepted full run with slower pacing. Both complete samples on both networks passed, all 20 negative cases were rejected, and ownership evidence was checked again.

The successful final run does not overwrite the original manifest discrepancy or turn partial failed runs into successes.

## Remaining acceptance gates and next work

**Next integration milestone:** exercise our drawing consumer with actual coordinator behavior in an isolated no-real-funds environment. Test request-fee handling, callback gas, authenticated fulfillment, same-result redelivery, expiry/refund-notification recovery and no reroll. Replaying historical third-party requests is not that end-to-end integration test.

Before production approval, separately review current effective upgrade authority, owner-contract implementation/modules/guards, epoch backup and historical authorization, operational liveness and selective-withholding assumptions. Four successful historical samples do not establish a future service guarantee or independent cryptographic audit.

The application also still needs real ticket/funding accounting, reserve liability separation, payout deduplication and receipt verification, stake-cap shortfall rules, backed participant refunds, approved economics/eligibility and full release review. An operator-owned reserve is not contract-enforced escrow. A randomness-fee refund is not reimbursement of ticket revenue already converted to MSS2.

Task 3 remains open. No main-branch merge, application/arcade change, public deployment, wallet approval, real purchase, prize payout, production setting or MintStakeShare repository access was performed.

## References

- Accepted run: https://github.com/TheCryptoArborist/yield-vaccum/actions/runs/42566437894
- Normalized evidence: [provider-history record](evidence/daily-draw-provider-history-2026-11-09.json)
- Endpoint documentation: https://docs.robinhood.com/chain/connecting/ and https://docs.arc.io/arc/references/connect-to-arc
- Provider security: https://d20dao.org/docs/security
- Provider verification: https://d20dao.org/docs/verification
- Pinned SDK: https://github.com/d20dao/d20-sdk/tree/fc4b546c06017703b0508ef2182d2030d789c966
