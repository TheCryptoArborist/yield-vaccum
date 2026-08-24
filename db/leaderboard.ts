import { getDeployStore, getStore } from "@netlify/blobs";

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
    if (view === "mission") {
      const best = playerRecords.reduce((leader, record) => record.score > leader.score ? record : leader);
      results.push({
        nickname: newest.nickname,
        wallet: newest.wallet,
        score: best.score,
        missions: new Set(playerRecords.map((record) => record.epochStart)).size,
        badge: best.badge,
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
  return epochStart;
}
