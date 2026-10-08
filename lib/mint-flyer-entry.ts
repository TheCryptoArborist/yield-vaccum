export type MintFlyerEntryAction = "wait" | "select-network" | "retry-readiness" | "start-free" | "prepare-quote" | "refresh-balance" | "pay" | "verify-payment";

export function mintFlyerEntryAction(input: {
  supportedNetwork: boolean;
  readinessKnown: boolean;
  readinessFailed: boolean;
  playerReady: boolean;
  live: boolean;
  walletConnected: boolean;
  hasQuote: boolean;
  quoteExpired: boolean;
  balanceSufficient: boolean | undefined;
  paymentSubmitted: boolean;
}): MintFlyerEntryAction {
  if (!input.supportedNetwork) return "select-network";
  if (!input.readinessKnown) return input.readinessFailed ? "retry-readiness" : "wait";
  if (!input.playerReady) return "wait";
  if (!input.live) return "start-free";
  if (!input.walletConnected) return "wait";
  // A submitted payment is verified without paying again, even after quote expiry.
  if (input.paymentSubmitted && input.hasQuote) return "verify-payment";
  if (!input.hasQuote || input.quoteExpired) return "prepare-quote";
  if (input.balanceSufficient !== true) return "refresh-balance";
  return "pay";
}
