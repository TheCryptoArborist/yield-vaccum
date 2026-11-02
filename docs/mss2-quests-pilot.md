# MSS2 Quests: verified participation pilot

## Release boundary

This adds a working, administrator-operated **points-only** campaign path to the existing draft Quests branch. It does not merge or deploy production, move tokens, enable minting/staking, create payout obligations, charge campaign fees, or change arcade accounting. Both pilot switches remain unset/off by default. The older concept campaigns remain previews and cannot be joined.

## Implemented flow

- `/quests`: published campaigns and a separate concept-preview section.
- `/quests/profile`: private, network-specific membership history and recorded points.
- `/admin/quests`: administrator sign-in, private draft creation, publication, early closure, and contribution review.
- `/api/quests`, `/session`, `/profile`, `/actions`, `/admin`: no-store JSON endpoints, with server authorization for private data and all mutations.
- Existing `WalletConnect` is reused, including its browser-wallet and Topaz ID signing paths. Quest code never invokes token transfers, approvals, or smart-wallet payment calls.
- A server-generated ERC-4361 message binds the wallet, network, canonical domain/URI, nonce and five-minute expiry. The exact message is stored. A separate HttpOnly browser challenge cookie prevents transplanting a challenge into another browser. One-use consumption happens before signature verification, including failed signatures.
- Server verification uses the existing network configuration and viem public-client message verification. A matching RPC chain ID is required. This supports the library's EOA/smart-account verification path; real-device browser-wallet and Topaz ID testing is still a release gate.
- Separate 15-minute opaque quest sessions use hashed server tokens and Secure/HttpOnly/SameSite=Strict host-only cookies. Exact configured Origin and a session CSRF token are required for mutations. Session identity, never a posted wallet, determines the participant. Posted expected-wallet/network fields only detect stale clients.
- Administrator permission is derived server-side from the existing `isArcadeAdmin` allowlist. A quest session does not confer an arcade-admin session and vice versa.

## Campaign rules

Only version-1, points-only campaigns can be created. Drafts accept a title, description, one network, UTC start/end/review deadline, and 1–1,000 participating wallets. Campaigns last at most 30 days and review lasts at most 14 additional days. Creating a draft uses an idempotency UUID. Publishing locks its terms; neither published nor closed campaigns can be reset to draft. Closure stops new participation, while existing submissions can be reviewed until their original review deadline.

Two fixed tasks are supported:

1. Pilot rules quiz: all three correct answers earn **50 non-transferable points**. Five attempts per wallet per campaign, with a 30-second retry interval. The answer key is not sent in browser props. This is educational validation, not proof that a unique human learned the material.
2. One original MSS2 explanation or improvement suggestion, 80–2,000 characters: **100 points only after administrator approval**. Review criteria are relevance, accuracy, originality and usefulness. Both approval and rejection require a reason. Decisions are final in this pilot; self-review is blocked. An unreviewed submission after the published deadline earns nothing.

There is no purchase requirement, paid game requirement, financial reward, or future-airdrop promise. A wallet is not proof of a person. Do not advertise the pilot as Sybil-proof. No automatic game, social-action, staking, or referral verification has been implemented.

## Storage and concurrency

The additive migration creates only `quest_*` tables. Scope includes a hash of deployment context and the exact configured origin, keeping production and each preview isolated even if a database URL is mistakenly shared. Netlify preview database isolation should still be verified rather than relying on scope as the only safeguard.

Enrollment, completion, points and audit events use parameterized SQL transactions on one pooled connection. A campaign row lock serializes cap checks and state transitions. The server samples time after the lock wait. Unique wallet/campaign/task keys prevent duplicate awards; decisions and their point-ledger changes commit together. Database checks constrain task point values. Published-term immutability is also enforced by a database trigger.

Rate limits are database-backed: 60 global challenge creations per minute per scope, five per wallet; 120 global verification attempts; 30 mutation requests per wallet. These are conservative pilot limits, not a complete public-service anti-abuse strategy. Do not enable an unrestricted public launch without edge-level rate limiting and abuse monitoring. Queries return bounded batches; interfaces disclose the 100-record limits. Private history totals include all memberships on the signed-in network.

## Preview activation — not performed by this change

1. Finish CI, dependency-audit triage, and browser review before activating a preview.
2. Confirm the preview uses an isolated Netlify database branch and that the additive migration applied. Do not point a preview at production credentials.
3. For **deploy-preview only**, set `MSS2_QUESTS_ENABLED=true` and `MSS2_QUESTS_ORIGIN` to that preview's exact HTTPS origin, with no trailing slash or path. These are server variables, not `NEXT_PUBLIC_` flags. Production must remain disabled. The production origin, if later approved, is restricted to `https://yieldvaccum.xyz`.
4. Open `/admin/quests`, connect the existing configured administrator wallet, and sign the explicit quest-management message. No private keys are stored or requested.
5. Create a small-cap draft with real UTC dates. Review its rules, then explicitly publish. No sample campaign is auto-created, funded, or opened.
6. Use a separate test participant wallet to join, answer the quiz, and submit a contribution. Check approval, rejection, duplicate requests, network/account switching and sign-out. Do not use real token transfers for this pilot.

A merged deployment without the flag still shows a truthful disabled state and performs no quest database calls for the public availability check.

## Required checks

```sh
npm ci
node --import tsx --test tests/quest-pilot.test.ts
node --test tests/quests-integration.test.mjs
npm test
npm run lint
npm run build
npx tsc --noEmit
```

Tests cover schema migrations against temporary PostgreSQL, a genuine disposable EOA signature, browser/scope binding, concurrent nonce consumption, expiration/revocation, rate limits, administrator authorization, immutable terms, participant caps, concurrent awards, quiz limits, review finality, network privacy and HTTP authorization/CSRF guards. Signature-verifier injection is used where testing the live administrator would require its private key; no live admin key is used. Do not interpret these tests as a smart-contract wallet/device end-to-end test, a security audit, or a completed browser review.

Review 360px, 768px, and desktop rendering; keyboard and screen-reader labels; wallet cancellation; account/network changes during signing and in other tabs; session expiry; sign-out errors; admin publication prompts; UTC dates; disabled/unavailable API states; and original game launch/navigation behavior. The existing dependency audit findings remain a separate release gate.

## Retention and operations

Never log signatures, cookies, CSRF values, connection strings or user contribution bodies. API errors expose only controlled messages. Periodically prune expired challenge/session/rate records using the companion cleanup script, against the correct environment. The script does not delete participation or audit history. Establish and publish an operator retention/contact policy before a public campaign; the current rules disclose private record storage and require participants not to submit personal information. No cleanup job has been scheduled automatically.

## Deliberately not built yet

Funded token/stake campaigns, token custody or escrow, funding verification, reward obligations or payout reconciliation, MSS2 gifting, game-run verification, social/referral verification, campaign sponsorship/fees/burns, and public campaign creation. The point ledger is not a token reward ledger. Those features need separate reviewed implementation, explicit funding rules and deployment approval.

## Reference contracts

- ERC-4361: https://eips.ethereum.org/EIPS/eip-4361
- viem public-client verification: https://viem.sh/docs/actions/public/verifyMessage
- Netlify database pooling/transactions: https://docs.netlify.com/build/data-and-storage/netlify-database/api/
