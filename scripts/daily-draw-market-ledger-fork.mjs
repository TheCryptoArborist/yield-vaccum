/** Read-only public access; only private local fork writes. No credentials or live signer.
 * Retains the seven original swap assertions. Mechanical edits below change local IDs,
 * request the source storage layout, and insert one explicitly scoped extension.
 */
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const mode=process.argv[2];assert(['robinhood','arc'].includes(mode));assert.equal(process.argv.length,3);
let code=await readFile('base-swap.mjs','utf8');
const blob=createHash('sha1').update(`blob ${Buffer.byteLength(code)}\0`).update(code).digest('hex');
assert.equal(blob,'5223d49fad11e0e5e314b4c47ff1e9d683e07e0c','Pinned original swap runner changed');
const edits=[];
function replace(oldText,newText){assert.equal(code.split(oldText).length,2,'Expected one mechanical anchor: '+oldText);code=code.replace(oldText,newText);edits.push(oldText);}
replace("import assert from 'node:assert/strict';","import assert from 'node:assert/strict';\nimport {runMarketLedgerCases} from './daily-draw-market-ledger-cases.mjs';\nconst LOCAL_ID=process.argv[2]==='robinhood'?31337:31338;");
replace('fields=abi,compilation,runtimeBytecode,sources','fields=abi,compilation,runtimeBytecode,sources,storageLayout');
replace("hardhat:{chainId:n.id,hardfork:'cancun'","hardhat:{chainId:LOCAL_ID,hardfork:'cancun'");
replace("['--fork-url',gatewayURL","['--network','arc','--chain-id',String(LOCAL_ID),'--fork-url',gatewayURL");
replace("if(BigInt(await local('eth_chainId'))===BigInt(n.id))","if(BigInt(await local('eth_chainId'))===BigInt(LOCAL_ID))");
replace("assert.equal(BigInt(await local('eth_chainId')),BigInt(n.id));","assert.equal(BigInt(await local('eth_chainId')),BigInt(LOCAL_ID));report.localChainId=LOCAL_ID;");
replace(" assert.equal((await upstream('eth_getBlockByNumber',[anchor.number,false])).hash,anchor.hash);assert.equal(BigInt(await upstream('eth_chainId',[])),BigInt(n.id));report.passed=",` await runMarketLedgerCases({key,n,report,anchor,local,source,checked,bal,stake,call,send,sendData,deadline,quote,path,erc,ti,si,ri,staking,SENDER,TOKEN,ROUTER,QUOTER,FACTORY,WETH,prefix,reset,localChainId:LOCAL_ID});
 assert.equal((await upstream('eth_getBlockByNumber',[anchor.number,false])).hash,anchor.hash);assert.equal(BigInt(await upstream('eth_chainId',[])),BigInt(n.id));report.passed=`);
// No original scenario is removed, changed to an expected pass or suppressed.
assert.equal((code.match(/await test\(/g)||[]).length,5,'Original explicit scenario definitions changed');
await writeFile('market-ledger-executed.mjs',code);
await writeFile('market-ledger-harness-edits.json',JSON.stringify({originalBlob:blob,edits,localOnly:true,mainnetTransactionsSubmitted:0},null,2));
await import('./market-ledger-executed.mjs');
