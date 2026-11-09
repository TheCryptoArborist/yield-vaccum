# MSS2 Daily Draw — provider ownership and historical proof review

Recorded 2026-11-09 UTC. Issue #53; Draft PR #54. Research only. This document supplements the earlier winner-selection report; earlier findings remain historical evidence rather than current acceptance status.

## Decision boundary

D20DAO remains a candidate, not an approved production dependency. The approved utility design is separate daily chain-local rounds with equal chances per paid ticket, one immutable result and one winner per active chain. USDG on Robinhood and USDC on Arc purchase liquid MSS2; the later owner-signed prize gift comes from `0xE8b63245DdDAB73C7A276818942341D8Cfb7D7A7` into the winner's stake. This review does not approve prices, allocation percentages, receivers, refund backing, public deployment or wallet spending.

## Ownership discrepancy: on-chain transition identified

The manifest still names `0x7ad78fc8097DFEA5c12DBb503D6EB6E60f34B40B` as Robinhood's coordinator owner. Current on-chain owner is `0xE953671bf063CF21F89BbA3bfdB4AFc5FE71078A`.

Run **42566220668**, job **128993181944**, verified a transfer between exactly these addresses:

- Coordinator: `0xEc8b95B168c87294c45727Bd2ac903d09316D132`.
- Transfer block: **94,329,459**, hex `0x59f5a73`.
- Block timestamp: **2026-10-21 13:49:33 UTC**, Unix `1792590573`.
- Transaction: `0xa01c7700727aefe777701df47104cf1e88745179ab29f71b2f91475341835966`.
- Block hash: `0x0f16d7c5594f8d6db016cbc9d51bb73a5317ea63ba1eba30b7086e5ef272b47d`.
- In the preceding block, `owner()` returned the manifest address and `pendingOwner()` returned the new address. At the transfer block, `owner()` returned the new address.
- The successful receipt contains the coordinator's `OwnershipTransferred` event. The transaction appears in its block; another RPC endpoint returns the same block hash.
- The transaction calls the new owner contract with selector `0x6a761202`; its outer sender is `0x58E96263b410Ee407f8CDa1348c192f0E8a3D458`. The historical coordinator implementation slot/code matches the recorded implementation at that block.

**Conclusion:** there is an evidenced on-chain ownership transfer explaining the differing addresses. The deployment manifest was not rewritten to hide the difference. This is not proof of the real-world identities controlling the addresses, an exhaustive scan of every ownership change, a Safe module/guard audit, or provider approval. The original manifest-comparison check remains a record of that discrepancy.

### Current owner-contract observations

Both networks' owner contracts returned these two owners from `getOwners()`:

- `0xcA35c280c5DF22958Adb74DD03911C8A0ec3eA03`
- `0x58E96263b410Ee407f8CDa1348c192f0E8a3D458`

Both returned threshold **2**. These are observed getter responses, not proof that signers are independent people or that no modules or alternate authorization paths exist. The owner contracts' Sourcify entries were unavailable during this review.

| Network | Coordinator owner | Reported master copy |
|---|---|---|
| Robinhood | `0xE953671bf063CF21F89BbA3bfdB4AFc5FE71078A` | `0xEdd160fEBBD92E350D4D398fb636302fccd67C7e` |
| Arc | `0xB57f656149749eff6b496dF090336491f977E744` | `0x29fcB43b46531BcA003ddC8FCB67FFE91900C762` |

Arc's registry owner matched its coordinator owner. Its current primary committer was `0xA5496Bb35905Bfe0Bac7D23Ca18c008F5E6Eb13e`, with one backup committer reported. The backup identity and full request-specific authority history are not established by these selected getters.

## Historical randomness evidence

The checker pins `@d20dao/vrf-sdk@0.6.2`, SDK source commit `fc4b546c06017703b0508ef2182d2030d789c966`, documented ABI hashes and exact fixture Git blob hashes. It executes the provider's published verification library against recorded examples. It does not implement independent cryptographic verification from scratch and is not an audit.

Four mathematical proof replays passed: Robinhood requests **1 and 2**, and Arc requests **40 and 41**. Each sample also rejected five deliberately altered inputs: VRF scalar, recorded randomness, client seed, after-deadline acceptance time, and beacon signature/evidence packet. Total: **4 positive proof replays and 20 negative checks**, not 24 separate real draws.

