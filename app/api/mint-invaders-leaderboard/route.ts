import { getDatabase } from "@netlify/database";
import { deploymentContext } from "../../../lib/deployment-context";
import { requirePaymentForScore } from "../../../db/arcade-payments";
import { validateInvadersResult, type InvadersResult } from "../../../lib/mint-invaders-result";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store" };
let database: ReturnType<typeof getDatabase> | undefined;
const db = () => database ??= getDatabase({ connectionString: process.env.NETLIFY_DB_URL });
export async function GET() {
  try {
    const entries = await db().sql`SELECT nickname, score, wave, network FROM (SELECT DISTINCT ON (player_key) player_key, nickname, score, wave, network, created_at FROM mint_invaders_runs WHERE context = ${deploymentContext()} ORDER BY player_key, score DESC, wave DESC, created_at ASC) best ORDER BY score DESC, wave DESC, created_at ASC LIMIT 50`;
    return Response.json({ entries }, { headers });
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
    const rows = await db().sql`INSERT INTO mint_invaders_runs (context,run_id,payment_id,player_key,nickname,wallet_address,network,score,wave) VALUES (${deploymentContext()},${p.runId},${p.paymentId},${p.playerKey},${nickname},${entry.walletAddress},${entry.network},${p.score},${p.wave}) ON CONFLICT DO NOTHING RETURNING run_id`;
    return Response.json({ saved: true, duplicate: rows.length === 0 }, { headers });
  } catch { return Response.json({ error: "The result could not be saved. Check the nickname and verified entry, then retry." }, { status: 400, headers }); }
}
