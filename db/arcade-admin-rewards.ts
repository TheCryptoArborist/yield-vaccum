import {rewardExcluded} from '../lib/arcade-reward-policy';
import { adminDatabase } from './arcade-admin-session';
import { arcadeWeekWindow,gamesPlayedStandings } from '../lib/arcade-championship';
import {groupArcadeHistory,type LegacyFlightHistory} from '../lib/arcade-result-history';
import {readArcadeResultHistory} from './arcade-result-history';
import type {AdminRewards,RewardNetwork} from '../lib/arcade-admin-rewards';
export async function readAdminRewards(week?:string,database=adminDatabase(),readLegacy?:()=>Promise<LegacyFlightHistory>):Promise<AdminRewards> {
 const {start,end}=arcadeWeekWindow(week),history=await readArcadeResultHistory(database,readLegacy);
 const groups=groupArcadeHistory(history.results.filter(row=>Date.parse(row.createdAt)>=start.getTime()&&Date.parse(row.createdAt)<end.getTime()));
 const eligible=groups.filter(group=>!rewardExcluded({wallet:group.wallet,nickname:group.nickname}));
 const ranked=gamesPlayedStandings(eligible.map(row=>({id:row.id,nickname:row.nickname,runs:row.runs,flyer:row.flyer,invaders:row.invaders,stack:row.stack}))).filter(row=>row.rank<=3);
 const recipients=ranked.map(standing=>{
  const group=groups.find(value=>value.id===standing.id)!;
  const networks=new Set<RewardNetwork>();let unknownNetwork=false;
  for(const row of group.history){if(row.network)networks.add(row.network);else unknownNetwork=true;}
  return {id:standing.id,rank:standing.rank,nickname:standing.nickname,wallet:group.wallet,games:standing.runs,flyerGames:group.flyerGames,invadersGames:group.invadersGames,stackGames:group.stackGames,networks:[...networks].sort(),unknownNetwork};
 });
 return {rows:recipients,weekStart:start.toISOString(),weekEnd:end.toISOString(),closed:Date.now()>=end.getTime(),tieReview:ranked.length>3,pilots:groups.length,excludedPlayers:groups.length-eligible.length,eligiblePilots:eligible.length,historyAudit:history.audit};
}
