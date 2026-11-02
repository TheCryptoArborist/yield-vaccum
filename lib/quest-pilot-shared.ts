export type QuestNetwork = 'arc' | 'robinhood';
export type QuestTask = 'quiz' | 'contribution';
export type QuestCampaign = {
  id: string; title: string; summary: string; network: QuestNetwork;
  status: 'draft' | 'open' | 'closed'; startsAt: string; endsAt: string; reviewEndsAt: string;
  participantCap: number; participants: number; canParticipate: boolean;
  termsVersion: 1; rewardKind: 'points_only';
};
export type QuestProgress = {
  campaignId: string; title: string; network: QuestNetwork; joinedAt: string;
  quizAttempts: number; points: number;
  tasks: { task: QuestTask; status: 'pending' | 'approved' | 'rejected'; reason: string; submittedAt: string }[];
};
export type QuestIdentity = { wallet: string; network: QuestNetwork; expiresAt: string; admin: boolean; csrf: string };
export const QUEST_POINTS = { quiz: 50, contribution: 100 } as const;
export const QUEST_TERMS_VERSION = 1;
export const QUEST_PILOT_TERMS = 'Points only: no MSS2 payments, cash value, transferable tokens, or promise of a future airdrop. Complete the quiz for 50 points (all answers correct; at most five attempts per campaign). Submit one original, useful MSS2 explanation or improvement suggestion for review, worth 100 points if approved. Reviews assess relevance, accuracy, originality, and usefulness; rejection includes a reason. One contribution submission and one award per task per wallet; decisions are final in this pilot. Submit during the campaign window. Reviews end at the published review deadline; an unreviewed submission earns no points. One wallet is not proof of one person. Campaign terms and points cannot be changed after publication; the administrator may close entry early. No purchase or paid game is required. Wallet addresses, task records, and submitted text are stored privately for operation and moderation; do not submit secrets or personal information. Records are retained for the pilot and its review, then subject to the operator retention process.';
export const QUEST_QUIZ = [
  { question: 'What does this pilot award?', options: ['Withdrawable MSS2', 'Non-transferable participation points only', 'A guaranteed future airdrop'] },
  { question: 'What does the quest sign-in signature authorize?', options: ['Unlimited token spending', 'A permanent stake', 'A temporary sign-in session, not a transfer or approval'] },
  { question: 'What can qualify a useful contribution?', options: ['An original, relevant explanation or improvement reviewed against the campaign rules', 'Opening the arcade page', 'Submitting the same text repeatedly'] },
] as const;
export class QuestError extends Error {
  constructor(message: string, public status = 400) { super(message); this.name = 'QuestError'; }
}
export function questNetwork(value: unknown): QuestNetwork {
  if (value !== 'arc' && value !== 'robinhood') throw new QuestError('Choose Arc or Robinhood Chain.');
  return value;
}
export function questId(value: unknown): string {
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) throw new QuestError('Invalid campaign identifier.');
  return value;
}
export function questText(value: unknown, min: number, max: number, label: string): string {
  if (typeof value !== 'string' || value.trim().length < min || value.trim().length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value)) throw new QuestError(`${label} must contain ${min}–${max} characters.`);
  return value.trim();
}
export function questAnswers(value: unknown): number[] {
  if (!Array.isArray(value) || value.length !== QUEST_QUIZ.length || value.some((n, i) => !Number.isInteger(n) || n < 0 || n >= QUEST_QUIZ[i].options.length)) throw new QuestError('Answer every quiz question.');
  return value as number[];
}
export function questCampaignInput(value: Record<string, unknown>) {
  if (value.rewardKind !== undefined && value.rewardKind !== 'points_only' || value.rewardBudget !== undefined) throw new QuestError('Only points-only campaigns are supported.');
  const title = questText(value.title, 3, 100, 'Title');
  const summary = questText(value.summary, 20, 1200, 'Description');
  const network = questNetwork(value.network);
  const dates = ['startsAt', 'endsAt', 'reviewEndsAt'].map(key => {
    const text = value[key];
    if (typeof text !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(text) || !Number.isFinite(Date.parse(text))) throw new QuestError('Use valid UTC campaign dates.');
    return new Date(text).toISOString();
  });
  const [start, end, review] = dates.map(Date.parse);
  if (end <= start || end - start > 30 * 86400000 || review <= end || review - end > 14 * 86400000) throw new QuestError('Campaigns last at most 30 days, followed by a review period of at most 14 days.');
  const cap = value.participantCap;
  if (typeof cap !== 'number' || !Number.isInteger(cap) || cap < 1 || cap > 1000) throw new QuestError('Participant cap must be 1–1,000 wallets.');
  return { title, summary, network, startsAt: dates[0], endsAt: dates[1], reviewEndsAt: dates[2], participantCap: cap };
}
