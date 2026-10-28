import { keccak256 } from 'ethers';
import deployments from '../deployment/mss2-entry-router/deployments.json';
import { paymentNetworkConfig,type Mss2PaymentNetwork } from './mss2-payment';
import { readRouterStartBlock,scanEntryTotals,publicEntryTotals,type EntryTotals,type TotalsRpc,type TotalsSnapshot } from './mss2-entry-totals';
export type WeeklyEntryTotals=EntryTotals&{weekStart:string;weekEnd:string};
export type WeeklySnapshot={version:1;weekStart:string;weekEnd:string;origin:number;first:number;lastExclusive:number|null;scan:TotalsSnapshot|null;totals:WeeklyEntryTotals};
const hex=(n:number)=>`0x${n.toString(16)}`;
// Lower bound on block time: the week includes its opening block and excludes
// every block at or after the following Monday, independently of score saves.
export async function firstBlockAt(timestamp:number,origin:number,head:number,time:(block:number)=>Promise<number>){
 let low=origin,high=head+1;
 while(low<high){const mid=low+Math.floor((high-low)/2);if(await time(mid)<timestamp)low=mid+1;else high=mid;}
 return low;
}
export async function scanWeeklyEntryTotals(network:Mss2PaymentNetwork,rpc:TotalsRpc,start:Date,end:Date,previous:WeeklySnapshot|null):Promise<WeeklySnapshot>{
 const config=paymentNetworkConfig(network),router=deployments[network].router;
 const [chain,tip,code]=await Promise.all([rpc<string>('eth_chainId',[]),rpc<string>('eth_blockNumber',[]),rpc<string>('eth_getCode',[router,'latest'])]);
 if(Number(BigInt(chain))!==config.chainId||keccak256(code)!==deployments[network].runtimeCodeHash)throw new Error('Weekly source did not match the verified router and network.');
 const head=Number(BigInt(tip))-config.confirmations+1;
 if(!Number.isSafeInteger(head)||head<0)throw new Error('Confirmed chain head unavailable.');
 const weekStart=start.toISOString(),weekEnd=end.toISOString(),startTime=start.getTime()/1000,endTime=end.getTime()/1000;
 let old=previous?.version===1&&previous.weekStart===weekStart&&previous.weekEnd===weekEnd&&previous.totals.routerAddress===router?previous:null;
 const origin=old?.origin??await readRouterStartBlock(network,rpc);
 if(head<origin)throw new Error('Router history is not confirmed.');
 const times=new Map<number,Promise<number>>();
 const time=(block:number)=>{
  if(!times.has(block))times.set(block,rpc<{timestamp?:string}|null>('eth_getBlockByNumber',[hex(block),false]).then(row=>{
   if(!row?.timestamp)throw new Error('Block time unavailable.');const timestamp=Number(BigInt(row.timestamp));
   if(!Number.isSafeInteger(timestamp)||timestamp<0)throw new Error('Invalid block time.');return timestamp;
  }));return times.get(block)!;
 };
 const boundaryValid=async(block:number,target:number)=>block>=origin&&block<=head+1&&(block===head+1||await time(block)>=target)&&(block===origin||await time(block-1)<target);
 if(old&&(!await boundaryValid(old.first,startTime)||(old.lastExclusive!==null&&!await boundaryValid(old.lastExclusive,endTime))))old=null;
 const closed=await time(head)>=endTime;
 const [first,lastExclusive]=await Promise.all([
  old?Promise.resolve(old.first):firstBlockAt(startTime,origin,head,time),
  old?.lastExclusive!==null&&old?.lastExclusive!==undefined?Promise.resolve(old.lastExclusive):closed?firstBlockAt(endTime,origin,head,time):Promise.resolve(null),
 ]);
 const last=lastExclusive===null?head:lastExclusive-1;
 let scan:TotalsSnapshot|null=null,totals:EntryTotals;
 if(first>last){totals={network,status:'ready',deadAmountRaw:'0',communityAmountRaw:'0',entries:0,checkedAt:new Date().toISOString(),throughBlock:last,routerAddress:router,explorerUrl:config.explorerUrl};}
 else{
  // Reuse the verified, deduplicated, resumable scanner with a bounded head.
  const bounded:TotalsRpc=async<T>(method:string,params:unknown[]):Promise<T>=>method==='eth_blockNumber'?hex(last+config.confirmations-1) as T:rpc<T>(method,params);
  scan=await scanEntryTotals(network,bounded,old?.scan??null,first);totals=publicEntryTotals(network,scan);
 }
 return {version:1,weekStart,weekEnd,origin,first,lastExclusive,scan,totals:{...totals,weekStart,weekEnd}};
}
