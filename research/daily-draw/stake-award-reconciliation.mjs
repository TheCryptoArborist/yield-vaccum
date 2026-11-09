/** LOCAL RESEARCH ONLY. No signer, broadcaster, database, finality oracle or on-chain mark-paid authority.
 * Production requires durable atomic reservations, nonce/replacement monitoring, upgrade pins and reorg recovery.
 * This book deliberately rejects public chain IDs. Provider data must be fetched by collectGiftEvidence,
 * not accepted from a participant's browser. RPC evidence is not a cryptographic receipt-inclusion proof.
 */
import assert from 'node:assert/strict';
import {getAddress,keccak256,AbiCoder} from 'ethers';
const address=x=>getAddress(x).toLowerCase();
const hash=x=>{assert.equal(typeof x,'string');assert(/^0x[0-9a-fA-F]{64}$/.test(x),'Invalid hash');return x.toLowerCase();};
const uint=x=>{assert(typeof x==='bigint'||typeof x==='string'||(Number.isSafeInteger(x)&&x>=0),'Unsafe integer');const n=BigInt(x);assert(n>=0n);return n;};
const equalAddress=(a,b)=>assert.equal(address(a),address(b));
const READ=new Set(['eth_chainId','eth_getTransactionByHash','eth_getTransactionReceipt','eth_getBlockByNumber']);

/** Fetch authoritative inputs through the caller's read-only provider boundary. No write methods. */
export async function collectGiftEvidence(read,txHash){
 const ask=(method,params=[])=>{assert(READ.has(method));return read(method,params);};
 const chainId=uint(await ask('eth_chainId'));
 const transaction=await ask('eth_getTransactionByHash',[hash(txHash)]);
 const receipt=await ask('eth_getTransactionReceipt',[hash(txHash)]);
 const canonicalBlock=receipt?await ask('eth_getBlockByNumber',[receipt.blockNumber,false]):null;
 const head=await ask('eth_getBlockByNumber',['latest',false]);
 return {chainId,transaction,receipt,canonicalBlock,head};
}

