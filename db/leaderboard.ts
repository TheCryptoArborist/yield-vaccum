import { getDeployStore, getStore } from "@netlify/blobs";
import { ACHIEVEMENTS, MISSION_ACHIEVEMENTS, missionGrade, type AchievementId } from "../lib/achievements";

export type LeaderboardView = "epoch" | "mission" | "all";

type ScoreRecord = {
  epochStart: string;
  playerKey: string;
  nickname: string;
  wallet: string | null;
  missionIndex: number;
  score: number;
  mistakes: number;
  badge: string;
  updatedAt: string;
};

type LeaderboardEntry = {
  nickname: string;
  wallet: string | null;
  score: number;
  missions: number;
  badge: string;
  badges: AchievementId[];
  unlockedCount: number;
  updatedAt: string;
};

export type PlayerProfile = {
  playerKey: string;
  nickname: string;
  wallet: string | null;
  unlocked: AchievementId[];
  equipped: AchievementId[];
  clearedMissions: number[];
  sGradeMissions: number[];
  epochClears: Record<string, number[]>;
  completedEpochs: string[];
  updatedAt: string;
};

function leaderboardStore() {
  return process.env.CONTEXT === "production"
    ? getStore("topaz-leaderboard", { consistency: "strong" })
    : getDeployStore("topaz-leaderboard");
}

export function currentTopazEpoch(date = new Date()) {
  const utcMidnight = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  const daysSinceThursday = (date.getUTCDay() + 3) % 7;
  return new Date(utcMidnight - daysSinceThursday * 86_400_000).toISOString().slice(0, 10);
}

async function scoreRecords() {
  const store = leaderboardStore();
  const { blobs } = await store.list({ prefix: "scores/" });
  const records = await Promise.all(
    blobs.map((blob) => store.get(blob.key, { type: "json" }) as Promise<ScoreRecord | null>),
  );
  return records.filter((record): record is ScoreRecord => Boolean(record));
}

function emptyProfile(playerKey: string, nickname = "", wallet: string | null = null): PlayerProfile {
  return { playerKey, nickname, wallet, unlocked: [], equipped: [], clearedMissions: [], sGradeMissions: [], epochClears: {}, completedEpochs: [], updatedAt: new Date(0).toISOString() };
}

export async function readProfile(playerKey: string) {
  const profile = await leaderboardStore().get(`profiles/${playerKey}.json`, { type: "json" }) as PlayerProfile | null;
  const fallback = emptyProfile(playerKey);
  if (!profile) return fallback;
  return {
    ...fallback,
    ...profile,
    unlocked: profile.unlocked ?? [],
    equipped: profile.equipped ?? [],
    clearedMissions: profile.clearedMissions ?? [],
    sGradeMissions: profile.sGradeMissions ?? [],
    epochClears: profile.epochClears ?? {},
    completedEpochs: profile.completedEpochs ?? [],
  };
}

export async function equipBadges(playerKey: string, equipped: AchievementId[]) {
  const store = leaderboardStore();
  const profile = await readProfile(playerKey);
  const valid = equipped.filter((id, index) => profile.unlocked.includes(id) && equipped.indexOf(id) === index).slice(0, 3);
  profile.equipped = valid;
  profile.updatedAt = new Date().toISOString();
  await store.setJSON(`profiles/${playerKey}.json`, profile);
  return profile;
}

function newestRecord(records: ScoreRecord[]) {
  return records.reduce((newest, record) =>
    record.updatedAt > newest.updatedAt ? record : newest,
  );
}

export async function readLeaderboard(view: LeaderboardView, missionIndex: number) {
  const epoch = currentTopazEpoch();
  let records = await scoreRecords();

  if (view === "epoch") records = records.filter((record) => record.epochStart === epoch);
  if (view === "mission") records = records.filter((record) => record.missionIndex === missionIndex);

  const byPlayer = new Map<string, ScoreRecord[]>();
  for (const record of records) {
    const playerRecords = byPlayer.get(record.playerKey) ?? [];
    playerRecords.push(record);
    byPlayer.set(record.playerKey, playerRecords);
  }

  const results: LeaderboardEntry[] = [];
  for (const playerRecords of byPlayer.values()) {
    const newest = newestRecord(playerRecords);
    const profile = await readProfile(newest.playerKey);
    if (view === "mission") {
      const best = playerRecords.reduce((leader, record) => record.score > leader.score ? record : leader);
      results.push({
        nickname: newest.nickname,
        wallet: newest.wallet,
        score: best.score,
        missions: new Set(playerRecords.map((record) => record.epochStart)).size,
        badge: best.badge,
        badges: profile.equipped,
        unlockedCount: profile.unlocked.length,
        updatedAt: best.updatedAt,
      });
      continue;
    }

    const latestBadge = newest.badge;
    results.push({
      nickname: newest.nickname,
      wallet: newest.wallet,
      score: playerRecords.reduce((total, record) => total + record.score, 0),
      missions: playerRecords.length,
      badge: latestBadge,
      badges: profile.equipped,
      unlockedCount: profile.unlocked.length,
      updatedAt: newest.updatedAt,
    });
  }

  results.sort((a, b) => b.score - a.score || a.updatedAt.localeCompare(b.updatedAt));
  return { results: results.slice(0, 25) };
}

