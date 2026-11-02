# MSS2 Quests: first reviewable release

## Scope

An additive, browse-only Quests section for Yield Vaccum. It is not yet a live campaign service.

- `/quests`: searchable campaign directory with network and status filters.
- `/quests/mss2-first-steps` and `/quests/arcade-explorer`: explicitly labeled preview campaigns.
- `/quests/profile`: honest not-enabled state; no invented balances or connected identity.
- Home: third destination, revised heading, and Home / Arcade / Quests navigation.
- Arcade lobby: navigation plus a Quests banner outside the game cabinets.
- Existing gameplay, payment routes, contract addresses, score logic, reward reserves, and wallets are unchanged.

All catalog entries are previews, not funded, and unscheduled. Preview activity creates no eligibility, points, tokens, or wallet records. Do not turn these sample records into live campaigns by changing a label.

## Source integration

The homepage, arcade lobby, and root-layout integration is committed on `feature/mss2-quests-foundation`. The temporary branch-preparation workflow ran successfully and has been removed. Only the read-only PR validation workflow remains.

The idempotent `node scripts/integrate-mss2-quests.mjs` command remains for traceability and application to an unmodified base checkout. It checks exact anchors and calculates all edits before writing. It is not part of application startup or build, and it does not need to run again on the integrated review branch. Its fixture tests are not substitutes for a full application build.

## Verification

Run the existing project checks after `npm ci`:

```sh
node --test tests/quests-integration.test.mjs
node --import tsx --test tests/quests.test.ts
npm test
npm run lint
npm run build
npx tsc --noEmit
```

There are nine catalog tests and eight source-integration fixture tests. Fixture tests do not replace an application build, regression tests, or browser review. The catalog tests use the repository's existing tsx runner and are invoked explicitly in CI so they do not depend on recursive shell-glob behavior.

Manual review before merging: check the three homepage cards at 360px, 768px, and desktop widths; make sure mobile splash content can scroll; verify the original educational launch and all game links; test search, both network filters, the Live empty state, unknown campaign URLs, browser back/forward navigation, keyboard focus, and the campaign external-documentation link. No browser visual review has been claimed by this change.

## Next stage: one real administrator-operated campaign

Reuse the existing application stack and chain configuration. Do not add another database vendor or wallet provider without first evaluating the existing implementation.

1. Add server-verified wallet ownership using a one-time nonce, expected domain and URI, expiry, and a secure session. A connected account string or browser-local player key is not sufficient authentication. Invalidate or refresh identity when accounts change.
2. Store campaigns, task definitions, submissions, verifications, and reward obligations in a separate quest namespace. Enforce administrator roles on the server. Keep secrets out of client bundles. Lock campaign terms when participation opens and audit all changes.
3. Start with a server-checked quiz and an administrator-reviewed contribution. Add game tasks only when trusted result records can be matched to the authenticated wallet, campaign window, chain, game, and unique activity. Client-reported completion and page visits are not proof.
4. Record chain-aware evidence. Require uniqueness for each wallet/campaign/task completion and prevent accidental reuse of the same transaction or game result. Rate-limit attempts. One wallet must not be presented as proof of one person.
5. Keep verification, eligibility, and payout as different states. Use server time for windows and never invent a deadline. Define participant caps, allocation rules, review deadlines, rejection reasons, and remaining-funds handling before opening a campaign.
6. For any token reward, verify funded assets and reserve obligations before displaying a funded budget. Record the token contract, chain, amount, custody model, funding evidence, and timestamp. A wallet balance alone is not escrow. Stop new obligations if backing is insufficient.
7. Keep all quest funds and accounting separate from the arcade reserve. Do not alter the existing arcade split, entry fees, ranking rules, or prize allocations.
8. Publish reward format before entry. A permanent-stake reward is not a withdrawable-token payment. Verify the current MSS2 contract interface and recipient capacity before using gifting functionality. Do not guess addresses or automatically request token approvals.
9. Require operator approval for the first payout batches and validate receipt, recipient, chain, amount, and finality before marking a reward sent. Use an idempotent payout ledger to prevent duplicate distributions. No private keys or automatic transfers belong in this frontend release.

Public campaign creation, fees, burns, referral incentives, X follow/repost verification, and automated token distribution are out of scope for this release.
