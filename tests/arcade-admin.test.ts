import test from 'node:test';
import assert from 'node:assert/strict';
import {getDatabase} from '@netlify/database';
import {ARCADE_ADMIN_WALLET,isArcadeAdmin,adminCookie,adminToken,adminTokenHash,requireSameOrigin} from '../lib/arcade-admin-auth';
import {createAdminChallenge,consumeAdminChallenge,readAdminSession,deleteAdminSession} from '../db/arcade-admin-session';
import {recordArcadeResult,readArcadeLobby} from '../db/arcade-lobby';
import {readAdminRewards} from '../db/arcade-admin-rewards';
import {rewardsCsv,type AdminRewards} from '../lib/arcade-admin-rewards';
import {GET as privateRewardsGet} from '../app/api/admin/arcade-rewards/route';

test('only the selected F2 administrator is allowed; private cookies and CSRF are enforced',()=>{
 assert.equal(isArcadeAdmin(ARCADE_ADMIN_WALLET.toLowerCase()),true);
 assert.equal(isArcadeAdmin('0x90f9c1c0c675A0ce9D539c540DB7F4A1f7e583AE'),false);
 assert.equal(isArcadeAdmin(''),false);
 const token='a'.repeat(43),cookie=adminCookie(token);
 assert.match(cookie,/HttpOnly; Secure; SameSite=Strict/);
 assert.equal(adminToken(new Request('https://example.com',{headers:{cookie}})),token);
 assert.notEqual(adminTokenHash(token),token);
 assert.throws(()=>requireSameOrigin(new Request('https://example.com',{headers:{origin:'https://evil.example'}})));
 requireSameOrigin(new Request('https://example.com',{headers:{origin:'https://example.com'}}));
});

test('private rewards API rejects unauthenticated requests before loading wallet records',async()=>{
 const response=await privateRewardsGet(new Request('https://example.com/api/admin/arcade-rewards'));
 assert.equal(response.status,401);assert.equal(response.headers.get('Cache-Control'),'private, no-store');
 const text=await response.text();assert.doesNotMatch(text,/wallet|0x/);
});

test('admin sign-in requires a valid one-use challenge and sessions expire or revoke',async()=>{
 const {NetlifyDB}=await import('@netlify/database-dev');const local=new NetlifyDB();let db:ReturnType<typeof getDatabase>|undefined;
 try{
  db=getDatabase({connectionString:await local.start()});await local.applyMigrations('./netlify/database/migrations');
  await assert.rejects(createAdminChallenge('0x90f9c1c0c675A0ce9D539c540DB7F4A1f7e583AE','arc','https://example.com',db));
  const challenge=await createAdminChallenge(ARCADE_ADMIN_WALLET,'arc','https://example.com',db);
  assert.match(challenge.message,/does not transfer tokens or approve spending/);
  const signature=`0x${'ab'.repeat(86)}`;
  await assert.rejects(consumeAdminChallenge(challenge.nonce,signature,'https://evil.example',db,async()=>true));
  await assert.rejects(consumeAdminChallenge(challenge.nonce,signature,'https://example.com',db,async()=>false));
  const attempts=await Promise.allSettled([0,1].map(()=>consumeAdminChallenge(challenge.nonce,signature,'https://example.com',db,async value=>value.wallet===ARCADE_ADMIN_WALLET.toLowerCase()&&value.network==='arc')));
  assert.equal(attempts.filter(value=>value.status==='fulfilled').length,1);
  const token=(attempts.find(value=>value.status==='fulfilled') as PromiseFulfilledResult<string>).value;
  assert.equal(await readAdminSession(token,db),ARCADE_ADMIN_WALLET.toLowerCase());
  assert.equal(await readAdminSession('b'.repeat(43),db),null);
  await db.sql`UPDATE arcade_admin_sessions SET expires_at=NOW()-INTERVAL '1 second' WHERE token_hash=${adminTokenHash(token)}`;
  assert.equal(await readAdminSession(token,db),null);
  await deleteAdminSession(token,db);assert.equal(await readAdminSession(token,db),null);
  const expired=await createAdminChallenge(ARCADE_ADMIN_WALLET,'arc','https://example.com',db);
  await db.sql`UPDATE arcade_admin_challenges SET expires_at=NOW()-INTERVAL '1 second' WHERE nonce=${expired.nonce}::uuid`;
  await assert.rejects(consumeAdminChallenge(expired.nonce,signature,'https://example.com',db,async()=>true));
 }finally{if(db)await db.pool.end();await local.stop();}
});

test('private rewards reveal verified wallets and networks while public rankings stay private',async()=>{
 const {NetlifyDB}=await import('@netlify/database-dev');const local=new NetlifyDB();let db:ReturnType<typeof getDatabase>|undefined;
 try{
  db=getDatabase({connectionString:await local.start()});await local.applyMigrations('./netlify/database/migrations');
  const source={game:'mint-flyer' as const,runId:'first-paid',playerKey:'admin-test-player-1234',walletAddress:ARCADE_ADMIN_WALLET,nickname:'Pilot',score:10,tieBreak:0,createdAt:new Date().toISOString(),network:'arc' as const};
  await recordArcadeResult(source,db);await recordArcadeResult({...source,network:'robinhood',score:99999},db);
  await recordArcadeResult({...source,game:'mint-invaders',runId:'second-paid',network:'robinhood'},db);
  for(let i=1;i<=3;i++)await recordArcadeResult({...source,runId:`tie-${i}`,walletAddress:`0x${String(i).repeat(40)}`,nickname:`Pilot ${i}`},db);
  const publicBoard=await readArcadeLobby([],true,db);assert.equal(JSON.stringify(publicBoard).includes(ARCADE_ADMIN_WALLET.toLowerCase()),false);
  const privateBoard=await readAdminRewards(undefined,db,async()=>null);
  assert.equal(privateBoard.tieReview,true);assert.equal(privateBoard.rows.length,4);
  assert.equal(privateBoard.rows[0].games,2);assert.deepEqual(privateBoard.rows[0].networks,['arc','robinhood']);
  assert.equal(privateBoard.rows[0].wallet,ARCADE_ADMIN_WALLET.toLowerCase());
  assert.equal(privateBoard.rows[0].unknownNetwork,false);
 }finally{if(db)await db.pool.end();await local.stop();}
});

test('CSV does not invent amounts or silently choose a payout network; formula cells are neutralized',()=>{
 const data:AdminRewards={weekStart:'2026-10-12',weekEnd:'2026-10-19',closed:false,tieReview:true,pilots:4,rows:[{id:'pilot',rank:1,nickname:'=HYPERLINK("evil")',wallet:ARCADE_ADMIN_WALLET,games:2,flyerGames:1,invadersGames:1,networks:['arc','robinhood'],unknownNetwork:false}]};
 const csv=rewardsCsv(data);
 assert.match(csv,/'=HYPERLINK/);assert.match(csv,/CONFIRM PAYOUT NETWORK/);assert.match(csv,/TOP THREE TIE REVIEW/);
 assert.doesNotMatch(rewardsCsv(data,{pilot:'arc'}),/CONFIRM PAYOUT NETWORK/);
});
