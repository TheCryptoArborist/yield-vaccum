/** Local Postgres tests. Synthetic receipt evidence, no RPC or wallet operations. */
import assert from 'node:assert/strict';
import { fork } from 'node:child_process';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { keccak256, toUtf8Bytes, toBeHex } from 'ethers';
import { openResearchStore, tokenInterface, stakingInterface } from '../research/daily-draw/payout-store/store.mjs';

const url=process.env.DRAW_RESEARCH_DATABASE_URL;
assert(url,'Explicit local test database required');
const hash=s=>keccak256(toUtf8Bytes(String(s)));
const addr=n=>'0x'+BigInt(n).toString(16).padStart(40,'0');
const ONE=10n**18n;
const mode=process.argv[2];

if(mode==='--worker') {
  const job=JSON.parse(process.argv[3]);
  if(job.crash) {
    const original=pg.Client.prototype.query;
    pg.Client.prototype.query=async function(...args) {
      if(args[0]==='COMMIT' && job.crash==='before') process.kill(process.pid,'SIGKILL');
      const result=await original.apply(this,args);
      if(args[0]==='COMMIT' && job.crash==='after') process.kill(process.pid,'SIGKILL');
      return result;
    };
  }
  const s=await openResearchStore(url);
  try { const result=await s.reserve(job.id,job.options);process.send?.({ok:true,result}); }
  catch(e) { process.send?.({ok:false,error:e.message,code:e.code}); }
  finally { await s.close(); }
  process.exit(0);
}

const s=await openResearchStore(url);
await mkdir('evidence',{recursive:true});
if(mode==='--restart-check') {
  const marker=JSON.parse(await readFile('evidence/persistence-restart-marker.json','utf8'));
  const a=await s.view(marker.id),attempts=await s.attempts(marker.id);
  assert.equal(a.phase,'Submitted');assert.equal(a.credited,'0');assert.equal(attempts.length,1);
  assert.equal(attempts[0].id,marker.attemptId);assert(attempts[0].active);
  await assert.rejects(()=>s.reserve(marker.id,{offered:ONE.toString(),nonce:'99',operationKey:'restart-duplicate'}));
  const result={status:'passed',scope:'Actual Postgres service restart; pending reservation and hash remain durable',award:marker.id,attempt:marker.attemptId};
  await writeFile('evidence/persistence-server-restart.json',JSON.stringify(result,null,2)+'\n');
  console.log(JSON.stringify(result));await s.close();process.exit(0);
}
assert(!mode,'Only --worker or --restart-check supported');
await s.initialize();
const report={createdAt:new Date().toISOString(),scope:'Real local Postgres, two local-chain namespaces, synthetic receipt fixtures; no chain calls, signer or live settlement',publicTransactions:0,tests:[]};
let sequence=0;
const fresh=async(chain,overrides={})=>{
  const i=++sequence;
  const a={chainId:chain,controller:addr(100),roundId:String(i),token:addr(200),staking:addr(300),sender:addr(1000+i),winner:addr(5000+i),
    amount:(3n*ONE).toString(),selectedBlock:'100',selectedBlockHash:hash('selection-block'),selectionTx:hash('selection-'+i),minimumConfirmations:'2',...overrides};
  return {a,id:await s.register(a)};
};
const reserve=async f=>s.reserve(f.id,{offered:f.a.amount,nonce:'7',operationKey:'reserve-'+f.a.chainId+'-'+f.a.roundId});
function evidence(f,t,{credited=BigInt(t.offered),txHash=hash(t.id),status=1,head=106,blockHash=hash('payout-block'),nonce=t.nonce}={}) {
  const common={transactionHash:txHash,blockHash,blockNumber:'0x69',transactionIndex:'0x0',removed:false};
  const logs=[];
  if(status===1&&credited>0n) {
    logs.push({...common,address:f.a.staking,logIndex:'0x0',...stakingInterface.encodeEventLog(stakingInterface.getEvent('StakeGifted'),[f.a.sender,f.a.winner,credited])});
    logs.push({...common,address:f.a.token,logIndex:'0x1',...tokenInterface.encodeEventLog(tokenInterface.getEvent('Transfer'),[f.a.sender,f.a.staking,credited])});
  }
  const transaction={chainId:f.a.chainId,hash:txHash,from:f.a.sender,to:f.a.token,nonce:toBeHex(BigInt(nonce)),value:'0x0',input:t.calldata,blockHash,blockNumber:'0x69',transactionIndex:'0x0'};
  return {chainId:f.a.chainId,transaction,receipt:{transactionHash:txHash,from:f.a.sender,to:f.a.token,blockHash,blockNumber:'0x69',transactionIndex:'0x0',status:toBeHex(status),logs},
    canonicalBlock:{number:'0x69',hash:blockHash},head:{number:toBeHex(head),hash:hash('head-'+head)},selectionBlock:{number:'0x64',hash:f.a.selectedBlockHash}};
}
async function ready(chain,options={}) {
  const f=await fresh(chain),t=await reserve(f),e=evidence(f,t,options);
  await s.bindTransaction(f.id,t.id,e.transaction);return {...f,t,e};
}
async function run(name,fn,chain=null) {
  try {const details=await fn();report.tests.push({name,chain,status:'passed',...details});}
  catch(error) {report.tests.push({name,chain,status:'failed',error:error.stack});}
  console.log('PERSISTENCE_CASE',chain??'shared',name,report.tests.at(-1).status);
}
function worker(job) {
  return new Promise((resolve,reject)=>{
    const child=fork(fileURLToPath(import.meta.url),['--worker',JSON.stringify(job)],{stdio:['ignore','pipe','pipe','ipc']});
    let message,stderr='';child.stderr.on('data',b=>{stderr+=b;});child.on('message',m=>{message=m;});
    const timer=setTimeout(()=>{child.kill('SIGKILL');reject(Error('Worker timeout: '+stderr));},15000);
    child.on('error',reject);child.on('exit',(code,signal)=>{clearTimeout(timer);resolve({message,code,signal,stderr});});
  });
}

