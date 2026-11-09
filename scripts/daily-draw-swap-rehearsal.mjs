/** Research only. Real-chain traffic is read-only. State changes occur only in a
 * private Hardhat (Robinhood) or Arc Foundry (Arc) fork behind a read-only gateway.
 * No private keys, external signing provider, deployment, or payment activation.
 */
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { Interface, getAddress, keccak256, solidityPacked, toBeHex } from 'ethers';
const TOKEN='0x091F0c7e675A787A4018eb47c30BeD3FA2013B65';
const SENDER='0xE8b63245DdDAB73C7A276818942341D8Cfb7D7A7';
const RECIPIENT='0x000000000000000000000000000000000da1d003';
const ROUTER='0x2e7395A6E0De6eE1f390bEcE891069Cd18Ff8572';
const QUOTER='0xA9Cd3aC90513663197E7Fd6c932f63f0C40701be';
const FACTORY='0xaa5865dC3A60b25D305226d66fd573021f0D8fFB';
const WETH='0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73';
const SLOT='0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc';
const ONE=10n**18n;
const NETS={robinhood:{id:4663,rpc:'https://rpc.mainnet.chain.robinhood.com',payment:'0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168',symbol:'USDG',ticks:[50,2000],tokens:[]},arc:{id:5042,rpc:'https://rpc.mainnet.arc.io',payment:'0x3600000000000000000000000000000000000000',symbol:'USDC',ticks:[2000],tokens:[]}};
const key=process.argv[2];assert(Object.hasOwn(NETS,key),'Select robinhood or arc');const n=NETS[key];n.tokens=key==='arc'?[n.payment,TOKEN]:[n.payment,WETH,TOKEN];
const serialize=x=>JSON.stringify(x,(_,v)=>typeof v==='bigint'?v.toString():v,2);
const report={network:key,chainId:n.id,createdAt:new Date().toISOString(),status:'blocked',mainnetTransactionsSubmitted:0,livePaymentEnabled:false,scope:'Pinned-state fork integration only. No ticket sales, winner selection, real wallet authority, audit, or public release.',simulationFunding:key==='arc'?'Local native-USDC balance increase also funds its ERC-20 view; no mock token.':'Local ETH balance increase, WETH deposit and reverse swap acquire fixture USDG; no mock token or stablecoin-storage override.',contracts:[],pools:[],tests:[],headerDefaults:[]};
const safe=e=>e?.code==='ERR_ASSERTION'?`Assertion: ${e.message.split('\n')[0]}`:String(e?.shortMessage??e?.message??'Unknown failure').slice(0,900);
const READ=new Set(['eth_chainId','net_version','eth_blockNumber','eth_getBlockByNumber','eth_getBlockByHash','eth_getCode','eth_getStorageAt','eth_getBalance','eth_getTransactionCount','eth_call','eth_getTransactionByHash','eth_getTransactionReceipt','eth_getLogs','eth_getProof','eth_gasPrice']);
let queue=Promise.resolve(),seq=0,gateway,hre,child,localURL,localSeq=0,anchor;
const cache=new Map(),sources=new Map();
async function json(url,options={}){
 let r;for(let attempt=0;attempt<4;attempt++){
  r=await fetch(url,{...options,redirect:'error',signal:AbortSignal.timeout(30000)});
  if(![429,503].includes(r.status)||attempt===3)break;
  const h=r.headers.get('retry-after');let wait=h&&Number.isFinite(Number(h))?Number(h)*1000:Math.max(0,Date.parse(h??'')-Date.now())||2000*2**attempt;
  await r.body?.cancel();assert(wait<=60000,'Provider requests a longer backoff');await delay(Math.max(1000,wait));
 }
 if(!r.ok)throw Error(`HTTP ${r.status}`);assert(r.body);const reader=r.body.getReader(),chunks=[];let count=0;
 try{while(true){const {done,value}=await reader.read();if(done)break;count+=value.byteLength;assert(count<=6000000,'Response bound');chunks.push(Buffer.from(value));}}finally{await reader.cancel().catch(()=>{});}
 return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}
