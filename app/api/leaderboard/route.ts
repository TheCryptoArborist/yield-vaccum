import { currentTopazEpoch, readLeaderboard, saveScore, type LeaderboardView } from "../../../db/leaderboard";

const BADGES = ["ROUTE ACE", "LP BALANCER", "LOCK BUILDER", "GAUGE STRATEGIST", "FEE SCANNER", "INCENTIVE ROUTER", "EPOCH EXPERT"];

function cleanNickname(value: unknown) {
  return String(value ?? "").replace(/[^a-zA-Z0-9 _.-]/g, "").trim().slice(0, 22);
}

function cleanWallet(value: unknown) {
  const wallet = String(value ?? "").trim();
  return /^0x[a-fA-F0-9]{40}$/.test(wallet) ? wallet : null;
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const requested = url.searchParams.get("view");
    const view: LeaderboardView = requested === "mission" || requested === "all" ? requested : "epoch";
    const missionIndex = Math.max(0, Math.min(6, Number(url.searchParams.get("mission") ?? 0) || 0));
    const result = await readLeaderboard(view, missionIndex);
    return Response.json({ entries: result.results ?? [], epochStart: currentTopazEpoch() });
  } catch {
    return Response.json({ error: "The leaderboard is temporarily unavailable." }, { status: 503 });
  }
}

export async function POST(request: Request) {
  try {
    const payload = await request.json() as Record<string, unknown>;
    const playerKey = String(payload.playerKey ?? "").trim();
    const nickname = cleanNickname(payload.nickname);
    const missionIndex = Number(payload.missionIndex);
    const score = Number(payload.score);
    const mistakes = Math.max(0, Math.min(999, Number(payload.mistakes) || 0));

    if (!/^[a-zA-Z0-9-]{16,80}$/.test(playerKey) || nickname.length < 2) {
      return Response.json({ error: "Choose a nickname with at least two letters or numbers." }, { status: 400 });
    }
    if (!Number.isInteger(missionIndex) || missionIndex < 0 || missionIndex > 6 || !Number.isInteger(score) || score < 0 || score > 100_000) {
      return Response.json({ error: "That score could not be verified." }, { status: 400 });
    }

    const badge = mistakes === 0 ? `PERFECT ${BADGES[missionIndex]}` : BADGES[missionIndex];
    const epochStart = await saveScore({ playerKey, nickname, wallet: cleanWallet(payload.wallet), missionIndex, score, mistakes, badge });
    return Response.json({ saved: true, badge, epochStart });
  } catch {
    return Response.json({ error: "The score could not be saved right now." }, { status: 503 });
  }
}
