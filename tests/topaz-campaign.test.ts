import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { TOPAZ_FEATURE_MISSIONS, featureBaseScore, featureMission } from "../lib/topaz-feature-missions";
import { ACHIEVEMENTS, MISSION_ACHIEVEMENTS, MISSION_GRADE_TARGETS, TOPAZ_MISSION_COUNT, achievementById, missionGrade } from "../lib/achievements";
import { POST } from "../app/api/leaderboard/route";

test("all sixteen lessons have grade targets and valid unique achievement IDs", () => {
  assert.equal(TOPAZ_MISSION_COUNT, 16);
  assert.equal(MISSION_GRADE_TARGETS.length, TOPAZ_MISSION_COUNT);
  assert.equal(new Set(MISSION_ACHIEVEMENTS).size, TOPAZ_MISSION_COUNT);
  for (const id of MISSION_ACHIEVEMENTS) assert.ok(achievementById(id));
  assert.equal(new Set(ACHIEVEMENTS.map((badge) => badge.id)).size, ACHIEVEMENTS.length);
  assert.equal(MISSION_ACHIEVEMENTS[0], "route-master");
  assert.equal(MISSION_ACHIEVEMENTS[10], "chain-navigator");
});

test("each new scenario has one selectable correct answer and a current official source", () => {
  TOPAZ_FEATURE_MISSIONS.forEach((mission, offset) => {
    assert.equal(featureMission(11 + offset), mission);
    assert.equal(mission.scenarios.length, 6);
    assert.ok(mission.factUrl.startsWith("https://www.topazdex.com/docs/"));
    for (const scenario of mission.scenarios) {
      assert.equal(mission.choices.filter((choice) => choice === scenario.correct).length, 1);
      assert.ok(scenario.prompt.length && scenario.detail.length);
    }
    const score = featureBaseScore(11 + offset);
    assert.equal(missionGrade(score, 0, 11 + offset), "S");
    assert.equal(missionGrade(score - 180, 1, 11 + offset), "A");
    assert.notEqual(missionGrade(score, 1, 11 + offset), "S");
  });
});

test("key reward and exit distinctions stay explicit", () => {
  const text = JSON.stringify(TOPAZ_FEATURE_MISSIONS);
  assert.match(text, /new permanent veTOPAZ NFT/);
  assert.match(text, /Holding them alone does not cast votes/);
  assert.match(text, /Rewards are not sold or added to principal/);
  assert.match(text, /NFT starts unstaked/);
  assert.match(text, /destination fill is not yet proven/);
  assert.match(text, /does not receive both full streams/);
});

test("campaign arrays include new definitions and selected lessons do not fake clears", () => {
  const page = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
  for (const field of ["goal", "hint", "title", "accept", "avoid", "gradeTitle", "recap"]) {
    assert.ok(page.includes(`TOPAZ_FEATURE_MISSIONS.map((mission) => mission.${field})`));
  }
  assert.match(page, /const completedMissions = clearedLessons.length/);
  assert.match(page, /phase === "results" && result.cleared/);
  assert.match(page, /clearedLessons.includes\(index\)/);
  assert.match(page, /added\?\.scenarios \?\? advancedScenarios/);
});

test("score endpoint rejects missions beyond the updated campaign", async () => {
  for (const missionIndex of [-1, 16, 11.5]) {
    const response = await POST(new Request("https://example.test/api/leaderboard", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ playerKey: "test-topaz-campaign-123", nickname: "Pilot", missionIndex, score: 8200, mistakes: 0 }),
    }));
    assert.equal(response.status, 400);
  }
});
