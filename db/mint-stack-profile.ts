import type { getDatabase } from '@netlify/database';
import { emptyStackProgress,stackAchievements,type StackProfile,type StackProgress } from '../lib/mint-stack-achievements';
// Resolve a browser's most recently saved wallet, then include that wallet's runs
// across browser identities. Never combine different wallets on a shared browser.
export async function readStackProfile(db:ReturnType<typeof getDatabase>,context:string,playerKey:string,walletAddress?:string):Promise<StackProfile>{
  const rows=await db.sql`WITH owner AS (SELECT wallet_address FROM mint_stack_runs WHERE context=${context} AND player_key=${playerKey} ORDER BY created_at DESC,run_id DESC LIMIT 1) SELECT COUNT(*)::int AS runs,COALESCE(SUM(lines),0)::int AS lines,COALESCE(MAX(lines),0)::int AS best_lines,COALESCE(MAX(level),0)::int AS level,COALESCE(MAX(score),0)::int AS score,COALESCE(SUM(pieces),0)::int AS pieces,COALESCE(SUM(fours),0)::int AS fours,COUNT(DISTINCT network)::int AS networks FROM mint_stack_runs WHERE context=${context} AND wallet_address=COALESCE(${walletAddress??null},(SELECT wallet_address FROM owner))`;
  const latest=await db.sql`SELECT nickname FROM mint_stack_runs WHERE context=${context} AND player_key=${playerKey} ORDER BY created_at DESC,run_id DESC LIMIT 1`;
  const r=rows[0];const progress:StackProgress=r?{runs:Number(r.runs),lines:Number(r.lines),bestLines:Number(r.best_lines),level:Number(r.level),score:Number(r.score),pieces:Number(r.pieces),fours:Number(r.fours),networks:Number(r.networks)}:{...emptyStackProgress};
  return {...progress,nickname:String(latest[0]?.nickname??''),unlocked:stackAchievements(progress)};
}
