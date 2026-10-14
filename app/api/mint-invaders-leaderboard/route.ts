import { recordArcadeResult } from "../../../db/arcade-lobby";
import { readInvadersProfile } from "../../../db/mint-invaders-profile";
import { invadersAchievements, INVADERS_ACHIEVEMENTS } from "../../../lib/mint-invaders-achievements";
import { getDatabase } from "@netlify/database";
import { deploymentContext } from "../../../lib/deployment-context";
import { requirePaymentForScore } from "../../../db/arcade-payments";
import { validateInvadersResult, type InvadersResult } from "../../../lib/mint-invaders-result";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store" };
let database: ReturnType<typeof getDatabase> | undefined;
const db = () => database ??= getDatabase({ connectionString: process.env.NETLIFY_DB_URL });
export async function GET(request: Request) {
  try {
    const context=deploymentContext(), database=db();
    const key=new URL(request.url).searchParams.get("playerKey")??"";
    const rows = await database.sql`WITH best AS (SELECT DISTINCT ON (player_key) player_key,nickname,score,wave,network,created_at FROM mint_invaders_runs WHERE context=${context} ORDER BY player_key,score DESC,wave DESC,created_at ASC), history AS (SELECT player_key,COUNT(*)::int AS runs,MAX(wave)::int AS max_wave,COALESCE(SUM(COALESCE((metrics->>'kills')::int,0)),0)::int AS kills,COALESCE(SUM(COALESCE((metrics->>'bossKills')::int,(wave-1)/4)),0)::int AS bosses,COALESCE(SUM(COALESCE((metrics->>'pickups')::int,0)),0)::int AS pickups,COUNT(DISTINCT network)::int AS networks FROM mint_invaders_runs WHERE context=${context} GROUP BY player_key) SELECT best.nickname,best.score,best.wave,best.network,history.runs,history.max_wave,history.kills,history.bosses,history.pickups,history.networks FROM best JOIN history USING(player_key) ORDER BY best.score DESC,best.wave DESC,best.created_at ASC LIMIT 50`;
    const entries=rows.map((row,index)=>({rank:index+1,nickname:row.nickname,score:row.score,wave:row.wave,network:row.network,runs:row.runs,unlocked:invadersAchievements({runs:Number(row.runs),wave:Number(row.max_wave),score:Number(row.score),kills:Number(row.kills),bossKills:Number(row.bosses),pickups:Number(row.pickups),networks:Number(row.networks)})}));
    const stats=await database.sql`SELECT COUNT(*)::int AS games, COUNT(DISTINCT player_key)::int AS pilots, COALESCE(MAX(score),0)::int AS record, COALESCE(MAX(wave),0)::int AS wave FROM mint_invaders_runs WHERE context=${context}`;
    const profile=/^[a-zA-Z0-9-]{16,80}$/.test(key)?await readInvadersProfile(database,context,key):null;
    return Response.json({entries,stats:stats[0],profile,achievements:INVADERS_ACHIEVEMENTS},{headers});
  } catch { return Response.json({ error: "Mint Invaders leaderboard is temporarily unavailable." }, { status: 503, headers }); }
}
export async function POST(request: Request) {
  try {
    const text = await request.text(); if (text.length > 8000) throw new Error("Result too large.");
    const p = JSON.parse(text) as InvadersResult & { playerKey: string; runId: string; paymentId: string; nickname: string };
    if (![p.playerKey,p.runId,p.paymentId].every(v => typeof v === "string" && /^[a-zA-Z0-9-]{16,80}$/.test(v))) return Response.json({ error: "A verified paid Invaders entry is required." }, { status: 403, headers });
    validateInvadersResult(p);
    const nickname = String(p.nickname ?? "").replace(/[^a-zA-Z0-9 _.-]/g, "").trim().slice(0,22);
    if (nickname.length < 2) throw new Error("Choose a nickname with at least two characters.");
    const entry = await requirePaymentForScore({ paymentId: p.paymentId, playerKey: p.playerKey, runId: p.runId, game: "mint-invaders" });
    const before=await readInvadersProfile(db(),deploymentContext(),p.playerKey);
    const metrics=JSON.stringify({kills:p.kills,bossKills:p.bossKills,pickups:p.pickups,seconds:p.seconds});
    const rows = await db().sql`INSERT INTO mint_invaders_runs (context,run_id,payment_id,player_key,nickname,wallet_address,network,score,wave,metrics) VALUES (${deploymentContext()},${p.runId},${p.paymentId},${p.playerKey},${nickname},${entry.walletAddress},${entry.network},${p.score},${p.wave},${metrics}::jsonb) ON CONFLICT DO NOTHING RETURNING run_id`;
    const original=await db().sql`SELECT nickname,score,wave,created_at FROM mint_invaders_runs WHERE context=${deploymentContext()} AND run_id=${p.runId} AND player_key=${p.playerKey}`;
    if(!original[0]) throw new Error("Saved run not found.");
    await recordArcadeResult({game:"mint-invaders",runId:p.runId,playerKey:p.playerKey,walletAddress:entry.walletAddress,nickname:String(original[0].nickname),score:Number(original[0].score),tieBreak:Number(original[0].wave),createdAt:new Date(String(original[0].created_at)).toISOString()});
    const profile=await readInvadersProfile(db(),deploymentContext(),p.playerKey);
    return Response.json({ saved: true, duplicate: rows.length === 0, profile, newlyUnlocked:rows.length?profile.unlocked.filter(id=>!before.unlocked.includes(id)):[] }, { headers });
  } catch { return Response.json({ error: "The result could not be saved. Check the nickname and verified entry, then retry." }, { status: 400, headers }); }
}
