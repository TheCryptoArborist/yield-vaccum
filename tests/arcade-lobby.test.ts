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
