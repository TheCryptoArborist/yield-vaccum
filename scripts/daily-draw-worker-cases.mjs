/** Private-fork + local Postgres integration. No public signing; mocks only randomness.
 * Only this test harness can reset local test tables, impersonate accounts or change capacity fixtures.
 * The worker receives a read-only boundary, not these mutation helpers.
 */
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import pg from 'pg';
import {getAddress,keccak256,ZeroHash} from 'ethers';
import {openReaderResearchStore as openResearchStore} from '../research/daily-draw/payout-store/reader-store.mjs';
import {createResearchChainReader,readOnlyBoundary} from '../research/daily-draw/payout-store/chain-reader.mjs';
const SLOT='0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc';
const ONE=10n**18n;
const q=n=>'0x'+BigInt(n).toString(16);
const stringify=x=>JSON.stringify(x,(_,v)=>typeof v==='bigint'?v.toString():v,2);
export async function runDurableWorkerCases(c,h){
 const {key,n,report,local,TOKEN,SENDER,staking,send,ti,stake,bal,localChainId}=c;
 const {D,di,selected,round,capacity,scenario}=h;
 const url=process.env.DRAW_RESEARCH_DATABASE_URL;assert(url,'Explicit local research database required');
 const parsed=new URL(url);assert.equal(parsed.hostname,'127.0.0.1');assert.equal(parsed.pathname,'/mss2_draw_research');
 assert(!parsed.search&&!parsed.hash);
 const admin=new pg.Pool({connectionString:url,max:2});
 assert.equal((await admin.query('SELECT current_database() AS name')).rows[0].name,'mss2_draw_research');
 const first=await openResearchStore(url);await first.initialize();await first.close();
 let clients=[];let readMethods=new Set();
 const watchedRead=async(method,params=[])=>{assert(['eth_chainId','eth_getCode','eth_getStorageAt','eth_call','eth_getTransactionByHash','eth_getTransactionReceipt','eth_getBlockByNumber'].includes(method),'Worker forwarded a forbidden method');readMethods.add(method);return local(method,params);};
 async function client(){const s=await openResearchStore(url);clients.push(s);return s;}
 async function config(){
  const slot=await local('eth_getStorageAt',[staking,SLOT,'latest']);const implementation=getAddress('0x'+slot.slice(-40));
  const p={chainId:localChainId,controller:D,payment:n.payment,token:TOKEN,staking,implementation,sender:SENDER,controllerAbi:di.fragments.map(f=>JSON.parse(f.format('json')))};
  for(const [a,b]of [['controller','controllerCodeHash'],['token','tokenCodeHash'],['staking','stakingCodeHash'],['implementation','implementationCodeHash']])p[b]=keccak256(await local('eth_getCode',[p[a],'latest']));
  return p;
 }
 function reader(s,p,minimumConfirmations=1,read=watchedRead){return createResearchChainReader({read,store:s,deployment:p,minimumConfirmations});}
 async function setup(confirmations=1){
  const {r,selection}=await selected();for(let i=1;i<confirmations;i++)await local('evm_mine');
  const s=await client(),p=await config(),w=reader(s,p,confirmations);
  const ref={roundId:1,selectionTx:selection.transactionHash};const {awardId}=await w.importAward(ref);
  return {r,selection,s,p,w,ref,awardId,confirmations};
 }
 async function reserve(x){const nonce=BigInt(await local('eth_getTransactionCount',[SENDER,'latest']));
  const t=await x.s.reserve(x.awardId,{offered:(await x.s.view(x.awardId)).outstanding,nonce,operationKey:'worker-'+x.awardId});return t;}
 async function gift(x,t){
  const before={stake:(await stake(x.r.winner))[0],liquid:await bal(TOKEN,x.r.winner),reserve:await bal(TOKEN)};
  const receipt=await send(TOKEN,ti,'airdropStake',[[x.r.winner],[BigInt(t.offered)]]);
  const credited=(await stake(x.r.winner))[0]-before.stake;
  assert.equal(before.reserve-await bal(TOKEN),credited);assert.equal(await bal(TOKEN,x.r.winner),before.liquid);
  return {receipt,credited,reference:{awardId:x.awardId,attemptId:t.id,transactionHash:receipt.transactionHash}};
 }
 async function test(name,fn){
  await scenario('durable_'+name,async()=>{
   // Explicit fixture reset, never called by the ingestion worker or production migration.
   await admin.query('TRUNCATE draw_research.awards,draw_research.sender_lanes RESTART IDENTITY CASCADE');
   try{return await fn();}finally{for(const s of clients)await s.close().catch(()=>{});clients=[];}
  });
 }
 try{
 await test('imports_locked_award_and_exact_real_gift_receipt',async()=>{
  const x=await setup(),t=await reserve(x),g=await gift(x,t);const result=await x.w.observePayout(g.reference);
  assert.equal(result.status,'PaidInDatabase');assert.equal(BigInt(result.credited),g.credited);assert.equal(g.credited,x.r.awardOwed);
  const v=await x.s.view(x.awardId);assert.equal(v.outstanding,'0');assert.equal(v.locked.winner,x.r.winner.toLowerCase());
  const out=await x.s.outbox(x.awardId);assert.equal(out.length,1);assert.equal(out[0].state,'HeldForAuthorityReview');
  assert.equal((await round()).phase,7n);assert.equal((await round()).awardOwed,x.r.awardOwed);
  return {actualForkReceipt:g.receipt.transactionHash,creditedRaw:g.credited,lockedSelection:x.selection.transactionHash,onchainLiabilityUnchanged:true};
 });
 await test('idempotent_award_import_does_not_reset_paid_credit',async()=>{
  const x=await setup(),t=await reserve(x),g=await gift(x,t);await x.w.observePayout(g.reference);
  assert.equal((await x.w.importAward(x.ref)).awardId,x.awardId);assert.equal((await x.s.view(x.awardId)).outstanding,'0');
 });
 await test('caller_cannot_supply_winner_amount_or_confirmation_override',async()=>{
  const x=await setup();for(const extra of [{amount:1},{winner:SENDER},{minimumConfirmations:0}])await assert.rejects(()=>x.w.importAward({...x.ref,...extra}));
  const t=await reserve(x),g=await gift(x,t);await assert.rejects(()=>x.w.observePayout({...g.reference,credited:x.r.awardOwed}));
  assert.equal((await x.s.view(x.awardId)).credited,'0');
 });
 await test('wrong_round_selection_is_rejected_before_registration',async()=>{
  const x=await setup();await assert.rejects(()=>x.w.importAward({roundId:2,selectionTx:x.selection.transactionHash}),/round/);
  assert.equal((await admin.query('SELECT count(*) FROM draw_research.awards')).rows[0].count,'1');
 });
 await test('selection_confirmations_required_before_registration',async()=>{
  const {selection}=await selected(),s=await client(),p=await config(),w=reader(s,p,2);
  await assert.rejects(()=>w.importAward({roundId:1,selectionTx:selection.transactionHash}),/confirmations/);
  assert.equal((await admin.query('SELECT count(*) FROM draw_research.awards')).rows[0].count,'0');
  await local('evm_mine');await w.importAward({roundId:1,selectionTx:selection.transactionHash});
 });
 await test('runtime_pin_mismatch_prevents_import',async()=>{
  const {selection}=await selected(),s=await client(),p=await config();p.controllerCodeHash=ZeroHash;
  await assert.rejects(()=>reader(s,p).importAward({roundId:1,selectionTx:selection.transactionHash}),/runtime/);
  assert.equal((await admin.query('SELECT count(*) FROM draw_research.awards')).rows[0].count,'0');
 });
 await test('partial_gift_preserves_exact_unpaid_award',async()=>{
  const x=await setup();await capacity(x.r.winner,ONE/2n);const t=await reserve(x),g=await gift(x,t),r=await x.w.observePayout(g.reference);
  assert.equal(r.status,'PartiallyCredited');assert.equal(BigInt(r.credited),ONE/2n);assert.equal(BigInt(r.outstanding),x.r.awardOwed-ONE/2n);
  return {localCapacityFixture:true,receipt:g.receipt.transactionHash,unpaidRaw:r.outstanding};
 });
 await test('zero_credit_success_is_not_recorded_as_paid',async()=>{
  const x=await setup();await capacity(x.r.winner,0n);const t=await reserve(x),g=await gift(x,t),r=await x.w.observePayout(g.reference);
  assert.equal(r.status,'ZeroCredit');assert.equal(r.credited,'0');assert.equal(BigInt(r.outstanding),x.r.awardOwed);
  return {localCapacityFixture:true,receipt:g.receipt.transactionHash};
 });
 await test('client_restart_retains_reserved_intent_before_observation',async()=>{
  const x=await setup(),t=await reserve(x),g=await gift(x,t);await x.s.close();clients=clients.filter(s=>s!==x.s);
  x.s=await client();x.w=reader(x.s,x.p);
  await assert.rejects(()=>x.s.reserve(x.awardId,{offered:x.r.awardOwed,nonce:BigInt(t.nonce)+1n,operationKey:'after-restart'}),/Unresolved/);
  assert.equal((await x.w.observePayout(g.reference)).status,'PaidInDatabase');
 });
 await test('client_restart_retains_paid_credit_and_receipt_uniqueness',async()=>{
  const x=await setup(),t=await reserve(x),g=await gift(x,t);await x.w.observePayout(g.reference);await x.s.close();clients=clients.filter(s=>s!==x.s);
  x.s=await client();x.w=reader(x.s,x.p);assert.equal((await x.w.observePayout(g.reference)).status,'AlreadyRecorded');
  assert.equal((await x.s.outbox(x.awardId)).length,1);assert.equal((await x.s.view(x.awardId)).outstanding,'0');
 });
 await test('concurrent_readers_credit_actual_receipt_once',async()=>{
  const x=await setup(),t=await reserve(x),g=await gift(x,t),stores=await Promise.all([client(),client(),client()]);
  const results=await Promise.all([x.w,...stores.map(s=>reader(s,x.p))].map(w=>w.observePayout(g.reference)));
  assert.equal(results.filter(r=>r.status==='PaidInDatabase').length,1);
  assert.equal(results.filter(r=>r.status==='AlreadyRecorded').length,3);
  assert.equal((await x.s.outbox(x.awardId)).length,1);assert.equal((await x.s.view(x.awardId)).sender_frozen,false);
 });
 await test('unseen_transaction_keeps_reservation_blocked',async()=>{
  const x=await setup(),t=await reserve(x);const r=await x.w.observePayout({awardId:x.awardId,attemptId:t.id,transactionHash:ZeroHash});
  assert.equal(r.status,'PendingOrUnknown');assert.equal((await x.s.view(x.awardId)).credited,'0');
  await assert.rejects(()=>x.s.reserve(x.awardId,{offered:t.offered,nonce:BigInt(t.nonce)+1n,operationKey:'unknown-retry'}),/Unresolved/);
 });
 await test('actual_receipt_waits_for_stored_confirmation_policy',async()=>{
  const x=await setup(2),t=await reserve(x),g=await gift(x,t);assert.equal((await x.w.observePayout(g.reference)).status,'AwaitingConfirmations');
  assert.equal((await x.s.view(x.awardId)).credited,'0');await local('evm_mine');assert.equal((await x.w.observePayout(g.reference)).status,'PaidInDatabase');
 });
 await test('temporary_missing_paid_receipt_freezes_without_reversal',async()=>{
  const x=await setup(),t=await reserve(x),g=await gift(x,t);await x.w.observePayout(g.reference);
  const read=async(m,p)=>m==='eth_getTransactionReceipt'&&p[0]===g.receipt.transactionHash?null:watchedRead(m,p);
  const r=await reader(x.s,x.p,1,read).observePayout(g.reference);assert.equal(r.status,'ReviewRequired');
  const v=await x.s.view(x.awardId);assert.equal(v.credited,x.r.awardOwed.toString());assert.equal(v.sender_frozen,true);
  return {explicitReadFaultInjection:true};
 });
 await test('real_fork_reorg_reverses_archived_credit_once_and_freezes',async()=>{
  const x=await setup(),t=await reserve(x),before=await local('evm_snapshot'),g=await gift(x,t);await x.w.observePayout(g.reference);
  assert(await local('evm_revert',[before]));
  const head=await local('eth_getBlockByNumber',['latest',false]);await local('evm_setNextBlockTimestamp',[Number(BigInt(head.timestamp)+20n)]);await local('evm_mine');
  assert.equal(await local('eth_getTransactionReceipt',[g.receipt.transactionHash]),null);
  assert.notEqual((await local('eth_getBlockByNumber',[g.receipt.blockNumber,false])).hash,g.receipt.blockHash);
  const r=await x.w.observePayout(g.reference);assert.equal(r.status,'ReviewRequired');
  const v=await x.s.view(x.awardId);assert.equal(v.credited,'0');assert.equal(BigInt(v.outstanding),x.r.awardOwed);assert(v.sender_frozen);
  await x.w.observePayout(g.reference);assert.equal((await x.s.outbox(x.awardId)).filter(x=>x.kind==='ReceiptOrphaned').length,1);
  return {localSnapshotReorganization:true,originalReceipt:g.receipt.transactionHash,restoredOwedRaw:v.outstanding};
 });
 await test('contradictory_header_height_does_not_credit_or_reverse',async()=>{
  const x=await setup(),t=await reserve(x),g=await gift(x,t);
  const read=async(m,p)=>{const v=await watchedRead(m,p);return m==='eth_getBlockByNumber'&&p[0]===g.receipt.blockNumber?{...v,number:q(BigInt(v.number)+1n)}:v;};
  assert.equal((await reader(x.s,x.p,1,read).observePayout(g.reference)).status,'ReviewRequired');assert.equal((await x.s.view(x.awardId)).credited,'0');
  return {explicitReadFaultInjection:true};
 });
 await test('changed_runtime_during_payout_is_held_for_review',async()=>{
  const x=await setup(),t=await reserve(x),g=await gift(x,t);
  const read=async(m,p)=>m==='eth_getCode'&&p[0].toLowerCase()===TOKEN.toLowerCase()?'0x00':watchedRead(m,p);
  assert.equal((await reader(x.s,x.p,1,read).observePayout(g.reference)).status,'ReviewRequired');assert.equal((await x.s.view(x.awardId)).credited,'0');
  return {explicitReadFaultInjection:true};
 });
 await test('chain_switch_during_observation_cannot_credit',async()=>{
  const x=await setup(),t=await reserve(x),g=await gift(x,t);let calls=0;
  const read=async(m,p)=>m==='eth_chainId'&&++calls>1?q(4663):watchedRead(m,p);
  assert.equal((await reader(x.s,x.p,1,read).observePayout(g.reference)).status,'ReviewRequired');assert.equal((await x.s.view(x.awardId)).credited,'0');
  return {explicitReadFaultInjection:true};
 });
 await test('read_boundary_blocks_signing_and_public_chain_configuration',async()=>{
  let forwarded=0;const read=readOnlyBoundary(async()=>{forwarded++;return null;});
  for(const m of ['eth_sendTransaction','eth_sendRawTransaction','eth_sign','personal_sign','wallet_sendCalls'])await assert.rejects(()=>read(m,[]),/forbidden/);
  assert.equal(forwarded,0);const s=await client(),p=await config();
  for(const chainId of [4663,5042])assert.throws(()=>reader(s,{...p,chainId}),/LOCAL_ONLY/);
 });
 await test('read_errors_never_create_credit_or_unlock_attempt',async()=>{
  const x=await setup(),t=await reserve(x),g=await gift(x,t);
  const read=async(m,p)=>{if(m==='eth_getTransactionReceipt')throw Error('Injected read transport failure');return watchedRead(m,p);};
  assert.equal((await reader(x.s,x.p,1,read).observePayout(g.reference)).status,'ReviewRequired');assert.equal((await x.s.view(x.awardId)).credited,'0');
  await assert.rejects(()=>x.s.reserve(x.awardId,{offered:t.offered,nonce:BigInt(t.nonce)+1n,operationKey:'retry-transport'}),/review/);
  return {explicitReadFaultInjection:true};
 });
 }finally{for(const s of clients)await s.close().catch(()=>{});await admin.end();}
 const tests=report.tests.filter(t=>t.name.startsWith('market_ledger_durable_'));
 report.durableWorker={categories:tests.length,passed:tests.filter(t=>t.status==='passed').length,failed:tests.filter(t=>t.status!=='passed').length,
  readMethods:[...readMethods].sort(),chainWritesByWorker:0,scope:'Real private-fork token/router/stake receipts + local Postgres; deterministic mock randomness. Local storage capacity/reorg fixtures and explicit read-fault cases. No public signer/API/scheduler or on-chain settlement.',
  sourceChainId:n.id,localChainId,productionEnabled:false,onChainLiabilityDecrement:false,
  pinScope:'Runtime pins read from the fixture deployment plus source-record-checked fork contracts; not independently reviewed production pins.',
  sourceHashes:Object.fromEntries(await Promise.all(['research/daily-draw/payout-store/chain-reader.mjs','research/daily-draw/payout-store/store.mjs',
    'research/daily-draw/payout-store/schema.sql','research/daily-draw/payout-store/reader-store.mjs'].map(async f=>[f,createHash('sha256').update(await readFile(f)).digest('hex')])))};
 await writeFile('durable-worker-'+key+'.json',stringify({worker:report.durableWorker,tests})+'\n');
}
