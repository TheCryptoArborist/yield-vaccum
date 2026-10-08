import { getAddress } from "ethers";

export type RewardWalletFields = {
  displayRewardWallet: boolean;
  rewardWallet: string | null;
  rewardNetwork: "robinhood" | "arc" | null;
  rewardWalletVerifiedAt: string | null;
};

type VerifiedEntry = {
  mode: "paid" | "demo";
  network: "robinhood" | "arc";
  walletAddress?: string;
  verifiedAt?: string;
};

export function resolveRewardWallet(entry: VerifiedEntry, display: boolean, signedWallet = "", signedAt = ""): RewardWalletFields {
  if (!display) return { displayRewardWallet: false, rewardWallet: null, rewardNetwork: null, rewardWalletVerifiedAt: null };
  const address = entry.mode === "paid" ? entry.walletAddress : signedWallet;
  const verifiedAt = entry.mode === "paid" ? entry.verifiedAt : signedAt;
  if (!address || !verifiedAt) throw new Error("Verify wallet ownership before listing a reward address.");
  return { displayRewardWallet: true, rewardWallet: getAddress(address), rewardNetwork: entry.network, rewardWalletVerifiedAt: verifiedAt };
}

export function publicRewardWallet(profile: Partial<RewardWalletFields>): RewardWalletFields {
  if (profile.displayRewardWallet && profile.rewardWallet && profile.rewardWalletVerifiedAt
    && (profile.rewardNetwork === "arc" || profile.rewardNetwork === "robinhood")) {
    try {
      return { displayRewardWallet: true, rewardWallet: getAddress(profile.rewardWallet), rewardNetwork: profile.rewardNetwork, rewardWalletVerifiedAt: profile.rewardWalletVerifiedAt };
    } catch { /* Invalid legacy metadata must not publish an address. */ }
  }
  return { displayRewardWallet: false, rewardWallet: null, rewardNetwork: null, rewardWalletVerifiedAt: null };
}
