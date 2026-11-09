/**
 * LOCAL RESEARCH ONLY. No HTTP handler, wallet, signer, broadcaster or chain mutation.
 * Only an explicitly named loopback Postgres database and local chain IDs are accepted.
 * Trusted server-side evidence is required; this is not a browser confirmation API.
 */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import pg from 'pg';
import { AbiCoder, Interface, getAddress, keccak256, toUtf8Bytes } from 'ethers';
import { ResearchAwardBook } from '../stake-award-reconciliation.mjs';

export const tokenInterface = new Interface([
  'function airdropStake(address[],uint256[]) returns (uint256)',
  'event Transfer(address indexed from,address indexed to,uint256 value)',
]);
export const stakingInterface = new Interface([
  'event StakeGifted(address indexed sender,address indexed recipient,uint256 amount)',
]);
const MAX = (1n << 256n) - 1n;
const MINIMUM_GIFT = 10n ** 18n;
const abi = AbiCoder.defaultAbiCoder();
const asAddress = value => getAddress(value).toLowerCase();
const asHash = value => {
  assert(typeof value === 'string' && /^0x[0-9a-fA-F]{64}$/.test(value), 'Invalid hash');
  return value.toLowerCase();
};
const uint = value => {
  assert(typeof value === 'bigint' || (typeof value === 'string' && /^(0x[0-9a-fA-F]+|[0-9]+)$/.test(value)) || Number.isSafeInteger(value), 'Unsafe integer');
  const n = BigInt(value);
  assert(n >= 0n && n <= MAX, 'Integer outside uint256');
  return n;
};
const plain = value => JSON.parse(JSON.stringify(value, (_, v) => typeof v === 'bigint' ? v.toString() : v));
const canonical = value => JSON.stringify((function sort(v) {
  if (Array.isArray(v)) return v.map(sort);
  if (v && typeof v === 'object') return Object.fromEntries(Object.keys(v).sort().map(k => [k, sort(v[k])]));
  return typeof v === 'bigint' ? v.toString() : v;
})(value));
const fingerprint = value => keccak256(toUtf8Bytes(canonical(value)));
const receiptFingerprint = evidence => fingerprint({transaction:evidence.transaction,receipt:evidence.receipt});

export async function openResearchStore(connectionString) {
  const u = new URL(connectionString);
  assert(['postgres:', 'postgresql:'].includes(u.protocol), 'Postgres required');
  assert.equal(u.hostname, '127.0.0.1', 'Only loopback test Postgres is permitted');
  assert.equal(u.pathname, '/mss2_draw_research', 'Research database required');
  assert(!u.search && !u.hash, 'Connection overrides forbidden');
  const pool = new pg.Pool({host:'127.0.0.1',port:Number(u.port || 5432),database:'mss2_draw_research',
    user:decodeURIComponent(u.username),password:decodeURIComponent(u.password),ssl:false,
    max:16,connectionTimeoutMillis:5000,application_name:'daily-draw-research'});
  const check = await pool.query('SELECT current_database() AS name');
  assert.equal(check.rows[0].name, 'mss2_draw_research');
  return new PayoutStore(pool);
}

