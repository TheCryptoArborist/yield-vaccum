/** Research only: bounded HTTPS reads and view calls; never requests randomness or sends a transaction. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { Interface, getAddress, keccak256 } from 'ethers';
const SDK_COMMIT='fc4b546c06017703b0508ef2182d2030d789c966';
const SLOT='0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc';
const HOSTS=new Set(['d20dao.org','rpc.mainnet.chain.robinhood.com','rpc.mainnet.arc.io']);
const METHODS=new Set(['eth_chainId','eth_getBlockByNumber','eth_getCode','eth_getStorageAt','eth_call']);
const networks=[
 {key:'robinhood',id:4663,rpc:'https://rpc.mainnet.chain.robinhood.com',proxy:'0xEc8b95B168c87294c45727Bd2ac903d09316D132',abi:'D20VRFCoordinatorRobinhood',abiHash:'f5024b52cb169375f50df1df09a9663f5abca72324c8986382ac42840702f0f8'},
 {key:'arc',id:5042,rpc:'https://rpc.mainnet.arc.io',proxy:'0xd20da057469C45928912d983F45790C41e290571',abi:'D20VRFCoordinator',abiHash:'4764ba62745e109f3b968b21ed23e88da739a4a26906fc2ed3192fa23b8d79c1'}
];
let sequence=0,posts=0;
const serial=x=>JSON.stringify(x,(_,v)=>typeof v==='bigint'?v.toString():v,2);
async function read(url,options={}) {
 const u=new URL(url);assert.equal(u.protocol,'https:');assert(HOSTS.has(u.hostname));assert(!u.username&&!u.password);
 let r;
 for(let attempt=0;attempt<3;attempt++) {
  r=await fetch(url,{...options,redirect:'error',signal:AbortSignal.timeout(20000)});
  if(![429,503].includes(r.status)||attempt===2)break;
  const header=r.headers.get('retry-after'),seconds=Number(header);
  const wait=header&&Number.isFinite(seconds)?seconds*1000:Math.max(0,Date.parse(header??'')-Date.now())||2000*(attempt+1);
  await r.body?.cancel();if(wait>30000)throw Error('Provider requested longer backoff; bounded check stopped');await delay(Math.max(wait,1000));
 }
 assert(r.ok,`HTTP ${r.status}`);assert(r.body);
 const chunks=[];let size=0;const reader=r.body.getReader();
 try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;assert(size<=2000000,'Oversized public response');chunks.push(Buffer.from(value));}}
 finally{await reader.cancel().catch(()=>{});}
 const raw=Buffer.concat(chunks);return {value:JSON.parse(raw.toString('utf8')),sha256:createHash('sha256').update(raw).digest('hex')};
}
async function rpc(n,method,params) {
 assert(METHODS.has(method),'Signing/write RPC methods blocked before network');await delay(450);
 const id=++sequence;posts++;
 const {value:r}=await read(n.rpc,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id,method,params})});
 assert.equal(r.jsonrpc,'2.0');assert.equal(r.id,id);assert(!r.error,`Read-only RPC failed: ${r.error?.code}`);assert(Object.hasOwn(r,'result'));return r.result;
}
const report={createdAt:new Date().toISOString(),scope:'Pinned live deployment and selected getter observations only; NOT a VRF proof replay, complete role/upgrade review, own consumer request, audited cryptography, provider liveness guarantee or release approval.',mainnetTransactionsSubmitted:0,livePaymentEnabled:false,networks:{}};
const before=posts;for(const method of ['eth_sendTransaction','eth_sendRawTransaction','eth_sign','personal_sign','wallet_sendCalls'])await assert.rejects(()=>rpc(networks[0],method,[]));assert.equal(posts,before);report.writeMethodsRejected=5;
for(const n of networks) {
 const o=report.networks[n.key]={status:'blocked',checks:[],observations:{},discrepancies:[]};
 try {
  const manifestURL=`https://d20dao.org/deployments/${n.key}-mainnet.json`;
  const {value:m,sha256:manifestSha256}=await read(manifestURL);
  assert.equal(Number(m.chainId),n.id);assert.equal(getAddress(m.coordinator),getAddress(n.proxy));
  o.manifest={url:manifestURL,sha256:manifestSha256};
  // ABIs are generated package exports, not checked-in files at the repository URL.
  // Read data only; do not execute SDK entrypoints. Match the documented 0.6.2 ABI hashes.
  const abiRaw=await readFile(new URL(import.meta.resolve(`@d20dao/vrf-sdk/abi/${n.abi}.json`)));
  const abiHash=createHash('sha256').update(abiRaw).digest('hex');assert.equal(abiHash,n.abiHash,'Pinned SDK ABI hash mismatch');
  const iface=new Interface(JSON.parse(abiRaw.toString('utf8')));o.abi={packageVersion:'0.6.2',sdkCommit:SDK_COMMIT,sha256:abiHash};
  assert.equal(BigInt(await rpc(n,'eth_chainId',[])),BigInt(n.id));
  const b=await rpc(n,'eth_getBlockByNumber',['latest',false]);assert(b&&b.hash&&b.number&&b.baseFeePerGas);o.anchor={number:b.number,hash:b.hash,timestamp:b.timestamp,finalized:false};
  const check=(label,actual,expected)=>{assert.notEqual(expected,undefined,`Missing manifest ${label}`);const same=String(actual).toLowerCase()===String(expected).toLowerCase();o.checks.push({label,actual,expected,matched:same});if(!same)o.discrepancies.push(label);};
  const code=async(role,address,expected)=>{const raw=await rpc(n,'eth_getCode',[address,b.number]);assert(raw!=='0x',`No code for ${role}`);check(role+' runtime',keccak256(raw),expected);};
  async function proxy(role,address,implementation,proxyHash,implementationHash){
   await code(role,address,proxyHash);const word=await rpc(n,'eth_getStorageAt',[address,SLOT,b.number]);assert(/^0x0{24}[0-9a-fA-F]{40}$/.test(word));const active=getAddress('0x'+word.slice(-40));check(role+' implementation',active,implementation);await code(role+' implementation',active,implementationHash);
  }
  await proxy('coordinator',m.coordinator,m.coordinatorImplementation,m.coordinatorCodeHash,m.coordinatorImplementationCodeHash);
  if(n.key==='arc')await proxy('registry',m.registry,m.epochImplementation,m.registryCodeHash,m.epochImplementationCodeHash);
  for(const role of ['beaconVerifier','proofVerifier','mappingLibrary'])if(m[role])await code(role,m[role],m[role+'CodeHash']);
  const view=async(name,args=[])=>{const f=iface.getFunction(name);assert(f&&['view','pure'].includes(f.stateMutability),'Only SDK-declared getters allowed');return iface.decodeFunctionResult(f,await rpc(n,'eth_call',[{to:m.coordinator,data:iface.encodeFunctionData(f,args)},b.number]));};
  for(const name of ['owner','feeRecipient']){const value=(await view(name))[0];o.observations[name]=value;check(name,value,m[name]);}
  if(n.key==='robinhood'){
   const value=(await view('keeper'))[0];o.observations.keeper=value;check('keeper',value,m.keeper);
  }else{
   assert.equal(iface.hasFunction('keeper'),false,'Review changed Arc coordinator ABI');
   o.authorizationScope='Arc epoch coordinator does not expose keeper(). This check does not validate epoch committer/backup authorization, registry owner, or historical request-specific authority; separate review required.';
  }
  const pricing=Array.from(await view('pricing')),expected=m.pricing??m;
  for(const [i,name] of ['minFeeWei','feeMultiplier','fulfillGasOverhead'].entries())check(name,pricing[i],expected[name]);
  o.observations.pricing=pricing;
  for(const name of ['refundBps','keeperFeeBps']){const value=(await view(name))[0];o.observations[name]=value;check(name,value,expected[name]);}
  const quote=(await view('quoteFeeAt',[120000,BigInt(b.baseFeePerGas)]))[0],calculated=pricing[1]*BigInt(b.baseFeePerGas)*(pricing[2]+120000n);
  assert.equal(quote,calculated>pricing[0]?calculated:pricing[0]);o.observations.quoteFor120kCallbackNativeRaw=quote;
  for(const name of ['RESPONSE_TIMEOUT','MIN_CALLBACK_GAS','MAX_CALLBACK_GAS','protocolConfigurationHash','keyHash','epochRegistry','registry','proofVerifier','mappingLibrary'])if(iface.hasFunction(name)&&iface.getFunction(name).inputs.length===0)o.observations[name]=Array.from(await view(name));
  for(const name of ['protocolConfigurationHash','keyHash','proofVerifier'])if(m[name]!==undefined&&o.observations[name])check(name,o.observations[name][0],m[name]);
  if(o.observations.MIN_CALLBACK_GAS&&o.observations.MAX_CALLBACK_GAS){assert(120000n>=o.observations.MIN_CALLBACK_GAS[0]);assert(120000n<=o.observations.MAX_CALLBACK_GAS[0]);}
  assert.equal((await rpc(n,'eth_getBlockByNumber',[b.number,false])).hash,b.hash,'Anchor changed');assert.equal(BigInt(await rpc(n,'eth_chainId',[])),BigInt(n.id));
  o.anchorRechecked=true;
  o.status=o.discrepancies.length?'manifest_discrepancy':'selected_deployment_checks_matched';
 }catch(e){o.error=String(e.shortMessage??e.message).slice(0,900);}
}
await writeFile('randomness-live-observation.json',serial(report)+'\n');console.log('BEGIN_RANDOMNESS_OBSERVATION');console.log(serial(report));console.log('END_RANDOMNESS_OBSERVATION');
if(Object.values(report.networks).some(n=>n.status!=='selected_deployment_checks_matched'))process.exitCode=1;
