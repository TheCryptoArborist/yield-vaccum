export type TrialChallenge = { wallet: string; playerKey: string; runId: string; network: "robinhood" | "arc"; issuedAt: number };

export function validateTrialChallenge(value: TrialChallenge, now = Date.now()) {
  if (!value || !/^0x[0-9a-fA-F]{40}$/.test(value.wallet) || !/^[a-zA-Z0-9-]{16,80}$/.test(value.playerKey) || !/^[a-zA-Z0-9-]{16,80}$/.test(value.runId)
    || !["robinhood", "arc"].includes(value.network) || !Number.isSafeInteger(value.issuedAt) || value.issuedAt > now + 10_000 || now - value.issuedAt > 300_000) {
    throw new Error("Your free-flight request expired or is invalid. Refresh and try again.");
  }
}

export function trialMessage(value: TrialChallenge, host: string) {
  return `${host} — Mint Flyer introductory flight\n\nClaim one free practice flight for this wallet. No token transfer or approval. Future flights cost $1 worth of MSS2. This does not grant access to your funds.\n\nWallet: ${value.wallet.toLowerCase()}\nNetwork: ${value.network}\nPlayer: ${value.playerKey}\nRun: ${value.runId}\nIssued: ${value.issuedAt}`;
}
