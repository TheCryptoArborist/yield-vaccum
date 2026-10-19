import test from 'node:test';
import assert from 'node:assert/strict';
import {getDatabase} from '@netlify/database';
import {verifiedFlightHistory,mergeArcadeHistory} from '../lib/arcade-result-history';
import {readArcadeLobby,recordArcadeResult} from '../db/arcade-lobby';
import {readAdminRewards} from '../db/arcade-admin-rewards';
const wallet='0x1111111111111111111111111111111111111111',second='0x2222222222222222222222222222222222222222';
const run={runId:'legacy-flight-123456',playerKey:'legacy-browser-123456',nickname:'Legacy',score:1000,distance:100,createdAt:'2026-10-14T00:00:00.123Z',entryMode:'paid'};
const payment={status:'verified',txHash:'0x'+'a'.repeat(64),playerKey:run.playerKey,runId:run.runId,walletAddress:wallet,network:'arc'};
test('legacy participation requires a matching verified payment, not a profile wallet or name',()=>{
 const history=verifiedFlightHistory([run,{...run,runId:'practice-flight',entryMode:'demo'},{...run,runId:'unverified-flight'}],[payment,{...payment,status:'pending',runId:'unverified-flight'}]);
 assert.equal(history.results.length,1);assert.equal(history.results[0].network,'arc');assert.equal(history.results[0].walletAddress,wallet);
 assert.deepEqual(history.audit.pilots,[{nickname:'Legacy',saved:3,verifiedPaid:1,practice:1,unverified:1}]);
 assert.throws(()=>verifiedFlightHistory([run],[payment,{...payment,walletAddress:second}]));
 assert.equal(verifiedFlightHistory([run],[{...payment,game:'mint-invaders'}]).results.length,0);
});
test('merging recovers missing runs, fills network evidence and preserves immutable originals',()=>{
 const legacy=verifiedFlightHistory([run],[payment]).results;
 const primary={...legacy[0],network:null,score:999,pilotId:'existing-id'};
 const merged=mergeArcadeHistory([primary],legacy,'local');assert.equal(merged.length,1);assert.equal(merged[0].score,999);assert.equal(merged[0].network,'arc');assert.equal(merged[0].pilotId,'existing-id');
 assert.equal(primary.network,null);
 assert.throws(()=>mergeArcadeHistory([primary],[{...legacy[0],walletAddress:second}],'local'));
 const recovered=mergeArcadeHistory([],legacy,'local');assert.equal(recovered[0].pilotId,mergeArcadeHistory([],legacy,'local')[0].pilotId);assert.ok(!recovered[0].pilotId?.includes(wallet));
});
test('weekly admin and public counts reconcile paid Flyer history and original Invaders rows without double counting',async()=>{
 const {NetlifyDB}=await import('@netlify/database-dev');const local=new NetlifyDB();let db:ReturnType<typeof getDatabase>|undefined;
 try{
  db=getDatabase({connectionString:await local.start()});await local.applyMigrations('./netlify/database/migrations');
  const history=verifiedFlightHistory([run,{...run,runId:'second-flight'},{...run,runId:'old-flight',createdAt:'2026-10-11T23:59:59.999Z'},{...run,runId:'new-flight',createdAt:'2026-10-19T00:00:00.000Z'},{...run,runId:'practice-flight',entryMode:'demo'}],[payment,{...payment,runId:'second-flight'},{...payment,runId:'old-flight'},{...payment,runId:'new-flight'}]);
  const original=history.results[0];await recordArcadeResult({...original,network:'arc'},db);
  await db.sql`INSERT INTO mint_invaders_runs(context,run_id,payment_id,player_key,nickname,wallet_address,network,score,wave,created_at) VALUES('local','invaders-legacy','payment-legacy','invaders-browser-1234','Invader',${second},'robinhood',900,2,'2026-10-15T00:00:00.456Z')`;
  const legacy=async()=>history;
  const board=await readArcadeLobby([],true,db,{week:'2026-10-12',now:new Date('2026-10-20'),readLegacy:legacy});
  const admin=await readAdminRewards('2026-10-12',db,legacy);
  assert.equal(board.runs,3);assert.equal(admin.rows.reduce((n,row)=>n+row.games,0),3);
  assert.deepEqual(board.standings.map(row=>[row.nickname,row.runs]),[['Legacy',2],['Invader',1]]);
  assert.deepEqual(admin.rows.map(row=>[row.nickname,row.flyerGames,row.invadersGames]),[['Legacy',2,0],['Invader',0,1]]);
  assert.deepEqual(admin.rows[0].networks,['arc']);assert.equal(admin.rows[0].unknownNetwork,false);
  assert.equal(JSON.stringify(board).includes(wallet),false);assert.equal(JSON.stringify(board).includes(run.playerKey),false);
  const lifetime=await readArcadeLobby([],false,db,{readLegacy:legacy});assert.equal(lifetime.runs,5);
 }finally{if(db)await db.pool.end();await local.stop();}
});
