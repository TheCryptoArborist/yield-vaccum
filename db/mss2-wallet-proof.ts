import { getDeployStore, getStore } from "@netlify/blobs";
import { getAddress, verifyMessage } from "ethers";

type WalletChallenge = {
  playerKey: string;
  walletAddress: string;
  message: string;
  expiresAt: string;
};

function challengeStore() {
  return process.env.CONTEXT === "production"
    ? getStore("mint-flyer-wallet-proof", { consistency: "strong" })
    : getDeployStore("mint-flyer-wallet-proof");
}

function challengeKey(playerKey: string) {
  return `challenges/${playerKey}.json`;
}

export async function createWalletChallenge(playerKey: string, walletAddress: string, siteHost: string) {
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
    "",
    "Signing is free and does not authorize a transaction, token approval, payment, or transfer.",
  ].join("\n");
  const challenge: WalletChallenge = { playerKey, walletAddress: address.toLowerCase(), message, expiresAt };
  await challengeStore().setJSON(challengeKey(playerKey), challenge);
  return { message, expiresAt };
}

export async function verifyAndConsumeWalletChallenge(playerKey: string, walletAddress: string, signature: string) {
  const store = challengeStore();
  const challenge = await store.get(challengeKey(playerKey), { type: "json" }) as WalletChallenge | null;
  if (!challenge || challenge.playerKey !== playerKey || challenge.walletAddress !== walletAddress.toLowerCase()) {
    throw new Error("The wallet verification request was not found. Please try again.");
  }
  if (Date.parse(challenge.expiresAt) <= Date.now()) {
    await store.delete(challengeKey(playerKey));
    throw new Error("The wallet verification request expired. Please try again.");
  }
  const recoveredAddress = verifyMessage(challenge.message, signature).toLowerCase();
  if (recoveredAddress !== challenge.walletAddress) {
    throw new Error("The signature did not match the connected wallet.");
  }
  await store.delete(challengeKey(playerKey));
  return new Date().toISOString();
}
