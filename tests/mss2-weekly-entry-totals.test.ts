import assert from 'node:assert/strict';
import test from 'node:test';
import { AbiCoder } from 'ethers';
import artifact from '../deployment/mss2-entry-router/Mss2EntryRouter.artifact.json';
import deployments from '../deployment/mss2-entry-router/deployments.json';
import { ENTRY_PAID_TOPIC,MSS2_TOKEN,addressTopic,splitEntryAmount } from '../lib/mss2-payment';
import { type TotalsRpc,type EntryLog } from '../lib/mss2-entry-totals';
import { scanWeeklyEntryTotals,firstBlockAt,type WeeklySnapshot } from '../lib/mss2-weekly-entry-totals';
import { GET } from '../app/api/arcade-weekly-totals/route';
const start=new Date('2026-10-19T00:00:00Z'),end=new Date('2026-10-26T00:00:00Z');
const epoch=start.getTime()/1000;
function log(block:number,id='ab'):EntryLog{
 const split=splitEntryAmount('100000000000000000003');
 return {address:deployments.robinhood.router,topics:[ENTRY_PAID_TOPIC,`0x${'11'.repeat(32)}`,addressTopic('0x1111111111111111111111111111111111111111'),addressTopic(MSS2_TOKEN)],data:AbiCoder.defaultAbiCoder().encode(['uint256','uint256','uint256'],[split.totalAmount,split.deadAddressAmount,split.communityReserveAmount]),blockNumber:`0x${block.toString(16)}`,transactionHash:`0x${id.repeat(32)}`,logIndex:'0x0'};
}
function fixture({head=11000,logs=[],step=60,chain='robinhood',reorg=false,failLogs=false}:{head?:number;logs?:EntryLog[];step?:number;chain?:'arc'|'robinhood';reorg?:boolean;failLogs?:boolean}={}):TotalsRpc{
 return async<T>(method:string,params:unknown[])=>{
  let value:unknown;
  if(method==='eth_chainId')value=chain==='arc'?'0x13b2':'0x1237';
  else if(method==='eth_blockNumber')value=`0x${head.toString(16)}`;
  else if(method==='eth_getCode')value=artifact.deployedBytecode;
  else if(method==='eth_getTransactionReceipt')value={status:'0x1',contractAddress:deployments[chain].router,transactionHash:deployments[chain].deploymentTransactionHash,blockNumber:'0x0'};
  else if(method==='eth_getBlockByNumber'){
   const n=Number(BigInt(params[0] as string));assert.ok(n<=head);value={timestamp:`0x${(epoch-2*step+n*step).toString(16)}`,hash:`${reorg?'new':'old'}-${n}`};
  }else if(method==='eth_getLogs'){
   if(failLogs)throw new Error('RPC unavailable');
   const f=params[0] as {fromBlock:string;toBlock:string};value=logs.filter(l=>BigInt(l.blockNumber)>=BigInt(f.fromBlock)&&BigInt(l.blockNumber)<=BigInt(f.toBlock));
  }else throw new Error(method);
  return value as T;
 };
}
test('weekly router funding uses exact UTC start-inclusive/end-exclusive boundaries and deduplicates',async()=>{
 const logs=[log(1),log(2,'bc'),log(2,'bc'),log(10081,'cd'),log(10082,'de')];
 const data=await scanWeeklyEntryTotals('robinhood',fixture({logs}),start,end,null);
 assert.equal(data.first,2);assert.equal(data.lastExclusive,10082);assert.equal(data.totals.entries,2);
 assert.equal(data.totals.communityAmountRaw,'160000000000000000006');assert.equal(data.totals.deadAmountRaw,'40000000000000000000');
 assert.equal(data.totals.weekStart,start.toISOString());assert.equal(data.totals.throughBlock,10081);
 // No score-save or browser identity is needed to count a confirmed entry.
 assert.ok(!JSON.stringify(data.totals).includes('walletAddress'));
 const repeat=await scanWeeklyEntryTotals('robinhood',fixture({logs}),start,end,data);assert.deepEqual(repeat.totals.communityAmountRaw,data.totals.communityAmountRaw);
});
test('current weekly funding excludes unconfirmed tip, includes newly confirmed entries and replaces reorgs',async()=>{
 const first=await scanWeeklyEntryTotals('robinhood',fixture({head:100,logs:[log(99),log(100,'bc')]}),start,end,null);
 assert.equal(first.totals.entries,1);assert.equal(first.lastExclusive,null);
 const next=await scanWeeklyEntryTotals('robinhood',fixture({head:101,logs:[log(99),log(100,'bc')]}),start,end,first);
 assert.equal(next.totals.entries,2);
 const reorg=await scanWeeklyEntryTotals('robinhood',fixture({head:101,logs:[log(98,'cd')],reorg:true}),start,end,next);
 assert.equal(reorg.totals.entries,1);
});
test('weeks before router deployment and empty confirmed weeks return verified zero',async()=>{
 const earlier=new Date('2026-10-12T00:00:00Z');
 const prior=await scanWeeklyEntryTotals('robinhood',fixture(),earlier,start,null);
 assert.equal(prior.totals.status,'ready');assert.equal(prior.totals.communityAmountRaw,'0');assert.equal(prior.totals.entries,0);
 const empty=await scanWeeklyEntryTotals('robinhood',fixture(),start,end,null);assert.equal(empty.totals.communityAmountRaw,'0');
});
test('Arc weekly scans resume without exposing partial totals or borrowing another week',async()=>{
 const rpc=fixture({chain:'arc',head:130000,step:5,logs:[log(2),log(120961,'bc'),log(120962,'cd')]});
 let data:WeeklySnapshot=await scanWeeklyEntryTotals('arc',rpc,start,end,null);
 assert.equal(data.totals.status,'syncing');assert.equal(data.totals.communityAmountRaw,null);
 for(let i=0;i<4&&data.totals.status!=='ready';i++)data=await scanWeeklyEntryTotals('arc',rpc,start,end,data);
 assert.equal(data.totals.status,'ready');assert.equal(data.totals.entries,2);
 const prior=await scanWeeklyEntryTotals('arc',rpc,new Date('2026-10-12'),start,data);assert.equal(prior.totals.entries,0);
});
test('wrong networks and unavailable history never become zero funding; invalid API weeks reject before RPC',async()=>{
 await assert.rejects(scanWeeklyEntryTotals('arc',fixture(),start,end,null),/source/);
 await assert.rejects(scanWeeklyEntryTotals('robinhood',fixture({failLogs:true}),start,end,null),/unavailable/);
 const missingTime:TotalsRpc=async<T>(method:string,params:unknown[])=>method==='eth_getBlockByNumber'?{} as T:fixture()<T>(method,params);
 await assert.rejects(scanWeeklyEntryTotals('robinhood',missingTime,start,end,null),/Block time/);
 for(const query of ['chain=unknown','chain=arc&week=2026-10-20','chain=arc&week=2099-01-05','chain=arc&week=bad']){
  const response=await GET(new Request(`https://example.com/api/arcade-weekly-totals?${query}`));assert.equal(response.status,400);
 }
});
test('lower-bound search handles multiple blocks sharing the boundary timestamp',async()=>{
 assert.equal(await firstBlockAt(100,0,9,async b=>[98,99,100,100,100,101,101,102,103,104][b]),2);
 assert.equal(await firstBlockAt(105,0,9,async b=>95+b),10);
});
