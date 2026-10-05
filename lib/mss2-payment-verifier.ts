import {
  MSS2_TOKEN,
  REQUIRED_CONFIRMATIONS,
  TRANSFER_TOPIC,
  addressTopic,
  encodeMss2Transfer,
} from "./mss2-payment";

export type PaymentEvidenceQuote = {
  walletAddress: string;
  recipient: string;
  amountRaw: string;
};

export type PaymentEvidenceTransaction = {
  hash?: string;
  from?: string;
  to?: string;
  input?: string;
};

export type PaymentEvidenceReceipt = {
  status?: string;
  blockNumber?: string;
  transactionHash?: string;
  logs?: Array<{ address?: string; topics?: string[]; data?: string }>;
};

export function validatePaymentEvidence(
  quote: PaymentEvidenceQuote,
  transaction: PaymentEvidenceTransaction,
  receipt: PaymentEvidenceReceipt,
  latestBlockHex: string,
) {
  if (receipt.status !== "0x1") throw new Error("The MSS2 transfer failed on Robinhood Chain.");
  if (transaction.from?.toLowerCase() !== quote.walletAddress.toLowerCase() || transaction.to?.toLowerCase() !== MSS2_TOKEN.toLowerCase()) {
    throw new Error("The transaction sender or token contract did not match the payment quote.");
  }
  if (transaction.input?.toLowerCase() !== encodeMss2Transfer(quote.recipient, quote.amountRaw).toLowerCase()) {
    throw new Error("The transaction recipient or MSS2 amount did not match the payment quote.");
  }
  const matchingTransfer = receipt.logs?.some((log) => log.address?.toLowerCase() === MSS2_TOKEN.toLowerCase()
    && log.topics?.[0]?.toLowerCase() === TRANSFER_TOPIC
    && log.topics?.[1]?.toLowerCase() === addressTopic(quote.walletAddress)
    && log.topics?.[2]?.toLowerCase() === addressTopic(quote.recipient)
    && BigInt(log.data || "0x0") === BigInt(quote.amountRaw));
  if (!matchingTransfer) throw new Error("The successful receipt did not contain the required MSS2 transfer.");

  const blockNumber = Number(BigInt(receipt.blockNumber || "0x0"));
  const confirmations = Math.max(0, Number(BigInt(latestBlockHex)) - blockNumber + 1);
  return { blockNumber, confirmations, confirmed: confirmations >= REQUIRED_CONFIRMATIONS };
}
