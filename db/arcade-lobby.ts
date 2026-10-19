import { getDatabase } from '@netlify/database';
import { deploymentContext } from '../lib/deployment-context';
import { championship, gamesPlayedStandings, arcadeWeekWindow } from '../lib/arcade-championship';
import type { ArcadeGame } from '../lib/arcade-game';
import {readArcadeResultHistory} from './arcade-result-history';
import {groupArcadeHistory,type LegacyFlightHistory} from '../lib/arcade-result-history';
let database:ReturnType<typeof getDatabase>|undefined;
const db=()=>database??=getDatabase({connectionString:process.env.NETLIFY_DB_URL});
export async function recordArcadeResult(input:{game:ArcadeGame;runId:string;playerKey:string;walletAddress:string;nickname:string;score:number;tieBreak:number;createdAt:string;network?:'arc'|'robinhood'},database=db()) {
 const context=deploymentContext(),wallet=input.walletAddress.toLowerCase();
 await database.sql`INSERT INTO arcade_pilots(context,wallet_address) VALUES(${context},${wallet}) ON CONFLICT DO NOTHING`;
 await database.sql`INSERT INTO arcade_results(context,game,run_id,player_key,wallet_address,nickname,score,tie_break,created_at,network) VALUES(${context},${input.game},${input.runId},${input.playerKey},${wallet},${input.nickname},${input.score},${input.tieBreak},${input.createdAt},${input.network??null}) ON CONFLICT(context,game,run_id) DO UPDATE SET network=COALESCE(arcade_results.network,EXCLUDED.network) WHERE arcade_results.wallet_address=EXCLUDED.wallet_address AND arcade_results.player_key=EXCLUDED.player_key`;
}
export async function readArcadeLobby(keys:string[],weekly:boolean,database=db(),options:{ranking?:'games'|'points';week?:string;now?:Date;page?:number;readLegacy?:()=>Promise<LegacyFlightHistory>}={}) {
 const window=arcadeWeekWindow(options.week,options.now);
 const start=weekly?window.start:new Date(0),end=weekly?window.end:new Date('9999-12-31T00:00:00.000Z');
 const history=await readArcadeResultHistory(database,options.readLegacy);
 const groups=groupArcadeHistory(history.results.filter(row=>Date.parse(row.createdAt)>=start.getTime()&&Date.parse(row.createdAt)<end.getTime()));
 const ranking=options.ranking??'games';
 const standings=(ranking==='games'?gamesPlayedStandings:championship)(groups.map(row=>({id:row.id,nickname:row.nickname,flyer:row.flyer,invaders:row.invaders,runs:row.runs})));
 const owned=new Set(history.results.filter(row=>keys.includes(row.playerKey)).map(row=>row.pilotId));
 const totalPages=Math.max(1,Math.ceil(standings.length/100)),page=Math.min(Math.max(1,options.page??1),totalPages);
 return {page,totalPages,standings:standings.slice((page-1)*100,page*100),profile:standings.find(row=>owned.has(row.id))??null,pilots:standings.length,runs:standings.reduce((sum,row)=>sum+row.runs,0),ranking,weekStart:weekly?start.toISOString():null,weekEnd:weekly?end.toISOString():null,historyAudit:history.audit};
}
