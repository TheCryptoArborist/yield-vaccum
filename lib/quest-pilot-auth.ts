import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { getDatabase } from '@netlify/database';
import { createPublicClient, getAddress, http } from 'viem';
import { createSiweMessage } from 'viem/siwe';
import { deploymentContext } from './deployment-context';
import { isArcadeAdmin } from './arcade-admin-auth';
import { paymentNetworkConfig } from './mss2-payment';
import { QuestError, questNetwork, type QuestNetwork } from './quest-pilot-shared';
export type QuestDatabase = ReturnType<typeof getDatabase>;
export type QuestScope = { origin: string; key: string };
export type QuestSession = { wallet: string; network: QuestNetwork; expiresAt: string };
export const QUEST_SESSION_COOKIE = '__Host-mss2-quest-session';
export const QUEST_BIND_COOKIE = '__Host-mss2-quest-challenge';
export const questHeaders = { 'Cache-Control': 'private, no-store', 'X-Robots-Tag': 'noindex, nofollow', 'Vary': 'Cookie' };
let database: QuestDatabase | undefined;
export const questDatabase = () => database ??= getDatabase({ connectionString: process.env.NETLIFY_DB_URL });
export const questHash = (value: string) => createHash('sha256').update(value).digest('hex');
export const questToken = () => randomBytes(32).toString('base64url');
export function questScope(): QuestScope | null {
  if (process.env.MSS2_QUESTS_ENABLED !== 'true') return null;
  const raw = process.env.MSS2_QUESTS_ORIGIN ?? '';
  let origin: URL;
  try { origin = new URL(raw); } catch { throw new QuestError('Quest participation is not configured yet.', 503); }
  if (origin.protocol !== 'https:' || origin.origin !== raw || (deploymentContext() === 'production' && raw !== 'https://yieldvaccum.xyz')) throw new QuestError('Quest participation is not configured yet.', 503);
  return { origin: raw, key: questHash(`${deploymentContext()}|${raw}`) };
}
export function questCookie(name: string, token: string, maxAge: number) {
  return `${name}=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAge}`;
}
export function readQuestCookie(request: Request, name: string): string {
  const value = (request.headers.get('cookie') ?? '').split(';').map(p => p.trim()).find(p => p.startsWith(`${name}=`))?.slice(name.length + 1) ?? '';
  return /^[A-Za-z0-9_-]{43}$/.test(value) ? value : '';
}
export function requireQuestOrigin(request: Request, scope: QuestScope) {
  if (request.headers.get('origin') !== scope.origin) throw new QuestError('Open Quests on this site and retry.', 403);
}
export const questCsrf = (token: string) => questHash(`quest-csrf:${token}`);
export function requireQuestCsrf(request: Request, token: string) {
  const supplied = request.headers.get('x-quest-csrf') ?? '';
  if (!token || !/^[0-9a-f]{64}$/.test(supplied) || !timingSafeEqual(Buffer.from(supplied), Buffer.from(questCsrf(token)))) throw new QuestError('Refresh your quest session and retry.', 403);
}
export function questWallet(value: unknown) {
  if (typeof value !== 'string' || !/^0x[0-9a-fA-F]{40}$/.test(value)) throw new QuestError('Connect a valid wallet.');
  return getAddress(value.toLowerCase()).toLowerCase();
}
export async function questRate(db: QuestDatabase, scope: QuestScope, key: string, limit: number) {
  const result = await db.pool.query('INSERT INTO quest_rate_limits(scope,key,window,hits) VALUES($1,$2,date_trunc(\'minute\',NOW()),1) ON CONFLICT(scope,key,window) DO UPDATE SET hits=quest_rate_limits.hits+1 RETURNING hits', [scope.key, key]);
  if (Number(result.rows[0].hits) > limit) throw new QuestError('Too many requests. Retry in a minute.', 429);
}
export async function createQuestChallenge(scope: QuestScope, walletInput: unknown, networkInput: unknown, binding: string, db = questDatabase()) {
  const wallet = questWallet(walletInput), network = questNetwork(networkInput);
  if (!/^[A-Za-z0-9_-]{43}$/.test(binding)) throw new QuestError('Invalid browser challenge.');
  await questRate(db, scope, 'challenge:global', 60);
  await questRate(db, scope, `challenge:${wallet}`, 5);
  const nonce = randomBytes(16).toString('hex'), issuedAt = new Date(), expiresAt = new Date(issuedAt.getTime() + 300000);
  const statement = isArcadeAdmin(wallet) ? 'Sign in to MSS2 Quests to manage campaigns and review submissions. No token transfer or spending approval.' : 'Sign in to MSS2 Quests to submit tasks and view private progress. No token transfer or spending approval.';
  const message = createSiweMessage({ address: getAddress(wallet), chainId: paymentNetworkConfig(network).chainId, domain: new URL(scope.origin).host, uri: `${scope.origin}/quests`, version: '1', nonce, issuedAt, expirationTime: expiresAt, statement });
  await db.pool.query('INSERT INTO quest_challenges(scope,nonce,wallet,network,origin,message,binding_hash,expires_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8)', [scope.key, nonce, wallet, network, scope.origin, message, questHash(binding), expiresAt.toISOString()]);
  return { nonce, message, wallet, network, expiresAt: expiresAt.toISOString() };
}
export type QuestChallengeEvidence = { wallet: string; network: QuestNetwork; message: string };
export async function verifyQuestSignature(value: QuestChallengeEvidence, signature: `0x${string}`) {
  const config = paymentNetworkConfig(value.network);
  const client = createPublicClient({ transport: http(config.rpcUrl, { timeout: 12000, retryCount: 0 }) });
  if (await client.getChainId() !== config.chainId) return false;
  return client.verifyMessage({ address: value.wallet as `0x${string}`, message: value.message, signature });
}
export async function consumeQuestChallenge(scope: QuestScope, nonce: unknown, signature: unknown, binding: string, db = questDatabase(), verify = verifyQuestSignature) {
  if (typeof nonce !== 'string' || !/^[0-9a-f]{32}$/.test(nonce) || typeof signature !== 'string' || !/^0x(?:[0-9a-fA-F]{2})+$/.test(signature) || signature.length > 16000 || !/^[A-Za-z0-9_-]{43}$/.test(binding)) throw new QuestError('Invalid sign-in response.', 403);
  await questRate(db, scope, 'verify:global', 120);
  // Claim once BEFORE an RPC call. Invalid signatures also consume the challenge.
  const result = await db.pool.query('UPDATE quest_challenges SET consumed_at=NOW() WHERE scope=$1 AND nonce=$2 AND origin=$3 AND binding_hash=$4 AND consumed_at IS NULL AND expires_at>NOW() RETURNING wallet,network,message', [scope.key, nonce, scope.origin, questHash(binding)]);
  const row = result.rows[0];
  if (!row) throw new QuestError('Sign-in expired or was already used. Request a new signature.', 403);
  const evidence = { wallet: String(row.wallet), network: questNetwork(row.network), message: String(row.message) };
  if (!await verify(evidence, signature as `0x${string}`)) throw new QuestError('The wallet signature could not be verified. Request a new signature.', 403);
  const token = questToken();
  await db.pool.query('INSERT INTO quest_sessions(scope,token_hash,wallet,network,expires_at) VALUES($1,$2,$3,$4,NOW()+INTERVAL \'15 minutes\')', [scope.key, questHash(token), evidence.wallet, evidence.network]);
  return token;
}
export async function readQuestSession(scope: QuestScope, token: string, db?: QuestDatabase): Promise<QuestSession | null> {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
  const result = await (db ?? questDatabase()).pool.query('SELECT wallet,network,expires_at FROM quest_sessions WHERE scope=$1 AND token_hash=$2 AND expires_at>NOW()', [scope.key, questHash(token)]);
  const row = result.rows[0];
  return row ? { wallet: String(row.wallet), network: questNetwork(row.network), expiresAt: new Date(row.expires_at).toISOString() } : null;
}
export async function revokeQuestSession(scope: QuestScope, token: string, db?: QuestDatabase) {
  if (token) await (db ?? questDatabase()).pool.query('DELETE FROM quest_sessions WHERE scope=$1 AND token_hash=$2', [scope.key, questHash(token)]);
}
export async function questBody(request: Request): Promise<Record<string, unknown>> {
  if (!request.headers.get('content-type')?.startsWith('application/json')) throw new QuestError('JSON is required.', 415);
  const reader = request.body?.getReader();
  if (!reader) throw new QuestError('Request body is required.');
  const chunks: Uint8Array[] = []; let bytes = 0;
  try {
    for (;;) { const { done, value } = await reader.read(); if (done) break; bytes += value.byteLength; if (bytes > 24000) { await reader.cancel(); throw new QuestError('Request is too large.', 413); } chunks.push(value); }
  } finally { reader.releaseLock(); }
  try {
    const value: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('object required');
    return value as Record<string, unknown>;
  } catch { throw new QuestError('Invalid JSON request.'); }
}
