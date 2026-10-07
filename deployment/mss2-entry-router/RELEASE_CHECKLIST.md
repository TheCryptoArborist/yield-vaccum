# MSS2 Entry Router release checklist

This package prepares the two-chain MSS2 arcade payment release. It does not deploy a contract, request a token approval, transfer funds, or enable payments in the application.

## Reviewed payment behavior

- Entry price: the independently quoted MSS2 amount closest to USD 1.00.
- Robinhood Chain and Arc use separate quotes, router deployments, receipts, and confirmation requirements.
- Each entry transfers 20% of the exact MSS2 amount directly to the permanent dead address and 80% directly to the Community Airdrop Reserve.
- The router has no owner, upgrade path, withdrawal function, rescue function, or native-currency custody.
- The backend must verify the network, token, sender, router, payment ID, amount, successful receipt, both transfers, router event, and confirmations before crediting a run.
- A payment ID may be credited only once.
- MSS2 Commitments remain a separate demo-only feature. They are not arcade entry payments.

Canonical addresses and network settings are in `networks.json`. The application test suite fails if that file drifts from the application constants.

## 1. Generate and review the deterministic artifact

```sh
npm ci
npm run deploy:artifact
npm test
npm run lint
npx tsc --noEmit
npm run build
git diff --check
```

Record and independently compare the source SHA-256, creation-code hash, runtime-code hash, compiler version, and optimizer settings from `Mss2EntryRouter.artifact.json`.

## 2. Preflight Robinhood Chain first

The deployer is the public address selected in the connected wallet. Never place a private key or seed phrase in this repository, a command, Netlify, or a support message.

```sh
npm run deploy:preflight -- --network robinhood --deployer 0xPUBLIC_DEPLOYER_ADDRESS
```

Require all of the following before signing anything:

- Status is `READY_FOR_WALLET_SIGNATURE`. If it is `NEEDS_NATIVE_GAS`, fund only the listed public deployer with enough native gas to meet `recommendedFundingWei`, then rerun the preflight.
- `signedOrBroadcast` is `false`.
- Chain ID is `4663`.
- MSS2 code exists at the canonical token address and reports 18 decimals.
- Destination addresses and the 20/80 allocation match `networks.json`.
- The deployer has sufficient native gas.
- The wallet shows a contract-creation transaction with zero value and the exact generated deployment data.

The wallet—not a repository script—must perform final signing and broadcasting. Record the deployer, deployment transaction hash, block, router address, gas used, and explorer URL.

## 3. Verify Robinhood deployment

Verified deployment record:

- Router: `0x3eF32427eB1eA6cE7572358e22C800CeC740292A`
- Runtime-code hash: `0x4eb7734e73e5a95727f926429704bb7baf16eaf9334ce8141ab6b5cb25a55b0a`
- Independent verifier result: `DEPLOYMENT_VERIFIED`
- Explorer: `https://robinhoodchain.blockscout.com/address/0x3eF32427eB1eA6cE7572358e22C800CeC740292A`

After the receipt succeeds:

```sh
npm run deploy:verify -- --network robinhood --router 0xDEPLOYED_ROUTER
```

The verifier must report `DEPLOYMENT_VERIFIED`. Publish the source and exact compiler settings on the chain explorer when supported. Confirm that the explorer bytecode matches the locally reviewed runtime hash.

## 4. Repeat for Arc

Verified deployment record:

- Router: `0x3eF32427eB1eA6cE7572358e22C800CeC740292A`
- Runtime-code hash: `0x4eb7734e73e5a95727f926429704bb7baf16eaf9334ce8141ab6b5cb25a55b0a`
- Independent verifier result: `DEPLOYMENT_VERIFIED`
- Explorer: `https://explorer.arc.io/address/0x3eF32427eB1eA6cE7572358e22C800CeC740292A`

Only after Robinhood verification is complete:

```sh
npm run deploy:preflight -- --network arc --deployer 0xPUBLIC_DEPLOYER_ADDRESS
# Sign the reviewed contract-creation transaction in the wallet.
npm run deploy:verify -- --network arc --router 0xDEPLOYED_ROUTER
```

Require chain ID `5042` and keep the Arc evidence separate from Robinhood evidence.

## 5. Staging configuration and canary validation

After both deployments verify, add the two router addresses to a non-production Netlify deploy preview:

- `MSS2_ENTRY_ROUTER_ROBINHOOD`
- `MSS2_ENTRY_ROUTER_ARC`

Do not change the source-code `LIVE_PAYMENT_RELEASED` gate yet. First review the complete UI and backend diff, then use a separately approved staging-only release to test the smallest practical real entry on each chain.

The deploy-preview canary must be restricted to a separately selected tester wallet. The Community Airdrop Reserve cannot be the payer because the router verifies that the reserve balance increases by the exact 80% allocation; a transfer from the reserve wallet to itself intentionally fails that check.

For each canary, retain:

- server-issued quote and payment ID;
- wallet address, network, token address, raw amount, and expiry;
- approval transaction, entry transaction, successful receipt, and required confirmations;
- exact 20% dead-address and 80% reserve transfer evidence;
- one credited run;
- rejection of the same transaction/payment ID a second time;
- rejection on the wrong chain, from the wrong sender, with an expired or mismatched quote, or with incomplete transfers.

## 6. Production activation is a separate approval

Production remains disabled until the canaries, backend replay protection, user-facing irreversible-transfer review, recovery/error states, monitoring, and operational ownership have all been reviewed. Enabling production requires a separate pull request and explicit production approval.

Never describe dead-address transfers as native staking or automatically as a reduction in total token supply. Arcade payments do not guarantee income, token-price appreciation, an airdrop, or continued service. Free Yield Vacuum gameplay and free Mint Flyer restarts remain available.
