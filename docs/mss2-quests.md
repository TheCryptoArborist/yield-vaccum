# MSS2 Quests implementation index

## Current review scope

PR #52 on `feature/mss2-quests-foundation` contains the homepage/arcade integration, clearly labeled concept previews, and a gated **points-only participation pilot**. It remains a draft. No production merge, token transfer, reward funding, or live campaign activation has been performed.

Read `docs/mss2-quests-pilot.md` for authentication, campaign rules, storage, operations, preview activation, and release gates. The original browse-only phase is no longer the entire implementation: private wallet progress and administrator-operated campaigns now have a separate implemented path, disabled by default.

## Routes

- `/quests`: published pilot campaigns, availability/sign-in, and a separately labeled concept-preview directory.
- `/quests/profile`: private wallet progress on the signed-in network.
- `/admin/quests`: private draft creation, publication, early closure, and contribution review.
- `/quests/mss2-first-steps` and `/quests/arcade-explorer`: concept previews only, not funded or open, with no points or eligibility.
- Homepage: third destination and revised headline; Home / Arcade / Quests navigation.
- Arcade lobby: navigation plus a banner outside the existing game cabinets. Existing game logic, payment routes, contract addresses, rankings and reserve accounting are unchanged.

## Activation boundary

Both server variables, `MSS2_QUESTS_ENABLED=true` and the exact HTTPS `MSS2_QUESTS_ORIGIN`, are required for participation. Without them the service reports a disabled state, not a live campaign. No sample campaign is automatically created or published. Only a separately reviewed, isolated deploy preview should be activated next; production must remain disabled.

The pilot records non-transferable participation points, not MSS2 balances or payout obligations. Token/stake rewards, funding verification, payout reconciliation, game/social/referral verification, sponsorship fees/burns and public campaign creation are not implemented.

## Source integration

The homepage, lobby and root layout are already integrated. Temporary write-capable integration/repair workflows were removed. The retained `scripts/integrate-mss2-quests.mjs` is a guarded, idempotent traceability tool for the original base checkout, not part of startup or build; it need not be rerun on this branch.

## Verification

The foundation at d0328e2 passed tests, lint, build and TypeScript before the participation phase. Current phase results are recorded in the PR checks; do not infer new-code success from the historical foundation run.

```sh
npm ci
node --test tests/quests-integration.test.mjs
node --import tsx --test tests/quests.test.ts
node --import tsx --test tests/quest-pilot.test.ts
npm test
npm run lint
npm run build
npx tsc --noEmit
```

CI supplies a disposable PostgreSQL 17 service, restricted to a loopback database named `quest_pilot_test`. Tests create isolated random schemas, apply committed migrations, and clean up only those schemas. This validates multi-connection row-lock behavior rather than relying on PGlite's single database backend. The NetlifyDB fallback is for local sequential development with a single pool connection, not proof of concurrency safety. CI refuses to silently fall back.

There are nine catalog tests and ten source-integration fixtures, plus participation/database/API tests and the existing regression suite. No test substitutes for browser review, real-wallet/device testing, or a security audit.

## Release gates

Before publication, require the latest automated checks, real browser-wallet and Topaz ID sign-in testing, account/network-change and session-expiry testing, 360px/768px/desktop review, navigation and original game-launch checks, preview database isolation, edge abuse controls, and a published retention/contact process.

Dependency review remains outstanding: the first install reported 27 package-audit findings (1 low, 16 moderate, 9 high, 1 critical). This feature does not change dependencies or the lockfile, and no application-exploitability conclusion has been made. Do not apply forced breaking upgrades without review.
