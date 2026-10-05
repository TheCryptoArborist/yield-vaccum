import { readMintFlyerLeaderboard, readMintFlyerProfile, saveMintFlyerRun } from "../../../db/arcade-leaderboard";
import { MINT_FLYER_ACHIEVEMENTS } from "../../../lib/mint-flyer-achievements";

function cleanNickname(value: unknown) {
  return String(value ?? "").replace(/[^a-zA-Z0-9 _.-]/g, "").trim().slice(0, 22);
}

function boundedInteger(value: unknown, min: number, max: number) {
  const number = Number(value);
  return Number.isInteger(number) && number >= min && number <= max ? number : null;
}

export async function GET(request: Request) {
  try {
    const playerKey = new URL(request.url).searchParams.get("playerKey") ?? "";
    const profile = /^[a-zA-Z0-9-]{16,80}$/.test(playerKey) ? await readMintFlyerProfile(playerKey) : null;
    return Response.json({ entries: await readMintFlyerLeaderboard(), profile, achievements: MINT_FLYER_ACHIEVEMENTS, holdingsStatus: "DISABLED_PENDING_VERIFICATION" });
  } catch {
    return Response.json({ error: "The Mint Flyer leaderboard is temporarily unavailable." }, { status: 503 });
  }
}

export async function POST(request: Request) {
  try {
    const payload = await request.json() as Record<string, unknown>;
    const playerKey = String(payload.playerKey ?? "").trim();
    const runId = String(payload.runId ?? "").trim();
    const nickname = cleanNickname(payload.nickname);
    const score = boundedInteger(payload.score, 0, 250_000);
    const distance = boundedInteger(payload.distance, 0, 3_000);
    const mintsCollected = boundedInteger(payload.mintsCollected, 0, 500);
    const maxCombo = boundedInteger(payload.maxCombo, 0, 500);
    const hits = boundedInteger(payload.hits, 0, 100);
    const lives = boundedInteger(payload.lives, 0, 3);
    const reachedMoon = payload.reachedMoon === true;
    const continued = payload.continued === true;

    if (!/^[a-zA-Z0-9-]{16,80}$/.test(playerKey) || !/^[a-zA-Z0-9-]{16,80}$/.test(runId) || nickname.length < 2) {
      return Response.json({ error: "Choose a nickname with at least two letters or numbers." }, { status: 400 });
    }
    if ([score, distance, mintsCollected, maxCombo, hits, lives].some((value) => value === null)) {
      return Response.json({ error: "That flight result could not be validated." }, { status: 400 });
    }
    if (!reachedMoon || distance !== 3_000 || score! < distance! * 10) {
      return Response.json({ error: "That flight result is inconsistent." }, { status: 400 });
    }

    const result = await saveMintFlyerRun({ playerKey, runId, nickname, score: score!, distance: distance!, mintsCollected: mintsCollected!, maxCombo: maxCombo!, hits: hits!, lives: lives!, reachedMoon, continued });
    return Response.json({ saved: true, ...result });
  } catch {
    return Response.json({ error: "The flight result could not be saved right now." }, { status: 503 });
  }
}
