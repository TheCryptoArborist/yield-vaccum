/** Public explorer discovery only. Never creates or submits transactions. */
import { createHash } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { MSS2 } from './daily-draw-readiness.mjs';
const SOURCES = Object.freeze({
  robinhood: 'https://robinhoodchain.blockscout.com',
  arc: 'https://explorer.arc.io',
});
const LIMIT = 2_000_000;
export async function readPublicContract(network, fetcher = fetch) {
  if (!Object.hasOwn(SOURCES, network)) throw new Error('Unsupported explorer.');
  const url = `${SOURCES[network]}/api/v2/smart-contracts/${MSS2}`;
  const response = await fetcher(url, {method:'GET', redirect:'error', signal:AbortSignal.timeout(15000), headers:{Accept:'application/json'}});
  if (!response.ok) throw new Error('Public explorer unavailable.');
  if (!response.body) throw new Error('Missing explorer body.');
  const reader=response.body.getReader(); let size=0; const chunks=[];
  try {
    while(true) {
      const {value,done}=await reader.read(); if(done)break;
      size+=value.byteLength; if(size>LIMIT)throw new Error('Explorer response exceeds bound.');
      chunks.push(Buffer.from(value));
    }
  } finally { await reader.cancel().catch(()=>{}); }
  const raw=Buffer.concat(chunks); const value=JSON.parse(raw.toString('utf8'));
  if(!value || typeof value!=='object' || Array.isArray(value))throw new Error('Invalid explorer response.');
  return {url,rawSha256:createHash('sha256').update(raw).digest('hex'),value};
}
export function summarize({url,rawSha256,value}) {
  const abi=Array.isArray(value.abi)?value.abi:[];
  const relevant=abi.filter(x=>x&&typeof x==='object'&&typeof x.name==='string'&&/gift|airdrop|stak|refer|cap|limit/i.test(x.name));
  const sourceInputs=[{file_path:value.file_path??value.name??'primary',source_code:value.source_code},...(Array.isArray(value.additional_sources)?value.additional_sources:[])];
  const excerpts=[];
  for(const src of sourceInputs) {
    if(typeof src?.source_code!=='string')continue;
    const lines=src.source_code.split('\n');
    if(!lines.some(x=>/function\s+\w*(gift|airdrop)/i.test(x)))continue;
    const picked=new Set();
    lines.forEach((line,i)=>{if(/function\s+\w*(gift|airdrop)/i.test(line))for(let j=Math.max(0,i-5);j<Math.min(lines.length,i+65);j++)picked.add(j);});
    const text=[...picked].sort((a,b)=>a-b).map(i=>`${i+1}: ${lines[i]}`).join('\n');
    excerpts.push({file:String(src.file_path??src.name??'source'),sourceSha256:createHash('sha256').update(src.source_code).digest('hex'),excerpt:text.slice(0,22000),truncated:text.length>22000});
  }
  return {url,rawSha256,name:value.name??null,compiler:value.compiler_version??null,
    explorerVerificationFlags:{is_verified:value.is_verified??null,is_fully_verified:value.is_fully_verified??null,is_partially_verified:value.is_partially_verified??null},
    abiEntries:abi.length,relevantAbi:relevant,sourceExcerpts:excerpts,
    scope:'Explorer-reported ABI/source only. Not independently compiled or matched to live bytecode; no simulation or authority proof.'};
}
export async function main() {
 const report={createdAt:new Date().toISOString(),livePaymentEnabled:false,networks:{}};
 for(const network of Object.keys(SOURCES)) {
  try {report.networks[network]={status:'explorer_observed',...summarize(await readPublicContract(network))};}
  catch {report.networks[network]={status:'blocked',reason:'Public explorer did not return usable bounded JSON; no interface is inferred.'};}
 }
 const output=JSON.stringify(report,null,2)+'\n';
 if(process.argv[2])await writeFile(process.argv[2],output,{mode:0o600});else process.stdout.write(output);
 if(Object.values(report.networks).some(x=>x.status!=='explorer_observed'||!x.abiEntries))process.exitCode=1;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)main().catch(()=>{console.error('Public contract discovery failed. No transactions submitted.');process.exitCode=1;});
