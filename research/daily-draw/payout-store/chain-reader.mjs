/** LOCAL RESEARCH ONLY. Read-only chain ingestion into the isolated durable store.
 * No wallet, broadcast, public API, scheduler, settlement dispatcher or mainnet IDs.
 * Deployment pins are trusted test configuration, not participant/browser inputs.
 * Rechecked RPC observations are not cryptographic inclusion or finality proofs.
 */
import assert from 'node:assert/strict';
import { Interface, getAddress, keccak256 } from 'ethers';
import { collectGiftEvidence } from '../stake-award-reconciliation.mjs';

const SLOT = '0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc';
const READ = new Set(['eth_chainId','eth_getCode','eth_getStorageAt','eth_call',
  'eth_getTransactionByHash','eth_getTransactionReceipt','eth_getBlockByNumber']);
const ADDRESS = value => getAddress(value).toLowerCase();
const HASH = value => {
  assert(typeof value === 'string' && /^0x[0-9a-fA-F]{64}$/.test(value), 'Invalid hash');
  return value.toLowerCase();
};
const UINT = value => {
  assert(typeof value === 'bigint' || Number.isSafeInteger(value) ||
    (typeof value === 'string' && /^(0x[0-9a-fA-F]+|[0-9]+)$/.test(value)), 'Unsafe integer');
  const n = BigInt(value); assert(n >= 0n && n < (1n << 256n), 'Invalid uint256'); return n;
};
const Q = value => '0x' + UINT(value).toString(16);
const token = new Interface(['function staking() view returns(address)']);

/** The only RPC interface used by this module; checks methods before forwarding. */
export function readOnlyBoundary(read) {
  assert.equal(typeof read, 'function');
  return async (method, params = []) => {
    assert(READ.has(method), 'Chain writes/signing are forbidden');
    return read(method, params);
  };
}

