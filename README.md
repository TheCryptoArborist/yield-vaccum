# Topaz: Yield Vacuum

An independent eleven-mission educational arcade game about Topaz DEX, its BNB Chain economic core, and expansion toward Robinhood Chain, presented by The Crypto Arborist.

The optional `/arcade` area includes Mint Flyer and a demo-only MSS2 Commitments flow. The commitments preview stores only clearly labeled browser-local demo records. It does not request token approvals, signatures, transfers, payouts, or membership payments.

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

The `/arcade` route hosts optional arcade games without changing the Topaz educational campaign. The first game is Mint Flyer. Its current continue flow uses clearly labeled demo credits only:

- Every future scored MSS2 arcade run is planned to require a separately verified MSS2 entry payment targeting $1.00 USD worth of MSS2 at checkout.
- One same-run continue costs 100 demo credits and restores three lives.
- Demo credits have no cash or token value and create no blockchain transaction.
- The preview simulates paid entry without requesting a wallet signature or token transfer.
- Proposed developer recipient: `0xF2Ab1eEBbEcb4E315FE95D8b532D1aB00F1A8789`.
- The demo reads an indicative MSS2/USD value from the verified Robinhood Topaz MSS2/WETH pair on DEX Screener: `0xdfcc6ad671033f7d3eceb24cbae5c0f7f6f8d91e`.
- DEX Screener data is display-only and is not yet an authoritative payment quote.
- Each displayed amount is wrapped in a 90-second demo quote with a reference, expiry countdown, and explicit review step before a run starts.
- Expired or unavailable demo quotes cannot start a new scored run; every restart returns to the entry review instead of bypassing it.
- Real MSS2 payments remain disabled until live quote rules, manipulation safeguards, refund policy, recipient ownership, and backend transaction verification are confirmed.
- The developer intends to add arcade proceeds to liquidity manually. No automatic liquidity action or guarantee is represented.

The MSS2 Commitments panel is a separate Robinhood-only demonstration for proposed permanent membership contributions. It simulates review, receipt verification, duplicate protection, and an isolated membership record without requesting a wallet action. Its proposed dead-address destination does not apply to ordinary arcade purchases or operating revenue.

## Wallet foundation

The campaign header and MSS2 Arcade can discover MetaMask, Rabby, and other EIP-6963 browser wallets. This foundation is connection-only: it reads the selected public account and current chain after user consent. It does not request signatures, token approvals, transfers, or network switches.

The Mint Flyer entry and result screens include a locked payment-readiness preview. MSS2 is the planned required entry asset for every scored run. TOPAZ remains only a possible continue option under review and does not replace the MSS2 entry requirement. Demo-credit continues remain the only active continue mechanism until the payment configuration and backend receipt-verification design are approved.
