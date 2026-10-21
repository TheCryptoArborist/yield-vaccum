import test from 'node:test';
import assert from 'node:assert/strict';
import { getDatabase } from '@netlify/database';
import { createStackGame, ghostY, replayStack, stepStack, type StackEvent } from '../lib/mint-stack';
import { arcadeGame, assertPaymentGame } from '../lib/arcade-game';
import { recordArcadeResult, readArcadeLobby } from '../db/arcade-lobby';
import { readAdminRewards } from '../db/arcade-admin-rewards';
import { rewardsCsv } from '../lib/arcade-admin-rewards';
import { POST } from '../app/api/mint-stack-leaderboard/route';
test('Mint Stack deals deterministic seven-piece bags and allows one hold per locked piece',()=>{
  const g=createStackGame('paid-entry');
  assert.deepEqual(g,createStackGame('paid-entry'));
  assert.equal(new Set([g.piece,...g.queue.slice(0,6)]).size,7);
  const original=g.piece;stepStack(g,['hold']);assert.equal(g.held,original);
  const current=g.piece;stepStack(g,['hold']);assert.equal(g.piece,current);
  stepStack(g,['drop']);assert.equal(g.canHold,true);
  stepStack(g,['hold']);assert.equal(g.piece,original);
});
test('hard drops land at the ghost, clear four rows and increase speed after ten lines',()=>{
  const g=createStackGame('line-clear');g.board=Array.from({length:20},(_,y)=>Array.from({length:10},(_,x)=>y>=16&&x<9?2:0));
  g.piece=0;g.matrix=[[1],[1],[1],[1]];g.x=9;g.y=0;g.lines=6;
  assert.equal(ghostY(g),16);stepStack(g,['drop']);
  assert.equal(g.lines,10);assert.equal(g.level,2);assert.equal(g.fours,1);assert.equal(g.score,832);
  assert.deepEqual(g.clearRows,[16,17,18,19]);assert.equal(g.clearPoints,800);
  assert.ok(g.board.every(row=>row.every(cell=>cell===0)));
});
test('pieces cannot cross walls and gravity, lock delay and top-out advance deterministically',()=>{
  const g=createStackGame('walls');for(let i=0;i<20;i++)stepStack(g,['left']);
  const x=g.x;stepStack(g,['left']);assert.equal(g.x,x);
  g.y=ghostY(g);for(let i=0;i<9;i++)stepStack(g);assert.equal(g.pieces,0);
  stepStack(g);assert.equal(g.pieces,1);
});
test('server replay reproduces completed scores and rejects unfinished, malformed and extended runs',()=>{
  const g=createStackGame('replay-seed'),events:StackEvent[]=[];
  while(!g.over){events.push({t:g.ticks,a:'drop'});stepStack(g,['drop']);}
  assert.deepEqual(replayStack('replay-seed',events,g.ticks),g);
  assert.throws(()=>replayStack('replay-seed',[],1),/Finish/);
  assert.throws(()=>replayStack('replay-seed',[{t:-1,a:'drop'}],1),/Invalid/);
  assert.throws(()=>replayStack('replay-seed',events,g.ticks+1),/after game over/);
  assert.throws(()=>replayStack('replay-seed',Array.from({length:11},()=>({t:0,a:'drop' as const})),1),/Too many/);
  assert.equal(replayStack('replay-seed',[],0,false).ticks,0);
});
test('Mint Stack payments are game-bound and unpaid results are rejected before database access',async()=>{
  assert.equal(arcadeGame('mint-stack'),'mint-stack');
  assertPaymentGame({game:'mint-stack'},'mint-stack');
  assert.throws(()=>assertPaymentGame({game:'mint-flyer'},'mint-stack'));
  assert.throws(()=>assertPaymentGame({game:'mint-stack'},'mint-invaders'));
  const r=await POST(new Request('https://example.com/api/mint-stack-leaderboard',{method:'POST',body:JSON.stringify({playerKey:'profile-1234567890',runId:'run-id-1234567890',paymentId:'',nickname:'Player'})}));
  assert.equal(r.status,403);
});
test('Stack joins both older games without relabeling counts; a payment creates one immutable score',async()=>{
  const {NetlifyDB}=await import('@netlify/database-dev');const local=new NetlifyDB();let db:ReturnType<typeof getDatabase>|undefined;
  try{
    db=getDatabase({connectionString:await local.start()});await local.applyMigrations('./netlify/database/migrations');
    const source={runId:'run-one',playerKey:'browser-1234567890',walletAddress:'0xabc',nickname:'Player',score:100,tieBreak:0,network:'arc' as const,createdAt:'2026-10-14T12:00:00.000Z'};
    await recordArcadeResult({...source,game:'mint-flyer'},db);await recordArcadeResult({...source,game:'mint-invaders'},db);
    const inserts=await Promise.all([1,2,3].map(()=>db!.sql`INSERT INTO mint_stack_runs(context,run_id,payment_id,player_key,wallet_address,nickname,network,score,lines,level,pieces,fours,ticks,created_at) VALUES('local','stack-one','stack-payment','browser-stack-123456','0xabc','Player','arc',200,2,1,8,0,100,'2026-10-14T12:01:00Z') ON CONFLICT DO NOTHING RETURNING run_id`));
    assert.equal(inserts.filter(r=>r.length).length,1);
    const replacement=await db.sql`INSERT INTO mint_stack_runs(context,run_id,payment_id,player_key,wallet_address,nickname,network,score,lines,level,pieces,fours,ticks) VALUES('local','stack-two','stack-payment','browser-stack-123456','0xabc','Player','arc',9999,99,10,100,0,100) ON CONFLICT DO NOTHING RETURNING run_id`;
    assert.equal(replacement.length,0);
    // Source-table recovery also keeps a failed shared-ledger write visible.
    const history=async()=>({results:[],audit:{pilots:[],checkedAt:new Date().toISOString()}});
    const board=await readArcadeLobby(['browser-stack-123456'],true,db,{week:'2026-10-12',now:new Date('2026-10-20'),readLegacy:history});
    assert.equal(board.runs,3);assert.equal(board.profile?.stack,200);assert.equal(board.profile?.invaders,100);assert.equal(board.profile?.points,3000);
    assert.ok(!JSON.stringify(board).includes('0xabc'));
    const admin=await readAdminRewards('2026-10-12',db,history);
    assert.equal(admin.rows[0].flyerGames,1);assert.equal(admin.rows[0].invadersGames,1);assert.equal(admin.rows[0].stackGames,1);assert.equal(admin.rows[0].games,3);
    assert.match(rewardsCsv(admin),/Mint Stack games/);
  }finally{if(db)await db.pool.end();await local.stop();}
});

