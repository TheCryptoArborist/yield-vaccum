/** Local test environment only. No public RPC, wallet key or public transaction. */
import assert from 'node:assert/strict';
import {readFile,writeFile,readdir} from 'node:fs/promises';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import path from 'node:path';
import solc from 'solc';
import {AbiCoder,BrowserProvider,Contract,ContractFactory,computeAddress,keccak256,solidityPacked,toBeHex,toUtf8Bytes} from 'ethers';
import {secp256k1} from '@noble/curves/secp256k1';
import {mod,pow,invert} from '@noble/curves/abstract/modular';
import {verifyVRFProof} from '@d20dao/vrf-sdk';

export async function environment(mode){
 assert(['robinhood','arc'].includes(mode));
 const chainId=mode==='robinhood'?31337:31338;
 const abi=AbiCoder.defaultAbiCoder(), hash=x=>createHash('sha256').update(x).digest('hex');
 const fixture=JSON.parse(await readFile('sdk/scripts/fixtures/drand-evmnet/rounds.json','utf8'));
 const beacon=fixture.info,sample=fixture.rounds[0],target=fixture.rounds[2];
 const T=BigInt(beacon.genesis_time)+(BigInt(target.round)-1n)*BigInt(beacon.period);
 await writeFile('hardhat.config.cjs',`module.exports={defaultNetwork:'hardhat',networks:{hardhat:{chainId:${chainId},hardfork:'cancun',initialDate:'${new Date(Number(T-5000n)*1000).toISOString()}',initialBaseFeePerGas:1000000,blockGasLimit:30000000,throwOnTransactionFailures:false,loggingEnabled:false}}};\n`);
 const hre=(await import('hardhat')).default;
 assert.equal(hre.network.name,'hardhat');assert.equal(hre.config.networks.hardhat.forking,undefined);
 assert.deepEqual(Object.keys(hre.config.networks).filter(n=>n!=='localhost'),['hardhat']);
 globalThis.fetch=async()=>{throw Error('Network disabled during local fee tests');};
 const local=(method,params=[])=>hre.network.provider.request({method,params});
 assert.equal(BigInt(await local('eth_chainId')),BigInt(chainId));
 const provider=new BrowserProvider(hre.network.provider,undefined,{cacheTimeout:-1});
 const signers=await Promise.all(Array.from({length:8},(_,i)=>provider.getSigner(i)));
 const addresses=await Promise.all(signers.map(s=>s.getAddress()));
 const [owner,alice,bob,recipient,feeRecipient,keeper]=signers;
 const [O,A,B,R,F,K]=addresses;
 // Deliberately public fixture scalar. NEVER a production VRF or wallet key.
 const TEST_VRF_SCALAR=1n,Point=secp256k1.ProjectivePoint,P=secp256k1.CURVE.Fp.ORDER,N=secp256k1.CURVE.n;
 const xy=p=>{const a=p.toAffine();return [a.x,a.y];};
 const publicKey=xy(Point.BASE.multiply(TEST_VRF_SCALAR));
 function fieldHash(bytes){let x=BigInt(keccak256(bytes));while(x>=P)x=BigInt(keccak256(toBeHex(x,32)));return x;}
 function curve(seed){let x=fieldHash(solidityPacked(['uint256','uint256[2]','uint256'],[1n,publicKey,seed]));for(;;){const y2=mod(x*x*x+7n,P);let y=pow(y2,(P+1n)/4n,P);if(mod(y*y,P)===y2){if(y%2n)y=P-y;return Point.fromAffine({x,y});}x=fieldHash(toBeHex(x,32));}}
 function proofFor(seed){const h=curve(seed),gamma=h.multiply(TEST_VRF_SCALAR);for(let i=0n;i<100n;i++){
  const nonce=BigInt(keccak256(abi.encode(['string','uint256','uint256'],['PUBLIC_LOCAL_FEE_TEST_NONCE_NOT_PRODUCTION',seed,i])))%N;if(!nonce)continue;
  const u=Point.BASE.multiply(nonce),v=h.multiply(nonce),uWitness=computeAddress('0x'+u.toHex(false));
  const c=BigInt(keccak256(solidityPacked(['uint256','uint256[2]','uint256[2]','uint256[2]','uint256[2]','address'],[2n,xy(h),publicKey,xy(gamma),xy(v),uWitness]))),s=mod(nonce-mod(c,N)*TEST_VRF_SCALAR,N);
  if(c%N===0n||s===0n)continue;const cg=xy(gamma.multiply(c%N)),sh=xy(h.multiply(s));if(cg[0]===sh[0])continue;
  const d=mod(sh[0]-cg[0],P),dx=mod(d*d,P),dy=mod(d*d*d,P);
  const proof={pk:publicKey,gamma:xy(gamma),c,s,seed,uWitness,cGammaWitness:cg,sHashWitness:sh,zInv:invert(dx===dy?dx:mod(dx*dy,P),P)};
  const result=verifyVRFProof(proof,publicKey,seed);assert.equal(result.valid,true,result.reason);return {proof,word:result.randomness};
 }throw Error('Test proof generation exhausted');}
 const sources={};
 async function tree(folder,prefix){for(const e of await readdir(folder,{withFileTypes:true})){if(e.isDirectory())await tree(path.join(folder,e.name),prefix+'/'+e.name);else if(e.name.endsWith('.sol'))sources[prefix+'/'+e.name]={content:await readFile(path.join(folder,e.name),'utf8')};}}
 await tree('sdk/protocol/contracts','protocol/contracts');
 const budgetPath='research/daily-draw/DailyDrawOperatingFeesPrototype.sol';
 sources[budgetPath]={content:await readFile(budgetPath,'utf8')};
 sources['FeeFixtures.sol']={content:`// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;
interface IBudget {
 function requestWithBudget(uint256) external payable returns(uint256);
 function withdrawCredit(uint256,uint256,address payable) external;
 function collectRefund(uint256) external;
}
contract ArbSysFixture {function arbBlockNumber() external view returns(uint256){return block.number;}}
contract RejectNative {receive() external payable {revert("REJECT");}}
contract ForceNative {constructor(address payable target) payable {selfdestruct(target);}}
contract TokenFixture {
 mapping(address=>uint256) public balanceOf;
 function mint(address a,uint256 n) external {balanceOf[a]+=n;}
 function transfer(address a,uint256 n) external returns(bool){balanceOf[msg.sender]-=n;balanceOf[a]+=n;return true;}
}
// A payer contract used to prove reentry cannot double-withdraw its own credit.
contract ReentryPayer {
 IBudget public budget; uint256 public id; uint256 public amount;
 bool public attack; bool public nestedSucceeded;
 function fund(address b,uint256 roundId) external payable {budget=IBudget(b);id=roundId;budget.requestWithBudget{value:msg.value}(roundId);}
 function withdraw(uint256 n) external {amount=n;attack=true;budget.withdrawCredit(id,n,payable(address(this)));attack=false;}
 function withdrawTo(uint256 n,address payable to) external {budget.withdrawCredit(id,n,to);}
 receive() external payable {if(attack){attack=false;(nestedSucceeded,)=address(budget).call(abi.encodeCall(IBudget.withdrawCredit,(id,amount,payable(address(this)))));}}
}
// Separate recovery-only derivative. No failure switch is in the reviewed module.
import {DailyDrawOperatingFeesPrototype} from "research/daily-draw/DailyDrawOperatingFeesPrototype.sol";
contract FeeRecoveryProbe is DailyDrawOperatingFeesPrototype {
 constructor(address c,address controller) DailyDrawOperatingFeesPrototype(c,controller) {}
}
`};
 const imports={};
 const output=JSON.parse(solc.compile(JSON.stringify({language:'Solidity',sources,settings:{viaIR:true,optimizer:{enabled:true,runs:200},evmVersion:'cancun',outputSelection:{'*':{'*':['abi','evm.bytecode','evm.deployedBytecode']}}}}),{import:p=>{try{assert(p.startsWith('@openzeppelin/')&&!p.includes('..'));const content=readFileSync('node_modules/'+p,'utf8');imports[p]=hash(content);return {contents:content};}catch(e){return {error:String(e)};}}}));
 assert.deepEqual((output.errors??[]).filter(e=>e.severity==='error'),[],'Compile without errors');
 const linked={}, artifact=(file,name)=>output.contracts[file][name];
 function bytecode(a){let hex=a.evm.bytecode.object;for(const [file,libs]of Object.entries(a.evm.bytecode.linkReferences))for(const [name,refs]of Object.entries(libs)){const addr=linked[file+':'+name];assert(addr);for(const r of refs)hex=hex.slice(0,r.start*2)+addr.slice(2).toLowerCase()+hex.slice((r.start+r.length)*2);}assert(/^[a-fA-F0-9]+$/.test(hex));return hex;}
 async function deploy(file,name,args=[],value=0n){const a=artifact(file,name),c=await new ContractFactory(name==='LinkedRandomnessMapping'?[]:a.abi,bytecode(a),owner).deploy(...args,{gasLimit:15000000,value});await c.waitForDeployment();return c;}
 async function proxied(file,name,args,ctor=[]){const impl=await deploy(file,name,ctor),p=await deploy('protocol/contracts/D20Proxy.sol','D20Proxy',[await impl.getAddress(),impl.interface.encodeFunctionData('initialize',args)]);return new Contract(await p.getAddress(),artifact(file,name).abi,owner);}
 const send=async promise=>(await promise).wait(),block=()=>local('eth_getBlockByNumber',['latest',false]);
 const setNext=t=>local('evm_setNextBlockTimestamp',[Number(t)]),advance=async t=>{await setNext(t);await local('evm_mine');};
 const reject=async f=>{let e;try{const v=await f();if(v?.wait)await v.wait();}catch(error){e=error;}assert(e,'Expected rejection');assert.equal(e.code,'CALL_EXCEPTION',String(e));if(e.receipt)assert.equal(Number(e.receipt.status),0);else assert.equal(e.action,'estimateGas');return e;};
 const verifier=await deploy('protocol/contracts/D20BeaconVerifier.sol','D20BeaconVerifier');
 const minFee=1000000000000000n,callbackGas=120000,overhead=mode==='arc'?300000:405000;
 const registration=[await verifier.getAddress(),'0x'+beacon.hash,'0x'+beacon.public_key,beacon.genesis_time,beacon.period,sample.round,'0x'+sample.signature];
 let coordinator,registry;
 if(mode==='robinhood'){
  await local('hardhat_setCode',['0x0000000000000000000000000000000000000064','0x'+artifact('FeeFixtures.sol','ArbSysFixture').evm.deployedBytecode.object]);
  const pv=await deploy('protocol/contracts/robinhood/D20VRFProofVerifier.sol','D20VRFProofVerifier');
  const mapping=await deploy('protocol/contracts/robinhood/LinkedRandomnessMapping.sol','LinkedRandomnessMapping');
  linked['protocol/contracts/robinhood/LinkedRandomnessMapping.sol:LinkedRandomnessMapping']=await mapping.getAddress();
  coordinator=await proxied('protocol/contracts/robinhood/D20VRFCoordinatorRobinhood.sol','D20VRFCoordinatorRobinhood',[[publicKey,O,F,K,8000,minFee,2,overhead],registration],[await pv.getAddress()]);
 }else{
  registry=await proxied('protocol/contracts/EpochEntropy.sol','EpochEntropy',[[A,B,F,R],O,K]);
  const recipe=await registry.recipeCount();await send(registry.registerBeacon(...registration,{gasLimit:2000000}));
  await send(registry.scheduleCatalog([recipe],[await registry.slotSigner(recipe)],2));
  await local('hardhat_mine',[toBeHex((await registry.epochStart(2))-BigInt((await block()).number)),'0x1']);
  coordinator=await proxied('protocol/contracts/D20VRFCoordinator.sol','D20VRFCoordinator',[publicKey,O,F,minFee,1,await registry.getAddress(),6000]);
  await send(coordinator.setPricing(minFee,2,overhead));
 }
 const C=await coordinator.getAddress(),budget=await deploy(budgetPath,'DailyDrawOperatingFeesPrototype',[C,O]),E=await budget.getAddress();
 const token=await deploy('FeeFixtures.sol','TokenFixture'),sink=await deploy('FeeFixtures.sol','RejectNative'),attacker=await deploy('FeeFixtures.sol','ReentryPayer');
 const state=id=>mode==='arc'?coordinator.getRequest(id):coordinator.getRoundRequest(id);
 const vault=address=>new Contract(address,artifact(budgetPath,'DailyDrawFeeRefundAccount').abi,owner);
 const defaultDigest=keccak256(toUtf8Bytes('LOCKED_LOCAL_TICKET_AND_PRIZE_DIGEST_NOT_REAL_FUNDS'));
 const authorize=(id=1,payer=A,max=minFee*3n,digest=defaultDigest)=>send(budget.authorizeBudget(id,payer,max,digest));
 async function request(id=1,payer=alice,provided=minFee*2n){await send(budget.connect(payer).requestWithBudget(id,{value:provided,gasLimit:2500000}));return (await budget.budgets(id)).requestId;}
 async function prepareProof(id){
  if(mode==='arc'){await advance(T+1n);const r=await state(id);await send(registry.connect(keeper).commitEpoch(r.epochId,[T,toUtf8Bytes(String(target.round)),'0x'+target.signature],{gasLimit:2000000}));await local('evm_mine');await local('evm_mine');return proofFor(await coordinator.requestSeed(id));}
  await advance(T+1n);assert.equal((await state(id)).round,BigInt(target.round));return proofFor((await coordinator.getProofContext(id,'0x'+target.signature,{gasLimit:2000000}))[0]);
 }
 const fulfill=(id,p)=>mode==='arc'?coordinator.fulfillRandomness(id,p,{gasLimit:4000000}):coordinator.fulfillRandomness(id,p,'0x'+target.signature,{gasLimit:4000000});
 async function expired(id){await advance((await state(id)).deadline+1n);await send(coordinator.refundRequest(id,{gasLimit:800000}));}
 async function conservation(ids=[1]){let sum=0n;for(const id of ids){const b=await budget.budgets(id);assert.equal(b.provided+b.refunded,b.charged+b.credit+b.withdrawn,'round conservation');sum+=b.credit;}assert.equal(await budget.totalCredits(),sum);assert((await provider.getBalance(E))>=sum,'native backing');}
 return {mode,chainId,abi,hash,provider,local,signers,addresses,owner,alice,bob,recipient,keeper,O,A,B,R,C,E,T,minFee,callbackGas,overhead,coordinator,registry,budget,token,sink,attacker,vault,state,send,block,setNext,advance,reject,deploy,artifact,bytecode,budgetPath,authorize,request,prepareProof,fulfill,expired,conservation,sourceHashes:Object.fromEntries(Object.entries(sources).map(([p,s])=>[p,hash(s.content)])),importHashes:imports,compiler:solc.version()};
}
