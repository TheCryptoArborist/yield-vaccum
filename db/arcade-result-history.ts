import {getStore,getDeployStore} from '@netlify/blobs';
import type {getDatabase} from '@netlify/database';
import {deploymentContext} from '../lib/deployment-context';
import {mergeArcadeHistory,verifiedFlightHistory,type ArcadeHistoryResult,type LegacyFlightHistory} from '../lib/arcade-result-history';
let contextAuditAt=0;
let snapshot:LegacyFlightHistory|undefined,inFlight:Promise<LegacyFlightHistory>|undefined;
async function readObjects(store:ReturnType<typeof getStore>,prefix:string){
 const {blobs}=await store.list({prefix});const rows:unknown[]=[];
 // Bound concurrency, and never quietly return partial history on read failure.
 for(let offset=0;offset<blobs.length;offset+=10){const values=await Promise.all(blobs.slice(offset,offset+10).map(blob=>store.get(blob.key,{type:'json'})));for(const value of values){if(!value)throw new Error('A saved history object could not be read.');rows.push(value);}}
 return rows;
}
export async function readVerifiedFlightHistory():Promise<LegacyFlightHistory>{
 if(snapshot&&Date.now()-Date.parse(snapshot.audit.checkedAt)<60000)return snapshot;
 if(inFlight)return inFlight;
 inFlight=(async()=>{
  const production=deploymentContext()==='production';
  const runs=production?getStore('mint-flyer-leaderboard',{consistency:'strong'}):getDeployStore('mint-flyer-leaderboard');
  const payments=production?getStore('mint-flyer-payments',{consistency:'strong'}):getDeployStore('mint-flyer-payments');
  const [saved,quotes]=await Promise.all([readObjects(runs,'runs/'),readObjects(payments,'quotes/')]);
  snapshot=verifiedFlightHistory(saved as Parameters<typeof verifiedFlightHistory>[0],quotes as Parameters<typeof verifiedFlightHistory>[1]);return snapshot;
 })().finally(()=>{inFlight=undefined;});return inFlight;
}
export async function readArcadeResultHistory(database:ReturnType<typeof getDatabase>,readLegacy?:()=>Promise<LegacyFlightHistory>){
 const context=deploymentContext();
 if(context==='production'&&Date.now()-contextAuditAt>60000){
  const counts=await database.sql`SELECT context,COUNT(*)::int AS games FROM mint_invaders_runs GROUP BY context`;
  console.info('arcade_history_context_audit',{activeContext:context,invaders:counts.map(row=>({context:String(row.context),games:Number(row.games)}))});contextAuditAt=Date.now();
 }
 const rows=await database.sql`SELECT r.game,r.run_id,r.player_key,r.wallet_address,r.nickname,r.score,r.tie_break,r.created_at,r.network,p.pilot_id FROM arcade_results r JOIN arcade_pilots p USING(context,wallet_address) WHERE r.context=${context}`;
 // Invaders' original table is also authoritative if an older dual-write failed.
 const invaders=await database.sql`SELECT game.run_id,game.player_key,game.wallet_address,game.nickname,game.score,game.wave,game.created_at,game.network,p.pilot_id FROM mint_invaders_runs game LEFT JOIN arcade_pilots p USING(context,wallet_address) WHERE game.context=${context}`;
 const iso=(value:unknown)=>value instanceof Date?value.toISOString():new Date(String(value)).toISOString();
 const primary:ArcadeHistoryResult[]=rows.map(row=>({game:row.game as ArcadeHistoryResult['game'],runId:String(row.run_id),playerKey:String(row.player_key),walletAddress:String(row.wallet_address),nickname:String(row.nickname),score:Number(row.score),tieBreak:Number(row.tie_break),createdAt:iso(row.created_at),network:row.network as ArcadeHistoryResult['network'],pilotId:String(row.pilot_id)}));
 const flightHistory=readLegacy?await readLegacy():deploymentContext()==='local'?{results:[],audit:{pilots:[],checkedAt:new Date().toISOString()}}:await readVerifiedFlightHistory();
 const historical:ArcadeHistoryResult[]=invaders.map(row=>({game:'mint-invaders',runId:String(row.run_id),playerKey:String(row.player_key),walletAddress:String(row.wallet_address),nickname:String(row.nickname),score:Number(row.score),tieBreak:Number(row.wave),createdAt:iso(row.created_at),network:row.network as ArcadeHistoryResult['network'],...(row.pilot_id?{pilotId:String(row.pilot_id)}:{})}));
 return {results:mergeArcadeHistory(primary,[...historical,...flightHistory.results],context),audit:flightHistory.audit};
}
