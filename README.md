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

- The current demonstration models a separately verified Robinhood MSS2 entry targeting $1.00 USD worth of MSS2 at checkout.
- One same-run continue costs 100 demo credits and restores three lives.
- Demo credits have no cash or token value and create no blockchain transaction.
- Preview deployments keep real transfers disabled.
- Proposed entry allocation: 20% to `0x000000000000000000000000000000000000dEaD` and 80% to the designated Community Airdrop Reserve at `0xE8b63245DdDAB73C7A276818942341D8Cfb7D7A7`.
- The demo reads an indicative MSS2/USD value from the verified Robinhood Topaz MSS2/WETH pair on DEX Screener: `0xdfcc6ad671033f7d3eceb24cbae5c0f7f6f8d91e`.
- The server validates the DEX Screener pair identity, token, Topaz market, positive price, and at least $25,000 in reported liquidity before creating a payment quote.
- Each exact transfer amount is wrapped in a server-stored 90-second quote tied to one browser profile, connected wallet, and run.
- Expired or unavailable demo quotes cannot start a new scored run; every restart returns to the entry review instead of bypassing it.
- The previous direct-recipient payment switch is permanently disabled. Real entry payments require a reviewed 20/80 router contract and a matching two-destination backend verifier.
- The Community Airdrop Reserve is separate from the creator's personal MSS2 investment wallet. No airdrop eligibility, timing, value, or distribution is promised.

The MSS2 Commitments panel is a separate Robinhood-only demonstration for proposed permanent membership contributions. It simulates review, receipt verification, duplicate protection, and an isolated membership record without requesting a wallet action. Its proposed dead-address destination does not apply to ordinary arcade purchases or operating revenue.

## Wallet foundation

The campaign header and MSS2 Arcade can discover MetaMask, Rabby, and other EIP-6963 browser wallets. Connecting reads the selected public account and current chain after user consent. The Topaz wallet picker retains BNB, Robinhood, and Arc support, while the MSS2 Arcade picker intentionally offers only the two MSS2 networks: Robinhood and Arc. The arcade header reads a rounded MSS2 wallet balance from the currently selected MSS2 chain. The MSS2 arcade can request Robinhood network selection and one exact ERC-20 transfer only after the user reviews a live server quote. It never asks for an unlimited token approval.

The Mint Flyer entry and result screens show the current payment readiness. MSS2 is the required entry asset when production payments are enabled. TOPAZ remains outside this release. Game-credit continues remain separate from token entry payments.

## MSS2 payment release locks

Real payments cannot be enabled by an environment switch in this branch. The payment-readiness response is hard-locked until a future 20/80 entry router is deployed and verified.

The future backend must verify Robinhood chain data, the MSS2 token contract, transaction sender, exact total, the 20% dead-address allocation, the 80% reserve allocation, successful receipt, router event, required confirmations, and prior transaction use. The leaderboard must also require the verified payment ID to match the same browser profile and run. Payment records remain separate from arcade scores and achievements.

Arc payments remain disabled until the Arc pool/quote source and RPC receipt path are independently available and pass the same end-to-end checks. The MSS2 Commitments section remains demo-only and is not enabled by the arcade payment switch.
