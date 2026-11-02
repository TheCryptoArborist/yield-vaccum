import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { verifyMessage } from 'viem';
import { parseSiweMessage } from 'viem/siwe';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { ARCADE_ADMIN_WALLET } from '../lib/arcade-admin-auth';
import { QuestError, questAnswers, questCampaignInput, questId, questNetwork, QUEST_PILOT_TERMS } from '../lib/quest-pilot-shared';
import { QUEST_SESSION_COOKIE, createQuestChallenge, consumeQuestChallenge, questBody, questCookie, questCsrf, questDatabase, questHash, questRate, questScope, questToken, readQuestCookie, readQuestSession, requireQuestCsrf, requireQuestOrigin, revokeQuestSession, type QuestScope, type QuestSession } from '../lib/quest-pilot-auth';
import { questApi } from '../lib/quest-pilot-api';
import { changeQuestCampaign, createQuestCampaign, joinQuestCampaign, listQuestCampaigns, readQuestAdministration, readQuestProgress, reviewQuestContribution, submitQuestContribution, submitQuestQuiz } from '../db/quest-pilot';
import { startQuestTestDatabase } from './quest-test-database';
const origin = 'https://quests.example';
const scope = (): QuestScope => ({ origin, key: `test-${randomUUID()}` });
const actor = (digit: string, network: 'arc' | 'robinhood' = 'arc'): QuestSession => ({ wallet: `0x${digit.repeat(40)}`, network, expiresAt: new Date(Date.now() + 900000).toISOString() });
const admin: QuestSession = { wallet: ARCADE_ADMIN_WALLET.toLowerCase(), network: 'arc', expiresAt: '2099-01-01T00:00:00Z' };
const alice = actor('1'), bob = actor('2');
const contribution = 'An original improvement suggestion: explain the selected network beside every quest action and show task approval separately from points so newcomers can understand their current status.';
const input = (extra: Record<string, unknown> = {}) => ({ requestId: randomUUID(), title: 'Community onboarding pilot', summary: 'Learn how the points-only quest pilot works and contribute a useful community improvement.', network: 'arc', startsAt: new Date(Date.now() - 60000).toISOString(), endsAt: new Date(Date.now() + 3600000).toISOString(), reviewEndsAt: new Date(Date.now() + 86400000).toISOString(), participantCap: 100, ...extra });
function environment(values: Record<string, string | undefined>) {
  const saved = Object.fromEntries(Object.keys(values).map(key => [key, process.env[key]]));
  for (const [key, value] of Object.entries(values)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
  return () => { for (const [key, value] of Object.entries(saved)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; } };
}
async function allSuccessful(promises: Promise<unknown>[]) {
  const results = await Promise.allSettled(promises);
  for (const result of results) if (result.status === 'rejected') throw result.reason;
}
test('pilot input rejects token budgets, bad IDs, unknown chains, malformed answers and impossible windows', () => {
  assert.equal(questCampaignInput(input()).network, 'arc');
  for (const bad of [{ rewardKind: 'token' }, { rewardBudget: 1000 }, { participantCap: 0 }, { participantCap: 1.5 }, { participantCap: 1001 }, { network: 'ethereum' }, { endsAt: 'invalid' }, { reviewEndsAt: '2020-01-01T00:00:00Z' }]) assert.throws(() => questCampaignInput(input(bad)), QuestError);
  assert.throws(() => questId('../../admin')); assert.throws(() => questNetwork('other'));
  for (const answers of [[], [1, 2], [1, 2, 3], [1, -1, 0], ['1', 2, 0], { 0: 1 }]) assert.throws(() => questAnswers(answers));
  assert.deepEqual(questAnswers([1, 2, 0]), [1, 2, 0]);
  assert.match(QUEST_PILOT_TERMS, /no MSS2 payments/); assert.match(QUEST_PILOT_TERMS, /five attempts/);
});
test('origin configuration is explicit, HTTPS-only and isolated across deployments', () => {
  const restore = environment({ MSS2_QUESTS_ENABLED: undefined, MSS2_QUESTS_ORIGIN: origin, CONTEXT: 'dev' });
  try {
    assert.equal(questScope(), null); process.env.MSS2_QUESTS_ENABLED = 'true';
    const dev = questScope()!; assert.equal(dev.origin, origin);
    process.env.CONTEXT = 'deploy-preview'; assert.notEqual(questScope()!.key, dev.key);
    process.env.MSS2_QUESTS_ORIGIN = 'http://quests.example'; assert.throws(() => questScope());
    process.env.MSS2_QUESTS_ORIGIN = `${origin}/quests`; assert.throws(() => questScope());
    process.env.MSS2_QUESTS_ORIGIN = origin; process.env.CONTEXT = 'production'; assert.throws(() => questScope());
    process.env.MSS2_QUESTS_ORIGIN = 'https://yieldvaccum.xyz'; assert.equal(questScope()!.origin, 'https://yieldvaccum.xyz');
  } finally { restore(); }
});
test('cookies are host-only, private and secure; CSRF and foreign origins fail closed', () => {
  const token = questToken(), cookie = questCookie(QUEST_SESSION_COOKIE, token, 900);
  assert.match(cookie, /Path=\/; HttpOnly; Secure; SameSite=Strict; Max-Age=900/); assert.doesNotMatch(cookie, /Domain=/);
  assert.equal(readQuestCookie(new Request(origin, { headers: { cookie } }), QUEST_SESSION_COOKIE), token);
  assert.equal(readQuestCookie(new Request(origin, { headers: { cookie: `${QUEST_SESSION_COOKIE}=bad` } }), QUEST_SESSION_COOKIE), '');
  const request = new Request(origin, { headers: { origin, 'x-quest-csrf': questCsrf(token) } });
  requireQuestOrigin(request, scope()); requireQuestCsrf(request, token);
  assert.throws(() => requireQuestCsrf(request, questToken()));
  assert.throws(() => requireQuestOrigin(new Request(origin, { headers: { origin: 'https://evil.example', 'x-forwarded-host': 'quests.example' } }), scope()));
  assert.throws(() => requireQuestOrigin(new Request(origin), scope()));
  assert.notEqual(questHash(token), token); assert.notEqual(questCsrf(token), questHash(token));
});
test('API is disabled by default and rejects anonymous or cross-origin mutations before database work', async () => {
  const restore = environment({ MSS2_QUESTS_ENABLED: undefined, MSS2_QUESTS_ORIGIN: origin, CONTEXT: 'dev' });
  try {
    const disabled = await questApi(new Request(`${origin}/api/quests`), 'directory');
    assert.equal((await disabled.json()).enabled, false);
    assert.equal((await questApi(new Request(`${origin}/api/quests/profile`), 'profile')).status, 503);
    process.env.MSS2_QUESTS_ENABLED = 'true';
    assert.equal((await questApi(new Request(`${origin}/api/quests/profile`), 'profile')).status, 401);
    assert.equal((await questApi(new Request(`${origin}/api/quests/admin`), 'admin')).status, 401);
    const forged = new Request(`${origin}/api/quests/admin`, { method: 'POST', headers: { origin, 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'publish', wallet: admin.wallet, admin: true }) });
    assert.equal((await questApi(forged, 'admin')).status, 401);
    const hostile = new Request(`${origin}/api/quests/session`, { method: 'POST', headers: { origin: 'https://evil.example' } });
    assert.equal((await questApi(hostile, 'session')).status, 403);
  } finally { restore(); }
});
test('JSON bodies are size-bounded and reject arrays and unsupported media types', async () => {
  const request = (body: string, type = 'application/json') => new Request(origin, { method: 'POST', headers: { 'Content-Type': type }, body });
  assert.deepEqual(await questBody(request('{"action":"join"}')), { action: 'join' });
  await assert.rejects(questBody(request('[]'))); await assert.rejects(questBody(request('{')));
  await assert.rejects(questBody(request('{}', 'text/plain')));
  await assert.rejects(questBody(request(JSON.stringify({ content: 'x'.repeat(25000) }))), (error: unknown) => error instanceof QuestError && error.status === 413);
});
test('pilot client has no token transfer path and binds actions to the current signed-in wallet', () => {
  const code = readFileSync('app/quests/pilot-panel.tsx', 'utf8');
  assert.doesNotMatch(code, /sendTransaction|sendCalls|eth_sendTransaction|localStorage|dangerouslySetInnerHTML/);
  assert.match(code, /wallet\.signMessage\(challenge\.message\)/);
  assert.match(code, /expectedWallet: signed\.wallet/); assert.match(code, /expectedNetwork: signed\.network/);
  assert.match(code, /onConnectionChange=\{changed\}/); assert.match(code, /signInAbort\.current\?\.abort\(\)/);
  assert.match(code, /await revocation\.current/);
  assert.doesNotMatch(readFileSync('lib/quest-pilot-shared.ts', 'utf8'), /\[1, 2, 0\]/);
});
test('quest pilot PostgreSQL authentication, lifecycle, points and API authorization', async t => {
  const harness = await startQuestTestDatabase();
  const database = harness.db, connectionString = harness.connectionString;
  let apiPoolUsed = false; let restore = () => {};
  t.diagnostic(harness.concurrentTransactions ? 'Full PostgreSQL: concurrent pooled connections.' : 'Local single-backend fallback: serialized connections; not concurrency validation.');
  try {
    const published = async (s: QuestScope, extra: Record<string, unknown> = {}) => {
      const created = await createQuestCampaign(s, admin, input(extra), database);
      await changeQuestCampaign(s, admin, created.campaign.id, 'publish', database); return created.campaign.id;
    };
    await t.test('real EOA signature verifies exact SIWE, browser binding, scope and one-use consumption', async () => {
      const s = scope(), signer = privateKeyToAccount(generatePrivateKey()), binding = questToken();
      const challenge = await createQuestChallenge(s, signer.address, 'arc', binding, database);
      const parsed = parseSiweMessage(challenge.message);
      assert.equal(parsed.domain, 'quests.example'); assert.equal(parsed.uri, `${origin}/quests`); assert.equal(parsed.nonce, challenge.nonce);
      assert.match(challenge.message, /No token transfer or spending approval/);
      const signature = await signer.signMessage({ message: challenge.message });
      const verify = async (value: { wallet: string; message: string }, sig: `0x${string}`) => verifyMessage({ address: value.wallet as `0x${string}`, message: value.message, signature: sig });
      await assert.rejects(consumeQuestChallenge(s, challenge.nonce, signature, questToken(), database, verify));
      await assert.rejects(consumeQuestChallenge(scope(), challenge.nonce, signature, binding, database, verify));
      const results = await Promise.allSettled([0, 1].map(() => consumeQuestChallenge(s, challenge.nonce, signature, binding, database, verify)));
      assert.equal(results.filter(item => item.status === 'fulfilled').length, 1);
      const token = (results.find(item => item.status === 'fulfilled') as PromiseFulfilledResult<string>).value;
      assert.equal((await readQuestSession(s, token, database))?.wallet, signer.address.toLowerCase());
      assert.equal(await readQuestSession(scope(), token, database), null);
      await revokeQuestSession(s, token, database); assert.equal(await readQuestSession(s, token, database), null);
    });
    await t.test('bad signatures consume the nonce; challenge and session expiry are enforced', async () => {
      const s = scope(), binding = questToken(), signature = `0x${'ab'.repeat(65)}`;
      const challenge = await createQuestChallenge(s, alice.wallet, 'arc', binding, database);
      await assert.rejects(consumeQuestChallenge(s, challenge.nonce, signature, binding, database, async () => false));
      await assert.rejects(consumeQuestChallenge(s, challenge.nonce, signature, binding, database, async () => true));
      const expired = await createQuestChallenge(s, alice.wallet, 'arc', binding, database);
      await database.pool.query("UPDATE quest_challenges SET expires_at=NOW()-INTERVAL '1 second' WHERE scope=$1 AND nonce=$2", [s.key, expired.nonce]);
      await assert.rejects(consumeQuestChallenge(s, expired.nonce, signature, binding, database, async () => true));
      const fresh = await createQuestChallenge(s, alice.wallet, 'arc', binding, database);
      const token = await consumeQuestChallenge(s, fresh.nonce, signature, binding, database, async () => true);
      await database.pool.query("UPDATE quest_sessions SET expires_at=NOW()-INTERVAL '1 second' WHERE scope=$1", [s.key]);
      assert.equal(await readQuestSession(s, token, database), null);
    });
    await t.test('rate limits are atomic under concurrent requests', async () => {
      const s = scope();
      const results = await Promise.allSettled(Array.from({ length: 10 }, () => questRate(database, s, 'test', 3)));
      assert.equal(results.filter(item => item.status === 'fulfilled').length, 3);
    });
    await t.test('admin-only drafts are private and idempotent; published terms are immutable', async () => {
      const s = scope(), data = input();
      await assert.rejects(createQuestCampaign(s, alice, data, database));
      const first = await createQuestCampaign(s, admin, data, database);
      const retry = await createQuestCampaign(s, admin, data, database);
      assert.equal(first.campaign.id, retry.campaign.id);
      await assert.rejects(createQuestCampaign(s, admin, { ...data, title: 'Different content' }, database));
      assert.equal((await listQuestCampaigns(s, database)).campaigns.length, 0);
      await assert.rejects(changeQuestCampaign(s, admin, first.campaign.id, 'close', database));
      await assert.rejects(joinQuestCampaign(s, alice, first.campaign.id, 1, database));
      await changeQuestCampaign(s, admin, first.campaign.id, 'publish', database);
      assert.equal((await listQuestCampaigns(s, database)).campaigns.length, 1);
      await assert.rejects(database.pool.query('UPDATE quest_campaigns SET title=$3 WHERE scope=$1 AND id=$2', [s.key, first.campaign.id, 'Changed published title']));
      await assert.rejects(database.pool.query('UPDATE quest_campaigns SET participant_cap=999 WHERE scope=$1 AND id=$2', [s.key, first.campaign.id]));
      await assert.rejects(changeQuestCampaign(s, alice, first.campaign.id, 'close', database));
    });
    await t.test('network and terms are required; simultaneous enrollment cannot exceed the cap', async () => {
      const s = scope(), id = await published(s, { participantCap: 2 });
      await assert.rejects(joinQuestCampaign(s, alice, id, 0, database));
      await assert.rejects(joinQuestCampaign(s, { ...alice, network: 'robinhood' }, id, 1, database));
      const joins = await Promise.allSettled(['1', '2', '3', '4', '5'].map(digit => joinQuestCampaign(s, actor(digit), id, 1, database)));
      assert.equal(joins.filter(item => item.status === 'fulfilled').length, 2);
      assert.equal((await listQuestCampaigns(s, database)).campaigns[0].participants, 2);
      const admitted = await database.pool.query('SELECT wallet FROM quest_members WHERE scope=$1 LIMIT 1', [s.key]);
      await joinQuestCampaign(s, { ...alice, wallet: admitted.rows[0].wallet }, id, 1, database);
      assert.equal((await listQuestCampaigns(s, database)).campaigns[0].participants, 2);
      await assert.rejects(joinQuestCampaign(scope(), alice, id, 1, database));
    });
    await t.test('concurrent correct quizzes award exactly once and progress remains network/private', async () => {
      const s = scope(), id = await published(s);
      await assert.rejects(submitQuestQuiz(s, alice, id, [1, 2, 0], database));
      await joinQuestCampaign(s, alice, id, 1, database);
      assert.equal((await submitQuestQuiz(s, alice, id, [0, 0, 0], database)).passed, false);
      await assert.rejects(submitQuestQuiz(s, alice, id, [1, 2, 0], database));
      await database.pool.query("UPDATE quest_members SET quiz_last_at=NOW()-INTERVAL '31 seconds' WHERE scope=$1", [s.key]);
      await allSuccessful([0, 1, 2].map(() => submitQuestQuiz(s, alice, id, [1, 2, 0], database)));
      assert.equal((await readQuestProgress(s, alice, database)).totalPoints, 50);
      assert.equal((await readQuestProgress(s, bob, database)).totalPoints, 0);
      assert.equal((await readQuestProgress(s, { ...alice, network: 'robinhood' }, database)).totalPoints, 0);
      const ledger = await database.pool.query('SELECT COUNT(*)::int AS count FROM quest_points WHERE scope=$1', [s.key]); assert.equal(ledger.rows[0].count, 1);
      await assert.rejects(database.pool.query('UPDATE quest_points SET points=999 WHERE scope=$1', [s.key]));
    });
    await t.test('five incorrect attempts cannot be reset by rejoining', async () => {
      const s = scope(), id = await published(s); await joinQuestCampaign(s, alice, id, 1, database);
      for (let i = 0; i < 5; i++) {
        await database.pool.query("UPDATE quest_members SET quiz_last_at=NOW()-INTERVAL '31 seconds' WHERE scope=$1", [s.key]);
        await submitQuestQuiz(s, alice, id, [0, 0, 0], database);
      }
      await joinQuestCampaign(s, alice, id, 1, database);
      await assert.rejects(submitQuestQuiz(s, alice, id, [1, 2, 0], database));
      assert.equal((await readQuestProgress(s, alice, database)).progress[0].quizAttempts, 5);
      assert.equal((await readQuestProgress(s, alice, database)).totalPoints, 0);
    });
    await t.test('single contribution and concurrent approval cannot duplicate points or audit decisions', async () => {
      const s = scope(), id = await published(s); await joinQuestCampaign(s, alice, id, 1, database);
      await assert.rejects(submitQuestContribution(s, alice, id, 'too short', database));
      await allSuccessful([0, 1].map(() => submitQuestContribution(s, alice, id, contribution, database)));
      await assert.rejects(submitQuestContribution(s, alice, id, `${contribution} New version.`, database));
      assert.equal((await readQuestProgress(s, alice, database)).totalPoints, 0);
      await assert.rejects(reviewQuestContribution(s, bob, id, alice.wallet, 'approved', 'Useful and relevant contribution.', database));
      await assert.rejects(reviewQuestContribution(s, admin, id, admin.wallet, 'approved', 'Reviewing my own work.', database));
      await allSuccessful([0, 1].map(() => reviewQuestContribution(s, admin, id, alice.wallet, 'approved', 'Original, relevant and useful improvement.', database)));
      assert.equal((await readQuestProgress(s, alice, database)).totalPoints, 100);
      await assert.rejects(reviewQuestContribution(s, admin, id, alice.wallet, 'rejected', 'Changed my decision.', database));
      assert.equal((await readQuestAdministration(s, admin, database)).submissions.length, 0);
      const audit = await database.pool.query("SELECT COUNT(*)::int AS count FROM quest_audit WHERE scope=$1 AND action='contribution_approved'", [s.key]); assert.equal(audit.rows[0].count, 1);
    });
    await t.test('rejection retains the reason and awards nothing; private review data requires admin', async () => {
      const s = scope(), id = await published(s); await joinQuestCampaign(s, bob, id, 1, database);
      await submitQuestContribution(s, bob, id, contribution, database);
      await assert.rejects(readQuestAdministration(s, alice, database));
      await reviewQuestContribution(s, admin, id, bob.wallet, 'rejected', 'This duplicates an existing suggestion without adding detail.', database);
      const progress = await readQuestProgress(s, bob, database);
      assert.equal(progress.totalPoints, 0); assert.equal(progress.progress[0].tasks[0].status, 'rejected'); assert.match(progress.progress[0].tasks[0].reason, /duplicates/);
    });
    await t.test('closure stops entries/tasks without deleting history or blocking timely reviews', async () => {
      const s = scope(), id = await published(s); await joinQuestCampaign(s, alice, id, 1, database);
      await submitQuestContribution(s, alice, id, contribution, database);
      await changeQuestCampaign(s, admin, id, 'close', database);
      await assert.rejects(joinQuestCampaign(s, bob, id, 1, database));
      await assert.rejects(submitQuestQuiz(s, alice, id, [1, 2, 0], database));
      await assert.rejects(changeQuestCampaign(s, admin, id, 'publish', database));
      await reviewQuestContribution(s, admin, id, alice.wallet, 'approved', 'Meets the stated contribution criteria.', database);
      assert.equal((await readQuestProgress(s, alice, database)).totalPoints, 100);
    });
    await t.test('future campaigns reject participation and expired deadlines cannot be bypassed', async () => {
      const s = scope();
      const future = await published(s, { startsAt: new Date(Date.now() + 3600000).toISOString(), endsAt: new Date(Date.now() + 7200000).toISOString() });
      await assert.rejects(joinQuestCampaign(s, alice, future, 1, database));
      const past = await createQuestCampaign(s, admin, input({ startsAt: '2020-01-01T00:00:00Z', endsAt: '2020-01-02T00:00:00Z', reviewEndsAt: '2020-01-03T00:00:00Z' }), database);
      await assert.rejects(changeQuestCampaign(s, admin, past.campaign.id, 'publish', database));
      // Historical fixture in the disposable test schema, not a runtime code path.
      await database.pool.query("UPDATE quest_campaigns SET status='closed' WHERE scope=$1 AND id=$2", [s.key, past.campaign.id]);
      await database.pool.query('INSERT INTO quest_members(scope,campaign_id,wallet,accepted_terms) VALUES($1,$2,$3,1)', [s.key, past.campaign.id, alice.wallet]);
      await database.pool.query("INSERT INTO quest_submissions(scope,campaign_id,wallet,task,status,content) VALUES($1,$2,$3,'contribution','pending',$4)", [s.key, past.campaign.id, alice.wallet, contribution]);
      await assert.rejects(reviewQuestContribution(s, admin, past.campaign.id, alice.wallet, 'approved', 'Too late to approve.', database));
      assert.equal((await readQuestProgress(s, alice, database)).totalPoints, 0);
    });
    await t.test('HTTP guards reject forged roles, CSRF, stale wallet/network and arcade cookies', async () => {
      restore = environment({ NETLIFY_DB_URL: connectionString, MSS2_QUESTS_ENABLED: 'true', MSS2_QUESTS_ORIGIN: origin, CONTEXT: 'dev' });
      const s = questScope()!, token = questToken();
      await database.pool.query("INSERT INTO quest_sessions(scope,token_hash,wallet,network,expires_at) VALUES($1,$2,$3,'arc',NOW()+INTERVAL '10 minutes')", [s.key, questHash(token), alice.wallet]);
      const id = await published(s);
      const request = (body: Record<string, unknown>, extra: Record<string, string> = {}) => new Request(`${origin}/api/quests/actions`, { method: 'POST', headers: { origin, 'Content-Type': 'application/json', cookie: `${QUEST_SESSION_COOKIE}=${token}`, 'x-quest-csrf': questCsrf(token), ...extra }, body: JSON.stringify({ expectedWallet: alice.wallet, expectedNetwork: 'arc', ...body }) });
      apiPoolUsed = true;
      assert.equal((await questApi(request({ action: 'publish', campaignId: id, admin: true }), 'admin')).status, 403);
      assert.equal((await questApi(request({ action: 'join', campaignId: id, acceptedTerms: 1 }, { 'x-quest-csrf': 'bad' }), 'actions')).status, 403);
      assert.equal((await questApi(request({ action: 'join', campaignId: id, acceptedTerms: 1, expectedWallet: bob.wallet }), 'actions')).status, 409);
      assert.equal((await questApi(request({ action: 'join', campaignId: id, acceptedTerms: 1, expectedNetwork: 'robinhood' }), 'actions')).status, 409);
      assert.equal((await questApi(request({ action: 'join', campaignId: id, acceptedTerms: 1 }, { cookie: `__Secure-mss2-arcade-admin=${token}` }), 'actions')).status, 401);
      assert.equal((await questApi(request({ action: 'join', campaignId: id, acceptedTerms: 1 }), 'actions')).status, 200);
      const own = await questApi(new Request(`${origin}/api/quests/profile`, { headers: { cookie: `${QUEST_SESSION_COOKIE}=${token}` } }), 'profile');
      assert.equal(own.headers.get('Cache-Control'), 'private, no-store'); assert.equal((await own.json()).progress.length, 1);
      const publicResponse = await questApi(new Request(`${origin}/api/quests`), 'directory'); const publicText = await publicResponse.text();
      assert.doesNotMatch(publicText, new RegExp(alice.wallet)); assert.doesNotMatch(publicText, /binding_hash|token_hash|correctAnswer/);
    });
  } finally {
    if (apiPoolUsed && questDatabase().pool !== database.pool) await questDatabase().pool.end();
    restore(); await harness.stop();
  }
});
