import { isArcadeAdmin } from './arcade-admin-auth';
import { paymentNetworkConfig } from './mss2-payment';
import { QuestError } from './quest-pilot-shared';
import { QUEST_BIND_COOKIE, QUEST_SESSION_COOKIE, consumeQuestChallenge, createQuestChallenge, questBody, questCookie, questCsrf, questDatabase, questHeaders, questRate, questScope, questToken, readQuestCookie, readQuestSession, requireQuestCsrf, requireQuestOrigin, revokeQuestSession } from './quest-pilot-auth';
import { changeQuestCampaign, createQuestCampaign, joinQuestCampaign, listQuestCampaigns, readQuestAdministration, readQuestProgress, reviewQuestContribution, submitQuestContribution, submitQuestQuiz } from '../db/quest-pilot';
type Area = 'directory' | 'session' | 'profile' | 'actions' | 'admin';
function reply(value: unknown, status = 200, cookies: string[] = []) {
  const headers = new Headers(questHeaders);
  for (const cookie of cookies) headers.append('Set-Cookie', cookie);
  return Response.json(value, { status, headers });
}
export async function questApi(request: Request, area: Area): Promise<Response> {
  try {
    const scope = questScope();
    if (!scope) return area === 'directory' || area === 'session' ? reply({ enabled: false, authenticated: false, campaigns: [] }) : reply({ error: 'Quest participation is not enabled.' }, 503);
    if (request.method !== 'GET') requireQuestOrigin(request, scope);
    const token = readQuestCookie(request, QUEST_SESSION_COOKIE);
    if (area === 'directory' && request.method === 'GET') {
      const networks = (['arc', 'robinhood'] as const).map(network => { const config = paymentNetworkConfig(network); return { id: network, name: config.name, chainHex: config.chainHex }; });
      return reply({ enabled: true, networks, ...await listQuestCampaigns(scope) });
    }
    if (area === 'session') {
      if (request.method === 'GET') {
        const actor = await readQuestSession(scope, token);
        return reply({ enabled: true, authenticated: !!actor, identity: actor ? { ...actor, admin: isArcadeAdmin(actor.wallet), csrf: questCsrf(token) } : null });
      }
      if (request.method === 'DELETE') {
        requireQuestCsrf(request, token);
        await revokeQuestSession(scope, token);
        return reply({ authenticated: false }, 200, [questCookie(QUEST_SESSION_COOKIE, '', 0), questCookie(QUEST_BIND_COOKIE, '', 0)]);
      }
      const body = await questBody(request);
      if (body.action === 'challenge') {
        const binding = questToken();
        const challenge = await createQuestChallenge(scope, body.wallet, body.network, binding);
        return reply(challenge, 200, [questCookie(QUEST_BIND_COOKIE, binding, 300)]);
      }
      if (body.action === 'verify') {
        const newToken = await consumeQuestChallenge(scope, body.nonce, body.signature, readQuestCookie(request, QUEST_BIND_COOKIE));
        await revokeQuestSession(scope, token);
        return reply({ authenticated: true }, 200, [questCookie(QUEST_SESSION_COOKIE, newToken, 900), questCookie(QUEST_BIND_COOKIE, '', 0)]);
      }
      throw new QuestError('Unknown sign-in action.');
    }
    const actor = await readQuestSession(scope, token);
    if (!actor) throw new QuestError('Sign in to Quests with your wallet first.', 401);
    if (area === 'profile' && request.method === 'GET') return reply(await readQuestProgress(scope, actor));
    if (area === 'admin' && !isArcadeAdmin(actor.wallet)) throw new QuestError('Administrator access is required.', 403);
    if (area === 'admin' && request.method === 'GET') return reply(await readQuestAdministration(scope, actor));
    requireQuestCsrf(request, token);
    const body = await questBody(request);
    if (typeof body.expectedWallet !== 'string' || body.expectedWallet.toLowerCase() !== actor.wallet || body.expectedNetwork !== actor.network) throw new QuestError('Your wallet or network changed. Sign in again.', 409);
    await questRate(questDatabase(), scope, `action:${actor.wallet}`, 30);
    if (area === 'actions') {
      if (body.action === 'join') return reply(await joinQuestCampaign(scope, actor, body.campaignId, body.acceptedTerms));
      if (body.action === 'quiz') return reply(await submitQuestQuiz(scope, actor, body.campaignId, body.answers));
      if (body.action === 'contribution') return reply(await submitQuestContribution(scope, actor, body.campaignId, body.content));
    }
    if (area === 'admin') {
      if (body.action === 'create') return reply(await createQuestCampaign(scope, actor, body));
      if (body.action === 'publish' || body.action === 'close') return reply(await changeQuestCampaign(scope, actor, body.campaignId, body.action));
      if (body.action === 'review') return reply(await reviewQuestContribution(scope, actor, body.campaignId, body.wallet, body.decision, body.reason));
    }
    throw new QuestError('Unknown quest action.');
  } catch (error) {
    return reply({ error: error instanceof QuestError ? error.message : 'Quest service is temporarily unavailable. Retry without signing a transaction.' }, error instanceof QuestError ? error.status : 503);
  }
}
