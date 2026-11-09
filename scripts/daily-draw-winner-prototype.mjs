/** LOCAL-ONLY. Fresh in-process networks; no public RPC, keys or live transaction provider. */
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import solc from 'solc';
import { AbiCoder, BrowserProvider, ContractFactory, Interface, keccak256, toUtf8Bytes, ZeroHash } from 'ethers';

const chainId = Number(process.argv[2]);
assert([31337,31338,4663,5042].includes(chainId));
const guardOnly = [4663,5042].includes(chainId); // LOCAL emulators with these IDs, never public networks.
await writeFile('hardhat.config.cjs',`module.exports={defaultNetwork:'hardhat',networks:{hardhat:{chainId:${chainId},hardfork:'cancun',loggingEnabled:false}}};\n`);
const hre=(await import('hardhat')).default;
assert.equal(hre.network.name,'hardhat');
assert.equal(hre.config.networks.hardhat.forking,undefined);
const local=(method,params=[])=>hre.network.provider.request({method,params});
assert.equal(Number(BigInt(await local('eth_chainId'))),chainId);
// Synchronous snapshots/time travel invalidate ethers' default 250-ms cache.
// Keep real state assertions; do not mask failures by accepting stale cached reverts.
const provider=new BrowserProvider(hre.network.provider,undefined,{cacheTimeout:-1});
const operator=await provider.getSigner(0),alice=await provider.getSigner(1),bob=await provider.getSigner(2),sender=await provider.getSigner(3);
const [OP,A,B,S]=await Promise.all([operator,alice,bob,sender].map(s=>s.getAddress()));
const root='research/daily-draw/';
const paths=[root+'DailyDrawPrototype.sol','protocol/contracts/D20VRFConsumer.sol','protocol/contracts/interfaces/ID20VRF.sol','protocol/contracts/libraries/RandomnessMapping.sol'];
const sources={};for(const path of paths)sources[path]={content:await readFile(path,'utf8')};
const fixture=`// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;
interface IConsumer {function rawFulfillRandomness(uint256,bytes32) external;function onRefund(uint256) external;}
contract FixtureToken {
 mapping(address=>uint256) public balanceOf; mapping(address=>mapping(address=>uint256)) public allowance;
 uint8 public mode; function setMode(uint8 m) external {mode=m;}
 function mint(address a,uint256 n) external {balanceOf[a]+=n;}
 function approve(address a,uint256 n) external returns(bool){allowance[msg.sender][a]=n;return true;}
 function transferFrom(address f,address t,uint256 n) external returns(bool){
  if(mode==1)return false;require(allowance[f][msg.sender]>=n,"allowance");require(balanceOf[f]>=n,"balance");
  allowance[f][msg.sender]-=n;balanceOf[f]-=n;balanceOf[t]+=mode==2?n-1:n;return true;
 }
}
contract FixtureCoordinator {
 struct Request {address consumer;bytes32 seed;uint32 gasLimit;address refund;uint64 created;bytes32 word;bool accepted;bool refunded;bool delivered;}
 mapping(uint256=>Request) public requests;uint256 public nextRequestId=1;bool public rejectRequests;
 function quoteFee(uint32) external pure returns(uint256){return 1000000000;}
 function setReject(bool b) external {rejectRequests=b;}
 function requestRandomness(bytes32 s,uint32 g,address r) external payable returns(uint256 id){
  require(!rejectRequests,"request rejected");require(msg.value==1000000000,"fee");
  id=nextRequestId++;requests[id]=Request(msg.sender,s,g,r,uint64(block.timestamp),0,false,false,false);
 }
 function accept(uint256 id,bytes32 w,bool deliver) external {Request storage r=requests[id];require(r.consumer!=address(0)&&!r.accepted&&!r.refunded,"bad request");r.accepted=true;r.word=w;if(deliver)_retry(id);}
 function retry(uint256 id) external {_retry(id);}
 function _retry(uint256 id) private {Request storage r=requests[id];require(r.accepted&&!r.delivered,"not retryable");(bool ok,)=r.consumer.call{gas:r.gasLimit}(abi.encodeCall(IConsumer.rawFulfillRandomness,(id,r.word)));r.delivered=ok;}
 function refund(uint256 id) external {Request storage r=requests[id];require(r.consumer!=address(0)&&!r.accepted&&!r.refunded&&block.timestamp>r.created+60,"not refundable");r.refunded=true;IConsumer(r.consumer).onRefund(id);}
 function rawDeliver(address target,uint256 id,bytes32 word) external returns(bool ok){(ok,)=target.call(abi.encodeCall(IConsumer.rawFulfillRandomness,(id,word)));}
 function rawRefund(address target,uint256 id) external returns(bool ok){(ok,)=target.call(abi.encodeCall(IConsumer.onRefund,(id)));}
}
`;
sources['Fixture.sol']={content:fixture};
const compiled=JSON.parse(solc.compile(JSON.stringify({language:'Solidity',sources,settings:{viaIR:true,optimizer:{enabled:true,runs:200},evmVersion:'cancun',outputSelection:{'*':{'*':['abi','evm.bytecode.object']}}}})));
const errors=(compiled.errors??[]).filter(e=>e.severity==='error');
assert.equal(errors.length,0,errors.map(e=>e.formattedMessage).join('\n'));
const deploy=async(file,name,args=[])=>{const c=compiled.contracts[file][name];const contract=await new ContractFactory(c.abi,c.evm.bytecode.object,operator).deploy(...args);await contract.waitForDeployment();return contract;};
const token=await deploy('Fixture.sol','FixtureToken'),coordinator=await deploy('Fixture.sol','FixtureCoordinator');
const T=await token.getAddress(),C=await coordinator.getAddress();
const report={localChainId:chainId,scope:'Local test-token and mock-coordinator lifecycle tests. NOT live D20 proof fulfillment, network-specific integration, production payments, fairness audit or deployment.',livePaymentEnabled:false,mainnetTransactionsSubmitted:0,providerCacheDisabled:true,tests:[],compiler:solc.version(),sourceSha256:createHash('sha256').update(sources[root+'DailyDrawPrototype.sol'].content).digest('hex')};
const rejected=async f=>assert.rejects(f,e=>{assert.equal(e.code,'CALL_EXCEPTION','Must be an EVM revert, not an unrelated failure');return true;});
if(guardOnly){
 await rejected(()=>deploy(root+'DailyDrawPrototype.sol','DailyDrawPrototype',[C,T,S,OP]));
 report.tests.push({name:'reject_constructor_on_production_chain_id_in_local_emulator',status:'passed'});
}else{
 const draw=await deploy(root+'DailyDrawPrototype.sol','DailyDrawPrototype',[C,T,S,OP]),D=await draw.getAddress();
 const fee=1000000000n,price=1000000n,prize=100n*10n**18n;
 for(const [s,a] of [[operator,OP],[alice,A],[bob,B],[sender,S]]){await(await token.mint(a,1000000000000n)).wait();await(await token.connect(s).approve(D,1000000000000n)).wait();}
 const now=async()=>Number(BigInt((await local('eth_getBlockByNumber',['latest',false])).timestamp));
 const advance=async t=>{await local('evm_setNextBlockTimestamp',[t]);await local('evm_mine');};
 const plain=r=>Array.from(r).map(x=>typeof x==='bigint'?x.toString():x);
 const round=async(id=1n)=>draw.rounds(id);
 async function open(id=1n){const t=await now(),start=t+3,end=t+300;await(await draw.openRound(id,start,end,price)).wait();await advance(start);return end;}
 async function entered(id=1n,countA=2n,countB=3n){const end=await open(id);await(await draw.connect(alice).buyTickets(id,countA)).wait();if(countB)await(await draw.connect(bob).buyTickets(id,countB)).wait();return end;}
 async function closed(id=1n,a=2n,b=3n){const end=await entered(id,a,b);await advance(end);await(await draw.closeRound(id)).wait();return end;}
 async function prepared(id=1n,a=2n,b=3n){await closed(id,a,b);await(await draw.commitPrize(id,prize)).wait();}
 async function requested(id=1n,a=2n,b=3n){await prepared(id,a,b);await(await draw.connect(bob).requestDraw(id,{value:fee})).wait();return(await round(id)).requestId;}
 async function stored(id=1n,word=ZeroHash){const request=await requested(id);await(await coordinator.accept(request,word,true)).wait();assert.equal((await coordinator.requests(request)).delivered,true);return request;}
 const abi=AbiCoder.defaultAbiCoder(),mapDomain=keccak256(toUtf8Bytes('D20_MAP'));
 function replay(word,n){const threshold=(1n<<256n)%n;for(let cursor=0n;cursor<1000n;cursor++){const w=BigInt(keccak256(abi.encode(['bytes32','bytes32','uint256'],[mapDomain,word,cursor])));if(w>=threshold)return w%n;}throw Error('Unexpected sampler bound');}
 let snap=await local('evm_snapshot');
 async function test(name,f){assert.equal(await local('evm_revert',[snap]),true);snap=await local('evm_snapshot');try{const details=await f();report.tests.push({name,status:'passed',...details});}catch(e){report.tests.push({name,status:'failed',error:String(e.shortMessage??e.message).slice(0,500),data:typeof e.data==='string'?e.data.slice(0,200):null});}}
 await test('operator_only_round_creation',async()=>{const t=await now();await rejected(()=>draw.connect(alice).openRound(1,t+10,t+30,price));});
 await test('invalid_and_duplicate_round_ids',async()=>{const t=await now();await rejected(()=>draw.openRound(0,t+10,t+30,price));await open();await rejected(()=>draw.openRound(1,t+10,t+30,price));});
 await test('no_tickets_before_open',async()=>{const t=await now();await(await draw.openRound(1,t+60,t+300,price)).wait();await rejected(()=>draw.connect(alice).buyTickets(1,1));});
 await test('ticket_ranges_match_exact_payment',async()=>{await entered();await(await draw.connect(alice).buyTickets(1,1)).wait();assert.equal((await round()).tickets,6n);assert.equal(await token.balanceOf(D),6n*price);assert.equal(await draw.rangeCount(1),3n);for(let i=0;i<6;i++)assert.equal(await draw.ticketOwner(1,i),i<2||i===5?A:B);await rejected(()=>draw.ticketOwner(1,6));});
 await test('missing_payment_approval_cannot_create_tickets',async()=>{await open();await(await token.connect(alice).approve(D,0)).wait();await rejected(()=>draw.connect(alice).buyTickets(1,1));assert.equal((await round()).tickets,0n);});
 await test('false_returning_payment_rolls_back',async()=>{await open();await(await token.setMode(1)).wait();await rejected(()=>draw.connect(alice).buyTickets(1,1));assert.equal((await round()).tickets,0n);});
 await test('short_payment_reverts_and_restores_balance',async()=>{await open();await(await token.setMode(2)).wait();const before=await token.balanceOf(A);await rejected(()=>draw.connect(alice).buyTickets(1,1));assert.equal(await token.balanceOf(A),before);assert.equal(await token.balanceOf(D),0n);});
 await test('zero_ticket_purchase_rejected',async()=>{await open();await rejected(()=>draw.connect(alice).buyTickets(1,0));});
 await test('payout_sender_cannot_enter_self_gift_draw',async()=>{await open();await rejected(()=>draw.connect(sender).buyTickets(1,1));});
 await test('cutoff_rejects_even_before_close_called',async()=>{const end=await open();await advance(end);await rejected(()=>draw.connect(alice).buyTickets(1,1));});
 await test('early_close_rejected',async()=>{await open();await rejected(()=>draw.closeRound(1));});
 await test('empty_round_never_requests_randomness',async()=>{const end=await open();await advance(end);await(await draw.closeRound(1)).wait();assert.equal((await round()).phase,6n);await rejected(()=>draw.requestDraw(1,{value:fee}));assert.equal(await coordinator.nextRequestId(),1n);});
 await test('no_request_before_prize_commitment',async()=>{await closed();await rejected(()=>draw.requestDraw(1,{value:fee}));});
 await test('prize_commitment_is_operator_only_and_write_once',async()=>{await closed();await rejected(()=>draw.connect(alice).commitPrize(1,prize));await(await draw.commitPrize(1,prize)).wait();await rejected(()=>draw.commitPrize(1,prize+1n));});
 await test('wrong_request_fee_keeps_round_closed',async()=>{await prepared();for(const value of [fee-1n,fee+1n])await rejected(()=>draw.requestDraw(1,{value}));assert.equal((await round()).phase,2n);assert.equal(await coordinator.nextRequestId(),1n);});
 await test('rejected_request_rolls_back_without_consuming_a_draw',async()=>{await prepared();await(await coordinator.setReject(true)).wait();await rejected(()=>draw.requestDraw(1,{value:fee}));assert.equal((await round()).phase,2n);assert.equal((await round()).requestId,0n);});
 await test('exactly_one_accepted_request_per_round',async()=>{await requested();await rejected(()=>draw.requestDraw(1,{value:fee}));assert.equal(await coordinator.nextRequestId(),2n);});
 await test('seed_binds_chain_contract_tickets_and_prize',async()=>{const rid=await requested();const r=await round();const expected=keccak256(abi.encode(['bytes32','uint256','address','uint256','address','uint64','uint64','uint256','uint64','bytes32','uint256','address'],[await draw.DOMAIN(),chainId,D,1,T,r.opensAt,r.closesAt,r.price,r.tickets,r.ticketDigest,r.announcedPrize,S]));assert.equal(r.seed,expected);assert.equal((await coordinator.requests(rid)).seed,expected);});
 await test('late_entries_do_not_modify_locked_ownership',async()=>{await requested();const before=plain(await round());await rejected(()=>draw.connect(alice).buyTickets(1,1));assert.deepEqual(plain(await round()),before);});
 await test('forged_callback_from_wallet_rejected',async()=>{const rid=await requested();await rejected(()=>draw.connect(alice).rawFulfillRandomness(rid,ZeroHash));assert.equal((await round()).phase,3n);});
 await test('unknown_request_callback_rejected_even_from_coordinator',async()=>{await requested();assert.equal(await coordinator.rawDeliver.staticCall(D,999,ZeroHash),false);assert.equal((await round()).phase,3n);});
 await test('callback_stores_zero_word_within_budget_without_selecting',async()=>{await stored();assert.equal((await round()).phase,4n);assert.equal((await round()).winner,'0x0000000000000000000000000000000000000000');return{callbackGasBudget:120000};});
 await test('permissionless_selection_matches_independent_mapping',async()=>{await stored();await(await draw.connect(alice).selectWinner(1)).wait();const r=await round();assert.equal(r.phase,5n);assert.equal(r.winningTicket,replay(ZeroHash,r.tickets));assert.equal(r.winner,await draw.ticketOwner(1,r.winningTicket));});
 await test('duplicate_and_changed_callback_cannot_replace_word',async()=>{const rid=await stored();assert.equal(await coordinator.rawDeliver.staticCall(D,rid,keccak256(toUtf8Bytes('different'))),false);assert.equal((await round()).randomness,ZeroHash);});
 await test('duplicate_finalization_and_requests_rejected_after_winner',async()=>{await stored();await(await draw.selectWinner(1)).wait();const r=plain(await round());await rejected(()=>draw.selectWinner(1));await rejected(()=>draw.requestDraw(1,{value:fee}));assert.deepEqual(plain(await round()),r);});
 await test('accepted_result_retries_same_word_without_second_request',async()=>{const rid=await requested();const word=keccak256(toUtf8Bytes('retained'));await(await coordinator.accept(rid,word,false)).wait();assert.equal((await round()).phase,3n);await(await coordinator.retry(rid)).wait();assert.equal((await round()).randomness,word);assert.equal(await coordinator.nextRequestId(),2n);});
 await test('expiry_notification_is_not_ticket_refund_or_reroll',async()=>{const rid=await requested();const paid=await token.balanceOf(D);await advance((await now())+61);await(await coordinator.refund(rid)).wait();assert.equal((await round()).phase,7n);assert.equal(await token.balanceOf(D),paid);await rejected(()=>draw.requestDraw(1,{value:fee}));assert.equal(await coordinator.rawDeliver.staticCall(D,rid,ZeroHash),false);});
 await test('accepted_result_is_not_refundable_or_replaceable',async()=>{const rid=await stored();await advance((await now())+61);await rejected(()=>coordinator.refund(rid));await rejected(()=>coordinator.accept(rid,ZeroHash,false));});
 await test('mapping_exceeds_256_ticket_limit',async()=>{const rid=await requested(1n,300n,1n);await(await coordinator.accept(rid,ZeroHash,true)).wait();await(await draw.selectWinner(1)).wait();const r=await round();assert.equal(r.tickets,301n);assert.equal(r.winningTicket,replay(ZeroHash,301n));});
 await test('first_and_last_ticket_can_be_selected',async()=>{const words={};for(let i=0;Object.keys(words).length<2&&i<500;i++){const w=keccak256(toUtf8Bytes('boundary'+i)),k=replay(w,5n);if(k===0n||k===4n)words[k]=w;}assert.equal(Object.keys(words).length,2);for(const k of [0n,4n]){const id=k+1n,rid=await requested(id);await(await coordinator.accept(rid,words[k],true)).wait();await(await draw.selectWinner(id)).wait();assert.equal((await round(id)).winningTicket,k);}});
 await test('out_of_order_callbacks_remain_bound_to_their_round',async()=>{const a=await requested(1n),b=await requested(2n);assert.notEqual((await round(1)).seed,(await round(2)).seed);const word=keccak256(toUtf8Bytes('second'));await(await coordinator.accept(b,word,true)).wait();await(await coordinator.accept(a,ZeroHash,true)).wait();assert.equal((await round(1)).randomness,ZeroHash);assert.equal((await round(2)).randomness,word);});
 await test('no_winner_override_withdraw_or_reroll_interface',async()=>{const names=new Interface(compiled.contracts[root+'DailyDrawPrototype.sol'].DailyDrawPrototype.abi).fragments.filter(f=>f.type==='function').map(f=>f.name);for(const bad of ['setWinner','reroll','withdraw','cancel','markPaid','editTickets'])assert(!names.includes(bad));});
 await test('one_ticket_always_selects_its_owner',async()=>{const rid=await requested(1n,1n,0n);await(await coordinator.accept(rid,ZeroHash,true)).wait();await(await draw.selectWinner(1)).wait();assert.equal((await round()).winningTicket,0n);assert.equal((await round()).winner,A);});
 await test('forged_refund_notification_rejected',async()=>{const rid=await requested();await rejected(()=>draw.connect(alice).onRefund(rid));assert.equal((await round()).phase,3n);});
 await test('refund_after_received_word_cannot_destroy_result',async()=>{const rid=await stored();assert.equal(await coordinator.rawRefund.staticCall(D,rid),false);assert.equal((await round()).phase,4n);});
 await test('unfulfilled_round_cannot_be_reopened_or_repriced',async()=>{const rid=await requested();await advance((await now())+61);await(await coordinator.refund(rid)).wait();const t=await now();await rejected(()=>draw.openRound(1,t+10,t+300,price));await rejected(()=>draw.commitPrize(1,prize+1n));assert.equal((await round()).phase,7n);});
}
report.passed=report.tests.filter(t=>t.status==='passed').length;report.failed=report.tests.length-report.passed;
await mkdir('evidence',{recursive:true});await writeFile(`evidence/winner-local-${chainId}.json`,JSON.stringify(report,null,2)+'\n');
console.log('BEGIN_WINNER_PROTOTYPE');console.log(JSON.stringify(report));console.log('END_WINNER_PROTOTYPE');
await provider.destroy();
if(report.failed)process.exitCode=1;
