import { randomUUID } from 'node:crypto';
import { isArcadeAdmin } from '../lib/arcade-admin-auth';
import { questDatabase, questWallet, type QuestDatabase, type QuestScope, type QuestSession } from '../lib/quest-pilot-auth';
import { QuestError, QUEST_POINTS, questAnswers, questCampaignInput, questId, questText, type QuestCampaign, type QuestProgress } from '../lib/quest-pilot-shared';
type Row = Record<string, unknown>;
type Sql = { query: (text: string, values?: unknown[]) => Promise<{ rows: Row[] }> };
const iso = (value: unknown) => value instanceof Date ? value.toISOString() : new Date(String(value)).toISOString();
function administrator(actor: QuestSession) {
  if (!isArcadeAdmin(actor.wallet)) throw new QuestError('Administrator access is required.', 403);
}
async function transaction<T>(db: QuestDatabase, work: (sql: Sql) => Promise<T>): Promise<T> {
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    await client.query("SET LOCAL statement_timeout = '10s'");
    await client.query("SET LOCAL lock_timeout = '5s'");
    const value = await work({ query: (text, values) => client.query(text, values) });
    await client.query('COMMIT');
    return value;
  } catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
}
async function audit(sql: Sql, scope: QuestScope, campaign: string, actor: string, action: string, details: Record<string, unknown> = {}) {
  await sql.query('INSERT INTO quest_audit(scope,id,campaign_id,actor,action,details) VALUES($1,$2,$3,$4,$5,$6::jsonb)', [scope.key, randomUUID(), campaign, actor, action, JSON.stringify(details)]);
}
function campaign(row: Row): QuestCampaign {
  return { id: String(row.id), title: String(row.title), summary: String(row.summary), network: row.network as QuestCampaign['network'], status: row.status as QuestCampaign['status'], startsAt: iso(row.starts_at), endsAt: iso(row.ends_at), reviewEndsAt: iso(row.review_ends_at), participantCap: Number(row.participant_cap), participants: Number(row.participants ?? 0), canParticipate: row.can_participate === true, termsVersion: 1, rewardKind: 'points_only' };
}
async function lockedCampaign(sql: Sql, scope: QuestScope, id: string) {
  const result = await sql.query('SELECT * FROM quest_campaigns WHERE scope=$1 AND id=$2 FOR UPDATE', [scope.key, id]);
  if (!result.rows[0]) throw new QuestError('Campaign not found.', 404);
  // Sample the clock after any lock wait, not at transaction start.
  const time = await sql.query('SELECT clock_timestamp() AS now');
  return { row: result.rows[0], now: Date.parse(iso(time.rows[0].now)) };
}
function requireWindow(row: Row, now: number, actor: QuestSession) {
  if (row.network !== actor.network) throw new QuestError('Sign in on the campaign network before participating.', 409);
  if (row.status !== 'open' || now < Date.parse(iso(row.starts_at)) || now >= Date.parse(iso(row.ends_at))) throw new QuestError('This campaign is not accepting participation.', 409);
}
async function member(sql: Sql, scope: QuestScope, id: string, actor: QuestSession) {
  const result = await sql.query('SELECT * FROM quest_members WHERE scope=$1 AND campaign_id=$2 AND wallet=$3 FOR UPDATE', [scope.key, id, actor.wallet]);
  if (!result.rows[0]) throw new QuestError('Join the campaign and accept its rules first.', 409);
  return result.rows[0];
}
export async function listQuestCampaigns(scope: QuestScope, db = questDatabase(), includeDraft = false) {
  const result = await db.pool.query(`SELECT c.*, (SELECT COUNT(*)::int FROM quest_members m WHERE m.scope=c.scope AND m.campaign_id=c.id) AS participants,
    (c.status='open' AND c.starts_at<=clock_timestamp() AND c.ends_at>clock_timestamp()) AS can_participate
    FROM quest_campaigns c WHERE c.scope=$1 AND ($2::boolean OR c.status<>'draft') ORDER BY c.created_at DESC LIMIT 101`, [scope.key, includeDraft]);
  return { campaigns: result.rows.slice(0, 100).map(campaign), hasMore: result.rows.length > 100 };
}
export async function createQuestCampaign(scope: QuestScope, actor: QuestSession, value: Record<string, unknown>, db = questDatabase()) {
  administrator(actor);
  const input = questCampaignInput(value), id = questId(value.requestId);
  return transaction(db, async sql => {
    const result = await sql.query(`INSERT INTO quest_campaigns(scope,id,title,summary,network,starts_at,ends_at,review_ends_at,participant_cap,created_by)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT(scope,id) DO NOTHING RETURNING *`, [scope.key, id, input.title, input.summary, input.network, input.startsAt, input.endsAt, input.reviewEndsAt, input.participantCap, actor.wallet]);
    if (!result.rows.length) {
      const prior = await sql.query('SELECT * FROM quest_campaigns WHERE scope=$1 AND id=$2', [scope.key, id]);
      const p = campaign(prior.rows[0]);
      if (p.title !== input.title || p.summary !== input.summary || p.network !== input.network || p.startsAt !== input.startsAt || p.endsAt !== input.endsAt || p.reviewEndsAt !== input.reviewEndsAt || p.participantCap !== input.participantCap) throw new QuestError('This request identifier was already used for a different draft.', 409);
      return { campaign: p };
    }
    await audit(sql, scope, id, actor.wallet, 'campaign_created', { termsVersion: 1, rewardKind: 'points_only' });
    return { campaign: campaign(result.rows[0]) };
  });
}
export async function changeQuestCampaign(scope: QuestScope, actor: QuestSession, idInput: unknown, action: 'publish' | 'close', db = questDatabase()) {
  administrator(actor); const id = questId(idInput);
  return transaction(db, async sql => {
    const { row, now } = await lockedCampaign(sql, scope, id);
    if (action === 'publish' && row.status === 'open' || action === 'close' && row.status === 'closed') return { changed: false };
    if (action === 'publish' && (row.status !== 'draft' || now >= Date.parse(iso(row.ends_at)))) throw new QuestError('Only a draft whose end time is still ahead can be published.', 409);
    await sql.query('UPDATE quest_campaigns SET status=$3 WHERE scope=$1 AND id=$2', [scope.key, id, action === 'publish' ? 'open' : 'closed']);
    await audit(sql, scope, id, actor.wallet, action === 'publish' ? 'campaign_published' : 'campaign_closed');
    return { changed: true };
  });
}
export async function joinQuestCampaign(scope: QuestScope, actor: QuestSession, idInput: unknown, accepted: unknown, db = questDatabase()) {
  const id = questId(idInput);
  if (accepted !== 1) throw new QuestError('Accept the published points-only rules before joining.');
  return transaction(db, async sql => {
    const { row, now } = await lockedCampaign(sql, scope, id);
    if (row.network !== actor.network) throw new QuestError('Sign in on the campaign network.', 409);
    const prior = await sql.query('SELECT wallet FROM quest_members WHERE scope=$1 AND campaign_id=$2 AND wallet=$3', [scope.key, id, actor.wallet]);
    if (prior.rows.length) return { joined: true };
    requireWindow(row, now, actor);
    const count = await sql.query('SELECT COUNT(*)::int AS count FROM quest_members WHERE scope=$1 AND campaign_id=$2', [scope.key, id]);
    if (Number(count.rows[0].count) >= Number(row.participant_cap)) throw new QuestError('This campaign has reached its participant cap.', 409);
    await sql.query('INSERT INTO quest_members(scope,campaign_id,wallet,accepted_terms) VALUES($1,$2,$3,1)', [scope.key, id, actor.wallet]);
    await audit(sql, scope, id, actor.wallet, 'joined', { termsVersion: 1 });
    return { joined: true };
  });
}
export async function submitQuestQuiz(scope: QuestScope, actor: QuestSession, idInput: unknown, answerInput: unknown, db = questDatabase()) {
  const id = questId(idInput), answers = questAnswers(answerInput);
  return transaction(db, async sql => {
    const { row, now } = await lockedCampaign(sql, scope, id); requireWindow(row, now, actor);
    const participation = await member(sql, scope, id, actor);
    const prior = await sql.query("SELECT status FROM quest_submissions WHERE scope=$1 AND campaign_id=$2 AND wallet=$3 AND task='quiz'", [scope.key, id, actor.wallet]);
    if (prior.rows.length) return { passed: true, alreadyCompleted: true };
    const attempts = Number(participation.quiz_attempts);
    if (attempts >= 5) throw new QuestError('All five quiz attempts have been used.', 409);
    if (participation.quiz_last_at && now - Date.parse(iso(participation.quiz_last_at)) < 30000) throw new QuestError('Wait 30 seconds before another quiz attempt.', 429);
    // Answer key stays in this server-only database module, never in browser props.
    const passed = answers.every((answer, i) => answer === [1, 2, 0][i]);
    await sql.query('UPDATE quest_members SET quiz_attempts=quiz_attempts+1,quiz_last_at=clock_timestamp() WHERE scope=$1 AND campaign_id=$2 AND wallet=$3', [scope.key, id, actor.wallet]);
    if (passed) {
      await sql.query("INSERT INTO quest_submissions(scope,campaign_id,wallet,task,status,reason,reviewed_at) VALUES($1,$2,$3,'quiz','approved','Server-checked quiz.',clock_timestamp())", [scope.key, id, actor.wallet]);
      await sql.query("INSERT INTO quest_points(scope,campaign_id,wallet,task,points) VALUES($1,$2,$3,'quiz',$4) ON CONFLICT DO NOTHING", [scope.key, id, actor.wallet, QUEST_POINTS.quiz]);
    }
    await audit(sql, scope, id, actor.wallet, passed ? 'quiz_approved' : 'quiz_attempt', { attempt: attempts + 1 });
    return { passed, attemptsRemaining: 4 - attempts };
  });
}
export async function submitQuestContribution(scope: QuestScope, actor: QuestSession, idInput: unknown, contentInput: unknown, db = questDatabase()) {
  const id = questId(idInput), content = questText(contentInput, 80, 2000, 'Contribution');
  return transaction(db, async sql => {
    const { row, now } = await lockedCampaign(sql, scope, id); requireWindow(row, now, actor);
    await member(sql, scope, id, actor);
    const prior = await sql.query("SELECT content,status FROM quest_submissions WHERE scope=$1 AND campaign_id=$2 AND wallet=$3 AND task='contribution'", [scope.key, id, actor.wallet]);
    if (prior.rows.length) {
      if (prior.rows[0].content !== content) throw new QuestError('Only one contribution may be submitted in this pilot.', 409);
      return { status: String(prior.rows[0].status) };
    }
    await sql.query("INSERT INTO quest_submissions(scope,campaign_id,wallet,task,status,content) VALUES($1,$2,$3,'contribution','pending',$4)", [scope.key, id, actor.wallet, content]);
    await audit(sql, scope, id, actor.wallet, 'contribution_submitted');
    return { status: 'pending' };
  });
}
export async function reviewQuestContribution(scope: QuestScope, actor: QuestSession, idInput: unknown, walletInput: unknown, decision: unknown, reasonInput: unknown, db = questDatabase()) {
  administrator(actor);
  const id = questId(idInput), wallet = questWallet(walletInput), reason = questText(reasonInput, 5, 500, 'Review reason');
  if (decision !== 'approved' && decision !== 'rejected') throw new QuestError('Choose approve or reject.');
  if (wallet === actor.wallet) throw new QuestError('An administrator cannot review their own contribution.', 403);
  return transaction(db, async sql => {
    const { row, now } = await lockedCampaign(sql, scope, id);
    if (row.status === 'draft' || now >= Date.parse(iso(row.review_ends_at))) throw new QuestError('This campaign is not accepting reviews.', 409);
    const result = await sql.query("SELECT status FROM quest_submissions WHERE scope=$1 AND campaign_id=$2 AND wallet=$3 AND task='contribution' FOR UPDATE", [scope.key, id, wallet]);
    if (!result.rows[0]) throw new QuestError('Submission not found.', 404);
    if (result.rows[0].status === decision) return { status: decision, changed: false };
    if (result.rows[0].status !== 'pending') throw new QuestError('This submission already has a final decision.', 409);
    await sql.query("UPDATE quest_submissions SET status=$4,reason=$5,reviewer=$6,reviewed_at=clock_timestamp() WHERE scope=$1 AND campaign_id=$2 AND wallet=$3 AND task='contribution'", [scope.key, id, wallet, decision, reason, actor.wallet]);
    if (decision === 'approved') await sql.query("INSERT INTO quest_points(scope,campaign_id,wallet,task,points) VALUES($1,$2,$3,'contribution',$4) ON CONFLICT DO NOTHING", [scope.key, id, wallet, QUEST_POINTS.contribution]);
    await audit(sql, scope, id, actor.wallet, `contribution_${decision}`, { wallet, reason });
    return { status: decision, changed: true };
  });
}
export async function readQuestProgress(scope: QuestScope, actor: QuestSession, db = questDatabase()) {
  const result = await db.pool.query(`SELECT m.*,c.title,c.network,
    COALESCE((SELECT SUM(p.points)::int FROM quest_points p WHERE p.scope=m.scope AND p.campaign_id=m.campaign_id AND p.wallet=m.wallet),0) AS points,
    COALESCE((SELECT jsonb_agg(jsonb_build_object('task',s.task,'status',s.status,'reason',s.reason,'submittedAt',s.submitted_at) ORDER BY s.task) FROM quest_submissions s WHERE s.scope=m.scope AND s.campaign_id=m.campaign_id AND s.wallet=m.wallet),'[]'::jsonb) AS tasks
    FROM quest_members m JOIN quest_campaigns c ON c.scope=m.scope AND c.id=m.campaign_id WHERE m.scope=$1 AND m.wallet=$2 AND c.network=$3 ORDER BY m.joined_at DESC LIMIT 101`, [scope.key, actor.wallet, actor.network]);
  const total = await db.pool.query('SELECT COALESCE(SUM(p.points),0)::int AS points FROM quest_points p JOIN quest_campaigns c ON c.scope=p.scope AND c.id=p.campaign_id WHERE p.scope=$1 AND p.wallet=$2 AND c.network=$3', [scope.key, actor.wallet, actor.network]);
  const progress: QuestProgress[] = result.rows.slice(0, 100).map(row => ({ campaignId: String(row.campaign_id), title: String(row.title), network: row.network, joinedAt: iso(row.joined_at), quizAttempts: Number(row.quiz_attempts), points: Number(row.points), tasks: row.tasks }));
  return { progress, totalPoints: Number(total.rows[0].points), hasMore: result.rows.length > 100 };
}
export async function readQuestAdministration(scope: QuestScope, actor: QuestSession, db = questDatabase()) {
  administrator(actor);
  const directory = await listQuestCampaigns(scope, db, true);
  const result = await db.pool.query(`SELECT s.campaign_id,s.wallet,s.content,s.submitted_at,c.title,c.network,c.review_ends_at,(c.review_ends_at>clock_timestamp()) AS reviewable
    FROM quest_submissions s JOIN quest_campaigns c ON c.scope=s.scope AND c.id=s.campaign_id
    WHERE s.scope=$1 AND s.task='contribution' AND s.status='pending'
    ORDER BY (c.review_ends_at>clock_timestamp()) DESC,s.submitted_at ASC LIMIT 101`, [scope.key]);
  return { ...directory, submissions: result.rows.slice(0, 100).map(row => ({ campaignId: row.campaign_id, wallet: row.wallet, content: row.content, submittedAt: iso(row.submitted_at), title: row.title, network: row.network, reviewEndsAt: iso(row.review_ends_at), reviewable: row.reviewable })), moreSubmissions: result.rows.length > 100 };
}
