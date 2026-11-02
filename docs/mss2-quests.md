# MSS2 Quests implementation index

## Current review scope

Draft PR #52 on `feature/mss2-quests-foundation` contains the homepage/arcade integration, labeled concept previews, and a **points-only participation pilot**. It is not merged into production. No campaign, token reward, token approval, payment, or payout was created by this work.

An isolated Netlify deploy preview is now deployed and its participation flag is enabled. Production remains unchanged and its quest flag remains unset. Read `docs/mss2-quests-preview-operator.md` for the current environment boundary, public-preview privacy warning, administrator handoff, and suggested small test campaign. `docs/mss2-quests-pilot.md` describes the authentication and data model; its original pre-activation notes are historical where superseded by the operator guide.

## Routes

- `/quests`: published pilot campaigns, sign-in, and a separately labeled concept-preview directory.
- `/quests/profile`: private wallet progress on the signed-in network.
- `/admin/quests`: administrator-authorized draft creation, publication, closure, and contribution review.
- `/quests/mss2-first-steps` and `/quests/arcade-explorer`: concepts only, not funded or open.
- Homepage: third destination and revised headline, with Home / Arcade / Quests navigation.
- Arcade lobby: navigation and a banner outside the game cabinets. Game logic, payment routes, contract addresses, rankings and reserve accounting are unchanged.

## Activation boundary

Both server variables, `MSS2_QUESTS_ENABLED=true` and the exact HTTPS `MSS2_QUESTS_ORIGIN`, are required. They are configured in Netlify's **deploy-preview functions context only**. This is not a production activation. No sample campaign is automatically created or published; an authenticated administrator must create a private draft and explicitly publish it.

The pilot records non-transferable participation points, not MSS2 balances or payout obligations. Token/stake rewards, funding verification, payout reconciliation, game/social/referral verification, sponsorship fees/burns and public campaign creation remain unimplemented.

## Source integration

The homepage, lobby and layout are integrated. Temporary write-capable integration and dependency-preparation workflows were removed after their feature-branch commits. The retained `scripts/integrate-mss2-quests.mjs` is a guarded traceability tool for the original checkout, not application startup; do not rerun it as part of a deploy.

## Validation

The full application at 8dc51c3a8f9c31ca04b463f19c599aaf498df57c passed regression, PostgreSQL 17 participation, catalog/integration, lint, build and TypeScript checks in run 41388923087. Subsequent changes to review scripts and documentation do not change application behavior. Use the current PR checks and retained browser reports for exact tested revisions and outcomes rather than assuming a newer commit passed because an earlier one did.

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

CI uses disposable PostgreSQL 17, loopback access, isolated random schemas, and committed migrations. It validates concurrent pooled connections. The single-backend NetlifyDB fallback is only for sequential local development; CI refuses to silently fall back. No production database credentials are used by tests.

Hosted browser review covers 360px, 768px and 1440px layouts, navigation, search, concept filters, game-route availability and anonymous guards. Hosted sign-in tests use an instrumented EIP-1193 provider and genuine signatures from disposable unfunded accounts. This is not an actual wallet-extension/device or Topaz ID smart-account end-to-end test. Browser test tools do not publish campaigns, submit contributions, play paid games, or transfer tokens.

## Dependency review

Targeted preview-branch updates pin Next.js and eslint-config-next to 16.4.3, React/react-dom to 19.2.9, and ethers to 6.17.0, with compatible source-map-js and zod lockfile updates. Recorded runtime-only npm audit findings dropped from seven to zero. The development-inclusive audit still reports 21 findings: one low, sixteen moderate, four high. This is not an independent security audit or proof of application safety. No forced major downgrades or Solidity compiler changes were applied. These dependency patches are not yet on production.

## Remaining public-release gates

Finish the administrator-signed test campaign and real browser-wallet/Topaz ID/device testing, account/network changes, expiry and cross-tab UX checks. Review outstanding development dependency findings and define edge abuse controls, retention/contact policy and operational cleanup. Preview data may be copied from production even though its database branch is isolated; never assume an unlisted preview URL is private. Keep this PR in draft and do not merge or publish a public campaign solely because automated checks pass.
