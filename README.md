# Topaz: Yield Vacuum

An independent sixteen-mission educational arcade game about Topaz DEX, its BNB hub, and local markets on Robinhood Chain, Base, Ethereum and Arc, presented by The Crypto Arborist.

## Topaz documentation refresh · 2026-10-08

The original eleven missions retain their IDs and earned achievements. New lessons cover xTOPAZ share backing and local stakes, Topaz Auto managed ranges (not reward compounding), single-token CL/Auto zaps, aggregator/cross-chain execution and delivery, and dynamic/unstaked fees. All figures and scenarios in the campaign are educational simulations, not live trade quotes or investment guidance.

Primary sources: [overview](https://www.topazdex.com/docs/overview), [multichain](https://www.topazdex.com/docs/multichain), [xTOPAZ](https://www.topazdex.com/docs/xtopaz), [spoke staking](https://www.topazdex.com/docs/xtopaz/staking), [Topaz Auto](https://www.topazdex.com/docs/auto), [Auto risks](https://www.topazdex.com/docs/auto/risks), [zaps](https://www.topazdex.com/docs/liquidity/zaps), [swaps](https://www.topazdex.com/docs/trading/swaps), [fees](https://www.topazdex.com/docs/liquidity/fees), [voting](https://www.topazdex.com/docs/gauges) and [security scope](https://www.topazdex.com/docs/security).

Some cached documentation and live feature-specific pages disagree on Auto network rollout. The lessons therefore require checking the actual selected network's live vault/route instead of claiming uniform availability. Private swaps are distinguished from ordinary cross-chain swaps and the xTOPAZ bridge; this campaign does not simulate the private service's full execution/recovery lifecycle. Later xTOPAZ/bridge/zap components are not represented as covered by the earlier BNB Shieldify review.

The optional `/arcade` area includes Mint Flyer and a demo-only MSS2 Commitments flow. The commitments preview stores only clearly labeled browser-local demo records. It does not request token approvals, transfers, payouts, or membership payments.

## Development

```bash
npm install
npm run dev
```

## Production build

```bash
npm run build
```

The project is configured for a standalone Netlify deployment. Its shared weekly leaderboard uses Netlify Blobs and does not depend on the TREE website or its infrastructure.

## Optional MSS2 Arcade

The `/arcade` route hosts Mint Flyer without changing the free Topaz educational campaign. Public paid entry is enabled on Robinhood Chain and Arc:

- Each flight requires a chain-specific quote for $1.00 USD worth of MSS2. Free flights and continues are disabled.
- Deploy previews retain a real-payment canary restricted to the approved tester wallet.
- Entry allocation: 20% to `0x000000000000000000000000000000000000dEaD` and 80% to the Community Airdrop Reserve at `0xE8b63245DdDAB73C7A276818942341D8Cfb7D7A7`; 0% is retained by Yield Vacuum.
- The demo reads an indicative MSS2/USD value from the verified Robinhood Topaz MSS2/WETH pair on DEX Screener: `0xdfcc6ad671033f7d3eceb24cbae5c0f7f6f8d91e`.
- The server validates the DEX Screener pair identity, token, Topaz market, positive price, and at least $25,000 in reported liquidity before creating a payment quote.
- Arc uses the official chain-qualified Topaz API observation for the independent MSS2/USDC pool `0x01a19ee4688aac8918b99faa6ecb6f2cc3a97a31`. It validates chain ID 5042, token identity and decimals, resolved/fresh price evidence, the USDC path, pool identity, observation age, and at least $25,000 in trusted liquidity.
- Each exact transfer amount is wrapped in a server-stored 90-second quote tied to one browser profile, connected wallet, and run.
- Expired or unavailable quotes cannot start a new scored run; every restart returns to the entry review instead of bypassing it.
- The previous direct-recipient payment switch is permanently disabled. Real entry payments require a reviewed 20/80 router contract and a matching two-destination backend verifier.
- The Community Airdrop Reserve is separate from the creator's personal MSS2 investment wallet. Community reward eligibility, timing, and distribution details will be announced.

The MSS2 Commitments panel is a separate Robinhood-only demonstration for proposed permanent membership contributions. It simulates review, receipt verification, duplicate protection, and an isolated membership record without requesting a wallet action. Its proposed dead-address destination does not apply to ordinary arcade purchases or operating revenue.

## Wallet foundation

The campaign header and MSS2 Arcade can discover MetaMask, Rabby, and other EIP-6963 browser wallets. Connecting reads the selected public account and current chain after user consent. The Topaz wallet picker retains BNB, Robinhood, and Arc support, while the MSS2 Arcade picker offers Robinhood and Arc. Entry requests an exact allowance for the verified router and then the entry transaction, without an unlimited token approval.

Mint Flyer follows the selected MSS2 network. Robinhood uses its own balance and Topaz MSS2/WETH quote; Arc uses its balance and the official Topaz MSS2/USDC price observation. Each independently quotes the MSS2 equivalent of a $1.00 flight. TOPAZ remains outside this release.

## MSS2 public payment release

Public activation was approved on 2026-10-08 UTC after both routers and paid canaries were verified. Production uses the versioned verified router records, regardless of environment address overrides. Local builds remain disabled; deploy previews retain their tester restriction. Production payment records, scores, and wallet proofs use persistent strongly consistent stores even when runtime CONTEXT is absent.

`contracts/Mss2EntryRouter.sol` is the non-custodial prototype. It has fixed token and destination addresses, no owner, no upgrade path, and no withdrawal or rescue function. Each server-issued payment ID can be used once. The router performs two direct `transferFrom` calls, verifies the recipients' exact balance increases, and emits one entry event. It never intentionally holds entry tokens.

The prepared backend verifies the selected chain, router address, transaction sender, exact calldata, successful receipt, exact 20% dead-address transfer, exact 80% reserve transfer, matching router event, required confirmations, and prior transaction use. The leaderboard also requires the verified payment ID to match the same browser profile and run. Payment records remain separate from arcade scores and achievements.

Both networks verify successful receipts and exact transfers before starting a paid flight. The reserve wallet is blocked from paying itself. The MSS2 Commitments section remains demo-only. Read-only monitoring and rollback instructions are in `deployment/mss2-entry-router/RELEASE_CHECKLIST.md`.

## Payment tests

The arcade's community-impact panel shows lifetime MSS2 contributions through
the verified entry router on Robinhood Chain or Arc. It sums confirmed
`EntryPaid` events from the router's creation block, including paid canary
entries, and keeps the networks separate. The reserve figure measures funding,
not rewards distributed or its current wallet balance. The read-only
`/api/arcade-entry-totals?chain=robinhood` endpoint also accepts `chain=arc`.
Context-isolated aggregate caches survive redeployments; recent blocks are
rescanned for chain reorganizations. Incomplete or unavailable history is
clearly labeled and never displayed as a zero total.

```bash
npm test
```

The test command compiles the router with Solidity 0.8.30, checks that its ABI exposes no privileged or custody methods, and runs backend evidence tests for split arithmetic, calldata binding, event matching, exact destination transfers, confirmations, and replay rejection.
