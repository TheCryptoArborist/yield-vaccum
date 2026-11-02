import assert from "node:assert/strict";
import test from "node:test";
import { QUEST_PREVIEWS, filterQuestPreviews, getQuestPreview } from "../lib/quests";
test("preview catalog never advertises funded or live rewards", () => {
  assert.ok(QUEST_PREVIEWS.length > 0);
  for (const campaign of QUEST_PREVIEWS) {
    assert.equal(campaign.status, "preview");
    assert.equal(campaign.rewardStatus, "not-funded");
    assert.equal(campaign.rewardAmount, null);
    assert.equal(campaign.startsAt, null);
    assert.equal(campaign.endsAt, null);
    assert.ok(campaign.tasks.length > 0);
    assert.equal(new Set(campaign.tasks.map((task) => task.id)).size, campaign.tasks.length);
  }
});
test("slugs are unique and reserved profile route is not a campaign", () => {
  assert.equal(new Set(QUEST_PREVIEWS.map((campaign) => campaign.slug)).size, QUEST_PREVIEWS.length);
  for (const { slug } of QUEST_PREVIEWS) { assert.match(slug, /^[a-z0-9]+(?:-[a-z0-9]+)*$/); assert.notEqual(slug, "profile"); }
});
test("live filter cannot surface a preview", () => { assert.deepEqual(filterQuestPreviews({ view: "live" }), []); });
test("search is case insensitive and trims whitespace", () => { assert.equal(filterQuestPreviews({ query: "  FIRST STEPS " })[0]?.slug, "mss2-first-steps"); });
test("network filtering includes only matching planned networks", () => {
  for (const network of ["robinhood", "arc"] as const) { assert.ok(filterQuestPreviews({ network }).every((campaign) => campaign.networks.includes(network))); }
});
test("unknown search yields an empty result", () => { assert.deepEqual(filterQuestPreviews({ query: "nothing-matches-this" }), []); });
test("unknown and hostile slugs do not resolve", () => { for (const slug of ["missing", "__proto__", "../../admin", "profile"]) assert.equal(getQuestPreview(slug), undefined); });
test("known campaign is returned by exact slug only", () => { assert.equal(getQuestPreview("arcade-explorer")?.title, "Explore the MSS2 Arcade"); assert.equal(getQuestPreview("ARCADE-EXPLORER"), undefined); });
test("task links are internal or official HTTPS documentation", () => {
  for (const campaign of QUEST_PREVIEWS) for (const task of campaign.tasks) {
    if (!task.href) continue;
    assert.ok(task.href.startsWith("/arcade/") || task.href.startsWith("https://www.mintstakeshare.com/docs"));
    assert.ok(task.action);
  }
});
