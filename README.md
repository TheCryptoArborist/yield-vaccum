# Topaz: Yield Vacuum

An independent eleven-mission educational arcade game about Topaz DEX, its BNB Chain economic core, and expansion toward Robinhood Chain, presented by The Crypto Arborist.

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

- New flights and restarts are free.
- One same-run continue costs 100 demo credits and restores three lives.
- Demo credits have no cash or token value and create no blockchain transaction.
- Real MSS2 payments remain disabled until token deployments, networks, recipient, pricing, and backend transaction verification are confirmed.

## Wallet foundation

The campaign header and MSS2 Arcade can discover MetaMask, Rabby, and other EIP-6963 browser wallets. This foundation is connection-only: it reads the selected public account and current chain after user consent. It does not request signatures, token approvals, transfers, or network switches.

The Mint Flyer result screen includes a locked MSS2/TOPAZ continue-readiness preview. Demo-credit continues remain the only active continue mechanism until the payment configuration and backend receipt-verification design are approved.