export async function saveScore(input: {
  playerKey: string;
  nickname: string;
  wallet: string | null;
  missionIndex: number;
  score: number;
  mistakes: number;
  badge: string;
}) {
  const store = leaderboardStore();
  const epochStart = currentTopazEpoch();
  const key = `scores/${epochStart}/${input.playerKey}/${input.missionIndex}.json`;
  const current = await store.get(key, { type: "json" }) as ScoreRecord | null;
  const isBest = !current || input.score > current.score;
  const record: ScoreRecord = {
    epochStart,
    playerKey: input.playerKey,
    nickname: input.nickname,
    wallet: input.wallet,
    missionIndex: input.missionIndex,
    score: isBest ? input.score : current.score,
    mistakes: isBest ? input.mistakes : current.mistakes,
    badge: isBest ? input.badge : current.badge,
    updatedAt: new Date().toISOString(),
  };
  await store.setJSON(key, record);

  const profile = await readProfile(input.playerKey);
  profile.nickname = input.nickname;
  profile.wallet = input.wallet;
  const history = (await scoreRecords()).filter((saved) => saved.playerKey === input.playerKey);
  profile.clearedMissions = [...new Set([...profile.clearedMissions, ...history.map((saved) => saved.missionIndex), input.missionIndex])].sort();
  for (const saved of history) {
    if (missionGrade(saved.score, saved.mistakes, saved.missionIndex) === "S") {
      profile.sGradeMissions = [...new Set([...profile.sGradeMissions, saved.missionIndex])].sort();
    }
    profile.epochClears[saved.epochStart] = [...new Set([...(profile.epochClears[saved.epochStart] ?? []), saved.missionIndex])].sort();
    if (profile.epochClears[saved.epochStart].length === 7) {
      profile.completedEpochs = [...new Set([...profile.completedEpochs, saved.epochStart])].sort();
    }
  }
  if (missionGrade(input.score, input.mistakes, input.missionIndex) === "S") {
    profile.sGradeMissions = [...new Set([...profile.sGradeMissions, input.missionIndex])].sort();
  }
  profile.epochClears[epochStart] = [...new Set([...(profile.epochClears[epochStart] ?? []), input.missionIndex])].sort();
  if (profile.epochClears[epochStart].length === 7) {
    profile.completedEpochs = [...new Set([...profile.completedEpochs, epochStart])].sort();
  }

  const earned = new Set<AchievementId>(profile.unlocked);
  for (const saved of history) {
    if (saved.mistakes === 0) earned.add(MISSION_ACHIEVEMENTS[saved.missionIndex]);
  }
  if (input.mistakes === 0) earned.add(MISSION_ACHIEVEMENTS[input.missionIndex]);
  if (profile.clearedMissions.length === 7) earned.add("topaz-scholar");
  if (profile.sGradeMissions.length === 7) earned.add("yield-champion");
  if (profile.completedEpochs.length >= 3) earned.add("epoch-veteran");
  const unlocked = ACHIEVEMENTS.map((achievement) => achievement.id).filter((id) => earned.has(id));
  const newBadges = unlocked.filter((id) => !profile.unlocked.includes(id));
  profile.unlocked = unlocked;
  for (const id of newBadges) {
    if (profile.equipped.length < 3) profile.equipped.push(id);
  }
  profile.equipped = profile.equipped.filter((id) => profile.unlocked.includes(id)).slice(0, 3);
  profile.updatedAt = new Date().toISOString();
  await store.setJSON(`profiles/${input.playerKey}.json`, profile);
  return { epochStart, profile, newBadges };
}
