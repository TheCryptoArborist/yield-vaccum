import { getStore } from '@netlify/blobs';
import deployments from '../deployment/mss2-entry-router/deployments.json';
import { deploymentContext } from '../lib/deployment-context';
import { paymentNetworkConfig,type Mss2PaymentNetwork } from '../lib/mss2-payment';
import { scanWeeklyEntryTotals,type WeeklySnapshot,type WeeklyEntryTotals } from '../lib/mss2-weekly-entry-totals';
import { entryTotalsRpc } from './arcade-entry-totals';
const memory=new Map<string,WeeklySnapshot>();
const inFlight=new Map<string,Promise<WeeklyEntryTotals>>();
export function readArcadeWeeklyEntryTotals(network:Mss2PaymentNetwork,start:Date,end:Date){
 const context=deploymentContext(),blobKey=`weekly-v1/${network}/${deployments[network].router}/${start.toISOString().slice(0,10)}.json`,key=`${context}/${blobKey}`;
 const running=inFlight.get(key);if(running)return running;
 const read=async()=>{
  let cache:ReturnType<typeof getStore>|null=null;
  try{cache=getStore(`mint-flyer-entry-totals-${context}`,{consistency:'strong'});}catch{/* Local reads use memory only. */}
  let previous=memory.get(key)??null;
  // Lambda instances may hold older memory than another instance's checkpoint.
  // Prefer the furthest shared scan; the scanner revalidates its chain anchor.
  if(cache)try{
   const shared=await cache.get(blobKey,{type:'json'}) as WeeklySnapshot|null;
   if(shared&&(!previous||(shared.totals.throughBlock??-1)>(previous.totals.throughBlock??-1)||((shared.totals.throughBlock??-1)===(previous.totals.throughBlock??-1)&&Date.parse(shared.totals.checkedAt??'')>Date.parse(previous.totals.checkedAt??''))))previous=shared;
  }catch{/* Confirmed RPC reads remain authoritative. */}
  if(previous&&Date.now()-Date.parse(previous.totals.checkedAt??'')<(previous.totals.status==='ready'?30000:3000))return previous.totals;
  const next=await scanWeeklyEntryTotals(network,entryTotalsRpc(network),start,end,previous);
  memory.set(key,next);if(memory.size>64)memory.delete(memory.keys().next().value!);
  if(cache)try{await cache.setJSON(blobKey,next);}catch{/* Public aggregate caching is optional. */}
  return next.totals;
 };
 const promise=read().catch(():WeeklyEntryTotals=>({network,weekStart:start.toISOString(),weekEnd:end.toISOString(),status:'unavailable',deadAmountRaw:null,communityAmountRaw:null,entries:null,checkedAt:null,throughBlock:null,routerAddress:deployments[network].router,explorerUrl:paymentNetworkConfig(network).explorerUrl})).finally(()=>inFlight.delete(key));
 inFlight.set(key,promise);return promise;
}
