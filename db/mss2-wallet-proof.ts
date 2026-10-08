import { getDeployStore, getStore } from "@netlify/blobs";
import { getAddress, verifyMessage } from "ethers";

type WalletChallenge = {
  playerKey: string;
  walletAddress: string;
  message: string;
  expiresAt: string;
  purpose?: "balance" | "rewards";
};

function challengeStore() {
  return process.env.CONTEXT === "production"
    ? getStore("mint-flyer-wallet-proof", { consistency: "strong" })
    : getDeployStore("mint-flyer-wallet-proof");
}

function challengeKey(playerKey: string, purpose: "balance" | "rewards") {
  return purpose === "balance" ? `challenges/${playerKey}.json` : `reward-challenges/${playerKey}.json`;
}

export async function createWalletChallenge(playerKey: string, walletAddress: string, siteHost: string, purpose: "balance" | "rewards" = "balance") {
  const address = getAddress(walletAddress);
  const expiresAt = new Date(Date.now() + 5 * 60_000).toISOString();
  const message = [
    "Yield Vacuum MSS2 leaderboard verification",
    "",
    `Site: ${siteHost}`,
    `Wallet: ${address}`,
    `Arcade profile: ${playerKey}`,
    `Nonce: ${crypto.randomUUID()}`,
    `Expires: ${expiresAt}`,
    purpose === "rewards" ? "Purpose: Publish this wallet beside my leaderboard name for optional direct rewards." : "Purpose: Verify ownership before displaying my MSS2 balance.",
    "",
    "Signing is free and does not authorize a transaction, token approval, payment, or transfer.",
  ].join("\n");
  const challenge: WalletChallenge = { playerKey, walletAddress: address.toLowerCase(), message, expiresAt, purpose };
  await challengeStore().setJSON(challengeKey(playerKey, purpose), challenge);
  return { message, expiresAt };
}

export async function verifyAndConsumeWalletChallenge(playerKey: string, walletAddress: string, signature: string, purpose: "balance" | "rewards" = "balance") {
  const store = challengeStore();
  const key = challengeKey(playerKey, purpose);
  const challenge = await store.get(key, { type: "json" }) as WalletChallenge | null;
  if (!challenge || challenge.playerKey !== playerKey || challenge.walletAddress !== walletAddress.toLowerCase()) {
    throw new Error("The wallet verification request was not found. Please try again.");
  }
  if ((challenge.purpose ?? "balance") !== purpose) throw new Error("This signature was requested for a different purpose.");
  if (Date.parse(challenge.expiresAt) <= Date.now()) {
    await store.delete(key);
    throw new Error("The wallet verification request expired. Please try again.");
  }
  const recoveredAddress = verifyMessage(challenge.message, signature).toLowerCase();
  if (recoveredAddress !== challenge.walletAddress) {
    throw new Error("The signature did not match the connected wallet.");
  }
  await store.delete(key);
  return new Date().toISOString();
}