export class ResearchAwardBook {
 #awards=new Map();#consumed=new Map();#token;#staking;
 constructor({tokenInterface,stakingInterface}){this.#token=tokenInterface;this.#staking=stakingInterface;}
 register(input){
  const a={chainId:uint(input.chainId),controller:address(input.controller),roundId:uint(input.roundId),token:address(input.token),staking:address(input.staking),sender:address(input.sender),winner:address(input.winner),amount:uint(input.amount),selectedBlock:uint(input.selectedBlock),selectionTx:hash(input.selectionTx)};
  assert(a.chainId===31337n||a.chainId===31338n,'LOCAL_ONLY');assert(a.amount>0n);assert.notEqual(a.sender,a.winner);
  const key=keccak256(AbiCoder.defaultAbiCoder().encode(['uint256','address','address','uint256'],[a.chainId,a.controller,a.token,a.roundId]));
  assert(!this.#awards.has(key),'Award already registered');
  this.#awards.set(key,{...a,credited:0n,phase:'AwardPending',intent:null,receipts:[]});return key;
 }
 view(key){const a=this.#get(key);return structuredClone({...a,outstanding:a.amount-a.credited});}
 #get(key){const a=this.#awards.get(key);assert(a,'Unknown award');return a;}
 prepare(key,{offered,nonce}){
  const a=this.#get(key);assert(!a.intent,'Unresolved attempt: reconcile before another signature');assert.notEqual(a.phase,'ReviewRequired');
  const amount=uint(offered);assert(amount>=10n**18n,'Below protocol minimum; do not round up an unpaid remainder');assert(amount<=a.amount-a.credited,'Offer exceeds unpaid award');
  a.intent={offered:amount,nonce:uint(nonce),data:this.#token.encodeFunctionData('airdropStake',[[a.winner],[amount]]).toLowerCase(),hashes:[]};a.phase='Prepared';return structuredClone(a.intent);
 }
 recordSubmitted(key,txHash){const a=this.#get(key);assert(a.intent,'No prepared intent');const h=hash(txHash);assert(!a.intent.hashes.includes(h),'Transaction already recorded');a.intent.hashes.push(h);a.phase='Submitted';}
 /** Replacements must have the same nonce, target, value and exact calldata. No timeout unlock exists. */
 reconcile(key,evidence,{minimumConfirmations}){
  const a=this.#get(key);assert.equal(uint(evidence.chainId),a.chainId,'Wrong chain');
  const confirmations=uint(minimumConfirmations);assert(confirmations>0n,'Explicit confirmation policy required');
  const {transaction:tx,receipt:r,canonicalBlock:b,head}=evidence;
  if(!tx||!r||!b||!head)return {status:'PendingOrUnknown',outstanding:a.amount-a.credited};
  const txHash=hash(r.transactionHash),existing=a.receipts.find(x=>x.transactionHash===txHash);
  if(hash(b.hash)!==hash(r.blockHash)) {a.phase='ReviewRequired';throw Error('Receipt is not in the currently reported canonical block; automatic retry disabled');}
  assert.equal(uint(b.number),uint(r.blockNumber));assert(uint(head.number)>=uint(r.blockNumber));
  if(uint(head.number)-uint(r.blockNumber)+1n<confirmations)return {status:'AwaitingConfirmations',outstanding:a.amount-a.credited};
  if(existing){assert.equal(existing.blockHash,hash(r.blockHash));return {status:'AlreadyRecorded',credited:existing.credited,outstanding:a.amount-a.credited};}
  assert(a.intent,'No active payout intent');assert(a.intent.hashes.includes(txHash),'Unbound transaction');
  assert.equal(hash(tx.hash),txHash);assert.equal(hash(tx.blockHash),hash(r.blockHash));assert.equal(uint(tx.blockNumber),uint(r.blockNumber));
  assert.equal(uint(tx.transactionIndex),uint(r.transactionIndex));assert(uint(r.blockNumber)>a.selectedBlock,'Gift predates locked award');
  equalAddress(tx.from,a.sender);equalAddress(r.from,a.sender);equalAddress(tx.to,a.token);equalAddress(r.to,a.token);
  assert.equal(uint(tx.nonce),a.intent.nonce,'Replacement nonce mismatch');assert.equal(uint(tx.value??0),0n);assert.equal((tx.input??tx.data).toLowerCase(),a.intent.data,'Calldata differs from reviewed award');
  const consumption=`${a.chainId}:${txHash}`;assert(!this.#consumed.has(consumption),'Transaction already assigned to another award');
  if(uint(r.status)===0n){this.#consumed.set(consumption,key);a.receipts.push({transactionHash:txHash,blockHash:hash(r.blockHash),credited:0n,reverted:true});a.intent=null;a.phase='AwardPending';return {status:'ConfirmedRevert',credited:0n,outstanding:a.amount-a.credited};}
  assert.equal(uint(r.status),1n);assert(Array.isArray(r.logs));
  const gifts=[],transfers=[],indices=new Set();
  for(const log of r.logs){
   assert(!log.removed,'Removed log');assert.equal(hash(log.transactionHash),txHash);assert.equal(hash(log.blockHash),hash(r.blockHash));assert.equal(uint(log.blockNumber),uint(r.blockNumber));
   const index=uint(log.logIndex??log.index).toString();assert(!indices.has(index),'Duplicate log index');indices.add(index);
   if(address(log.address)===a.staking){let p;try{p=this.#staking.parseLog(log);}catch{}if(p?.name==='StakeGifted')gifts.push(p.args);}
   if(address(log.address)===a.token){let p;try{p=this.#token.parseLog(log);}catch{}if(p?.name==='Transfer')transfers.push(p.args);}
  }
  assert(gifts.length<=1,'Expected at most one stake gift');let credited=0n;
  if(gifts.length){equalAddress(gifts[0].sender,a.sender);equalAddress(gifts[0].recipient,a.winner);credited=uint(gifts[0].amount);assert(credited>0n);}
  assert(credited<=a.intent.offered&&credited<=a.amount-a.credited,'Credit exceeds reviewed/outstanding award');
  const relevant=transfers.filter(t=>address(t.from)===a.sender||address(t.to)===a.winner||address(t.to)===a.staking);
  assert.equal(relevant.length,credited>0n?1:0,'Unexpected token movement');
  if(credited>0n){equalAddress(relevant[0].from,a.sender);equalAddress(relevant[0].to,a.staking);assert.equal(uint(relevant[0].value),credited,'Gift and transfer amounts differ');}
  this.#consumed.set(consumption,key);a.credited+=credited;a.receipts.push({transactionHash:txHash,blockHash:hash(r.blockHash),credited});a.intent=null;
  a.phase=a.credited===a.amount?'PaidInLocalRecord':credited===0n?'ZeroCredit':'PartiallyCredited';
  return {status:a.phase,credited,outstanding:a.amount-a.credited};
 }
}
