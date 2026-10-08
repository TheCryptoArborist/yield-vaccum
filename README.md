# Topaz: Yield Vacuum

An independent eleven-mission educational arcade game about Topaz DEX, its BNB Chain economic core, and expansion toward Robinhood Chain, presented by The Crypto Arborist.

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

The `/arcade` route hosts optional arcade games without changing the Topaz educational campaign. The first game is Mint Flyer. Its continue flow uses clearly labeled game credits only:

- The current demonstration models chain-specific Robinhood and Arc MSS2 entry quotes targeting $1.00 USD worth of MSS2 at checkout.
- One same-run continue costs 100 demo credits and restores three lives.
- Demo credits have no cash or token value and create no blockchain transaction.
- Preview deployments keep real transfers disabled.
- Proposed entry allocation: 20% to `0x000000000000000000000000000000000000dEaD` and 80% to the designated Community Airdrop Reserve at `0xE8b63245DdDAB73C7A276818942341D8Cfb7D7A7`.
- The demo reads an indicative MSS2/USD value from the verified Robinhood Topaz MSS2/WETH pair on DEX Screener: `0xdfcc6ad671033f7d3eceb24cbae5c0f7f6f8d91e`.
- The server validates the DEX Screener pair identity, token, Topaz market, positive price, and at least $25,000 in reported liquidity before creating a payment quote.
- Arc uses the official chain-qualified Topaz API observation for the independent MSS2/USDC pool `0x01a19ee4688aac8918b99faa6ecb6f2cc3a97a31`. It validates chain ID 5042, token identity and decimals, resolved/fresh price evidence, the USDC path, pool identity, observation age, and at least $25,000 in trusted liquidity.
- Each exact transfer amount is wrapped in a server-stored 90-second quote tied to one browser profile, connected wallet, and run.
- Expired or unavailable demo quotes cannot start a new scored run; every restart returns to the entry review instead of bypassing it.
- The previous direct-recipient payment switch is permanently disabled. Real entry payments require a reviewed 20/80 router contract and a matching two-destination backend verifier.
- The Community Airdrop Reserve is separate from the creator's personal MSS2 investment wallet. No airdrop eligibility, timing, value, or distribution is promised.

The MSS2 Commitments panel is a separate Robinhood-only demonstration for proposed permanent membership contributions. It simulates review, receipt verification, duplicate protection, and an isolated membership record without requesting a wallet action. Its proposed dead-address destination does not apply to ordinary arcade purchases or operating revenue.

## Wallet foundation

The campaign header and MSS2 Arcade can discover MetaMask, Rabby, and other EIP-6963 browser wallets. Connecting reads the selected public account and current chain after user consent. The Topaz wallet picker retains BNB, Robinhood, and Arc support, while the MSS2 Arcade picker intentionally offers only the two MSS2 networks: Robinhood and Arc. The arcade header reads a rounded MSS2 wallet balance from the currently selected MSS2 chain. If a network-specific payment route is later released, the wallet will first request an exact allowance for the verified router and then the entry transaction. The prepared flow does not request an unlimited token approval.

Mint Flyer follows the MSS2 network selected in the shared wallet bar. Robinhood uses its chain-specific balance and Robinhood/Topaz MSS2/WETH quote; Arc uses its own balance and the official Topaz Arc MSS2/USDC price observation. Both calculate the indicative MSS2 equivalent of a $1.00 run independently. Preview flights remain free and request no wallet transaction. MSS2 is the intended entry asset when a network-specific production payment route is eventually enabled. TOPAZ remains outside this release. Game-credit continues remain separate from token entry payments.

## MSS2 payment release locks

Real payments cannot be enabled by an environment switch in this branch. The payment-readiness response is hard-locked until the 20/80 entry router is independently reviewed, deployed, verified, and explicitly released for each network.

`contracts/Mss2EntryRouter.sol` is the non-custodial prototype. It has fixed token and destination addresses, no owner, no upgrade path, and no withdrawal or rescue function. Each server-issued payment ID can be used once. The router performs two direct `transferFrom` calls, verifies the recipients' exact balance increases, and emits one entry event. It never intentionally holds entry tokens.

The prepared backend verifies the selected chain, router address, transaction sender, exact calldata, successful receipt, exact 20% dead-address transfer, exact 80% reserve transfer, matching router event, required confirmations, and prior transaction use. The leaderboard also requires the verified payment ID to match the same browser profile and run. Payment records remain separate from arcade scores and achievements.

Arc now has an independently validated indicative price source, but Arc payments remain disabled until its 20/80 router, RPC receipt path, transaction verification, confirmation policy, and duplicate-use protection pass the same end-to-end checks. The MSS2 Commitments section remains demo-only and is not enabled by the arcade payment switch.

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
