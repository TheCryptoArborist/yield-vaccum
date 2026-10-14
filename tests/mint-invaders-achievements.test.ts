import test from "node:test";
import assert from "node:assert/strict";
import {INVADERS_ACHIEVEMENTS,invadersAchievements,emptyInvadersProgress} from "../lib/mint-invaders-achievements";
import {getDatabase} from "@netlify/database";
import {readInvadersProfile} from "../db/mint-invaders-profile";
test("achievement goals have unique IDs and only unlock at their thresholds",()=>{
 assert.equal(new Set(INVADERS_ACHIEVEMENTS.map(b=>b.id)).size,12); assert.deepEqual(invadersAchievements(emptyInvadersProgress),[]);
 const first=invadersAchievements({...emptyInvadersProgress,runs:1,wave:2,score:9150});assert.deepEqual(first,["first-contact","hold-the-line"]);
 const all=invadersAchievements({runs:10,wave:9,score:50000,kills:100,bossKills:1,pickups:5,networks:2});assert.equal(all.length,12);
});
test("legacy scores retain wave milestones and saved metrics accumulate without duplicate badges",async()=>{
 const {NetlifyDB}=await import("@netlify/database-dev");const local=new NetlifyDB();let db:ReturnType<typeof getDatabase>|undefined;
 try{
  const connectionString=await local.start();await local.applyMigrations("./netlify/database/migrations");db=getDatabase({connectionString});const sql=db.sql;
  await sql`INSERT INTO mint_invaders_runs (context,run_id,payment_id,player_key,nickname,wallet_address,network,score,wave) VALUES (${"test"},${"legacy-run"},${"legacy-pay"},${"player"},${"Pilot"},${"wallet"},${"robinhood"},${9150},${2})`;
  const legacy=await readInvadersProfile(db,"test","player");assert.deepEqual(legacy.unlocked,["first-contact","hold-the-line"]);assert.equal(legacy.kills,0);
  const metrics=JSON.stringify({kills:100,bossKills:1,pickups:5,seconds:100});
  await sql`INSERT INTO mint_invaders_runs (context,run_id,payment_id,player_key,nickname,wallet_address,network,score,wave,metrics) VALUES (${"test"},${"new-run"},${"new-pay"},${"player"},${"Pilot"},${"wallet"},${"arc"},${25000},${5},${metrics}::jsonb)`;
  const profile=await readInvadersProfile(db,"test","player");assert.equal(profile.runs,2);assert.equal(profile.kills,100);assert.equal(profile.pickups,5);assert.ok(profile.unlocked.includes("two-fronts"));assert.ok(profile.unlocked.includes("mothership-down"));assert.equal(new Set(profile.unlocked).size,profile.unlocked.length);
 }finally{if(db)await db.pool.end();await local.stop();}
});
