/**
 * LOCAL ONLY. Compiles pinned provider implementation sources, not a mock coordinator.
 * Never connects to an RPC, imports a wallet key, or broadcasts a public transaction.
 * TEST_VRF_SCALAR is public fixture data, deliberately unsuitable for production.
 * Recorded public drand signatures and an artificial clock exercise real verifiers.
 * This is not a live oracle request, network emulator, security audit or release.
 */
import assert from 'node:assert/strict';
import {readFile, writeFile, readdir, mkdir} from 'node:fs/promises';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import path from 'node:path';
import solc from 'solc';
import {AbiCoder, BrowserProvider, Contract, ContractFactory, computeAddress, keccak256, solidityPacked, toBeHex, toUtf8Bytes, ZeroHash} from 'ethers';
import {secp256k1} from '@noble/curves/secp256k1';
import {mod, pow, invert} from '@noble/curves/abstract/modular';
import {verifyVRFProof} from '@d20dao/vrf-sdk';

const mode=process.argv[2];
assert(['robinhood','arc'].includes(mode),'Use robinhood or arc; neither argument selects a public network');
assert.equal(process.argv.length,3,'No RPC or key arguments accepted');
const chainId=mode==='robinhood'?31337:31338;
const SDK_COMMIT='fc4b546c06017703b0508ef2182d2030d789c966';
const drawPath='research/daily-draw/DailyDrawPrototype.sol';
const json=x=>JSON.stringify(x,(_,v)=>typeof v==='bigint'?v.toString():v,2);
const hash=x=>createHash('sha256').update(x).digest('hex');
const abi=AbiCoder.defaultAbiCoder();
const beaconFixture=JSON.parse(await readFile('sdk/scripts/fixtures/drand-evmnet/rounds.json','utf8'));
const beacon=beaconFixture.info, sample=beaconFixture.rounds[0], target=beaconFixture.rounds[2];
const T=BigInt(beacon.genesis_time)+(BigInt(target.round)-1n)*BigInt(beacon.period);
await writeFile('hardhat.config.cjs',`module.exports={defaultNetwork:'hardhat',networks:{hardhat:{chainId:${chainId},hardfork:'cancun',initialDate:'${new Date(Number(T-5000n)*1000).toISOString()}',initialBaseFeePerGas:1000000,blockGasLimit:30000000,throwOnTransactionFailures:false,loggingEnabled:false}}};\n`);
const hre=(await import('hardhat')).default;
assert.equal(hre.network.name,'hardhat');
assert.equal(hre.config.networks.hardhat.forking,undefined);
assert.deepEqual(Object.keys(hre.config.networks).filter(n=>n!=='localhost'),['hardhat']);
// Hardhat inserts localhost in its config; no HTTP provider is constructed or used.
globalThis.fetch=async()=>{throw Error('Network disabled during local integration');};
const local=(method,params=[])=>hre.network.provider.request({method,params});
assert.equal(BigInt(await local('eth_chainId')),BigInt(chainId));
const provider=new BrowserProvider(hre.network.provider,undefined,{cacheTimeout:-1});
const signers=await Promise.all(Array.from({length:8},(_,i)=>provider.getSigner(i)));
const addresses=await Promise.all(signers.map(s=>s.getAddress()));
const [owner,alice,bob,prizeSender,feeRecipient,keeper,refundRecipient]=signers;
const [O,A,B,S,F,K,R]=addresses;
const TEST_VRF_SCALAR=1n;
const Point=secp256k1.ProjectivePoint, P=secp256k1.CURVE.Fp.ORDER, N=secp256k1.CURVE.n;
const xy=p=>{const a=p.toAffine();return [a.x,a.y];};
const publicKey=xy(Point.BASE.multiply(TEST_VRF_SCALAR));
function fieldHash(bytes){let x=BigInt(keccak256(bytes));while(x>=P)x=BigInt(keccak256(toBeHex(x,32)));return x;}
function hashToCurve(seed){let x=fieldHash(solidityPacked(['uint256','uint256[2]','uint256'],[1n,publicKey,seed]));for(;;){const y2=mod(x*x*x+7n,P);let y=pow(y2,(P+1n)/4n,P);if(mod(y*y,P)===y2){if(y%2n)y=P-y;return Point.fromAffine({x,y});}x=fieldHash(toBeHex(x,32));}}
function testProof(seed){
 const h=hashToCurve(seed), gamma=h.multiply(TEST_VRF_SCALAR);
 for(let i=0n;i<100n;i++){
  const nonce=BigInt(keccak256(abi.encode(['string','uint256','uint256'],['PUBLIC_LOCAL_TEST_NONCE_NOT_PRODUCTION',seed,i])))%N;
  if(nonce===0n)continue;
  const u=Point.BASE.multiply(nonce), v=h.multiply(nonce), uWitness=computeAddress('0x'+u.toHex(false));
  const c=BigInt(keccak256(solidityPacked(['uint256','uint256[2]','uint256[2]','uint256[2]','uint256[2]','address'],[2n,xy(h),publicKey,xy(gamma),xy(v),uWitness])));
  const s=mod(nonce-mod(c,N)*TEST_VRF_SCALAR,N);if(c%N===0n||s===0n)continue;
  const cg=xy(gamma.multiply(c%N)), sh=xy(h.multiply(s));if(cg[0]===sh[0])continue;
  const d=mod(sh[0]-cg[0],P),dx=mod(d*d,P),dy=mod(d*d*d,P);
  const proof={pk:publicKey,gamma:xy(gamma),c,s,seed,uWitness,cGammaWitness:cg,sHashWitness:sh,zInv:invert(dx===dy?dx:mod(dx*dy,P),P)};
  const verified=verifyVRFProof(proof,publicKey,seed);assert.equal(verified.valid,true,verified.reason);
  return {proof,word:verified.randomness};
 }
 throw Error('Local proof fixture generation exhausted');
}
const sources={};
async function addTree(folder,prefix){for(const e of await readdir(folder,{withFileTypes:true})){if(e.isDirectory())await addTree(path.join(folder,e.name),prefix+'/'+e.name);else if(e.name.endsWith('.sol'))sources[prefix+'/'+e.name]={content:await readFile(path.join(folder,e.name),'utf8')};}}
await addTree('sdk/protocol/contracts','protocol/contracts');
sources[drawPath]={content:await readFile(drawPath,'utf8')};
assert.equal(hash(sources[drawPath].content),'dd52a15ad4c430594c4d75862007e4958ab7cf89dd425d854a3a179da1a51ce1','Original DailyDrawPrototype must be unchanged');
sources['LocalFixtures.sol']={content:`// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;
import {D20VRFConsumer} from "protocol/contracts/D20VRFConsumer.sol";
import {ID20VRF} from "protocol/contracts/interfaces/ID20VRF.sol";
interface IRecovery {function withdrawRefundCredit(address payable) external;}
contract PaymentFixture {
 mapping(address=>uint256) public balanceOf; mapping(address=>mapping(address=>uint256)) public allowance;
 function mint(address a,uint256 n) external {balanceOf[a]+=n;}
 function approve(address a,uint256 n) external returns(bool){allowance[msg.sender][a]=n;return true;}
 function transferFrom(address a,address b,uint256 n) external returns(bool){require(allowance[a][msg.sender]>=n&&balanceOf[a]>=n);allowance[a][msg.sender]-=n;balanceOf[a]-=n;balanceOf[b]+=n;return true;}
}
// Explicit local shim for Robinhood's ArbSys block-number call; not a Nitro emulator.
contract ArbSysFixture {function arbBlockNumber() external view returns(uint256){return block.number;}}
contract RejectingRefundRecipient {
 receive() external payable {revert("fixture rejects native transfer");}
 function withdraw(address c,address payable to) external {IRecovery(c).withdrawRefundCredit(to);}
}
// Failure injection belongs ONLY to this test probe, never the Daily Draw contract.
contract RecoveryProbe is D20VRFConsumer {
 bool public failDelivery; bool public failRefund; uint256 public id; bytes32 public word; uint256 public deliveries; uint256 public refunds;
 constructor(address c) D20VRFConsumer(c){require(block.chainid==31337||block.chainid==31338);}
 function setFailures(bool d,bool r) external {failDelivery=d;failRefund=r;}
 function request(uint32 gasLimit,address refundTo) external payable {id=ID20VRF(vrfCoordinator).requestRandomness{value:msg.value}(keccak256("LOCAL_RECOVERY_PROBE"),gasLimit,refundTo);}
 function _fulfillRandomness(uint256 requestId,bytes32 result) internal override {require(requestId==id&&deliveries==0&&!failDelivery);word=result;deliveries++;}
 function _onRefund(uint256 requestId) internal override {require(requestId==id&&refunds==0&&!failRefund);refunds++;}
}
`};
const imported={};
const output=JSON.parse(solc.compile(JSON.stringify({language:'Solidity',sources,settings:{viaIR:true,optimizer:{enabled:true,runs:200},evmVersion:'cancun',outputSelection:{'*':{'*':['abi','evm.bytecode','evm.deployedBytecode']}}}}),{import:p=>{
 try{assert(p.startsWith('@openzeppelin/')&&!p.includes('..'));const content=readFileSync('node_modules/'+p,'utf8');imported[p]=hash(content);return {contents:content};}catch(e){return {error:String(e)};}
}}));
assert.deepEqual((output.errors??[]).filter(e=>e.severity==='error'),[],'Compilation must succeed');
const linked={};
const artifact=(file,name)=>output.contracts[file][name];
function bytecode(a){let hex=a.evm.bytecode.object;for(const [file,libs]of Object.entries(a.evm.bytecode.linkReferences))for(const [name,refs]of Object.entries(libs)){const addr=linked[file+':'+name];assert(addr,'Missing linked library '+name);for(const r of refs)hex=hex.slice(0,r.start*2)+addr.slice(2).toLowerCase()+hex.slice((r.start+r.length)*2);}assert(/^[a-fA-F0-9]+$/.test(hex));return hex;}
async function deploy(file,name,args=[]){const a=artifact(file,name);const c=await new ContractFactory(name==='LinkedRandomnessMapping'?[]:a.abi,bytecode(a),owner).deploy(...args,{gasLimit:15000000});await c.waitForDeployment();return c;}
async function proxied(file,name,init,args,constructorArgs=[]){const impl=await deploy(file,name,constructorArgs);const p=await deploy('protocol/contracts/D20Proxy.sol','D20Proxy',[await impl.getAddress(),impl.interface.encodeFunctionData(init,args)]);return {instance:new Contract(await p.getAddress(),artifact(file,name).abi,owner),implementation:await impl.getAddress()};}
const send=async promise=>(await promise).wait();
const block=async()=>local('eth_getBlockByNumber',['latest',false]);
const setNext=async t=>local('evm_setNextBlockTimestamp',[Number(t)]);
const advance=async t=>{await setNext(t);await local('evm_mine');};
// Mined failures require an actual status-0 receipt; estimation failures must be EVM call exceptions.
const reject=async f=>{let error;try{const value=await f();if(value?.wait)await value.wait();}catch(e){error=e;}assert(error,'Expected EVM rejection');assert.equal(error.code,'CALL_EXCEPTION',String(error));if(error.receipt)assert.equal(Number(error.receipt.status),0);else assert.equal(error.action,'estimateGas');};
const beaconVerifier=await deploy('protocol/contracts/D20BeaconVerifier.sol','D20BeaconVerifier');
let coordinator,registry,implementation;
const minFee=1000000000000000n,callbackGas=120000,overhead=mode==='arc'?300000:405000;
const registration=[await beaconVerifier.getAddress(),'0x'+beacon.hash,'0x'+beacon.public_key,beacon.genesis_time,beacon.period,sample.round,'0x'+sample.signature];
if(mode==='robinhood'){
 const shim=artifact('LocalFixtures.sol','ArbSysFixture').evm.deployedBytecode.object;
 await local('hardhat_setCode',['0x0000000000000000000000000000000000000064','0x'+shim]);
 const proofVerifier=await deploy('protocol/contracts/robinhood/D20VRFProofVerifier.sol','D20VRFProofVerifier');
 const mapping=await deploy('protocol/contracts/robinhood/LinkedRandomnessMapping.sol','LinkedRandomnessMapping');
 linked['protocol/contracts/robinhood/LinkedRandomnessMapping.sol:LinkedRandomnessMapping']=await mapping.getAddress();
 ({instance:coordinator,implementation}=await proxied('protocol/contracts/robinhood/D20VRFCoordinatorRobinhood.sol','D20VRFCoordinatorRobinhood','initialize',[[publicKey,O,F,K,8000,minFee,2,overhead],registration],[await proofVerifier.getAddress()]));
}else{
 ({instance:registry}=await proxied('protocol/contracts/EpochEntropy.sol','EpochEntropy','initialize',[[A,B,F,R],O,K]));
 const recipe=await registry.recipeCount();
 await send(registry.registerBeacon(...registration,{gasLimit:2000000}));
 await send(registry.scheduleCatalog([recipe],[await registry.slotSigner(recipe)],2));
 const epoch2=await registry.epochStart(2);const current=BigInt((await block()).number);
 await local('hardhat_mine',[toBeHex(epoch2-current), '0x1']);
 ({instance:coordinator,implementation}=await proxied('protocol/contracts/D20VRFCoordinator.sol','D20VRFCoordinator','initialize',[publicKey,O,F,minFee,1,await registry.getAddress(),6000]));
 await send(coordinator.setPricing(minFee,2,overhead));
}
const C=await coordinator.getAddress();
const token=await deploy('LocalFixtures.sol','PaymentFixture');
const draw=await deploy(drawPath,'DailyDrawPrototype',[C,await token.getAddress(),S,R]);
const D=await draw.getAddress();
const probe=await deploy('LocalFixtures.sol','RecoveryProbe',[C]);
const sink=await deploy('LocalFixtures.sol','RejectingRefundRecipient');
for(const [signer,address]of [[alice,A],[bob,B]]){await send(token.mint(address,1000000000n));await send(token.connect(signer).approve(D,1000000000n));}
const requestState=id=>mode==='arc'?coordinator.getRequest(id):coordinator.getRoundRequest(id);
const round=()=>draw.rounds(1);
const price=1000000n,prize=100n*10n**18n;
async function closed(){await setNext(T-100n);await send(draw.openRound(1,T-90n,T-20n,price));await advance(T-90n);await send(draw.connect(alice).buyTickets(1,2));await send(draw.connect(bob).buyTickets(1,3));await advance(T-20n);await send(draw.closeRound(1));await send(draw.commitPrize(1,prize));}
async function requested(){await closed();await setNext(T-3n);await send(draw.requestDraw(1,{value:minFee,gasLimit:1500000}));return (await round()).requestId;}
async function probeRequested(gas=callbackGas,recipient=R,extra=0n){await setNext(T-3n);await send(probe.request(gas,recipient,{value:minFee+extra,gasLimit:1500000}));return await probe.id();}
async function prepareProof(id){
 if(mode==='arc'){
  await advance(T+1n);const r=await requestState(id);
  await send(registry.connect(keeper).commitEpoch(r.epochId,[T,toUtf8Bytes(String(target.round)),'0x'+target.signature],{gasLimit:2000000}));
  await local('evm_mine');await local('evm_mine');
  return testProof(await coordinator.requestSeed(id));
 }
 await advance(T+1n);const r=await requestState(id);assert.equal(r.round,BigInt(target.round));
 return testProof((await coordinator.getProofContext(id,'0x'+target.signature,{gasLimit:2000000}))[0]);
}
const fulfill=(id,proof)=>mode==='arc'?coordinator.fulfillRandomness(id,proof,{gasLimit:4000000}):coordinator.fulfillRandomness(id,proof,'0x'+target.signature,{gasLimit:4000000});
function ticket(word,total){const threshold=(1n<<256n)%total;for(let cursor=0n;cursor<1000n;cursor++){const n=BigInt(keccak256(abi.encode(['bytes32','bytes32','uint256'],[keccak256(toUtf8Bytes('D20_MAP')),word,cursor])));if(n>=threshold)return n%total;}throw Error('Mapping bound');}
const report={createdAt:new Date().toISOString(),mode,localChainId:chainId,sdkCommit:SDK_COMMIT,compiler:solc.version(),scope:'Actual pinned coordinator/registry/proof-verifier sources on fresh local Hardhat. Public test VRF scalar, historical public beacon signatures, synthetic native funds, fixture ticket token. Not public-chain, native-Arc accounting, live keeper, audit, escrow or release validation.',publicTransactions:0,publicRpcCalls:0,productionProviderApproved:false,livePaymentEnabled:false,minedRevertReceipts:true,unchangedDrawSha256:hash(sources[drawPath].content),providerSourceHashes:Object.fromEntries(Object.entries(sources).filter(([p])=>p.startsWith('protocol/')).map(([p,s])=>[p,hash(s.content)])),importHashes:imported,coordinator:C,implementation,coordinatorRuntimeHash:keccak256(await local('eth_getCode',[implementation,'latest'])),arbSysShim:mode==='robinhood',tests:[]};
let snap=await local('evm_snapshot');
async function test(name,fn){assert.equal(await local('evm_revert',[snap]),true);snap=await local('evm_snapshot');try{const details=await fn();report.tests.push({name,status:'passed',...details});}catch(e){report.tests.push({name,status:'failed',error:String(e.shortMessage??e.message).slice(0,1200),data:e.data??null});}console.log('CASE',mode,name,report.tests.at(-1).status);}
await test('actual_proof_delivers_to_unchanged_draw_and_selects_locked_owner',async()=>{
 const id=await requested(),before=await round();const {proof,word}=await prepareProof(id);const receipt=await send(fulfill(id,proof));const r=await requestState(id);assert(r.fulfilled&&r.delivered&&!r.refunded);assert.equal(r.randomness,word);assert.equal(r.clientSeed,before.seed);assert.equal((await round()).phase,4n);assert.equal((await round()).randomness,word);await send(draw.connect(bob).selectWinner(1));const done=await round();assert.equal(done.phase,5n);assert.equal(done.winningTicket,ticket(word,5n));assert.equal(done.winner,done.winningTicket<2n?A:B);assert.equal(await token.balanceOf(D),5n*price);assert.equal(done.announcedPrize,prize);return {callbackGas,fulfillmentGas:receipt.gasUsed.toString(),winningTicket:done.winningTicket.toString(),prizeIsAnnouncementNotEscrow:true};
});
await test('tampered_vrf_proof_rejected_without_consuming_request',async()=>{const id=await requested(),p=await prepareProof(id);await reject(()=>fulfill(id,{...p.proof,s:p.proof.s+1n}));assert.equal((await requestState(id)).fulfilled,false);assert.equal((await round()).phase,3n);await send(fulfill(id,p.proof));assert.equal((await requestState(id)).delivered,true);});
await test('wrong_public_beacon_signature_rejected',async()=>{const id=await requested();if(mode==='robinhood'){const p=await prepareProof(id);await reject(()=>coordinator.fulfillRandomness(id,p.proof,'0x'+sample.signature,{gasLimit:4000000}));}else{await advance(T+1n);const r=await requestState(id);await reject(()=>registry.connect(keeper).commitEpoch(r.epochId,[T,toUtf8Bytes(String(target.round)),'0x'+sample.signature],{gasLimit:2000000}));}assert.equal((await requestState(id)).fulfilled,false);assert.equal((await round()).phase,3n);});
await test('underpaid_request_preserves_closed_round_and_request_counter',async()=>{await closed();await reject(()=>draw.requestDraw(1,{value:minFee-1n,gasLimit:1500000}));assert.equal((await round()).phase,2n);assert.equal(await coordinator.nextRequestId(),1n);});
await test('exact_fee_prototype_rejects_excess_without_trapping_payment',async()=>{await closed();await reject(()=>draw.requestDraw(1,{value:minFee+1n,gasLimit:1500000}));assert.equal(await provider.getBalance(D),0n);assert.equal((await round()).phase,2n);});
await test('changed_fee_fails_safely_then_requoted_request_succeeds',async()=>{await closed();await send(coordinator.setPricing(minFee*2n,2,overhead));await reject(()=>draw.requestDraw(1,{value:minFee,gasLimit:1500000}));assert.equal((await round()).phase,2n);await setNext(T-3n);await send(draw.requestDraw(1,{value:minFee*2n,gasLimit:1500000}));assert.equal(await coordinator.requestFeePaid((await round()).requestId),minFee*2n);});
await test('dynamic_base_fee_quote_matches_actual_request_charge',async()=>{await closed();await send(coordinator.setPricing(1,2,overhead));const base=1000000000n,q=await coordinator.quoteFeeAt(callbackGas,base);assert.equal(q,2n*base*(BigInt(overhead)+BigInt(callbackGas)));await local('hardhat_setNextBlockBaseFeePerGas',[toBeHex(base)]);await setNext(T-3n);await send(draw.requestDraw(1,{value:q,gasLimit:1500000,maxFeePerGas:base*3n,maxPriorityFeePerGas:base}));assert.equal(await coordinator.requestFeePaid((await round()).requestId),q);});
await test('forged_wallet_callback_cannot_deliver_result',async()=>{const id=await requested();await reject(()=>draw.connect(alice).rawFulfillRandomness(id,ZeroHash));assert.equal((await round()).phase,3n);});
await test('duplicate_request_rejected_while_pending',async()=>{await requested();await reject(()=>draw.requestDraw(1,{value:minFee,gasLimit:1500000}));assert.equal(await coordinator.nextRequestId(),2n);});
await test('expiry_refunds_rng_fee_not_ticket_payments_and_never_rerolls',async()=>{const id=await requested(),r=await requestState(id),start=await provider.getBalance(R),tickets=await token.balanceOf(D);await advance(r.deadline+1n);await send(coordinator.refundRequest(id,{gasLimit:700000}));assert.equal((await round()).phase,7n);assert.equal(await provider.getBalance(R)-start,minFee);assert.equal(await token.balanceOf(D),tickets);assert.equal(await coordinator.refundCallbackDelivered(id),true);await reject(()=>draw.requestDraw(1,{value:minFee,gasLimit:1500000}));await reject(()=>coordinator.refundRequest(id,{gasLimit:700000}));});
await test('premature_fee_refund_rejected',async()=>{const id=await requested();await reject(()=>coordinator.refundRequest(id,{gasLimit:700000}));assert.equal((await requestState(id)).refunded,false);});
await test('genuine_proof_after_deadline_rejected',async()=>{const id=await requested(),p=await prepareProof(id),r=await requestState(id);await advance(r.deadline+1n);await reject(()=>fulfill(id,p.proof));assert.equal((await requestState(id)).fulfilled,false);assert.equal((await round()).phase,3n);});
await test('selected_result_cannot_be_refunded_redelivered_or_replaced',async()=>{const id=await requested(),p=await prepareProof(id);await send(fulfill(id,p.proof));await send(draw.selectWinner(1));const winner=(await round()).winner;await reject(()=>fulfill(id,p.proof));await reject(()=>coordinator.retryCallback(id,callbackGas,{gasLimit:700000}));await advance((await requestState(id)).deadline+1n);await reject(()=>coordinator.refundRequest(id,{gasLimit:700000}));await reject(()=>draw.selectWinner(1));assert.equal((await round()).winner,winner);});
await test('failed_callback_accepts_proof_then_retries_identical_word_without_new_fee',async()=>{await send(probe.setFailures(true,false));const id=await probeRequested(),p=await prepareProof(id);await send(fulfill(id,p.proof));const accepted=await requestState(id);assert(accepted.fulfilled&&!accepted.delivered);assert.equal(await probe.deliveries(),0n);const served=await coordinator.lastServedIndex(),earned=await coordinator.earnedFees();await reject(()=>coordinator.refundRequest(id,{gasLimit:700000}));await send(probe.setFailures(false,false));await send(coordinator.connect(alice).retryCallback(id,callbackGas,{gasLimit:700000}));assert.equal((await requestState(id)).randomness,p.word);assert.equal(await probe.word(),p.word);assert.equal(await probe.deliveries(),1n);assert.equal(await coordinator.lastServedIndex(),served);assert.equal(await coordinator.earnedFees(),earned);assert.equal(await coordinator.nextRequestId(),2n);});
await test('underbudget_callback_recovers_with_more_gas_using_same_result',async()=>{const id=await probeRequested(30000),p=await prepareProof(id);await send(fulfill(id,p.proof));assert.equal((await requestState(id)).delivered,false);assert.equal((await requestState(id)).fulfilled,true);await send(coordinator.retryCallback(id,callbackGas,{gasLimit:700000}));assert.equal(await probe.word(),p.word);assert.equal(await probe.deliveries(),1n);});
await test('failed_refund_notification_retries_without_second_payment',async()=>{await send(probe.setFailures(false,true));const id=await probeRequested(),start=await provider.getBalance(R);await advance((await requestState(id)).deadline+1n);await send(coordinator.refundRequest(id,{gasLimit:700000}));assert.equal(await provider.getBalance(R)-start,minFee);assert.equal(await coordinator.refundCallbackDelivered(id),false);await send(probe.setFailures(false,false));await send(coordinator.retryRefundCallback(id,150000,{gasLimit:700000}));assert.equal(await probe.refunds(),1n);assert.equal(await provider.getBalance(R)-start,minFee);await reject(()=>coordinator.retryRefundCallback(id,150000,{gasLimit:700000}));});
await test('rejecting_fee_refund_recipient_gets_backed_credit_and_can_withdraw',async()=>{const recipient=await sink.getAddress(),id=await probeRequested(callbackGas,recipient),start=await provider.getBalance(R);await advance((await requestState(id)).deadline+1n);await send(coordinator.refundRequest(id,{gasLimit:700000}));assert.equal(await coordinator.refundCredits(recipient),minFee);assert.equal(await probe.refunds(),1n);await send(sink.withdraw(C,R,{gasLimit:700000}));assert.equal(await coordinator.refundCredits(recipient),0n);assert.equal(await provider.getBalance(R)-start,minFee);});
await test('forwarded_fee_excess_is_refund_credit_not_earned_revenue',async()=>{const extra=12345n,id=await probeRequested(callbackGas,R,extra);assert.equal(await coordinator.requestFeePaid(id),minFee);assert.equal(await coordinator.refundCredits(R),extra);assert.equal(await coordinator.earnedFees(),0n);});
await test('existing_request_keeps_original_refund_ratio_after_admin_change',async()=>{const id=await requested();await send(coordinator.setRefundBps(5000));assert.equal(await coordinator.requestRefundBps(id),10000n);await advance((await requestState(id)).deadline+1n);const before=await provider.getBalance(R);await send(coordinator.refundRequest(id,{gasLimit:700000}));assert.equal(await provider.getBalance(R)-before,minFee);});
await test('empty_round_never_calls_real_coordinator',async()=>{await setNext(T-100n);await send(draw.openRound(1,T-90n,T-20n,price));await advance(T-20n);await send(draw.closeRound(1));assert.equal((await round()).phase,6n);assert.equal(await coordinator.nextRequestId(),1n);});
report.passed=report.tests.filter(t=>t.status==='passed').length;report.failed=report.tests.length-report.passed;
report.dependencies=Object.fromEntries(['ethers','hardhat','solc','@openzeppelin/contracts','@openzeppelin/contracts-upgradeable','@d20dao/vrf-sdk','@noble/curves'].map(p=>[p,JSON.parse(readFileSync('node_modules/'+p+'/package.json','utf8')).version]));
await mkdir('evidence',{recursive:true});await writeFile('evidence/coordinator-integration-'+mode+'.json',json(report)+'\n');
console.log('BEGIN_COORDINATOR_INTEGRATION');console.log(json(report));console.log('END_COORDINATOR_INTEGRATION');
if(report.failed)process.exitCode=1;