The replay checks the VRF and external-beacon evidence supplied in each fixture, request-specific binding, time bounds, recorded result and deterministic mapping. Historical chain checks separately require successful receipts, event bytes, transaction membership in blocks, historical contract configuration, active implementation slots/runtime, and applicable beacon/epoch records. A valid fixture alone is not sufficient to pass the complete sample.

### Completed evidence before the paced rerun

Run **42566220668** concluded **failure** overall because Robinhood's public archive provider requested a backoff longer than the bounded checker accepted. It was not a failed cryptographic proof.

- **Arc 40 and 41:** each passed the complete implemented historical sample checks, including request/fulfillment/epoch-publication receipts; historical coordinator and registry implementations; epoch catalog/recipe/beacon settings; target/source block bindings; and block-hash corroboration through a second RPC endpoint.
- **Robinhood 1 and 2:** mathematical replays and all ten negative checks passed. Request 1's request and fulfillment receipts were also matched to blocks and corroborated through a second endpoint before the rate limit interrupted remaining checks. The two complete Robinhood samples are not claimed as passed on this run.
- Robinhood's ownership transfer above was verified before the same rate limit.

The subsequent workflow adds a 1,400 ms delay before each HTTP fetch, without changing the pinned checker, routing, response bytes or assertions. It retains the existing bounded Retry-After handling. A later completed result must be recorded explicitly; do not infer success from starting that run.

## Public-data access and corrections

The default Robinhood endpoint lacked the old state needed for the fixture requests and ownership history. A documented Pinax endpoint served that state. The default Arc endpoint returned some historical receipts but not others; the documented dRPC endpoint returned the missing epoch/fulfillment receipts. These are provider data-access differences, not proof of either chain being unavailable.

The archive probe (run **42566022679**) also tested BlockReq's public Robinhood route, which returned a message limiting public historical access to the most recent 1,024 blocks. No registration, credentials, payment or access-control bypass was attempted. Blockdaemon and QuickNode Arc routes returned null for the two probed missing receipts.

Earlier harness issues are retained in history: RPC quantity formatting (leading-zero hex), the SDK beacon-log envelope, padded receipt-status encoding and an inappropriate Arc getter selection. The checker now normalizes quantities/status values, unwraps the documented envelope and selects only the intended view functions. It does not remove receipt, timestamp, state or proof checks to get a passing result.

## Limitations and next acceptance gates

The relevant RPC-reported block hashes are corroborated by another endpoint, but these are not cryptographic inclusion proofs, consensus verification, independently operated-provider guarantees or rollup/L1 finality verification. Snapshot observations do not freeze future implementation upgrades.

The transfer evidence explains the old/new owner difference but does not remove upgrade authority. Valid historical proofs do not guarantee timely future fulfillment or prevent selective withholding by a provider. Review the owner contracts' effective authorization paths and the provider's operational assumptions before adopting it for paid draws.

Next: finish both complete historical samples on Robinhood, then exercise the drawing consumer against actual coordinator behavior in an isolated no-real-funds environment. Check request fees, callback gas, authenticated result delivery, same-result retry, expiry/refund-notification recovery and no-reroll behavior. A complete application still needs ticket/funding accounting, reserve liability separation, payout deduplication, stake-cap shortfall rules, backed participant refunds and full release review.

No real randomness requests, approvals, swaps, stake gifts or public contract deployments were submitted. Application routes, arcade allocations, main, application dependencies and production configuration remain outside these research changes.

## Evidence and source references

- Run: https://github.com/TheCryptoArborist/yield-vaccum/actions/runs/42566220668
- Archive probe: https://github.com/TheCryptoArborist/yield-vaccum/actions/runs/42566022679
- Checker commit: `32b0d96f1d7e065f7a4b83b3023e7744d0720f47`, blob `32118afea1081324039f0a947fba649f1f17aedd`
- Endpoint documentation: https://docs.robinhood.com/chain/connecting/ and https://docs.arc.io/arc/references/connect-to-arc
- Provider security model: https://d20dao.org/docs/security
- Provider verification model: https://d20dao.org/docs/verification
- Pinned SDK: https://github.com/d20dao/d20-sdk/tree/fc4b546c06017703b0508ef2182d2030d789c966
