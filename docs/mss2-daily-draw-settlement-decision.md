# MSS2 Daily Draw — settlement authority decision (ADR, proposed)

Date: 2026-11-09 UTC. Related: Issue #53; Draft PR #54.
**Status: RECOMMENDATION FOR REVIEW, NOT AN APPROVED POLICY OR DEPLOYMENT.**
Research branch only. No live payments, wallet changes, or on-chain settlement transactions.

## Fixed design requirements

- Independent daily draws on Robinhood (USDG tickets) and Arc (USDC tickets).
- The prize allocation buys **liquid MSS2** on that same chain. A draw locks ticket ownership and a verifiable single winner; no reroll.
- The selected prize sender is the owner-controlled address `0xE8b63245DdDAB73C7A276818942341D8Cfb7D7A7`, on the corresponding chain.
- The sender signs `MSS2.airdropStake([winner], [offeredAmount])`. The beneficiary receives **staked MSS2**, not liquid tokens.
- Existing Yield Vacuum arcade liabilities are not fungible with the Daily Draw prize obligation, even where they share an externally controlled reserve address.
- The actual credit can be less than the offered amount due to a mutable recipient stake cap. A successful receipt may credit zero. The unpaid remainder and the original winner must remain recorded.
- Payment price, developer/prize split, eligibility, timing, participant refund backing, and shortfall policy are still unapproved.

## Why a settlement decision is required

The latest isolated-fork worker (run 42628540736) imports the locked on-chain award and verifies actual staking gift receipts through a read-only chain interface. It writes transactionally into the isolated Postgres research store. The prototype on-chain draw nevertheless still reports `AwardPending` and the original liability after a verified external gift.

**An EVM contract cannot ordinarily inspect the transaction receipt of an unrelated earlier EOA transaction simply by receiving a transaction hash.** The receipt collector and database can verify evidence operationally, but writing a hash into a smart contract is not receipt-proof verification.

MSS2's `airdropStake` is called by the designated external wallet; its event does not carry a Daily Draw round ID. Identical independent gifts can be sent twice, and the application cannot prohibit an uncoordinated wallet send. Therefore a separate settlement assertion should not be described as trustless.

## Alternatives considered

| Option | What it means | Benefit | Cost / trust assumption |
|---|---|---|---|
| **A. Receipt-derived public status; immutable on-chain winner/award** | Keep winner and amount immutable on-chain. Treat a verified gift receipt and durable evidence as the status displayed to users; do not add an on-chain `markPaid` claim. | Preserves the selected reserve as the sender and avoids inventing a proof bridge or discretionary admin override. Users can inspect both winner selection and credits. | The contract cannot enforce payout or clear its original liability; the external wallet and database/indexing remain trusted for delivery and public status. Must change production semantics/UI so `AwardPending` is not misrepresented as an unsettled perpetual contract escrow. |
| **B. Restricted reserve-signed settlement attestation** | After independent receipt checks, the reserve signs an award-, chain-, winner-, amount- and receipt-bound statement; the draw contract records attested credits once. | Gives the draw contract an on-chain accounting update while preserving the reserve as gift sender. | This is an **operator assertion**, not cryptographic validation of the other transaction's receipt. If authorization is abused or compromised, the contract can record false credit. Requires new signer/nonce/governance and audit work. |
| **C. Escrow-funded atomic airdrop** | Dedicated prize-holding contract invokes `airdropStake`, measures its return/accepted amount, and updates its own award liability in the same transaction. | Strongest direct linkage between credit and on-chain accounting; funds can be protected by the contract. | `msg.sender` for the gift becomes the escrow contract, **not** the selected `0xE8…7A7` wallet. Changes a confirmed product requirement, custody, funding and audit surface. Requires fresh explicit approval. |
| **D. Independently verified receipt-inclusion proof** | Implement and audit a chain-specific verifier capable of proving receipt/state against a trusted finalized header. | Could reduce reliance on a payer's attestation. | Material network-specific proof/finality complexity and expense on Robinhood/Arc; not demonstrated by the existing local work. |

## Recommendation for initial release design

**Recommend Option A for review**, because it preserves the explicitly selected sender without creating an illusory on-chain receipt verifier. This recommendation **does not approve** a production launch or promise trustless prize custody.

For a production-facing contract/spec, distinguish:
1. **On-chain draw result:** final ticket, winner, and immutable awarded quantity. This cannot be edited by the operator.
2. **Off-chain operational obligation:** award amount minus the sum of *verified* on-chain gift credits attributable to that unique award. The obligation is not a contract-controlled reserve and must not be advertised as escrow.
3. **Public payout verification:** source chain and contract addresses, award ID, winner, purchase evidence, attempted transaction hash(es), confirmed matching gift/transfer events, confirmation policy, exact credited amount and remaining amount, and any unresolved/reorg state.
4. **Custodial status:** explicitly owner-signed/pending until the sender delivers. Do not say "automatically paid" or "contract-guaranteed".
5. **Outstanding on-chain prototype status:** the current `AwardPending` contract is NOT ready for deployment. Before release, either formally redesign the status model to keep an immutable winner/award with an external receipt-derived display, or obtain review/approval for an alternative contract settlement design. Never silently claim that a database observation decrements an on-chain liability.

The verified payout monitor should never expose a browser-controlled `confirm paid` route. On a missing/uncertain transaction, preserve the reservation and stop resending. On a positively contradicted canonical inclusion, reverse only the operational credit and freeze the sender lane pending review. Publishing a verified receipt **does not** grant a user a second entry or a new winner.

## Required tests and reviews before implementation approval

1. Developer reviews the production draw contract's award/phase semantics and agrees whether on-chain outstanding liabilities are removed/reframed under Option A, or whether another option is chosen. Document the exact public claim about what is owed and which custodian holds it.
2. Build a read-only public evidence projection from the stored verified receipts with correct chain/round keys, chain-specific confirmation policy, reorg review, multiple partial credits, event uniqueness and an immutable winner. No untrusted browser-supplied paid amounts.
3. Verify the actual reserve's ability and intention to sign on both chains without exposing keys. Do not assume admin login grants spending authority. Resolve the wallet's preexisting arcade obligations and make the Daily Draw inventory segregated and auditable.
4. Define stake-cap exhaustion and subminimum-remainder outcomes, backed ticket refunds and dispute/incident handling *before* charging real entry fees. One winner remains one winner; no discretionary redraw.
5. Reconnect the real-coordinator randomness implementation with the integrated market/receipt/DB stack in an isolated acceptance suite. Current D20DAO actual-source tests and real-market fork tests are **separate**, not a single genuine-provider flow.
6. Obtain independent security review, contract/accounting review, and applicable legal/eligibility review for a paid-entry drawing before public activation. Verify current provider deployment authority, token/router/staking versions and domain/deployment ownership.

## Non-goals in this ADR

No additional contract authorizations, `markPaid`, signing service, autonomous payouts, new Netlify migration, web API, production switch, main-branch merge, or real transaction. This is a proposed settlement trust model for developer/product approval; all options remain open pending review.

## Existing evidence

- [Connected read-only chain reader and private-fork Postgres receipts](mss2-daily-draw-chain-reader.md) — accepted run 42628540736.
- [Persistent payout reservations](mss2-daily-draw-persistence.md) — accepted run 42626166537.
- [Market-ledger and staking gift](mss2-daily-draw-market-ledger.md) — accepted run 42621984190.
- [Actual coordinator local integration](mss2-daily-draw-coordinator-integration.md) — accepted run 42611914241.
