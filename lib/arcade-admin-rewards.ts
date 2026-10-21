import type {HistoryAudit} from './arcade-result-history';
export type RewardNetwork='arc'|'robinhood';
export type AdminRewardRow={id:string;rank:number;nickname:string;wallet:string;games:number;networks:RewardNetwork[];unknownNetwork:boolean;flyerGames:number;invadersGames:number;stackGames?:number};
export type AdminRewards={rows:AdminRewardRow[];weekStart:string;weekEnd:string;closed:boolean;tieReview:boolean;pilots:number;historyAudit?:HistoryAudit};
function csvField(value:unknown) {
 let text=String(value);if(/^[=+\-@\t\r]/.test(text))text=`'${text}`;
 return `"${text.replaceAll('"','""')}"`;
}
export function rewardsCsv(data:AdminRewards,selected:Record<string,RewardNetwork>={}) {
 const header=['Week start UTC','Week end UTC','Rank','Player','Verified paying wallet','Paid games saved','Mint Flyer games','Mint Invaders games','Mint Stack games','Networks used','Payout network','Payout network source','Review'];
 const rows=data.rows.map(row=>{
  const requested=selected[row.id],confirmed=requested==='arc'||requested==='robinhood';
  const network=confirmed?requested:row.networks.length===1&&!row.unknownNetwork?row.networks[0]:'';
  const source=confirmed?'admin-confirmed':network?'recorded-history':'';
  const review=[data.historyAudit?.pilots.some(pilot=>pilot.unverified>0)?'UNVERIFIED SAVED FLIGHTS REQUIRE REVIEW':'',!data.closed?'WEEK IN PROGRESS':'',data.tieReview?'TOP THREE TIE REVIEW':'',row.unknownNetwork?'NETWORK HISTORY INCOMPLETE':'',!network?'CONFIRM PAYOUT NETWORK':''].filter(Boolean).join('; ');
  return [data.weekStart,data.weekEnd,row.rank,row.nickname,row.wallet,row.games,row.flyerGames,row.invadersGames,row.stackGames??0,row.networks.join(' + '),network,source,review];
 });
 return [header,...rows].map(row=>row.map(csvField).join(',')).join('\r\n');
}
