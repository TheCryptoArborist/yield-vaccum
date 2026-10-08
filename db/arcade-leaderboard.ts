import { getDeployStore, getStore } from "@netlify/blobs";
import { MINT_FLYER_ACHIEVEMENTS, mintFlyerGrade, type MintFlyerAchievementId } from "../lib/mint-flyer-achievements";
import { readRoundedRobinhoodMss2Balance } from "../lib/mss2-balance";

export type MintFlyerRun = {
  runId: string;
  playerKey: string;
  nickname: string;
  score: number;
  distance: number;
  mintsCollected: number;
  maxCombo: number;
  hits: number;
  lives: number;
  reachedMoon: boolean;
  continued: boolean;
  entryMode?: "demo" | "paid";
  entryNetwork?: "robinhood" | "arc";
  grade: "S" | "A" | "B" | "C";
  createdAt: string;
};

export type MintFlyerProfile = {
  playerKey: string;
  nickname: string;
  bestScore: number;
  bestDistance: number;
  bestGrade: "S" | "A" | "B" | "C";
  bestCombo: number;
  totalMints: number;
  runs: number;
  moonClears: number;
  unlocked: MintFlyerAchievementId[];
  displayMss2Balance?: boolean;
  mss2Wallet?: string | null;
  mss2HeldRounded?: string | null;
  mss2BalanceCheckedAt?: string | null;
  mss2WalletVerifiedAt?: string | null;
  updatedAt: string;
};

export type MintFlyerLeaderboardEntry = Omit<MintFlyerProfile, "playerKey" | "mss2Wallet"> & {
  displayedAchievements: MintFlyerAchievementId[];
};

function arcadeStore() {
  return process.env.CONTEXT === "production"
    ? getStore("mint-flyer-leaderboard", { consistency: "strong" })
    : getDeployStore("mint-flyer-leaderboard");
}

function emptyProfile(playerKey: string, nickname = ""): MintFlyerProfile {
  return { playerKey, nickname, bestScore: 0, bestDistance: 0, bestGrade: "C", bestCombo: 0, totalMints: 0, runs: 0, moonClears: 0, unlocked: [], updatedAt: new Date(0).toISOString() };
}

export async function readMintFlyerProfile(playerKey: string) {
  const profile = await arcadeStore().get(`profiles/${playerKey}.json`, { type: "json" }) as MintFlyerProfile | null;
  return profile ? { ...profile, bestDistance: profile.bestDistance ?? 0 } : emptyProfile(playerKey);
}

function achievementOrder(ids: MintFlyerAchievementId[]) {
  return MINT_FLYER_ACHIEVEMENTS.map((achievement) => achievement.id).filter((id) => ids.includes(id));
}

export async function saveMintFlyerRun(input: Omit<MintFlyerRun, "grade" | "createdAt">) {
  const store = arcadeStore();
  const runKey = `runs/${input.playerKey}/${input.runId}.json`;
  const existing = await store.get(runKey, { type: "json" }) as MintFlyerRun | null;
  if (existing) return { duplicate: true, profile: await readMintFlyerProfile(input.playerKey), newAchievements: [] as MintFlyerAchievementId[] };

  const grade = mintFlyerGrade(input.score);
  const run: MintFlyerRun = { ...input, grade, createdAt: new Date().toISOString() };
  await store.setJSON(runKey, run);

  const profile = await readMintFlyerProfile(input.playerKey);
  const previous = new Set(profile.unlocked);
  profile.nickname = input.nickname;
  profile.bestScore = Math.max(profile.bestScore, input.score);
  profile.bestDistance = Math.max(profile.bestDistance ?? 0, input.distance);
  profile.bestGrade = mintFlyerGrade(profile.bestScore);
  profile.bestCombo = Math.max(profile.bestCombo, input.maxCombo);
  profile.totalMints += input.mintsCollected;
  profile.runs += 1;
  if (input.reachedMoon) profile.moonClears += 1;

  const earned = new Set(profile.unlocked);
  earned.add("first-flight");
  if (input.reachedMoon) earned.add("moon-reached");
  if (input.reachedMoon && input.hits === 0) earned.add("clean-orbit");
  if (input.reachedMoon && input.lives === 1) earned.add("last-life-landing");
  if (input.maxCombo >= 10) earned.add("combo-pilot");
  if (input.maxCombo >= 20) earned.add("combo-commander");
  if (profile.totalMints >= 50) earned.add("mint-magnet");
  if (grade === "A" || grade === "S") earned.add("grade-a-pilot");
  if (grade === "S") earned.add("s-class-flyer");
  if (profile.moonClears >= 3) earned.add("moon-regular");
  if (profile.moonClears >= 10) earned.add("lunar-legend");
  profile.unlocked = achievementOrder([...earned]);
  profile.updatedAt = new Date().toISOString();
  await store.setJSON(`profiles/${input.playerKey}.json`, profile);
  return { duplicate: false, profile, newAchievements: profile.unlocked.filter((id) => !previous.has(id)) };
}

export async function updateMintFlyerBalanceDisplay(playerKey: string, display: boolean, walletAddress = "", walletVerifiedAt = "") {
  const store = arcadeStore();
  const profile = await readMintFlyerProfile(playerKey);
  if (!display) {
    profile.displayMss2Balance = false;
    profile.mss2Wallet = null;
    profile.mss2HeldRounded = null;
    profile.mss2BalanceCheckedAt = null;
    profile.mss2WalletVerifiedAt = null;
  } else {
    if (!walletVerifiedAt) throw new Error("Wallet ownership must be verified before displaying a balance.");
    const rounded = await readRoundedRobinhoodMss2Balance(walletAddress);
    profile.displayMss2Balance = true;
    profile.mss2Wallet = walletAddress.toLowerCase();
    profile.mss2HeldRounded = rounded;
    profile.mss2BalanceCheckedAt = new Date().toISOString();
    profile.mss2WalletVerifiedAt = walletVerifiedAt;
  }
  profile.updatedAt = new Date().toISOString();
  await store.setJSON(`profiles/${playerKey}.json`, profile);
  return profile;
}

export async function readMintFlyerLeaderboard() {
  const store = arcadeStore();
  const { blobs } = await store.list({ prefix: "profiles/" });
  const profiles = (await Promise.all(blobs.map((blob) => store.get(blob.key, { type: "json" }) as Promise<MintFlyerProfile | null>)))
    .filter((profile): profile is MintFlyerProfile => Boolean(profile));
  return profiles
    .filter((profile) => profile.runs > 0)
    .sort((a, b) => b.bestScore - a.bestScore || (b.bestDistance ?? 0) - (a.bestDistance ?? 0) || b.moonClears - a.moonClears || a.updatedAt.localeCompare(b.updatedAt))
    .slice(0, 25)
    .map((profile): MintFlyerLeaderboardEntry => {
      const { playerKey: _playerKey, mss2Wallet: _wallet, ...publicProfile } = profile;
      void _playerKey;
      void _wallet;
      return {
        ...publicProfile,
        bestDistance: profile.bestDistance ?? 0,
        mss2HeldRounded: profile.displayMss2Balance && profile.mss2WalletVerifiedAt ? profile.mss2HeldRounded ?? null : null,
        displayedAchievements: profile.unlocked.slice(-3).reverse(),
      };
    });
}
