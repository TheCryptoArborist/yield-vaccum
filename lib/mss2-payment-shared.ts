export const MSS2_PAYMENT_RECIPIENT = "0xF2Ab1eEBbEcb4E315FE95D8b532D1aB00F1A8789";

export const MSS2_RECIPIENT_CONFIRMATION_MESSAGE = [
  "Yield Vacuum MSS2 payment recipient confirmation",
  "",
  "Site: https://yieldvaccum.xyz",
  `Recipient: ${MSS2_PAYMENT_RECIPIENT}`,
  "Purpose: receive MSS2 arcade entry payments",
  "",
  "Signing proves control of the recipient address. It does not approve or move tokens.",
].join("\n");
