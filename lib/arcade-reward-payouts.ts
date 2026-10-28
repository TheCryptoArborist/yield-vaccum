import {rewardExcluded} from './arcade-reward-policy';
import type {AdminRewards,AdminRewardRow,RewardNetwork} from './arcade-admin-rewards';
export const TOKEN_SCALE=BigInt(10)**BigInt(18);
export function parseRewardAmount(value:string):bigint{
 const text=value.trim();if(!/^\d{1,30}(\.\d{1,18})?$/.test(text))throw new Error('Enter an MSS2 amount with up to 18 decimal places.');
 const [whole,fraction='']=text.split('.');return BigInt(whole)*TOKEN_SCALE+BigInt(fraction.padEnd(18,'0'));
}
export function exactRewardAmount(raw:bigint|string){
 const n=BigInt(raw),fraction=(n%TOKEN_SCALE).toString().padStart(18,'0').replace(/0+$/,'');
 return `${n/TOKEN_SCALE}${fraction?'.'+fraction:''}`;
}
export function payoutNetwork(row:AdminRewardRow,selected:Record<string,RewardNetwork>):RewardNetwork|''{
 const explicit=selected[row.id];return explicit==='arc'||explicit==='robinhood'?explicit:row.networks.length===1&&!row.unknownNetwork?row.networks[0]:'';
}
export function eligibleRewardRecipients(rows:AdminRewardRow[]){
 const all=rows.filter(row=>!rewardExcluded(row)&&row.games>0).sort((a,b)=>b.games-a.games||a.wallet.toLowerCase().localeCompare(b.wallet.toLowerCase()));
 const cutoff=all[2]?.games??0;
 return all.filter(row=>row.games>=cutoff).map(row=>({...row,rank:1+all.filter(other=>other.games>row.games).length}));
}
export type RewardPayout=AdminRewardRow&{amountRaw:string;amount:string;sharePercent:string;payoutNetwork:RewardNetwork|''};
export function calculateRewardPayouts(data:AdminRewards,budget:string,selected:Record<string,RewardNetwork>={}):RewardPayout[]{
 const pool=parseRewardAmount(budget);if(pool<=BigInt(0))throw new Error('The reward budget must be greater than zero.');
 const rows=eligibleRewardRecipients(data.rows);if(!rows.length)throw new Error('There are no eligible recipients for this week.');
 const wallets=new Set<string>();
 for(const row of rows){if(!/^0x[0-9a-f]{40}$/i.test(row.wallet)||wallets.has(row.wallet.toLowerCase())||!Number.isSafeInteger(row.games)||row.games<1)throw new Error('Review the recipient wallets and game counts.');wallets.add(row.wallet.toLowerCase());}
 const games=rows.reduce((sum,row)=>sum+BigInt(row.games),BigInt(0));
 const allocated=rows.map(row=>({row,amount:pool*BigInt(row.games)/games,remainder:pool*BigInt(row.games)%games}));
 // Largest remainder conserves every token unit. Equal remainders use wallet
 // order, so changing a nickname or query order cannot change the allocation.
 const left=pool-allocated.reduce((sum,row)=>sum+row.amount,BigInt(0));
 const order=[...allocated].sort((a,b)=>a.remainder===b.remainder?a.row.wallet.toLowerCase().localeCompare(b.row.wallet.toLowerCase()):a.remainder>b.remainder?-1:1);
 for(let n=0;n<Number(left);n++)order[n].amount++;
 return allocated.map(({row,amount})=>{
  const hundredths=(BigInt(row.games)*BigInt(10000)+games/BigInt(2))/games;
  return {...row,amountRaw:amount.toString(),amount:exactRewardAmount(amount),sharePercent:`${hundredths/BigInt(100)}.${(hundredths%BigInt(100)).toString().padStart(2,'0')}%`,payoutNetwork:payoutNetwork(row,selected)};
 });
}
export function payoutFingerprint(data:AdminRewards){return JSON.stringify([data.weekStart,data.weekEnd,data.closed,eligibleRewardRecipients(data.rows).map(row=>[row.wallet.toLowerCase(),row.games,row.networks,row.unknownNetwork])]);}
const field=(value:unknown)=>{let text=String(value);if(/^[=+\-@\t\r]/.test(text))text="'"+text;return '"'+text.replaceAll('"','""')+'"';};
export function rewardPayoutCsv(data:AdminRewards,budget:string,selected:Record<string,RewardNetwork>,source:string){
 if(!data.closed)throw new Error('Wait until the weekly period closes before exporting payouts.');
 const rows=calculateRewardPayouts(data,budget,selected);
 if(rows.some(row=>!row.payoutNetwork))throw new Error('Confirm a payout network for every recipient.');
 return [['Week start UTC','Week end UTC','Eligible rank','Player','Verified paying wallet','Paid games saved','Reward share','Reward MSS2','Payout network','Total budget MSS2','Budget source','Status'],...rows.map(row=>[data.weekStart,data.weekEnd,row.rank,row.nickname,row.wallet,row.games,row.sharePercent,row.amount,row.payoutNetwork,exactRewardAmount(parseRewardAmount(budget)),source,'REVIEWED PLAN - NOT SENT'])].map(row=>row.map(field).join(',')).join('\r\n');
}
