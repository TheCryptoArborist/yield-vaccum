import assert from "node:assert/strict";
import test from "node:test";
import { POST as paymentPost } from "../app/api/arcade-payment/route";
import { POST as leaderboardPost } from "../app/api/arcade-leaderboard/route";
import { requirePaymentForScore } from "../db/arcade-payments";

function request(path: string, payload: Record<string, unknown>) {
  return new Request(`https://arcade.example${path}`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
  });
}

test("both networks reject the former free-flight authorization endpoint", async () => {
  for (const network of ["arc", "robinhood"]) {
    const response = await paymentPost(request("/api/arcade-payment", {
      action: "demo-run", playerKey: "test-player-paid-only", network,
    }));
    assert.equal(response.status, 403);
    assert.match((await response.json()).error, /Free flights are disabled/);
  }
});

test("old free-flight authorizations cannot substitute for a verified payment", async () => {
  await assert.rejects(requirePaymentForScore({
    paymentId: "", playerKey: "test-player-paid-only", runId: "test-flight-paid-only",
  }), /verified MSS2 entry payment is required/);
});

test("the leaderboard rejects unpaid results and former free continues", async () => {
  const flight = {
    playerKey: "test-player-paid-only", runId: "test-flight-paid-only", nickname: "Pilot",
    score: 1000, distance: 100, mintsCollected: 0, maxCombo: 0, hits: 3, lives: 0,
    reachedMoon: false,
  };
  for (const entry of [
    { runAuthorizationId: "old-free-authorization", continued: false },
    { paymentId: "test-payment-paid-only", continued: true },
  ]) {
    const response = await leaderboardPost(request("/api/arcade-leaderboard", { ...flight, ...entry }));
    assert.equal(response.status, 403);
    assert.match((await response.json()).error, /Each flight requires a verified MSS2 entry payment/);
  }
});
