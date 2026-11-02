# MSS2 Quests: preview operator handoff

## Environment boundary

The Quests application is on the unmerged `feature/mss2-quests-foundation` branch in draft PR #52. Production remains unchanged. Participation was enabled only in Netlify's `deploy-preview` function context, with the exact origin below. There is no production value for either quest flag.

The preview is public, not password protected. Its separate database branch can contain production-seeded data. Do not treat an unlisted URL as access control, do not post personal information in test contributions, and do not distribute the preview as a public campaign launch.

- Review hub: https://deploy-preview-52--topaz-yield-vacuum.netlify.app/quests
- Campaign manager: https://deploy-preview-52--topaz-yield-vacuum.netlify.app/admin/quests
- Participant progress: https://deploy-preview-52--topaz-yield-vacuum.netlify.app/quests/profile
- Database branch: `feature/mss2-quests-foundation` (Netlify-confirmed).
- Applied migration: `20261102033000_mss2_quest_pilot`.

The exact runtime settings are `MSS2_QUESTS_ENABLED=true` and `MSS2_QUESTS_ORIGIN=https://deploy-preview-52--topaz-yield-vacuum.netlify.app`, scoped to functions and deploy previews. These flags do not publish a campaign, create rewards, or fund anything. Default code behavior remains disabled when they are unset. To disable the preview, set the preview-only enabled value to `false` and rebuild that preview; never change production values as part of this rehearsal.

## First administrator-operated rehearsal

No campaign has been created or published by the implementation work. The existing administrator wallet must sign in to perform those actions. Do not share a private key or seed phrase, substitute a test address for the administrator allowlist, or bypass signature verification.

1. Open the preview campaign manager. Connect the configured wallet `0xF2Ab1eEBbEcb4E315FE95D8b532D1aB00F1A8789` on Arc or Robinhood Chain. Press **Verify wallet & sign in** and inspect the sign-in message. It must name the preview domain and explicitly state that it does not transfer tokens or approve spending.
2. Create a small **private draft**. Suggested test values: title **Team Tree — Quest Pilot**, network **Arc**, maximum **10 wallets**. Use actual UTC dates: a start you choose, submissions ending 48 hours later, and reviews ending seven days after submissions close. These are suggested settings, not an existing scheduled event.
3. Suggested description: **Test MSS2 Quests onboarding and contribute one useful improvement. This is a points-only preview with no MSS2 rewards, cash value, paid entry, or future-airdrop promise. Do not include personal information.**
4. Review the dates, network, cap and fixed rules. Press **Publish points-only campaign** only after checking them. Publication locks the terms; closing is irreversible in this pilot.
5. Use a separate participant wallet on the campaign's network. Sign in, accept the rules, join once, answer the rules quiz, and submit one original 80–2,000-character contribution. Verify 50 points for a passed quiz and a pending contribution with no extra points yet.
6. Return with the administrator wallet. Approve or reject the participant contribution with a clear reason. Approval should bring the participant to 150 points; rejection should leave 50. An administrator cannot approve their own contribution.
7. Refresh the participant's profile and verify the decision. Test a second submit/review request without creating a duplicate award. Then test signing cancellation, a wallet/network change, sign-out in another tab, explicit Refresh, and expiry on real devices.

Points are non-transferable participation records with no cash value. Nothing in this rehearsal should request a token approval, transfer, purchase, paid arcade run, staking deposit, or gas-funded transaction. Stop if such a request appears in the quest flow.

## Evidence and remaining limits

Automated database tests exercise the campaign lifecycle and concurrent award/enrollment limits with isolated PostgreSQL 17. Hosted browser tests use an instrumented EIP-1193 provider and real signatures from disposable, unfunded accounts; they do not establish compatibility with an actual MetaMask/Rabby extension, hardware device, or Topaz ID smart account. Those real-wallet checks and the administrator-to-participant campaign rehearsal remain operator release gates.

The updated dependency set has zero findings in the recorded runtime-only npm audit. The full development-inclusive audit still reports 21 findings (1 low, 16 moderate, 4 high). This is not a security audit or a claim that every dependency is safe. Solidity compiler, arcade contracts, payment accounting and reserve rules were not changed. The framework/security patches are on the preview branch only, not production.

The authoritative run results, source revision and outstanding release gates are recorded in PR #52. Before public launch, finish real-device/Topaz ID checks, review remaining development dependency findings, define a published retention/contact policy, and confirm operational abuse controls and cleanup. No token-funded or permanent-stake campaign is implemented in this pilot.
