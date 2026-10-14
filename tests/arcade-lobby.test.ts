import test from 'node:test';
import assert from 'node:assert/strict';
import { getDatabase } from '@netlify/database';
import { recordArcadeResult,readArcadeLobby } from '../db/arcade-lobby';
test('verified wallet joins games across browser keys, with immutable scores and weekly isolation',async()=>{
 const {NetlifyDB}=await import('@netlify/database-dev');const local=new NetlifyDB();let database:ReturnType<typeof getDatabase>|undefined;
 try {
  database=getDatabase({connectionString:await local.start()});await local.applyMigrations('./netlify/database/migrations');
  const source={runId:'run-a',playerKey:'browser-one-123456',walletAddress:'0xAbC',nickname:'Pilot',score:100,tieBreak:1,createdAt:new Date().toISOString()};
  await recordArcadeResult({...source,game:'mint-flyer'},database);
  await recordArcadeResult({...source,game:'mint-flyer',score:99999},database);
  await recordArcadeResult({...source,game:'mint-invaders',runId:'run-b',playerKey:'browser-two-123456',walletAddress:'0xabc',score:200},database);
  await recordArcadeResult({...source,game:'mint-invaders',runId:'run-c',playerKey:'browser-two-123456',walletAddress:'0xabc',score:20},database);
  await recordArcadeResult({...source,game:'mint-flyer',runId:'past-pilot-run',createdAt:'2020-01-01T00:00:00.000Z'},database);
  await recordArcadeResult({...source,game:'mint-flyer',runId:'old',walletAddress:'0xOther',createdAt:'2020-01-01T00:00:00.000Z'},database);
  const weekly=await readArcadeLobby(['browser-two-123456'],true,database);
  assert.equal(weekly.pilots,1);assert.equal(weekly.runs,3);assert.equal(weekly.profile?.runs,3);assert.equal(weekly.standings[0].runs,3);assert.equal(weekly.profile?.flyer,100);assert.equal(weekly.profile?.invaders,200);assert.equal(weekly.profile?.points,2000);
  assert.equal(JSON.stringify(weekly).includes('0xabc'),false);
  const lifetime=await readArcadeLobby([],false,database);assert.equal(lifetime.pilots,2);assert.equal(lifetime.profile,null);
  const allTimePilot=await readArcadeLobby(['browser-two-123456'],false,database);assert.equal(allTimePilot.profile?.runs,4);assert.equal(allTimePilot.runs,5);
 }finally{if(database)await database.pool.end();await local.stop();}
});

test('weekly games are deduplicated, ranked by count and isolated at exact week boundaries',async()=>{
 const {NetlifyDB}=await import('@netlify/database-dev');const local=new NetlifyDB();let database:ReturnType<typeof getDatabase>|undefined;
 try {
  database=getDatabase({connectionString:await local.start()});await local.applyMigrations('./netlify/database/migrations');
  const source={game:'mint-flyer' as const,runId:'run-start',playerKey:'weekly-browser-1234',walletAddress:'0xone',nickname:'One',score:9000,tieBreak:0,createdAt:'2026-10-12T00:00:00.000Z'};
  await recordArcadeResult(source,database);await recordArcadeResult(source,database);
  await recordArcadeResult({...source,runId:'previous',createdAt:'2026-10-11T23:59:59.999Z'},database);
  await recordArcadeResult({...source,runId:'next',createdAt:'2026-10-19T00:00:00.000Z'},database);
  await recordArcadeResult({...source,runId:'many-flyer',walletAddress:'0xtwo',nickname:'Two',score:1},database);
  await recordArcadeResult({...source,game:'mint-invaders',runId:'many-invaders',walletAddress:'0xTWO',nickname:'Two',score:1},database);
  const current=await readArcadeLobby([],true,database,{ranking:'games',week:'2026-10-12',now:new Date('2026-10-20')});
  assert.equal(current.runs,3);assert.equal(current.weekEnd,'2026-10-19T00:00:00.000Z');
  assert.deepEqual(current.standings.map(row=>[row.nickname,row.runs,row.rank]),[['Two',2,1],['One',1,2]]);
  const previous=await readArcadeLobby([],true,database,{week:'2026-10-05',now:new Date('2026-10-20')});
  assert.equal(previous.runs,1);assert.equal(previous.standings[0].nickname,'One');
  const scoreBoard=await readArcadeLobby([],true,database,{ranking:'points',week:'2026-10-12',now:new Date('2026-10-20')});
  assert.equal(scoreBoard.ranking,'points');assert.equal(scoreBoard.runs,3);
  const context=String((await database.sql`SELECT context FROM arcade_results LIMIT 1`)[0].context);
  await database.sql`INSERT INTO arcade_pilots(context,wallet_address) SELECT ${context},'page-wallet-'||n FROM generate_series(1,105) n`;
  await database.sql`INSERT INTO arcade_results(context,game,run_id,player_key,wallet_address,nickname,score,tie_break,created_at) SELECT context,'mint-flyer',wallet_address,'page-browser-123456',wallet_address,'Page pilot',1,0,'2026-10-14T00:00:00Z' FROM arcade_pilots WHERE context=${context} AND wallet_address LIKE 'page-wallet-%'`;
  const pageOne=await readArcadeLobby([],true,database,{week:'2026-10-12',now:new Date('2026-10-20'),page:1});
  const pageTwo=await readArcadeLobby([],true,database,{week:'2026-10-12',now:new Date('2026-10-20'),page:2});
  assert.equal(pageOne.pilots,107);assert.equal(pageOne.totalPages,2);assert.equal(pageOne.standings.length,100);assert.equal(pageTwo.standings.length,7);
  assert.equal(new Set([...pageOne.standings,...pageTwo.standings].map(row=>row.id)).size,107);
  assert.ok(pageTwo.standings.every(row=>row.rank===2));
 }finally{if(database)await database.pool.end();await local.stop();}
});