async function upstream(method,params){
 assert(READ.has(method),'Upstream signing and writes forbidden');const ck=JSON.stringify([method,params]);
 const cachable=['eth_getCode','eth_getStorageAt','eth_getBalance','eth_getTransactionCount','eth_call'].includes(method)&&/^0x[0-9a-f]+$/i.test(params.at(-1));
 if(cachable&&cache.has(ck))return cache.get(ck);
 const pending=queue.then(async()=>{await delay(350);const id=++seq,r=await json(n.rpc,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id,method,params})});assert.equal(r.jsonrpc,'2.0');assert.equal(r.id,id);if(r.error){const e=Error(`Read RPC: ${String(r.error.message).slice(0,300)}`);e.data=r.error.data;throw e;}assert(Object.hasOwn(r,'result'));return r.result;});
 queue=pending.catch(()=>{});if(cachable)cache.set(ck,pending);try{return await pending;}catch(e){cache.delete(ck);throw e;}
}
async function source(address,chain=n.id){
 const a=getAddress(address),k=chain+':'+a;if(sources.has(k))return sources.get(k);
 const s=await json(`https://sourcify.dev/server/v2/contract/${chain}/${a}?fields=abi,compilation,runtimeBytecode,sources`);
 assert.equal(String(s.chainId),String(chain));assert.equal(getAddress(s.address),a);assert(['match','exact_match'].includes(s.runtimeMatch),'No verified source-runtime relation');assert(Array.isArray(s.abi));sources.set(k,s);return s;
}
async function checked(address,role){
 const s=await source(address),code=await upstream('eth_getCode',[address,anchor.number]);assert(code!=='0x');assert.equal(code.toLowerCase(),s.runtimeBytecode.onchainBytecode.toLowerCase(),'Runtime differs from verification record');
 report.contracts.push({role,address:getAddress(address),sourceRuntimeMatch:s.runtimeMatch,liveRuntimeMatchesRecord:true,keccak256:keccak256(code)});return new Interface(s.abi);
}
const readLive=async(to,abi,name,args=[])=>abi.decodeFunctionResult(name,await upstream('eth_call',[{to,data:abi.encodeFunctionData(name,args)},anchor.number]));
async function gatewayStart(){
 let denied=0,forwarded=0;
 gateway=createServer(async(req,res)=>{res.setHeader('Content-Type','application/json');try{
  assert.equal(req.method,'POST');let text='';for await(const part of req){text+=part;assert(text.length<200000);}
  const payload=JSON.parse(text),batch=Array.isArray(payload)?payload:[payload];assert(batch.length<=100);const responses=[];
  for(const r of batch){if(!READ.has(r.method)){denied++;responses.push({jsonrpc:'2.0',id:r.id,error:{code:-32601,message:'Read-only gateway denies signing and writes'}});continue;}forwarded++;
   try{let result=await upstream(r.method,r.params??[]);if(key==='robinhood'&&['eth_getBlockByNumber','eth_getBlockByHash'].includes(r.method)&&result){result={...result};for(const field of ['blobGasUsed','excessBlobGas'])if(result[field]==null){result[field]='0x0';if(!report.headerDefaults.includes(field))report.headerDefaults.push(field);}}
    responses.push({jsonrpc:'2.0',id:r.id,result});
   }catch(e){responses.push({jsonrpc:'2.0',id:r.id,error:{code:-32000,message:safe(e)}});}
  }res.end(JSON.stringify(Array.isArray(payload)?responses:responses[0]));
 }catch{res.statusCode=400;res.end('{}');}});
 await new Promise(resolve=>gateway.listen(0,'127.0.0.1',resolve));const url=`http://127.0.0.1:${gateway.address().port}`;
 const before=forwarded;for(const method of ['eth_sendTransaction','eth_sendRawTransaction','eth_sign','personal_sign','wallet_sendCalls']){const r=await json(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method,params:[]})});assert.equal(r.error.code,-32601);}assert.equal(forwarded,before);assert.equal(denied,5);report.gateway={deniedWriteChecks:5,writeRequestsForwarded:0};return url;
}
async function local(method,params=[]){
 if(key==='robinhood'){assert(hre&&hre.network.name==='hardhat','No external write provider');return hre.network.provider.request({method,params});}
 assert(child&&child.exitCode===null&&localURL?.startsWith('http://127.0.0.1:'),'Arc fork not owned/running');
 const id=++localSeq,r=await json(localURL,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id,method,params})});assert.equal(r.id,id);if(r.error){const e=Error(String(r.error.message).slice(0,500));e.code=r.error.code;e.data=r.error.data;throw e;}return r.result;
}
async function engine(gatewayURL){
 if(key==='robinhood'){
  const c={defaultNetwork:'hardhat',networks:{hardhat:{chainId:n.id,hardfork:'cancun',chains:{[n.id]:{hardforkHistory:{cancun:0}}},forking:{url:gatewayURL,blockNumber:Number(BigInt(anchor.number))},accounts:[],loggingEnabled:false}}};
  await writeFile('hardhat.config.cjs','module.exports = '+JSON.stringify(c)+';\n');hre=(await import('hardhat')).default;
  report.engine={name:'Hardhat 2.26.3',scope:'EVM fork; absent blob headers defaulted, not rollup consensus/gas equivalence'};
 }else{
  assert(process.env.ARC_ANVIL&&process.env.ARC_ANVIL.startsWith('/'),'Explicit absolute Arc Anvil binary required');
  const holder=createServer();await new Promise(r=>holder.listen(0,'127.0.0.1',r));const port=holder.address().port;await new Promise(r=>holder.close(r));localURL=`http://127.0.0.1:${port}`;
  child=spawn(process.env.ARC_ANVIL,['--fork-url',gatewayURL,'--fork-block-number',String(BigInt(anchor.number)),'--host','127.0.0.1','--port',String(port),'--accounts','0','--silent'],{stdio:['ignore','ignore','pipe']});let stderr='';child.stderr.on('data',b=>{stderr=(stderr+b.toString()).slice(-2000);});
  let ready=false;for(let i=0;i<90;i++){if(child.exitCode!==null)throw Error('Arc Anvil exited: '+stderr);try{if(BigInt(await local('eth_chainId'))===BigInt(n.id)){ready=true;break;}}catch{}await delay(1000);}assert(ready,'Arc fork did not become ready');
  const info=await local('anvil_nodeInfo');assert.equal(info.network,'arc','Arc semantics not active');report.engine={name:'Circle Arc Foundry v0.8.0-4',network:info.network,scope:'Arc execution on forked state; not real network finality or transaction competition'};
 }
 assert.equal(BigInt(await local('eth_chainId')),BigInt(n.id));
}
const pack=(tokens,ticks)=>{assert.equal(tokens.length,ticks.length+1);const types=['address'],values=[tokens[0]];for(let i=0;i<ticks.length;i++){types.push('int24','address');values.push(ticks[i],tokens[i+1]);}return solidityPacked(types,values);};
async function main(){
 assert.equal(BigInt(await upstream('eth_chainId',[])),BigInt(n.id));anchor=await upstream('eth_getBlockByNumber',['latest',false]);report.anchor={number:anchor.number,hash:anchor.hash,finalized:false};
 const ri=await checked(ROUTER,'swap router'),qi=await checked(QUOTER,'quoter'),fi=await checked(FACTORY,'factory'),ti=await checked(TOKEN,'MSS2 token');
 const routerSources=(await source(ROUTER)).sources;
 assert(Object.values(routerSources).some(s=>/require\s*\(\s*_blockTimestamp\(\)\s*<=\s*deadline\s*\)\s*;/.test(s.content??'')),'Deadline validation source changed');report.deadlineValidation='Verified source uses require(_blockTimestamp() <= deadline) without a reason string.';
 assert.equal(getAddress((await readLive(ROUTER,ri,'factory'))[0]),FACTORY);assert.equal(getAddress((await readLive(QUOTER,qi,'factory'))[0]),FACTORY);
 const path=pack(n.tokens,n.ticks);report.route={payment:n.payment,symbol:n.symbol,router:ROUTER,spender:ROUTER,path,tokens:n.tokens,tickSpacings:n.ticks,recipient:SENDER,bridge:false,purchaseMode:'liquid',transactionValue:'0'};
 let poolAbi,poolImplementation;
 for(let i=0;i<n.ticks.length;i++){
  const p=getAddress((await readLive(FACTORY,fi,'getPool',[n.tokens[i],n.tokens[i+1],n.ticks[i]]))[0]);assert(BigInt(p)>0n);
  const code=await upstream('eth_getCode',[p,anchor.number]),clone=/^0x363d3d373d3d3d363d73([0-9a-f]{40})5af43d82803e903d91602b57fd5bf3$/i.exec(code);
  assert(clone,'Pool proxy pattern not reviewed');const impl=getAddress('0x'+clone[1]);if(!poolAbi){poolAbi=await checked(impl,'CL pool implementation');poolImplementation=impl;}else assert.equal(impl,poolImplementation,'Pool implementation differs');
  const t0=getAddress((await readLive(p,poolAbi,'token0'))[0]),t1=getAddress((await readLive(p,poolAbi,'token1'))[0]);assert.deepEqual([t0,t1].map(x=>x.toLowerCase()).sort(),[n.tokens[i],n.tokens[i+1]].map(x=>x.toLowerCase()).sort());assert.equal((await readLive(p,poolAbi,'tickSpacing'))[0],BigInt(n.ticks[i]));assert.equal(getAddress((await readLive(p,poolAbi,'factory'))[0]),FACTORY);
  report.pools.push({address:p,implementation:impl,tokens:[t0,t1],tickSpacing:n.ticks[i],feeRaw:(await readLive(p,poolAbi,'fee'))[0],liquidity:(await readLive(p,poolAbi,'liquidity'))[0],runtimeKeccak:keccak256(code)});
 }
 const erc=new Interface(['function balanceOf(address) view returns(uint256)','function allowance(address,address) view returns(uint256)','function approve(address,uint256) returns(bool)','function decimals() view returns(uint8)','event Transfer(address indexed from,address indexed to,uint256 value)']);
 assert.equal((await readLive(n.payment,erc,'decimals'))[0],6n);assert.equal((await readLive(TOKEN,erc,'decimals'))[0],18n);
 if(key==='robinhood'){await checked(n.payment,'USDG proxy');const slot=await upstream('eth_getStorageAt',[n.payment,SLOT,anchor.number]);assert(/^0x0{24}[0-9a-fA-F]{40}$/.test(slot)&&BigInt(slot)>0n);await checked(getAddress('0x'+slot.slice(-40)),'USDG implementation');}
 else report.arcUSDC={runtimeKeccak:keccak256(await upstream('eth_getCode',[n.payment,anchor.number])),sourceEntry:'No Sourcify entry returned during discovery; system behavior tested in Arc engine, not mocked'};
 const staking=getAddress((await readLive(TOKEN,ti,'staking'))[0]);const stslot=await upstream('eth_getStorageAt',[staking,SLOT,anchor.number]);assert(/^0x0{24}[0-9a-fA-F]{40}$/.test(stslot)&&BigInt(stslot)>0n);const si=await checked(getAddress('0x'+stslot.slice(-40)),'active staking implementation');
 report.liveQuote={amountInRaw:'1000000',amountOutRaw:(await readLive(QUOTER,qi,'quoteExactInput',[path,1000000n]))[0],scope:'Pinned read-only quote before local fixture funding; not a promised future price'};
 assert.equal((await upstream('eth_getBlockByNumber',[anchor.number,false])).hash,anchor.hash);
 await engine(await gatewayStart());
 const call=async(to,abi,name,args=[],from=SENDER)=>Array.from(abi.decodeFunctionResult(name,await local('eth_call',[{to,from,data:abi.encodeFunctionData(name,args)},'latest'])));
 const bal=async(token,account=SENDER)=>(await call(token,erc,'balanceOf',[account]))[0];
 const stake=async(account=SENDER)=>call(staking,si,'stakes',[account]);
 const native=async()=>BigInt(await local('eth_getBalance',[SENDER,'latest']));
 const sendData=async(to,data,value=0n)=>{
  const hash=await local('eth_sendTransaction',[{from:SENDER,to,data,value:toBeHex(value),gas:'0x989680'}]);let receipt;
  for(let j=0;j<40;j++){receipt=await local('eth_getTransactionReceipt',[hash]);if(receipt)break;await delay(100);}assert(receipt,'Missing local receipt');assert.equal(BigInt(receipt.status),1n,'Local transaction reverted');return receipt;
 };
 const send=async(to,abi,name,args=[],value=0n)=>sendData(to,abi.encodeFunctionData(name,args),value);
 const prefix=key==='arc'?'anvil':'hardhat';await local(prefix+'_impersonateAccount',[SENDER]);await local(prefix+'_setBalance',[SENDER,toBeHex((key==='arc'?10000n:100n)*ONE)]);
 const deadline=async()=>BigInt((await local('eth_getBlockByNumber',['latest',false])).timestamp)+600n;
 const quote=async(p,amount)=>(await call(QUOTER,qi,'quoteExactInput',[p,amount]))[0];
 const approve=async(amount)=>{await send(n.payment,erc,'approve',[ROUTER,amount]);assert.equal((await call(n.payment,erc,'allowance',[SENDER,ROUTER]))[0],amount);};
 if(key==='robinhood'){
  await checked(WETH,'wrapped ETH proxy');const ws=await upstream('eth_getStorageAt',[WETH,SLOT,anchor.number]);assert(/^0x0{24}[0-9a-fA-F]{40}$/.test(ws)&&BigInt(ws)>0n,'Invalid WETH implementation');const wi=await checked(getAddress('0x'+ws.slice(-40)),'wrapped ETH implementation');assert(wi.hasFunction('deposit()'),'Verified WETH implementation has no deposit');
  const beforeWrapped=await bal(WETH);await send(WETH,wi,'deposit',[],ONE);assert.equal(await bal(WETH)-beforeWrapped,ONE,'Local WETH funding mismatch');
  await send(WETH,erc,'approve',[ROUTER,ONE]);const reverse=pack([WETH,n.payment],[50]);const q=await quote(reverse,ONE);assert(q>100000000n,'USDG fixture too small');await send(ROUTER,ri,'exactInput',[[reverse,SENDER,await deadline(),ONE,q*99n/100n]]);report.fixture='Deposited 1 synthetic local ETH through the verified WETH implementation and swapped WETH to actual USDG on the fork. This setup is not part of the prize purchase.';
 }else{assert.equal(await native()/10n**12n,await bal(n.payment),'USDC native/ERC20 balance relation');report.fixture='10000 synthetic local native USDC; ERC20 balance checked against the same underlying native balance.';}
 await approve(0n);const base=await local('evm_snapshot');let snapshot=base;
 async function reset(){assert(await local('evm_revert',[snapshot]));snapshot=await local('evm_snapshot');}
 async function test(name,fn){await reset();try{report.tests.push({name,status:'passed',...await fn()});}catch(e){report.tests.push({name,status:'failed',error:safe(e)});}}
 async function captured(){return {payment:await bal(n.payment),mss:await bal(TOKEN),stake:await stake(),allowance:(await call(n.payment,erc,'allowance',[SENDER,ROUTER]))[0],native:await native(),pools:await Promise.all(report.pools.map(p=>call(p.address,poolAbi,'slot0')))};}
 async function expectRevert(name,params,expected){await test(name,async()=>{await approve(1000000n);const before=await captured();let rejected=false;try{await call(ROUTER,ri,'exactInput',[await params()]);}catch(e){assert(/revert|VM Exception|execution/i.test(String(e.message)),'Not a contract revert');assert(String(e.message).includes(expected)||JSON.stringify(e.data??'').includes(expected),'Unexpected revert reason');rejected=true;}assert(rejected,'Expected revert did not occur');assert.deepEqual(await captured(),before,'Read-only rejected call changed fork state');return {expectedRevert:expected,checkedStateUnchanged:true,scope:'Rejected eth_call on local fork; not a mined reverting transaction'};});}
 for(const amount of [1000000n,10000000n,100000000n])await test('liquid_purchase_'+amount/1000000n+'_'+n.symbol,async()=>{
  await approve(amount);const before=await captured(),q=await quote(path,amount),min=q*99n/100n;assert(q>0n&&min>0n);const args=[path,SENDER,await deadline(),amount,min];
  const simulated=(await call(ROUTER,ri,'exactInput',[args]))[0];assert(simulated>=min);const receipt=await send(ROUTER,ri,'exactInput',[args]);const after=await captured(),received=after.mss-before.mss;assert.equal(received,simulated,'Quoted execution and actual receipt differ');assert(received>=min);assert.deepEqual(after.stake,before.stake,'Buy changed purchaser stake');assert.equal(after.allowance,0n,'Exact allowance not fully consumed');
  const transfers=receipt.logs.filter(l=>l.address.toLowerCase()===TOKEN.toLowerCase()).flatMap(l=>{try{return [erc.parseLog(l)];}catch{return [];}}).filter(l=>l?.name==='Transfer'&&getAddress(l.args.to)===SENDER);assert.equal(transfers.reduce((s,l)=>s+l.args.value,0n),received,'MSS2 delivery events do not match');
  const gasCost=BigInt(receipt.gasUsed)*BigInt(receipt.effectiveGasPrice);
  if(key==='robinhood')assert.equal(before.payment-after.payment,amount,'USDG spend differs');
  else {assert.equal(before.native-after.native,amount*10n**12n+gasCost,'USDC payment/gas reconciliation');assert.equal(after.native/10n**12n,after.payment,'USDC balance relation');}
  return {inputRaw:amount,quotedOutputRaw:q,minimumOutputRaw:min,receivedLiquidMssRaw:received,stakeUnchanged:true,allowanceRemainingRaw:after.allowance,gasCostNativeRaw:gasCost,localReceiptStatus:receipt.status};
 });
 await expectRevert('minimum_output_enforced',async()=>[path,SENDER,await deadline(),1000000n,(await quote(path,1000000n))*2n],'Too little received');
 await test('expired_purchase_rejected',async()=>{
  await approve(1000000n);const params=[path,SENDER,await deadline(),1000000n,1n];const control=(await call(ROUTER,ri,'exactInput',[params]))[0];assert(control>0n,'Fresh-deadline positive control failed');const before=await captured();let rejected=false;
  try{await call(ROUTER,ri,'exactInput',[[...params.slice(0,2),1n,...params.slice(3)]]);}catch(e){assert(/revert|VM Exception|execution/i.test(String(e.message)),'Not an EVM revert');rejected=true;}
  assert(rejected,'Expired transaction did not revert');assert.deepEqual(await captured(),before,'Deadline rejection changed state');return {freshDeadlineControlPassed:true,onlyDeadlineChanged:true,checkedStateUnchanged:true,sourceRule:'require(_blockTimestamp() <= deadline); no reason string',scope:'Paired eth_call on local fork, not mined failed transaction'};
 });
 await test('missing_approval_rejected',async()=>{const before=await captured();let rejected=false;try{await call(ROUTER,ri,'exactInput',[[path,SENDER,await deadline(),1000000n,1n]]);}catch(e){assert(/revert|VM Exception|execution/i.test(e.message));rejected=true;}assert(rejected);assert.deepEqual(await captured(),before);return {checkedStateUnchanged:true};});
 await test('purchased_liquid_tokens_then_exact_winner_stake',async()=>{
  const amount=1000000n;assert.equal((await stake(RECIPIENT))[0],0n);await approve(amount);const beforeMss=await bal(TOKEN),beforeStake=await stake();const q=await quote(path,amount);await send(ROUTER,ri,'exactInput',[[path,SENDER,await deadline(),amount,q*99n/100n]]);const bought=await bal(TOKEN)-beforeMss;assert(bought>=ONE);assert.deepEqual(await stake(),beforeStake);const recipientLiquid=await bal(TOKEN,RECIPIENT),reserveLiquid=await bal(TOKEN);const receipt=await send(TOKEN,ti,'airdropStake',[[RECIPIENT],[bought]]);assert.equal(reserveLiquid-await bal(TOKEN),bought);assert.equal((await stake(RECIPIENT))[0],bought);assert.equal(await bal(TOKEN,RECIPIENT),recipientLiquid);assert.equal(await bal(TOKEN),beforeMss,'Payout consumed unrelated reserve MSS2');const gifts=receipt.logs.filter(l=>l.address.toLowerCase()===staking.toLowerCase()).flatMap(l=>{try{return [si.parseLog(l)];}catch{return [];}}).filter(l=>l?.name==='StakeGifted');assert.equal(gifts.length,1);assert.equal(getAddress(gifts[0].args.sender),SENDER);assert.equal(getAddress(gifts[0].args.recipient),getAddress(RECIPIENT));assert.equal(gifts[0].args.amount,bought);return {purchasedMssRaw:bought,winnerStakeIncreaseRaw:bought,unrelatedReserveMssUnchanged:true,recipientLiquidIncreaseRaw:'0'};
 });
 assert.equal((await upstream('eth_getBlockByNumber',[anchor.number,false])).hash,anchor.hash);assert.equal(BigInt(await upstream('eth_chainId',[])),BigInt(n.id));report.passed=report.tests.filter(x=>x.status==='passed').length;report.failed=report.tests.length-report.passed;report.status=report.failed?'fork_cases_failed':'swap_fork_cases_passed';
}
try{await main();}catch(e){report.error=safe(e);report.status='blocked';}
finally{if(child&&child.exitCode===null){child.kill('SIGTERM');await delay(300);}if(gateway){gateway.closeAllConnections();await new Promise(r=>gateway.close(r));}await writeFile(`swap-${key}.json`,serialize(report)+'\n');console.log('BEGIN_SWAP_REHEARSAL');console.log(serialize(report));console.log('END_SWAP_REHEARSAL');if(report.status!=='swap_fork_cases_passed')process.exitCode=1;}
