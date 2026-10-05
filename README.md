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

- When the production payment locks are satisfied, every scored MSS2 arcade run requires a separately verified Robinhood MSS2 entry payment targeting $1.00 USD worth of MSS2 at checkout.
- One same-run continue costs 100 demo credits and restores three lives.
- Demo credits have no cash or token value and create no blockchain transaction.
- Preview deployments keep real transfers disabled.
- Proposed developer recipient: `0xF2Ab1eEBbEcb4E315FE95D8b532D1aB00F1A8789`.
- The demo reads an indicative MSS2/USD value from the verified Robinhood Topaz MSS2/WETH pair on DEX Screener: `0xdfcc6ad671033f7d3eceb24cbae5c0f7f6f8d91e`.
- The server validates the DEX Screener pair identity, token, Topaz market, positive price, and at least $25,000 in reported liquidity before creating a payment quote.
- Each exact transfer amount is wrapped in a server-stored 90-second quote tied to one browser profile, connected wallet, and run.
- Expired or unavailable demo quotes cannot start a new scored run; every restart returns to the entry review instead of bypassing it.
- The production switch remains off until the recipient wallet signs the exact ownership-confirmation message and the payment preview is approved.
- The developer intends to add arcade proceeds to liquidity manually. No automatic liquidity action or guarantee is represented.

The MSS2 Commitments panel is a separate Robinhood-only demonstration for proposed permanent membership contributions. It simulates review, receipt verification, duplicate protection, and an isolated membership record without requesting a wallet action. Its proposed dead-address destination does not apply to ordinary arcade purchases or operating revenue.

## Wallet foundation

The campaign header and MSS2 Arcade can discover MetaMask, Rabby, and other EIP-6963 browser wallets. Connecting reads the selected public account and current chain after user consent. The MSS2 arcade can request Robinhood network selection and one exact ERC-20 transfer only after the user reviews a live server quote. It never asks for an unlimited token approval.

The Mint Flyer entry and result screens show the current payment readiness. MSS2 is the required entry asset when production payments are enabled. TOPAZ remains outside this release. Game-credit continues remain separate from token entry payments.

## MSS2 payment release locks

Real payments require all of the following Netlify production environment values:

```text
MSS2_PAYMENT_RECIPIENT=0xF2Ab1eEBbEcb4E315FE95D8b532D1aB00F1A8789
MSS2_PAYMENT_RECIPIENT_SIGNATURE=<signature of the exact confirmation message>
MSS2_PAYMENTS_ENABLED=true
```

The server cryptographically recovers the signer of the confirmation message and requires it to match the disclosed recipient. Preview deploys remain locked regardless of environment values.

For every submitted payment, the backend verifies Robinhood chain data, the MSS2 token contract, transaction sender, developer recipient, exact raw token amount, successful receipt, Transfer log, required confirmations, and prior transaction use. The leaderboard also requires the verified payment ID to match the same browser profile and run. Payment records use a separate Netlify Blobs store from arcade scores and achievements.

Arc payments remain disabled until the Arc pool/quote source and RPC receipt path are independently available and pass the same end-to-end checks. The MSS2 Commitments section remains demo-only and is not enabled by the arcade payment switch.
