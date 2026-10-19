import { createHash } from 'node:crypto';
import type { ArcadeGame } from './arcade-game';
export type ArcadeHistoryResult={game:ArcadeGame;runId:string;playerKey:string;walletAddress:string;nickname:string;score:number;tieBreak:number;createdAt:string;network:'arc'|'robinhood'|null;pilotId?:string};
export type HistoryAuditPilot={nickname:string;saved:number;verifiedPaid:number;practice:number;unverified:number};
export type HistoryAudit={pilots:HistoryAuditPilot[];checkedAt:string};
export type LegacyFlightHistory={results:ArcadeHistoryResult[];audit:HistoryAudit};
type Run={runId?:string;playerKey?:string;nickname?:string;score?:number;distance?:number;createdAt?:string;entryMode?:string};
type Payment={game?:string;status?:string;txHash?:string;playerKey?:string;runId?:string;walletAddress?:string;network?:string};
export function verifiedFlightHistory(runs:Run[],payments:Payment[]):LegacyFlightHistory {
 const quotes=new Map<string,Payment[]>();
 for(const payment of payments){
  if(payment.status!=='verified'||(payment.game??'mint-flyer')!=='mint-flyer'||!/^0x[0-9a-fA-F]{64}$/.test(payment.txHash??'')||!/^0x[0-9a-fA-F]{40}$/.test(payment.walletAddress??'')||!['arc','robinhood'].includes(payment.network??''))continue;
  const key=JSON.stringify([payment.playerKey,payment.runId]);quotes.set(key,[...(quotes.get(key)??[]),payment]);
 }
 const results:ArcadeHistoryResult[]=[],audit=new Map<string,HistoryAuditPilot>();
 const seen=new Set<string>();
 for(const run of runs){
  const key=JSON.stringify([run.playerKey,run.runId]);if(seen.has(key))continue;seen.add(key);
  const nickname=String(run.nickname??'Unknown pilot');
  const row=audit.get(nickname)??{nickname,saved:0,verifiedPaid:0,practice:0,unverified:0};audit.set(nickname,row);row.saved++;
  if(run.entryMode==='demo'){row.practice++;continue;}
  const matches=quotes.get(key)??[],first=matches[0];
  if(matches.some(value=>value.walletAddress?.toLowerCase()!==first?.walletAddress?.toLowerCase()||value.network!==first?.network))throw new Error('Conflicting verified flight payments require review.');
  if(!first||!run.runId||!run.playerKey||!Number.isInteger(run.score)||!Number.isInteger(run.distance)||!Number.isFinite(Date.parse(run.createdAt??''))){row.unverified++;continue;}
  row.verifiedPaid++;
  results.push({game:'mint-flyer',runId:run.runId,playerKey:run.playerKey,walletAddress:first.walletAddress!.toLowerCase(),nickname,score:run.score!,tieBreak:run.distance!,createdAt:new Date(run.createdAt!).toISOString(),network:first.network as 'arc'|'robinhood'});
 }
 return {results,audit:{pilots:[...audit.values()].sort((a,b)=>a.nickname.localeCompare(b.nickname)),checkedAt:new Date().toISOString()}};
}
export function mergeArcadeHistory(primary:ArcadeHistoryResult[],legacy:ArcadeHistoryResult[],context:string):ArcadeHistoryResult[] {
 const result=new Map<string,ArcadeHistoryResult>();
 const pilots=new Map(primary.filter(row=>row.pilotId).map(row=>[row.walletAddress.toLowerCase(),row.pilotId!]));
 const ordered=[...legacy].sort((a,b)=>a.createdAt.localeCompare(b.createdAt)||a.runId.localeCompare(b.runId));
 for(const row of ordered){if(!pilots.has(row.walletAddress.toLowerCase()))pilots.set(row.walletAddress.toLowerCase(),row.pilotId??'legacy-'+createHash('sha256').update(JSON.stringify([context,row.walletAddress.toLowerCase(),row.playerKey])).digest('hex').slice(0,32));}
 for(const row of [...primary,...ordered]){
  const key=JSON.stringify([row.game,row.runId]),existing=result.get(key);
  if(existing){if(existing.walletAddress.toLowerCase()!==row.walletAddress.toLowerCase()||existing.playerKey!==row.playerKey)throw new Error('Conflicting arcade result identity requires review.');if(!existing.network&&row.network)existing.network=row.network;continue;}
  result.set(key,{...row,walletAddress:row.walletAddress.toLowerCase(),pilotId:pilots.get(row.walletAddress.toLowerCase())});
 }
 return [...result.values()];
}
export function groupArcadeHistory(results:ArcadeHistoryResult[]){
 const groups=new Map<string,{id:string;wallet:string;nickname:string;runs:number;flyer:number|null;invaders:number|null;flyerGames:number;invadersGames:number;history:ArcadeHistoryResult[]}>();
 for(const row of [...results].sort((a,b)=>a.createdAt.localeCompare(b.createdAt)||a.runId.localeCompare(b.runId))){
  const key=row.walletAddress.toLowerCase();const group=groups.get(key)??{id:row.pilotId!,wallet:key,nickname:row.nickname,runs:0,flyer:null,invaders:null,flyerGames:0,invadersGames:0,history:[]};groups.set(key,group);
  group.nickname=row.nickname;group.runs++;group.history.push(row);
  if(row.game==='mint-flyer'){group.flyer=Math.max(group.flyer??0,row.score);group.flyerGames++;}else{group.invaders=Math.max(group.invaders??0,row.score);group.invadersGames++;}
 }
 return [...groups.values()];
}
