import { adminDatabase } from './arcade-admin-session';
import { deploymentContext } from '../lib/deployment-context';
import { arcadeWeekWindow,gamesPlayedStandings } from '../lib/arcade-championship';
import { readSavedMintFlyerRun } from './arcade-leaderboard';
import type {AdminRewards,RewardNetwork} from '../lib/arcade-admin-rewards';
export async function readAdminRewards(week?:string,database=adminDatabase(),legacyRun=readSavedMintFlyerRun):Promise<AdminRewards> {
 const {start,end}=arcadeWeekWindow(week),context=deploymentContext();
 const rows=await database.sql`SELECT p.pilot_id AS id,r.wallet_address AS wallet,(array_agg(r.nickname ORDER BY r.created_at DESC,r.run_id))[1] AS nickname,COUNT(*)::int AS runs,COUNT(*) FILTER(WHERE r.game='mint-flyer')::int AS flyer_games,COUNT(*) FILTER(WHERE r.game='mint-invaders')::int AS invaders_games FROM arcade_results r JOIN arcade_pilots p USING(context,wallet_address) WHERE r.context=${context} AND r.created_at>=${start.toISOString()} AND r.created_at<${end.toISOString()} GROUP BY p.pilot_id,r.wallet_address`;
 const ranked=gamesPlayedStandings(rows.map(row=>({id:String(row.id),nickname:String(row.nickname),runs:Number(row.runs),flyer:null,invaders:null}))).filter(row=>row.rank<=3);
 const recipients=await Promise.all(ranked.map(async standing=>{
  const row=rows.find(value=>String(value.id)===standing.id)!,wallet=String(row.wallet);
  const history=await database.sql`SELECT game,player_key,run_id,network FROM arcade_results WHERE context=${context} AND wallet_address=${wallet} AND created_at>=${start.toISOString()} AND created_at<${end.toISOString()}`;
  const networks=new Set<RewardNetwork>();let unknownNetwork=false,lookups=0;
  for(const entry of history){
   let network=entry.network;
   if(!network&&entry.game==='mint-flyer'&&lookups++<25){
    try{const saved=await legacyRun(String(entry.player_key),String(entry.run_id));if(saved?.entryMode==='paid'&&saved.runId===entry.run_id&&saved.rewardWallet?.toLowerCase()===wallet.toLowerCase())network=saved.entryNetwork;}catch{/* Missing legacy evidence must remain explicitly unconfirmed. */}
   }
   if(network==='arc'||network==='robinhood')networks.add(network);else unknownNetwork=true;
  }
  return {id:standing.id,rank:standing.rank,nickname:standing.nickname,wallet,games:standing.runs,flyerGames:Number(row.flyer_games),invadersGames:Number(row.invaders_games),networks:[...networks].sort(),unknownNetwork};
 }));
 return {rows:recipients,weekStart:start.toISOString(),weekEnd:end.toISOString(),closed:Date.now()>=end.getTime(),tieReview:ranked.length>3,pilots:rows.length};
}