class PayoutStore {
  #pool;
  constructor(pool) { this.#pool = pool; }
  async initialize() { await this.#pool.query(await readFile(new URL('./schema.sql', import.meta.url), 'utf8')); }
  async close() { await this.#pool.end(); }
  async #transaction(fn) {
    const c = await this.#pool.connect();
    try {
      await c.query('BEGIN');
      await c.query("SET LOCAL lock_timeout='5s'");
      await c.query("SET LOCAL statement_timeout='10s'");
      const result = await fn(c);
      await c.query('COMMIT');
      return result;
    } catch (error) {
      await c.query('ROLLBACK').catch(() => {});
      throw error;
    } finally { c.release(); }
  }
  async #lock(c, id) {
    let a = (await c.query('SELECT * FROM draw_research.awards WHERE id=$1', [asHash(id)])).rows[0];
    assert(a, 'Unknown award');
    await c.query('INSERT INTO draw_research.sender_lanes(chain_id,sender) VALUES($1,$2) ON CONFLICT DO NOTHING', [a.chain_id,a.sender]);
    const lane = (await c.query('SELECT * FROM draw_research.sender_lanes WHERE chain_id=$1 AND sender=$2 FOR UPDATE', [a.chain_id,a.sender])).rows[0];
    a = (await c.query('SELECT * FROM draw_research.awards WHERE id=$1 FOR UPDATE', [id])).rows[0];
    return {a,lane};
  }
  async #attempt(c, award, id) {
    const t = (await c.query('SELECT * FROM draw_research.attempts WHERE id=$1 AND award_id=$2 FOR UPDATE', [id,award.id])).rows[0];
    assert(t, 'Unknown attempt');
    return t;
  }
  async #audit(c, id, kind, details) {
    await c.query('INSERT INTO draw_research.audit(award_id,kind,details) VALUES($1,$2,$3)', [id,kind,plain(details)]);
  }
  async #freeze(c, a, t, reason) {
    await c.query('UPDATE draw_research.sender_lanes SET frozen=true,reason=$3 WHERE chain_id=$1 AND sender=$2', [a.chain_id,a.sender,reason]);
    await c.query("UPDATE draw_research.awards SET phase='ReviewRequired',revision=revision+1 WHERE id=$1", [a.id]);
    if(t) await c.query("UPDATE draw_research.attempts SET phase='ReviewRequired' WHERE id=$1", [t.id]);
    await this.#audit(c,a.id,'ReviewRequired',{attempt:t?.id,reason});
    return {status:'ReviewRequired',reason};
  }
  async register(input) {
    const a = {
      chainId:uint(input.chainId).toString(),controller:asAddress(input.controller),roundId:uint(input.roundId).toString(),
      token:asAddress(input.token),staking:asAddress(input.staking),sender:asAddress(input.sender),winner:asAddress(input.winner),
      amount:uint(input.amount).toString(),selectedBlock:uint(input.selectedBlock).toString(),
      selectedBlockHash:asHash(input.selectedBlockHash),selectionTx:asHash(input.selectionTx),
      minimumConfirmations:uint(input.minimumConfirmations).toString(),
    };
    assert(['31337','31338'].includes(a.chainId), 'LOCAL_ONLY');
    assert(BigInt(a.amount)>0n && BigInt(a.roundId)>0n && BigInt(a.minimumConfirmations)>0n, 'Invalid award');
    assert.notEqual(a.sender,a.winner,'No self gift');
    for(const name of ['sender','winner','token','staking','controller']) assert(BigInt(a[name])>0n,'Zero address');
    const id = keccak256(abi.encode(['uint256','address','address','uint256'],[a.chainId,a.controller,a.token,a.roundId]));
    return this.#transaction(async c => {
      await c.query('INSERT INTO draw_research.awards(id,chain_id,controller,token,round_id,sender,locked,amount) VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT DO NOTHING',
        [id,a.chainId,a.controller,a.token,a.roundId,a.sender,a,a.amount]);
      const stored = (await c.query('SELECT locked FROM draw_research.awards WHERE id=$1',[id])).rows[0];
      assert.equal(canonical(stored.locked),canonical(a),'Conflicting immutable award');
      return id;
    });
  }
  async view(id) {
    const a = (await this.#pool.query('SELECT a.*,COALESCE(l.frozen,false) AS sender_frozen FROM draw_research.awards a LEFT JOIN draw_research.sender_lanes l ON l.chain_id=a.chain_id AND l.sender=a.sender WHERE a.id=$1',[asHash(id)])).rows[0];
    assert(a,'Unknown award');
    return {...a,outstanding:(BigInt(a.amount)-BigInt(a.credited)).toString(),onChainSettlement:'NotImplemented'};
  }
  async attempts(id) { return (await this.#pool.query('SELECT * FROM draw_research.attempts WHERE award_id=$1 ORDER BY created_at,id',[asHash(id)])).rows; }
  async outbox(id) { return (await this.#pool.query('SELECT * FROM draw_research.settlement_outbox WHERE award_id=$1 ORDER BY id',[asHash(id)])).rows; }
  async reserve(id,{offered,nonce,operationKey}) {
    const amount=uint(offered),n=uint(nonce);
    assert(typeof operationKey==='string' && /^[A-Za-z0-9:_-]{1,120}$/.test(operationKey),'Invalid idempotency key');
    return this.#transaction(async c => {
      const {a,lane}=await this.#lock(c,id);
      assert(!lane.frozen && a.phase!=='ReviewRequired','Sender or award requires review');
      const previous=(await c.query('SELECT * FROM draw_research.attempts WHERE operation_key=$1',[operationKey])).rows[0];
      if(previous) {
        assert.equal(previous.award_id,id);assert.equal(previous.offered,amount.toString());assert.equal(previous.nonce,n.toString());
        return previous; // Retry the same reservation, never allocate a second attempt.
      }
      assert(amount>=MINIMUM_GIFT,'Below protocol minimum; never round up');
      assert(amount<=BigInt(a.amount)-BigInt(a.credited),'Offer exceeds unpaid award');
      assert(!(await c.query('SELECT 1 FROM draw_research.attempts WHERE award_id=$1 AND active',[id])).rowCount,'Unresolved attempt');
      const data=tokenInterface.encodeFunctionData('airdropStake',[[a.locked.winner],[amount]]).toLowerCase();
      const t=(await c.query("INSERT INTO draw_research.attempts(id,award_id,operation_key,chain_id,sender,nonce,offered,calldata,phase) VALUES($1,$2,$3,$4,$5,$6,$7,$8,'Prepared') RETURNING *",
        [randomUUID(),id,operationKey,a.chain_id,a.sender,n.toString(),amount.toString(),data])).rows[0];
      await c.query("UPDATE draw_research.awards SET phase='Prepared',revision=revision+1 WHERE id=$1",[id]);
      await this.#audit(c,id,'Reserved',{attempt:t.id,nonce:t.nonce,offered:t.offered});
      return t;
    });
  }
  #validateTransaction(a,t,tx) {
    assert.equal(uint(tx.chainId),BigInt(a.chain_id),'Wrong chain');
    assert.equal(asAddress(tx.from),a.sender,'Wrong sender');
    assert.equal(asAddress(tx.to),a.token,'Wrong target');
    assert.equal(uint(tx.nonce),BigInt(t.nonce),'Wrong nonce');
    assert.equal(uint(tx.value??0),0n,'Unexpected native value');
    assert.equal((tx.input??tx.data).toLowerCase(),t.calldata,'Different payout instruction');
    return asHash(tx.hash);
  }
  async bindTransaction(id,attemptId,tx) {
    return this.#transaction(async c => {
      const {a,lane}=await this.#lock(c,id),t=await this.#attempt(c,a,attemptId);
      assert(t.active && !lane.frozen,'Attempt is closed or requires review');
      let h;
      try { h=this.#validateTransaction(a,t,tx); }
      catch(error) { return this.#freeze(c,a,t,'Observed transaction differs: '+error.message); }
      const old=(await c.query('SELECT attempt_id FROM draw_research.transaction_bindings WHERE chain_id=$1 AND tx_hash=$2',[a.chain_id,h])).rows[0];
      if(old) { assert.equal(old.attempt_id,t.id,'Transaction belongs to another award');return {status:'AlreadyBound'}; }
      await c.query('INSERT INTO draw_research.transaction_bindings(chain_id,tx_hash,attempt_id) VALUES($1,$2,$3)',[a.chain_id,h,t.id]);
      await c.query("UPDATE draw_research.attempts SET phase='Submitted' WHERE id=$1",[t.id]);
      await c.query("UPDATE draw_research.awards SET phase='Submitted',revision=revision+1 WHERE id=$1",[id]);
      await this.#audit(c,id,'TransactionBound',{attempt:t.id,hash:h});
      return {status:'Submitted'};
    });
  }
  async reconcile(id,attemptId,evidence) {
    return this.#transaction(async c => {
      const {a,lane}=await this.#lock(c,id),t=await this.#attempt(c,a,attemptId);
      assert.equal(uint(evidence.chainId),BigInt(a.chain_id),'Wrong evidence chain');
      const previous=(await c.query('SELECT * FROM draw_research.settlements WHERE attempt_id=$1',[t.id])).rows[0];
      const {transaction:tx,receipt:r,canonicalBlock:b,head,selectionBlock}=evidence;
      if(previous && !previous.active) return {status:'ReviewRequired',reason:'Previously orphaned settlement'};
      if(!tx||!r||!b||!head||!selectionBlock) {
        if(previous) return this.#freeze(c,a,t,'Previously credited evidence unavailable; no automatic reversal or retry');
        return {status:'PendingOrUnknown'};
      }
      assert.equal(uint(selectionBlock.number),BigInt(a.locked.selectedBlock),'Selection height mismatch');
      if(asHash(selectionBlock.hash)!==a.locked.selectedBlockHash)
        return this.#freeze(c,a,t,'Locked selection block changed; winner cannot be replaced');
      const h=asHash(r.transactionHash);
      assert.equal(asHash(tx.hash),h,'Receipt/transaction mismatch');
      const binding=(await c.query('SELECT attempt_id FROM draw_research.transaction_bindings WHERE chain_id=$1 AND tx_hash=$2',[a.chain_id,h])).rows[0];
      assert.equal(binding?.attempt_id,t.id,'Unbound transaction');
      const noncanonical=asHash(b.hash)!==asHash(r.blockHash) ||
        (previous && (previous.block_hash!==asHash(r.blockHash)||previous.tx_hash!==h));
      if(noncanonical) {
        if(previous) {
          await c.query('UPDATE draw_research.settlements SET active=false WHERE attempt_id=$1',[t.id]);
          await c.query('UPDATE draw_research.awards SET credited=credited-$2 WHERE id=$1',[id,previous.credited]);
          await c.query("INSERT INTO draw_research.settlement_outbox(event_key,award_id,kind,payload) VALUES($1,$2,'ReceiptOrphaned',$3) ON CONFLICT DO NOTHING",
            ['orphan:'+a.chain_id+':'+previous.tx_hash+':'+previous.block_hash,id,{attempt:t.id,restoredOwed:previous.credited}]);
        }
        return this.#freeze(c,a,t,'Payout inclusion changed; credit quarantined and signer lane frozen');
      }
      if(uint(head.number)<uint(r.blockNumber) || uint(head.number)-uint(r.blockNumber)+1n<BigInt(a.locked.minimumConfirmations)) {
        if(previous) return this.#freeze(c,a,t,'Previously accepted confirmation observation regressed');
        return {status:'AwaitingConfirmations'};
      }
      if(lane.frozen) return {status:'ReviewRequired',reason:lane.reason};
      this.#validateTransaction(a,t,{...tx,chainId:evidence.chainId});
      if(uint(r.status)===0n) assert.equal(r.logs.length,0,'Reverted receipt cannot retain logs');
      // Reuse the original receipt verifier, not a caller-supplied credited amount.
      const book=new ResearchAwardBook({tokenInterface,stakingInterface});
      const key=book.register(a.locked);
      book.prepare(key,{offered:t.offered,nonce:t.nonce});book.recordSubmitted(key,h);
      const result=book.reconcile(key,evidence,{minimumConfirmations:a.locked.minimumConfirmations});
      if(previous) {
        if(previous.fingerprint!==receiptFingerprint(evidence)) return this.#freeze(c,a,t,'Previously recorded receipt contents changed');
        return {status:'AlreadyRecorded',credited:previous.credited};
      }
      assert(t.active,'Attempt closed');
      const credited=uint(result.credited);
      assert(credited<=BigInt(a.amount)-BigInt(a.credited),'Credit exceeds current unpaid award');
      await c.query('INSERT INTO draw_research.settlements(attempt_id,chain_id,tx_hash,block_number,block_hash,credited,reverted,evidence,fingerprint) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)',
        [t.id,a.chain_id,h,uint(r.blockNumber).toString(),asHash(r.blockHash),credited.toString(),uint(r.status)===0n,plain(evidence),receiptFingerprint(evidence)]);
      for(const log of r.logs) await c.query('INSERT INTO draw_research.consumed_logs(chain_id,tx_hash,log_index,attempt_id) VALUES($1,$2,$3,$4)',
        [a.chain_id,h,uint(log.logIndex??log.index).toString(),t.id]);
      const total=BigInt(a.credited)+credited;
      const phase=total===BigInt(a.amount)?'PaidInDatabase':credited===0n?'ZeroCredit':'PartiallyCredited';
      await c.query('UPDATE draw_research.awards SET credited=$2,phase=$3,revision=revision+1 WHERE id=$1',[id,total.toString(),phase]);
      await c.query('UPDATE draw_research.attempts SET active=false,phase=$2 WHERE id=$1',[t.id,uint(r.status)===0n?'Reverted':'Confirmed']);
      await c.query("INSERT INTO draw_research.settlement_outbox(event_key,award_id,kind,payload) VALUES($1,$2,'ReceiptVerified',$3)",
        ['verified:'+a.chain_id+':'+h+':'+r.blockHash,id,{attempt:t.id,credited:credited.toString(),transactionHash:h,blockHash:r.blockHash,onChainSettlement:'NotImplemented'}]);
      await this.#audit(c,id,'ReceiptVerified',{attempt:t.id,credited:credited.toString(),transactionHash:h});
      return {status:phase,credited:credited.toString(),outstanding:(BigInt(a.amount)-total).toString()};
    });
  }
  // Intentionally no timeout unlock, force-paid, delete history, sender-unfreeze,
  // broadcast, winner override, or on-chain liability update API.
}
