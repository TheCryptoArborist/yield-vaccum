import { AbiCoder } from "ethers";
import { MSS2_COMMUNITY_AIRDROP_RESERVE, MSS2_DEAD_ADDRESS } from "./mss2-payment-shared";
import {
  ENTRY_PAID_TOPIC,
  MSS2_TOKEN,
  TRANSFER_TOPIC,
  addressTopic,
  encodeRouterEntry,
  paymentIdBytes32,
  paymentNetworkConfig,
  splitEntryAmount,
  type Mss2PaymentNetwork,
} from "./mss2-payment";

export type PaymentEvidenceQuote = {
  paymentId: string;
  network: Mss2PaymentNetwork;
  chainId: number;
  tokenAddress: string;
  walletAddress: string;
  routerAddress: string;
  amountRaw: string;
  deadAddress: string;
  communityAirdropReserve: string;
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

function containsTransfer(
  receipt: PaymentEvidenceReceipt,
  from: string,
  to: string,
  amount: string,
) {
  return receipt.logs?.some((log) => log.address?.toLowerCase() === MSS2_TOKEN.toLowerCase()
    && log.topics?.[0]?.toLowerCase() === TRANSFER_TOPIC
    && log.topics?.[1]?.toLowerCase() === addressTopic(from)
    && log.topics?.[2]?.toLowerCase() === addressTopic(to)
    && BigInt(log.data || "0x0") === BigInt(amount));
}

function containsEntryEvent(receipt: PaymentEvidenceReceipt, quote: PaymentEvidenceQuote) {
  const split = splitEntryAmount(quote.amountRaw);
  return receipt.logs?.some((log) => {
    if (log.address?.toLowerCase() !== quote.routerAddress.toLowerCase()
      || log.topics?.[0]?.toLowerCase() !== ENTRY_PAID_TOPIC
      || log.topics?.[1]?.toLowerCase() !== paymentIdBytes32(quote.paymentId)
      || log.topics?.[2]?.toLowerCase() !== addressTopic(quote.walletAddress)
      || log.topics?.[3]?.toLowerCase() !== addressTopic(MSS2_TOKEN)) return false;
    try {
      const [total, dead, reserve] = AbiCoder.defaultAbiCoder().decode(
        ["uint256", "uint256", "uint256"],
        log.data || "0x",
      );
      return total === BigInt(split.totalAmount)
        && dead === BigInt(split.deadAddressAmount)
        && reserve === BigInt(split.communityReserveAmount);
    } catch {
      return false;
    }
  });
}

export function validatePaymentEvidence(
  quote: PaymentEvidenceQuote,
  transaction: PaymentEvidenceTransaction,
  receipt: PaymentEvidenceReceipt,
  latestBlockHex: string,
) {
  const config = paymentNetworkConfig(quote.network);
  if (quote.chainId !== config.chainId || quote.tokenAddress.toLowerCase() !== MSS2_TOKEN.toLowerCase()) {
    throw new Error("The stored payment network or MSS2 token did not match the verified configuration.");
  }
  if (!config.routerAddress || quote.routerAddress.toLowerCase() !== config.routerAddress.toLowerCase()) {
    throw new Error("The stored entry router did not match the verified network configuration.");
  }
  if (quote.deadAddress.toLowerCase() !== MSS2_DEAD_ADDRESS.toLowerCase()
    || quote.communityAirdropReserve.toLowerCase() !== MSS2_COMMUNITY_AIRDROP_RESERVE.toLowerCase()) {
    throw new Error("The stored 20/80 destinations did not match the fixed allocation.");
  }
  if (receipt.status !== "0x1") throw new Error(`The MSS2 router transaction failed on ${config.name}.`);
  if (transaction.hash && receipt.transactionHash
    && transaction.hash.toLowerCase() !== receipt.transactionHash.toLowerCase()) {
    throw new Error("The transaction and receipt hashes did not match.");
  }
  if (transaction.from?.toLowerCase() !== quote.walletAddress.toLowerCase()
    || transaction.to?.toLowerCase() !== quote.routerAddress.toLowerCase()) {
    throw new Error("The transaction sender or entry router did not match the payment quote.");
  }
  if (transaction.input?.toLowerCase() !== encodeRouterEntry(quote.paymentId, quote.amountRaw).toLowerCase()) {
    throw new Error("The router payment ID or MSS2 amount did not match the payment quote.");
  }

  const split = splitEntryAmount(quote.amountRaw);
  if (!containsTransfer(receipt, quote.walletAddress, quote.deadAddress, split.deadAddressAmount)) {
    throw new Error("The receipt did not contain the exact 20% MSS2 transfer to the dead address.");
  }
  if (!containsTransfer(receipt, quote.walletAddress, quote.communityAirdropReserve, split.communityReserveAmount)) {
    throw new Error("The receipt did not contain the exact 80% MSS2 transfer to the Community Airdrop Reserve.");
  }
  if (!containsEntryEvent(receipt, quote)) {
    throw new Error("The receipt did not contain the matching entry-router event.");
  }

  const blockNumber = Number(BigInt(receipt.blockNumber || "0x0"));
  const confirmations = Math.max(0, Number(BigInt(latestBlockHex)) - blockNumber + 1);
  return { blockNumber, confirmations, confirmed: confirmations >= config.confirmations };
}
