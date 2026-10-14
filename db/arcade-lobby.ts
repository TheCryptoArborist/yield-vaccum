import { getDatabase } from '@netlify/database';
import { deploymentContext } from '../lib/deployment-context';
import { championship } from '../lib/arcade-championship';
import type { ArcadeGame } from '../lib/arcade-game';
let database:ReturnType<typeof getDatabase>|undefined;
const db=()=>database??=getDatabase({connectionString:process.env.NETLIFY_DB_URL});
export async function recordArcadeResult(input:{game:ArcadeGame;runId:string;playerKey:string;walletAddress:string;nickname:string;score:number;tieBreak:number;createdAt:string},database=db()) {
 const context=deploymentContext(),wallet=input.walletAddress.toLowerCase();
 await database.sql`INSERT INTO arcade_pilots(context,wallet_address) VALUES(${context},${wallet}) ON CONFLICT DO NOTHING`;
 await database.sql`INSERT INTO arcade_results(context,game,run_id,player_key,wallet_address,nickname,score,tie_break,created_at) VALUES(${context},${input.game},${input.runId},${input.playerKey},${wallet},${input.nickname},${input.score},${input.tieBreak},${input.createdAt}) ON CONFLICT DO NOTHING`;
}
export async function readArcadeLobby(keys:string[],weekly:boolean,database=db()) {
 const context=deploymentContext();
 const start=weekly?new Date(Date.now()-((new Date().getUTCDay()+6)%7)*86400000):new Date(0);
 if(weekly) start.setUTCHours(0,0,0,0);
 const rows=await database.sql`SELECT p.pilot_id AS id,(array_agg(r.nickname ORDER BY r.created_at DESC))[1] AS nickname,MAX(r.score) FILTER(WHERE r.game='mint-flyer') AS flyer,MAX(r.score) FILTER(WHERE r.game='mint-invaders') AS invaders,COUNT(*)::int AS runs FROM arcade_results r JOIN arcade_pilots p USING(context,wallet_address) WHERE r.context=${context} AND r.created_at>=${start.toISOString()} GROUP BY p.pilot_id`;
 const standings=championship(rows.map(row=>({id:String(row.id),nickname:String(row.nickname),flyer:row.flyer===null?null:Number(row.flyer),invaders:row.invaders===null?null:Number(row.invaders),runs:Number(row.runs)})));
 const owned=keys.length?await database.sql`SELECT DISTINCT p.pilot_id AS id FROM arcade_results r JOIN arcade_pilots p USING(context,wallet_address) WHERE r.context=${context} AND r.player_key=ANY(${keys}::text[])`:[];
 return {standings:standings.slice(0,100),profile:standings.find(row=>owned.some(p=>String(p.id)===row.id))??null,pilots:standings.length,runs:standings.reduce((sum,row)=>sum+row.runs,0),weekStart:weekly?start.toISOString():null};
}
