import { getDatabase } from '@netlify/database';
import { deploymentContext } from '../lib/deployment-context';
import { championship, gamesPlayedStandings, arcadeWeekWindow } from '../lib/arcade-championship';
import type { ArcadeGame } from '../lib/arcade-game';
let database:ReturnType<typeof getDatabase>|undefined;
const db=()=>database??=getDatabase({connectionString:process.env.NETLIFY_DB_URL});
export async function recordArcadeResult(input:{game:ArcadeGame;runId:string;playerKey:string;walletAddress:string;nickname:string;score:number;tieBreak:number;createdAt:string;network?:'arc'|'robinhood'},database=db()) {
 const context=deploymentContext(),wallet=input.walletAddress.toLowerCase();
 await database.sql`INSERT INTO arcade_pilots(context,wallet_address) VALUES(${context},${wallet}) ON CONFLICT DO NOTHING`;
 await database.sql`INSERT INTO arcade_results(context,game,run_id,player_key,wallet_address,nickname,score,tie_break,created_at,network) VALUES(${context},${input.game},${input.runId},${input.playerKey},${wallet},${input.nickname},${input.score},${input.tieBreak},${input.createdAt},${input.network??null}) ON CONFLICT(context,game,run_id) DO UPDATE SET network=COALESCE(arcade_results.network,EXCLUDED.network) WHERE arcade_results.wallet_address=EXCLUDED.wallet_address AND arcade_results.player_key=EXCLUDED.player_key`;
}
export async function readArcadeLobby(keys:string[],weekly:boolean,database=db(),options:{ranking?:'games'|'points';week?:string;now?:Date;page?:number}={}) {
 const context=deploymentContext();
 const window=arcadeWeekWindow(options.week,options.now);
 const start=weekly?window.start:new Date(0),end=weekly?window.end:new Date('9999-12-31T00:00:00.000Z');
 const rows=await database.sql`SELECT p.pilot_id AS id,(array_agg(r.nickname ORDER BY r.created_at DESC,r.run_id))[1] AS nickname,MAX(r.score) FILTER(WHERE r.game='mint-flyer') AS flyer,MAX(r.score) FILTER(WHERE r.game='mint-invaders') AS invaders,COUNT(*)::int AS runs FROM arcade_results r JOIN arcade_pilots p USING(context,wallet_address) WHERE r.context=${context} AND r.created_at>=${start.toISOString()} AND r.created_at<${end.toISOString()} GROUP BY p.pilot_id`;
 const ranking=options.ranking??'games';
 const standings=(ranking==='games'?gamesPlayedStandings:championship)(rows.map(row=>({id:String(row.id),nickname:String(row.nickname),flyer:row.flyer===null?null:Number(row.flyer),invaders:row.invaders===null?null:Number(row.invaders),runs:Number(row.runs)})));
 const owned=keys.length?await database.sql`SELECT DISTINCT p.pilot_id AS id FROM arcade_results r JOIN arcade_pilots p USING(context,wallet_address) WHERE r.context=${context} AND r.player_key=ANY(${keys}::text[])`:[];
 const totalPages=Math.max(1,Math.ceil(standings.length/100)),page=Math.min(Math.max(1,options.page??1),totalPages);
 return {page,totalPages,standings:standings.slice((page-1)*100,page*100),profile:standings.find(row=>owned.some(p=>String(p.id)===row.id))??null,pilots:standings.length,runs:standings.reduce((sum,row)=>sum+row.runs,0),ranking,weekStart:weekly?start.toISOString():null,weekEnd:weekly?end.toISOString():null};
}
