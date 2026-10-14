import assert from "node:assert/strict";
import test from "node:test";
import { assertPaymentGame, arcadeGame } from "../lib/arcade-game";
import { validateInvadersResult } from "../lib/mint-invaders-result";
import { POST } from "../app/api/mint-invaders-leaderboard/route";
import { getDatabase } from "@netlify/database";
test("paid entries remain bound to their game, including legacy Flyer quotes", () => {
  assertPaymentGame({}); assertPaymentGame({game:"mint-invaders"},"mint-invaders");
  assert.throws(()=>assertPaymentGame({},"mint-invaders"));
  assert.throws(()=>assertPaymentGame({game:"mint-invaders"},"mint-flyer"));
  assert.throws(()=>arcadeGame("unknown")); assert.equal(arcadeGame(undefined),"mint-flyer");
});
test("Invaders scores match enemy kills, completed-wave bonuses and collected pickups", () => {
  validateInvadersResult({ score: 4500+150+100, wave:2, kills:45, bossKills:0, pickups:2, seconds:60 });
  validateInvadersResult({ score:13500+1500+1500, wave:5, kills:135, bossKills:1, pickups:0, seconds:200 });
  assert.throws(()=>validateInvadersResult({score:999999,wave:1,kills:1,bossKills:0,pickups:0,seconds:10}));
  assert.throws(()=>validateInvadersResult({score:0,wave:5,kills:0,bossKills:0,pickups:0,seconds:10}));
});
test("unpaid Invaders results are rejected before database or chain access", async () => {
  const response=await POST(new Request("https://arcade.test/api/mint-invaders-leaderboard",{method:"POST",body:JSON.stringify({score:0,wave:1,kills:0,bossKills:0,pickups:0,seconds:5,playerKey:"test-player-123456",runId:"test-run-123456789",paymentId:"",nickname:"Pilot"})}));
  assert.equal(response.status,403);
});
test("a payment can create only one immutable Invaders score, even concurrently", async () => {
  const {NetlifyDB}=await import("@netlify/database-dev"); const local=new NetlifyDB(); let db:ReturnType<typeof getDatabase>|undefined;
  try {
    const connectionString=await local.start(); await local.applyMigrations("./netlify/database/migrations"); db=getDatabase({connectionString}); const sql=db.sql;
    const results=await Promise.all(Array.from({length:4},()=>sql`INSERT INTO mint_invaders_runs (context,run_id,payment_id,player_key,nickname,wallet_address,network,score,wave) VALUES (${"test"},${"run-123"},${"payment-123"},${"player-123"},${"Pilot"},${"0x123"},${"arc"},${100},${1}) ON CONFLICT DO NOTHING RETURNING run_id`));
    assert.equal(results.filter(rows=>rows.length).length,1);
    const replacement=await sql`INSERT INTO mint_invaders_runs (context,run_id,payment_id,player_key,nickname,wallet_address,network,score,wave) VALUES (${"test"},${"run-other"},${"payment-123"},${"player-123"},${"Pilot"},${"0x123"},${"arc"},${9999},${2}) ON CONFLICT DO NOTHING RETURNING run_id`;
    assert.equal(replacement.length,0);
    const rows=await sql`SELECT score FROM mint_invaders_runs WHERE payment_id=${"payment-123"}`;assert.equal(rows[0].score,100);
  }finally{if(db)await db.pool.end();await local.stop();}
});