export function createResearchChainReader({read, store, deployment, minimumConfirmations}) {
  const ask = readOnlyBoundary(read);
  const p = structuredClone(deployment);
  p.chainId = UINT(p.chainId);
  assert(p.chainId === 31337n || p.chainId === 31338n, 'LOCAL_ONLY');
  for (const k of ['controller','payment','token','staking','implementation','sender']) {
    p[k] = ADDRESS(p[k]); assert(BigInt(p[k]) > 0n, 'Zero address');
  }
  for (const k of ['controllerCodeHash','tokenCodeHash','stakingCodeHash','implementationCodeHash']) p[k] = HASH(p[k]);
  const confirmations = UINT(minimumConfirmations);
  assert(confirmations > 0n, 'Explicit confirmation policy required');
  const draw = new Interface(p.controllerAbi);
  const stats = {reads:0, imports:0, observations:0};
  const rpc = async (method, params=[]) => { stats.reads++; return ask(method, params); };
  const chain = async () => assert.equal(UINT(await rpc('eth_chainId')), p.chainId, 'Unexpected execution chain');
  async function block(tag) {
    const b = await rpc('eth_getBlockByNumber', [tag, false]);
    if (!b) return null;
    HASH(b.hash); UINT(b.number);
    if (tag !== 'latest') assert.equal(UINT(b.number), UINT(tag), 'Header returned for wrong height');
    return b;
  }
  async function checkBlock(b) {
    assert(b, 'Block unavailable');
    const fresh = await block(Q(b.number));
    assert(fresh && HASH(fresh.hash) === HASH(b.hash), 'Block changed during read');
  }
  async function call(target, iface, method, args, at) {
    return iface.decodeFunctionResult(method, await rpc('eth_call', [{to:target,
      data:iface.encodeFunctionData(method,args)}, Q(at)]));
  }
  async function pins(at) {
    for (const [addressKey,hashKey] of [['controller','controllerCodeHash'],['token','tokenCodeHash'],
      ['staking','stakingCodeHash'],['implementation','implementationCodeHash']]) {
      const code = await rpc('eth_getCode', [p[addressKey], Q(at)]);
      assert(typeof code === 'string' && code !== '0x', 'Contract code missing');
      assert.equal(keccak256(code), p[hashKey], 'Reviewed contract runtime changed: '+addressKey);
    }
    assert.equal(ADDRESS((await call(p.token, token, 'staking', [], at))[0]), p.staking, 'Staking target changed');
    const slot = await rpc('eth_getStorageAt', [p.staking,SLOT,Q(at)]);
    assert(/^0x0{24}[0-9a-fA-F]{40}$/.test(slot), 'Invalid implementation slot');
    assert.equal(ADDRESS('0x'+slot.slice(-40)), p.implementation, 'Staking implementation changed');
    for (const [getter,expected] of [['prize',p.token],['payment',p.payment],['reserve',p.sender]])
      assert.equal(ADDRESS((await call(p.controller,draw,getter,[],at))[0]),expected,'Controller configuration changed');
  }
  function inclusion(tx,receipt,canonical,head,expectedHash) {
    assert(tx && receipt && canonical && head, 'Selection evidence unavailable');
    assert.equal(HASH(tx.hash),expectedHash); assert.equal(HASH(receipt.transactionHash),expectedHash);
    assert.equal(HASH(tx.blockHash),HASH(receipt.blockHash));
    assert.equal(HASH(canonical.hash),HASH(receipt.blockHash),'Noncanonical selection receipt');
    assert.equal(UINT(tx.blockNumber),UINT(receipt.blockNumber));
    assert.equal(UINT(canonical.number),UINT(receipt.blockNumber));
    assert.equal(UINT(tx.transactionIndex),UINT(receipt.transactionIndex));
    assert.equal(ADDRESS(tx.to),p.controller); assert.equal(ADDRESS(receipt.to),p.controller);
    assert.equal(ADDRESS(tx.from),ADDRESS(receipt.from)); assert.equal(UINT(tx.value??0),0n);
    if (tx.chainId != null) assert.equal(UINT(tx.chainId),p.chainId);
    assert.equal(UINT(receipt.status),1n);
    assert(UINT(head.number)>=UINT(receipt.blockNumber) &&
      UINT(head.number)-UINT(receipt.blockNumber)+1n>=confirmations,'Selection awaiting confirmations');
  }
  async function loadAward({roundId,selectionTx}) {
    await chain();
    const id=UINT(roundId),h=HASH(selectionTx); assert(id>0n);
    const tx=await rpc('eth_getTransactionByHash',[h]);
    const receipt=await rpc('eth_getTransactionReceipt',[h]);
    const selectionBlock=receipt?await block(Q(receipt.blockNumber)):null;
    const head=await block('latest');
    inclusion(tx,receipt,selectionBlock,head,h);
    assert.equal((tx.input??tx.data).toLowerCase(),draw.encodeFunctionData('selectWinner',[id]).toLowerCase(),
      'Selection call differs from requested round');
    await pins(selectionBlock.number);
    if (UINT(head.number)!==UINT(selectionBlock.number)) await pins(head.number);
    const r=(await call(p.controller,draw,'round',[id],selectionBlock.number))[0];
    assert.equal(UINT(r.phase),7n,'Round has no locked award');
    assert(UINT(r.requestId)>0n && UINT(r.tickets)>0n && UINT(r.winningTicket)<UINT(r.tickets));
    assert(BigInt(HASH(r.lockedInputs))!==0n,'Missing locked inputs');
    const winner=ADDRESS(r.winner),amount=UINT(r.awardOwed);
    assert(amount>0n && amount===UINT(r.acquired),'Award differs from acquired prize');
    assert.notEqual(winner,p.sender); assert(BigInt(winner)>0n);
    assert.equal(ADDRESS((await call(p.controller,draw,'ticketOwner',[id,r.winningTicket],selectionBlock.number))[0]),winner,
      'Winner is not the recorded ticket owner');
    const events=[],indices=new Set();
    assert(Array.isArray(receipt.logs));
    for (const l of receipt.logs) {
      assert(!l.removed); assert.equal(HASH(l.transactionHash),h);
      assert.equal(HASH(l.blockHash),HASH(receipt.blockHash));
      assert.equal(UINT(l.blockNumber),UINT(receipt.blockNumber));
      const index=UINT(l.logIndex??l.index).toString(); assert(!indices.has(index),'Duplicate selection log'); indices.add(index);
      if(ADDRESS(l.address)===p.controller){let parsed;try{parsed=draw.parseLog(l);}catch{}
        if(parsed?.name==='AwardPending')events.push(parsed.args);}
    }
    assert.equal(events.length,1,'Expected one award event');
    const e=events[0];assert.equal(UINT(e.roundId),id);assert.equal(UINT(e.ticket),UINT(r.winningTicket));
    assert.equal(ADDRESS(e.winner),winner);assert.equal(UINT(e.amount),amount);
    const now=(await call(p.controller,draw,'round',[id],head.number))[0];
    for(const field of ['phase','requestId','winningTicket','awardOwed','acquired'])assert.equal(UINT(now[field]),UINT(r[field]));
    assert.equal(ADDRESS(now.winner),winner);assert.equal(HASH(now.lockedInputs),HASH(r.lockedInputs));
    await checkBlock(selectionBlock);await checkBlock(head);await chain();
    return {chainId:p.chainId,controller:p.controller,roundId:id,token:p.token,staking:p.staking,
      sender:p.sender,winner,amount,selectedBlock:UINT(receipt.blockNumber),selectedBlockHash:HASH(receipt.blockHash),
      selectionTx:h,minimumConfirmations:confirmations};
  }
  async function importAward(reference) {
    // Exact keys: no participant-provided amount, wallet, calldata or confirmation override.
    assert.deepEqual(Object.keys(reference).sort(),['roundId','selectionTx']);
    const a=await loadAward(reference);const id=await store.register(a);stats.imports++;
    return {awardId:id,source:'PinnedSelectionReceiptAndState',onChainSettlement:'NotImplemented'};
  }
  async function observePayout(reference) {
    assert.deepEqual(Object.keys(reference).sort(),['attemptId','awardId','transactionHash']);
    const {awardId,attemptId}=reference,h=HASH(reference.transactionHash);
    const a=await store.view(awardId);
    assert.equal(UINT(a.chain_id),p.chainId);assert.equal(UINT(a.locked.minimumConfirmations),confirmations);
    for(const [k,expected]of [['controller',p.controller],['token',p.token],['staking',p.staking],['sender',p.sender]])
      assert.equal(ADDRESS(a.locked[k]),expected,'Award is outside reader deployment');
    let t=(await store.attempts(awardId)).find(x=>x.id===attemptId);assert(t,'Unknown attempt');
    try {
      await chain();
      let evidence=await collectGiftEvidence(rpc,h);
      assert.equal(UINT(evidence.chainId),p.chainId);
      if(evidence.transaction)assert.equal(HASH(evidence.transaction.hash),h,'RPC returned another transaction');
      if(evidence.receipt)assert.equal(HASH(evidence.receipt.transactionHash),h,'RPC returned another receipt');
      evidence.selectionBlock=await block(Q(a.locked.selectedBlock));
      if(evidence.canonicalBlock)assert.equal(UINT(evidence.canonicalBlock.number),UINT(evidence.receipt.blockNumber),'Wrong receipt header height');
      // Previously accepted, now missing receipt: inspect its archived inclusion against a fresh header.
      // This uses archived verified data only to quarantine a positively contradicted credit, never to grant new credit.
      if(!evidence.receipt){
        const old=(await store.settlements(awardId)).find(x=>x.attempt_id===attemptId && x.active && x.tx_hash===h);
        if(old){const canonical=await block(Q(old.block_number));
          if(canonical && HASH(canonical.hash)!==HASH(old.block_hash))
            evidence={...evidence,transaction:old.evidence.transaction,receipt:old.evidence.receipt,canonicalBlock:canonical};
        }
      }
      if(evidence.head)await pins(evidence.head.number);
      if(evidence.receipt && evidence.canonicalBlock && HASH(evidence.receipt.blockHash)===HASH(evidence.canonicalBlock.hash))
        await pins(evidence.receipt.blockNumber);
      for(const b of [evidence.head,evidence.selectionBlock,evidence.canonicalBlock])if(b)await checkBlock(b);
      await chain();
      if(evidence.transaction && t.active){
        let binding;
        try{binding=await store.bindTransaction(awardId,attemptId,{...evidence.transaction,chainId:p.chainId});}
        catch(error){
          // Another worker may have settled after our read. Only that exact closed-attempt race may proceed.
          t=(await store.attempts(awardId)).find(x=>x.id===attemptId);
          if(error.message!=='Attempt is closed or requires review'||!t||t.active)throw error;
        }
        if(binding?.status==='ReviewRequired')return binding;
      }
      const result=await store.reconcile(awardId,attemptId,evidence);stats.observations++;
      return result;
    }catch(error){
      // Fail closed: no synthetic payment, no new attempt, no automatic reversal on transport trouble.
      return store.requireReview(awardId,attemptId,'Read-only worker could not verify evidence: '+String(error.message).slice(0,350));
    }
  }
  return Object.freeze({importAward,observePayout,statistics:()=>({...stats,chainWrites:0})});
}
