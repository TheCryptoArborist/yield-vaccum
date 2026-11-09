/** Preserve the accepted market/receipt scenarios and insert the durable-reader cases.
 * Local-only harness edits are archived; no contract or original case is changed.
 * Workflow copies this entrypoint to root as worker-run.mjs.
 */
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
assert.equal(process.argv.length,3);assert(['robinhood','arc'].includes(process.argv[2]));
const gitBlob=s=>createHash('sha1').update(`blob ${Buffer.byteLength(s)}\0`).update(s).digest('hex');
let cases=await readFile('scripts/daily-draw-market-ledger-cases.mjs','utf8');
assert.equal(gitBlob(cases),'7851fa5200cbeadb73259eb8fa7db246e7bcaddc');
const anchor=' report.marketLedger.integratedCases=report.tests.filter(x=>x.name.startsWith(\'market_ledger_\')).length;';
assert.equal(cases.split(anchor).length,2);
cases="import {runDurableWorkerCases} from './daily-draw-worker-cases.mjs';\n"+cases.replace(anchor,
 " await runDurableWorkerCases(c,{D,di,selected,round,capacity,scenario});\n"+anchor);
await writeFile('scripts/market-ledger-with-worker.mjs',cases);
let launcher=await readFile('scripts/daily-draw-market-ledger-fork.mjs','utf8');
assert.equal(gitBlob(launcher),'43488a86352f83e5fce0142f420ab5f9567b708d');
const old='./scripts/daily-draw-market-ledger-cases.mjs';assert.equal(launcher.split(old).length,2);
launcher=launcher.replace(old,'./scripts/market-ledger-with-worker.mjs');
await writeFile('worker-market-launcher-executed.mjs',launcher);
await writeFile('worker-harness-edits.json',JSON.stringify({caseBaseBlob:'7851fa5200cbeadb73259eb8fa7db246e7bcaddc',launcherBaseBlob:'43488a86352f83e5fce0142f420ab5f9567b708d',
 changes:['Import and append durable worker cases','Redirect only extension import'],originalAssertionsRetained:true},null,2));
await import('./worker-market-launcher-executed.mjs');
