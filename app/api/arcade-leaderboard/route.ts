import { readMintFlyerLeaderboard, readMintFlyerProfile, saveMintFlyerRun, updateMintFlyerBalanceDisplay } from "../../../db/arcade-leaderboard";
import { createWalletChallenge, verifyAndConsumeWalletChallenge } from "../../../db/mss2-wallet-proof";
import { requirePaymentForScore } from "../../../db/arcade-payments";
import { MINT_FLYER_ACHIEVEMENTS } from "../../../lib/mint-flyer-achievements";
import { publicRewardWallet, resolveRewardWallet, type RewardWalletFields } from "../../../lib/mint-flyer-rewards";

function cleanNickname(value: unknown) {
  return String(value ?? "").replace(/[^a-zA-Z0-9 _.-]/g, "").trim().slice(0, 22);
}

function boundedInteger(value: unknown, min: number, max: number) {
  const number = Number(value);
  return Number.isInteger(number) && number >= min && number <= max ? number : null;
}

function publicProfile<T extends Partial<RewardWalletFields> & { mss2Wallet?: string | null }>(profile: T) {
  const { mss2Wallet: _wallet, ...publicFields } = profile;
  void _wallet;
  return { ...publicFields, ...publicRewardWallet(profile) };
}

export async function GET(request: Request) {
  try {
    const playerKey = new URL(request.url).searchParams.get("playerKey") ?? "";
    const profile = /^[a-zA-Z0-9-]{16,80}$/.test(playerKey) ? await readMintFlyerProfile(playerKey) : null;
    return Response.json({ entries: await readMintFlyerLeaderboard(), profile: profile ? publicProfile(profile) : null, achievements: MINT_FLYER_ACHIEVEMENTS, holdingsStatus: "ROBINHOOD_READ_ONLY_ROUNDED" });
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
    const paymentId = String(payload.paymentId ?? "").trim();

    if (!/^[a-zA-Z0-9-]{16,80}$/.test(playerKey) || !/^[a-zA-Z0-9-]{16,80}$/.test(runId) || nickname.length < 2) {
      return Response.json({ error: "Choose a nickname with at least two letters or numbers." }, { status: 400 });
    }
    if ([score, distance, mintsCollected, maxCombo, hits, lives].some((value) => value === null)) {
      return Response.json({ error: "That flight result could not be validated." }, { status: 400 });
    }
    const distanceMatchesOutcome = reachedMoon ? distance === 3_000 : distance! < 3_000;
    if (!distanceMatchesOutcome || score! < distance! * 10) {
      return Response.json({ error: "That flight result is inconsistent." }, { status: 400 });
    }

    if (!/^[a-zA-Z0-9-]{16,80}$/.test(paymentId) || continued) {
      return Response.json({ error: "Each flight requires a verified MSS2 entry payment. Free flights and continues are disabled." }, { status: 403 });
    }
    const entry = await requirePaymentForScore({ paymentId, playerKey, runId });
    const displayRewardWallet = payload.displayRewardWallet === true;
    const rewards = resolveRewardWallet(entry, displayRewardWallet);
    const result = await saveMintFlyerRun({ playerKey, runId, nickname, score: score!, distance: distance!, mintsCollected: mintsCollected!, maxCombo: maxCombo!, hits: hits!, lives: lives!, reachedMoon, continued, entryMode: entry.mode, entryNetwork: entry.network, ...rewards });
    return Response.json({ saved: true, ...result, profile: publicProfile(result.profile) });
  } catch {
    return Response.json({ error: "The flight result could not be saved right now." }, { status: 503 });
  }
}


export async function PUT(request: Request) {
  try {
    const payload = await request.json() as Record<string, unknown>;
    const playerKey = String(payload.playerKey ?? "").trim();
    const walletAddress = String(payload.walletAddress ?? "").trim();
    const signature = String(payload.signature ?? "").trim();
    const display = payload.display === true;
    if (!/^[a-zA-Z0-9-]{16,80}$/.test(playerKey)) {
      return Response.json({ error: "That arcade profile could not be validated." }, { status: 400 });
    }
    if (display && !/^0x[a-fA-F0-9]{40}$/.test(walletAddress)) {
      return Response.json({ error: "Connect a valid EVM wallet before displaying a balance." }, { status: 400 });
    }
    if (display && !/^0x[a-fA-F0-9]{130}$/.test(signature)) {
      return Response.json({ error: "Sign the wallet verification message before displaying a balance." }, { status: 400 });
    }
    const verifiedAt = display ? await verifyAndConsumeWalletChallenge(playerKey, walletAddress, signature) : "";
    const profile = await updateMintFlyerBalanceDisplay(playerKey, display, walletAddress, verifiedAt);
    return Response.json({ saved: true, profile: publicProfile(profile), entries: await readMintFlyerLeaderboard() });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "The MSS2 balance could not be verified right now." }, { status: 502 });
  }
}

export async function PATCH(request: Request) {
  try {
    const payload = await request.json() as Record<string, unknown>;
    const playerKey = String(payload.playerKey ?? "").trim();
    const walletAddress = String(payload.walletAddress ?? "").trim();
    if (!/^[a-zA-Z0-9-]{16,80}$/.test(playerKey) || !/^0x[a-fA-F0-9]{40}$/.test(walletAddress)) {
      return Response.json({ error: "Connect a valid wallet before requesting verification." }, { status: 400 });
    }
    const purpose = payload.purpose === "rewards" ? "rewards" : "balance";
    const challenge = await createWalletChallenge(playerKey, walletAddress, new URL(request.url).host, purpose);
    return Response.json(challenge, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ error: "The wallet verification request could not be created." }, { status: 503 });
  }
}
