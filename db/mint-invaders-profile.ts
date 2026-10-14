import type { getDatabase } from "@netlify/database";
import { emptyInvadersProgress, invadersAchievements, type InvadersProgress } from "../lib/mint-invaders-achievements";
export type InvadersProfile = InvadersProgress & { nickname: string; unlocked: string[] };
export async function readInvadersProfile(db: ReturnType<typeof getDatabase>, context: string, playerKey: string): Promise<InvadersProfile> {
  const rows=await db.sql`SELECT COUNT(*)::int AS runs, COALESCE(MAX(wave),0)::int AS wave, COALESCE(MAX(score),0)::int AS score, COALESCE(SUM(COALESCE((metrics->>'kills')::int,0)),0)::int AS kills, COALESCE(SUM(COALESCE((metrics->>'bossKills')::int,(wave-1)/4)),0)::int AS bosses, COALESCE(SUM(COALESCE((metrics->>'pickups')::int,0)),0)::int AS pickups, COUNT(DISTINCT network)::int AS networks FROM mint_invaders_runs WHERE context=${context} AND player_key=${playerKey}`;
  const latest=await db.sql`SELECT nickname FROM mint_invaders_runs WHERE context=${context} AND player_key=${playerKey} ORDER BY created_at DESC LIMIT 1`;
  const row=rows[0];
  const progress: InvadersProgress=row?{runs:Number(row.runs),wave:Number(row.wave),score:Number(row.score),kills:Number(row.kills),bossKills:Number(row.bosses),pickups:Number(row.pickups),networks:Number(row.networks)}:{...emptyInvadersProgress};
  return {...progress,nickname:String(latest[0]?.nickname??""),unlocked:invadersAchievements(progress)};
}