test('Stack achievements distinguish lifetime totals from single-run milestones',async()=>{
  const {stackAchievements,emptyStackProgress,STACK_ACHIEVEMENTS}=await import('../lib/mint-stack-achievements');
  assert.deepEqual(stackAchievements(emptyStackProgress),[]);
  const earned=stackAchievements({...emptyStackProgress,runs:10,lines:100,bestLines:9,level:2,score:4999,pieces:250,fours:1,networks:2});
  assert.ok(earned.includes('first-drop'));assert.ok(earned.includes('line-miner'));assert.ok(earned.includes('mint-quad'));assert.ok(earned.includes('chain-hopper'));
  assert.ok(!earned.includes('double-digits'));assert.ok(!earned.includes('five-k'));assert.ok(!earned.includes('rising-stack'));
  assert.equal(stackAchievements({runs:10,lines:100,bestLines:40,level:5,score:20000,pieces:250,fours:1,networks:2}).length,STACK_ACHIEVEMENTS.length);
});

test('Stack badges include historical runs across browsers for one wallet and isolate shared browsers and contexts',async()=>{
  const {readStackProfile}=await import('../db/mint-stack-profile');
  const {NetlifyDB}=await import('@netlify/database-dev');const local=new NetlifyDB();let db:ReturnType<typeof getDatabase>|undefined;
  try{
    db=getDatabase({connectionString:await local.start()});await local.applyMigrations('./netlify/database/migrations');
    const add=async(context:string,id:string,key:string,wallet:string,network:string,lines:number,date:string)=>db!.sql`INSERT INTO mint_stack_runs(context,run_id,payment_id,player_key,wallet_address,nickname,network,score,lines,level,pieces,fours,ticks,created_at) VALUES(${context},${id},${id},${key},${wallet},'Player',${network},5000,${lines},2,150,1,100,${date})`;
    await add('local','a','old-browser','wallet-a','arc',6,'2026-10-20T01:00:00Z');
    await add('local','b','shared-browser','wallet-a','robinhood',6,'2026-10-20T02:00:00Z');
    let profile=await readStackProfile(db,'local','shared-browser');
    assert.equal(profile.runs,2);assert.equal(profile.lines,12);assert.equal(profile.bestLines,6);assert.equal(profile.pieces,300);assert.equal(profile.networks,2);
    assert.ok(profile.unlocked.includes('chain-hopper'));assert.ok(profile.unlocked.includes('block-builder'));assert.ok(!profile.unlocked.includes('double-digits'));
    assert.ok(!JSON.stringify(profile).includes('wallet-a'));
    await add('local','c','shared-browser','wallet-b','arc',1,'2026-10-20T03:00:00Z');
    await add('production','d','shared-browser','wallet-b','robinhood',99,'2026-10-20T04:00:00Z');
    profile=await readStackProfile(db,'local','shared-browser');assert.equal(profile.runs,1);assert.equal(profile.lines,1);assert.equal(profile.networks,1);
    assert.equal((await readStackProfile(db,'local','unknown')).unlocked.length,0);
    assert.equal((await readStackProfile(db,'local','old-browser')).runs,2);
  }finally{if(db)await db.pool.end();await local.stop();}
});