for(const chain of [31337,31338]) {
  await run('immutable_award_and_idempotent_registration',async()=>{
    const f=await fresh(chain);assert.equal(await s.register(f.a),f.id);
    await assert.rejects(()=>s.register({...f.a,winner:addr(99999)}));
  },chain);
  await run('amounts_above_javascript_safe_integer_remain_exact',async()=>{
    const f=await fresh(chain,{amount:((1n<<250n)+17n).toString()});assert.equal((await s.view(f.id)).amount,f.a.amount);
  },chain);
  await run('one_active_attempt_and_permanent_nonce_uniqueness',async()=>{
    const f=await fresh(chain);await reserve(f);
    await assert.rejects(()=>s.reserve(f.id,{offered:ONE.toString(),nonce:'8',operationKey:'another-'+sequence}));
    const g=await fresh(chain,{sender:f.a.sender});await assert.rejects(()=>reserve(g));
  },chain);
  await run('identical_reservation_retries_return_same_attempt',async()=>{
    const f=await fresh(chain);const a=await reserve(f),b=await reserve(f);assert.equal(a.id,b.id);assert.equal((await s.attempts(f.id)).length,1);
  },chain);
  await run('conflicting_idempotency_parameters_rejected',async()=>{
    const f=await fresh(chain),t=await reserve(f);
    await assert.rejects(()=>s.reserve(f.id,{offered:ONE.toString(),nonce:'7',operationKey:t.operation_key}));
  },chain);
  await run('competing_processes_have_one_reservation_winner',async()=>{
    const f=await fresh(chain),options={offered:f.a.amount,nonce:'7'};
    const results=await Promise.all(['a','b'].map(x=>worker({id:f.id,options:{...options,operationKey:'race-'+chain+'-'+x}})));
    assert.equal(results.filter(x=>x.message?.ok).length,1);assert.equal(results.filter(x=>x.message?.ok===false).length,1);
    assert.equal((await s.attempts(f.id)).length,1);
  },chain);
  await run('competing_idempotent_processes_recover_same_attempt',async()=>{
    const f=await fresh(chain),job={id:f.id,options:{offered:f.a.amount,nonce:'7',operationKey:'same-race-'+chain}};
    const [a,b]=await Promise.all([worker(job),worker(job)]);assert(a.message.ok&&b.message.ok);assert.equal(a.message.result.id,b.message.result.id);
  },chain);
  await run('process_crash_before_commit_rolls_back_reservation',async()=>{
    const f=await fresh(chain),options={offered:f.a.amount,nonce:'7',operationKey:'crash-before-'+chain};
    const killed=await worker({id:f.id,options,crash:'before'});assert.equal(killed.signal,'SIGKILL');
    const t=await s.reserve(f.id,options);assert(t.id);assert.equal((await s.attempts(f.id)).length,1);
  },chain);
  await run('process_crash_after_commit_recovers_without_new_attempt',async()=>{
    const f=await fresh(chain),options={offered:f.a.amount,nonce:'7',operationKey:'crash-after-'+chain};
    const killed=await worker({id:f.id,options,crash:'after'});assert.equal(killed.signal,'SIGKILL');
    const existing=await s.attempts(f.id);assert.equal(existing.length,1);
    assert.equal((await s.reserve(f.id,options)).id,existing[0].id);
  },chain);
  await run('submitted_attempt_survives_client_restart',async()=>{
    const f=await ready(chain),other=await openResearchStore(url);
    assert.equal((await other.view(f.id)).phase,'Submitted');
    await assert.rejects(()=>other.reserve(f.id,{offered:ONE.toString(),nonce:'8',operationKey:'restart-'+sequence}));await other.close();
  },chain);
  await run('missing_receipt_never_unlocks_signature',async()=>{
    const f=await ready(chain);assert.equal((await s.reconcile(f.id,f.t.id,{chainId:chain})).status,'PendingOrUnknown');
    await assert.rejects(()=>s.reserve(f.id,{offered:ONE.toString(),nonce:'8',operationKey:'unknown-'+sequence}));
  },chain);
  await run('insufficient_confirmations_preserve_reservation',async()=>{
    const f=await ready(chain,{head:105});assert.equal((await s.reconcile(f.id,f.t.id,f.e)).status,'AwaitingConfirmations');assert.equal((await s.view(f.id)).credited,'0');
  },chain);
  await run('full_credit_and_outbox_commit_together',async()=>{
    const f=await ready(chain);assert.equal((await s.reconcile(f.id,f.t.id,f.e)).outstanding,'0');
    const out=await s.outbox(f.id);assert.equal(out.length,1);assert.equal(out[0].state,'HeldForAuthorityReview');assert.equal((await s.view(f.id)).onChainSettlement,'NotImplemented');
  },chain);
  await run('parallel_receipt_workers_credit_once',async()=>{
    const f=await ready(chain);const results=await Promise.all([s.reconcile(f.id,f.t.id,f.e),s.reconcile(f.id,f.t.id,f.e)]);
    assert(results.some(x=>x.status==='AlreadyRecorded'));assert.equal((await s.view(f.id)).credited,f.a.amount);assert.equal((await s.outbox(f.id)).length,1);
  },chain);
  await run('replacement_with_identical_instruction_is_same_attempt',async()=>{
    const f=await ready(chain),e=evidence(f,f.t,{txHash:hash('replacement-'+sequence)});
    await s.bindTransaction(f.id,f.t.id,e.transaction);await s.reconcile(f.id,f.t.id,e);assert.equal((await s.view(f.id)).outstanding,'0');assert.equal((await s.attempts(f.id)).length,1);
  },chain);
  await run('changed_replacement_instruction_freezes_sender',async()=>{
    const f=await ready(chain),tx={...f.e.transaction,hash:hash('bad-replace-'+sequence),to:addr(777)};
    assert.equal((await s.bindTransaction(f.id,f.t.id,tx)).status,'ReviewRequired');
    const g=await fresh(chain,{sender:f.a.sender});await assert.rejects(()=>reserve(g));assert((await s.view(f.id)).sender_frozen);
  },chain);
  await run('confirmed_revert_preserves_owed_amount_and_consumes_nonce',async()=>{
    const f=await ready(chain,{status:0});await s.reconcile(f.id,f.t.id,f.e);assert.equal((await s.view(f.id)).outstanding,f.a.amount);
    await assert.rejects(()=>s.reserve(f.id,{offered:ONE.toString(),nonce:'7',operationKey:'reused-'+sequence}));
    await s.reserve(f.id,{offered:ONE.toString(),nonce:'8',operationKey:'reverted-next-'+sequence});
  },chain);
  await run('partial_credit_keeps_winner_and_exact_remainder',async()=>{
    const f=await ready(chain,{credited:ONE});await s.reconcile(f.id,f.t.id,f.e);const a=await s.view(f.id);
    assert.equal(a.outstanding,(2n*ONE).toString());assert.equal(a.locked.winner,f.a.winner);
    const t=await s.reserve(f.id,{offered:(2n*ONE).toString(),nonce:'8',operationKey:'partial-'+sequence});
    const e=evidence(f,t,{txHash:hash('partial-final-'+sequence)});await s.bindTransaction(f.id,t.id,e.transaction);await s.reconcile(f.id,t.id,e);assert.equal((await s.view(f.id)).outstanding,'0');
  },chain);
  await run('zero_credit_is_not_paid',async()=>{
    const f=await ready(chain,{credited:0n});assert.equal((await s.reconcile(f.id,f.t.id,f.e)).status,'ZeroCredit');assert.equal((await s.view(f.id)).outstanding,f.a.amount);
  },chain);
  await run('subminimum_remainder_cannot_be_rounded_up',async()=>{
    const f=await ready(chain,{credited:3n*ONE-1n});await s.reconcile(f.id,f.t.id,f.e);
    await assert.rejects(()=>s.reserve(f.id,{offered:'1',nonce:'8',operationKey:'dust-'+sequence}));
    await assert.rejects(()=>s.reserve(f.id,{offered:ONE.toString(),nonce:'8',operationKey:'roundup-'+sequence}));
  },chain);
  await run('receipt_hash_cannot_be_assigned_to_two_awards',async()=>{
    const f=await ready(chain),g=await fresh(chain),t=await reserve(g),e=evidence(g,t,{txHash:f.e.transaction.hash});
    await assert.rejects(()=>s.bindTransaction(g.id,t.id,e.transaction));assert.equal((await s.view(g.id)).credited,'0');
  },chain);
  await run('malformed_evidence_rolls_back_all_credit_and_outbox',async()=>{
    const f=await ready(chain),e=structuredClone(f.e);e.receipt.logs[1].data='0x'+'0'.repeat(64);
    await assert.rejects(()=>s.reconcile(f.id,f.t.id,e));assert.equal((await s.view(f.id)).credited,'0');assert.equal((await s.outbox(f.id)).length,0);
  },chain);
  await run('duplicate_log_index_rejected',async()=>{
    const f=await ready(chain),e=structuredClone(f.e);e.receipt.logs[1].logIndex='0x0';await assert.rejects(()=>s.reconcile(f.id,f.t.id,e));
  },chain);
  await run('wrong_chain_evidence_rejected',async()=>{
    const f=await ready(chain);await assert.rejects(()=>s.reconcile(f.id,f.t.id,{...f.e,chainId:chain===31337?31338:31337}));
  },chain);
  await run('reorg_before_credit_freezes_without_counting_payment',async()=>{
    const f=await ready(chain),e=structuredClone(f.e);e.canonicalBlock.hash=hash('other-canonical');
    assert.equal((await s.reconcile(f.id,f.t.id,e)).status,'ReviewRequired');assert.equal((await s.view(f.id)).credited,'0');
  },chain);
  await run('reorg_after_credit_restores_liability_once_and_blocks_retry',async()=>{
    const f=await ready(chain);await s.reconcile(f.id,f.t.id,f.e);const e=structuredClone(f.e);e.canonicalBlock.hash=hash('reorganized');
    await s.reconcile(f.id,f.t.id,e);await s.reconcile(f.id,f.t.id,e);
    const a=await s.view(f.id);assert.equal(a.credited,'0');assert.equal(a.outstanding,a.amount);assert(a.sender_frozen);assert.equal((await s.outbox(f.id)).length,2);
    await assert.rejects(()=>s.reserve(f.id,{offered:ONE.toString(),nonce:'8',operationKey:'unsafe-retry-'+sequence}));
  },chain);
  await run('temporary_missing_evidence_after_credit_does_not_erase_payment',async()=>{
    const f=await ready(chain);await s.reconcile(f.id,f.t.id,f.e);await s.reconcile(f.id,f.t.id,{chainId:chain});
    const a=await s.view(f.id);assert.equal(a.credited,a.amount);assert.equal(a.phase,'ReviewRequired');
  },chain);
  await run('selection_reorg_does_not_choose_new_winner',async()=>{
    const f=await ready(chain),e=structuredClone(f.e);e.selectionBlock.hash=hash('changed-selection');
    await s.reconcile(f.id,f.t.id,e);assert.equal((await s.view(f.id)).locked.winner,f.a.winner);assert.equal((await s.view(f.id)).phase,'ReviewRequired');
  },chain);
  await run('reorg_of_earlier_partial_credit_freezes_later_attempt',async()=>{
    const f=await ready(chain,{credited:ONE});await s.reconcile(f.id,f.t.id,f.e);
    await s.reserve(f.id,{offered:ONE.toString(),nonce:'8',operationKey:'later-'+sequence});
    const e=structuredClone(f.e);e.canonicalBlock.hash=hash('earlier-orphan');await s.reconcile(f.id,f.t.id,e);
    const a=await s.view(f.id);assert.equal(a.credited,'0');assert(a.sender_frozen);assert.equal((await s.attempts(f.id)).filter(x=>x.active).length,1);
  },chain);
}
await run('public_chain_ids_rejected',async()=>{
  for(const chain of [4663,5042]) await assert.rejects(()=>fresh(chain),/LOCAL_ONLY/);
});
await run('remote_and_production_database_connections_rejected',async()=>{
  await assert.rejects(()=>openResearchStore('postgres://test:test@example.com/mss2_draw_research'));
  await assert.rejects(()=>openResearchStore('postgres://test:test@127.0.0.1/production'));
});
await run('database_trigger_rejects_identity_rewrite',async()=>{
  const f=await fresh(31337),p=new pg.Pool({connectionString:url});
  await assert.rejects(()=>p.query('UPDATE draw_research.awards SET amount=amount+1 WHERE id=$1',[f.id]),/immutable/);await p.end();
});
await run('same_nonce_and_hash_are_isolated_by_chain',async()=>{
  const a=await fresh(31337),b=await fresh(31338,{sender:a.a.sender});const ta=await reserve(a),tb=await reserve(b);
  const ea=evidence(a,ta,{txHash:hash('same-cross-chain')}),eb=evidence(b,tb,{txHash:hash('same-cross-chain')});
  await s.bindTransaction(a.id,ta.id,ea.transaction);await s.bindTransaction(b.id,tb.id,eb.transaction);
  await s.reconcile(a.id,ta.id,ea);await s.reconcile(b.id,tb.id,eb);assert.equal((await s.view(a.id)).outstanding,'0');assert.equal((await s.view(b.id)).outstanding,'0');
});
// Persistent marker for a SEPARATE workflow step that restarts the database server.
const marker=await ready(31337);
await writeFile('evidence/persistence-restart-marker.json',JSON.stringify({id:marker.id,attemptId:marker.t.id},null,2)+'\n');
const infoPool=new pg.Pool({connectionString:url});report.database=(await infoPool.query('SELECT version() AS version')).rows[0].version;await infoPool.end();
report.passed=report.tests.filter(t=>t.status==='passed').length;report.failed=report.tests.length-report.passed;
await writeFile('evidence/persistence-tests.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));await s.close();
if(report.failed)process.exitCode=1;
