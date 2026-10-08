import { getDeployStore, getStore } from "@netlify/blobs";
import { deploymentContext } from "../lib/deployment-context";
import { getAddress } from "ethers";
import {
  MSS2_TOKEN,
  PAYMENT_CONFIRMATION_GRACE_MS,
  PAYMENT_QUOTE_LIFETIME_MS,
  encodeMss2Approval,
  encodeRouterEntry,
  paymentNetworkConfig,
  paymentReadiness,
  readVerifiedMarketQuote,
  rpcCall,
  splitEntryAmount,
  type Mss2PaymentNetwork,
} from "../lib/mss2-payment";
import { paymentReceiptKey, validatePaymentEvidence, type PaymentEvidenceReceipt, type PaymentEvidenceTransaction } from "../lib/mss2-payment-verifier";
import { readRawMss2Balance } from "../lib/mss2-balance";
import { assessMss2EntryBalance } from "../lib/mss2-entry-balance";

export type ArcadePaymentQuote = {
  paymentId: string;
  playerKey: string;
  runId: string;
  walletAddress: string;
  network: Mss2PaymentNetwork;
  chainId: number;
  tokenAddress: string;
  routerAddress: string;
  deadAddress: string;
  communityAirdropReserve: string;
  amountRaw: string;
  deadAddressAmountRaw: string;
  communityReserveAmountRaw: string;
  displayAmount: string;
  entryPriceUsd: string;
  priceUsd: string;
  liquidityUsd: number;
  pairAddress: string;
  pairUrl: string;
  explorerUrl: string;
  createdAt: string;
  expiresAt: string;
  status: "pending" | "verified";
  txHash?: string;
  blockNumber?: number;
  verifiedAt?: string;
};

function store() {
  return deploymentContext() === "production"
    ? getStore("mint-flyer-payments", { consistency: "strong" })
    : getDeployStore("mint-flyer-payments");
}

function quoteKey(paymentId: string) {
  return `quotes/${paymentId}.json`;
}

function validKey(value: string) {
  return /^[a-zA-Z0-9-]{16,80}$/.test(value);
}

export async function createArcadePaymentQuote(input: { playerKey: string; runId: string; walletAddress: string; network: Mss2PaymentNetwork }) {
  const readiness = paymentReadiness(input.network, input.walletAddress);
  const networkConfig = paymentNetworkConfig(input.network);
  if (!readiness.enabled) throw new Error(readiness.reason || "Real MSS2 payments are disabled.");
  if (!readiness.routerAddress) throw new Error(`The ${readiness.network} entry router is not configured.`);
  if (!validKey(input.playerKey) || !validKey(input.runId)) throw new Error("The arcade profile or run could not be validated.");
  const walletAddress = getAddress(input.walletAddress);
  const paymentId = crypto.randomUUID();
  const suffix = BigInt(`0x${paymentId.replaceAll("-", "").slice(0, 16)}`);
  const market = await readVerifiedMarketQuote(input.network, suffix);
  const split = splitEntryAmount(market.amountRaw);
  const [balance, nativeGasBalanceRaw] = await Promise.all([
    readRawMss2Balance(walletAddress, input.network === "arc" ? "0x13b2" : "0x1237"),
    rpcCall<string>(input.network, "eth_getBalance", [walletAddress, "latest"]),
  ]);
  const balanceCheck = assessMss2EntryBalance(balance.raw, market.amountRaw, balance.network);
  const createdAt = new Date();
  const quote: ArcadePaymentQuote = {
    paymentId,
    playerKey: input.playerKey,
    runId: input.runId,
    walletAddress: walletAddress.toLowerCase(),
    network: input.network,
    chainId: readiness.chainId,
    tokenAddress: MSS2_TOKEN,
    routerAddress: readiness.routerAddress,
    deadAddress: readiness.deadAddress,
    communityAirdropReserve: readiness.communityAirdropReserve,
    amountRaw: market.amountRaw,
    deadAddressAmountRaw: split.deadAddressAmount,
    communityReserveAmountRaw: split.communityReserveAmount,
    displayAmount: market.displayAmount,
    entryPriceUsd: readiness.entryPriceUsd,
    priceUsd: market.priceUsd,
    liquidityUsd: market.liquidityUsd,
    pairAddress: market.pairAddress,
    pairUrl: market.pairUrl,
    explorerUrl: networkConfig.explorerUrl,
    createdAt: createdAt.toISOString(),
    expiresAt: new Date(createdAt.getTime() + PAYMENT_QUOTE_LIFETIME_MS).toISOString(),
    status: "pending",
  };
  await store().setJSON(quoteKey(paymentId), quote);
  return {
    ...quote,
    balanceCheck,
    nativeGasBalanceRaw,
    playerKey: undefined,
    walletAddress: getAddress(walletAddress),
    approval: {
      from: getAddress(walletAddress),
      to: MSS2_TOKEN,
      data: encodeMss2Approval(readiness.routerAddress, market.amountRaw),
      value: "0x0",
    },
    entry: {
      from: getAddress(walletAddress),
      to: readiness.routerAddress,
      data: encodeRouterEntry(paymentId, market.amountRaw),
      value: "0x0",
    },
  };
}

export async function checkArcadePaymentBalance(input: { paymentId: string; playerKey: string; walletAddress: string }) {
  const quote = await store().get(quoteKey(input.paymentId), { type: "json" }) as ArcadePaymentQuote | null;
  if (!quote || quote.playerKey !== input.playerKey || quote.walletAddress !== input.walletAddress.toLowerCase()) {
    throw new Error("The entry quote does not match this wallet. Request a new quote.");
  }
  const [balance, nativeGasBalanceRaw] = await Promise.all([
    readRawMss2Balance(quote.walletAddress, quote.network === "arc" ? "0x13b2" : "0x1237"),
    rpcCall<string>(quote.network, "eth_getBalance", [quote.walletAddress, "latest"]),
  ]);
  return { paymentId: quote.paymentId, balanceCheck: assessMss2EntryBalance(balance.raw, quote.amountRaw, balance.network), nativeGasBalanceRaw };
}

export async function verifyArcadePayment(input: { paymentId: string; playerKey: string; walletAddress: string; txHash: string }) {
  if (!/^0x[0-9a-fA-F]{64}$/.test(input.txHash)) throw new Error("Enter a valid transaction hash.");
  const paymentStore = store();
  const quote = await paymentStore.get(quoteKey(input.paymentId), { type: "json" }) as ArcadePaymentQuote | null;
  if (!quote || quote.playerKey !== input.playerKey || quote.walletAddress !== input.walletAddress.toLowerCase()) {
    throw new Error("The payment quote was not found for this wallet and run.");
  }
  if (quote.status === "verified") {
    if (quote.txHash?.toLowerCase() !== input.txHash.toLowerCase()) throw new Error("This run was already paid with another transaction.");
    return quote;
  }
  if (Date.now() > Date.parse(quote.expiresAt) + PAYMENT_CONFIRMATION_GRACE_MS) throw new Error("The payment verification window expired. Request a new quote.");

  const receiptKey = paymentReceiptKey(quote.network, input.txHash, quote.paymentId);
  const used = await paymentStore.get(receiptKey, { type: "json" }) as { paymentId?: string } | null;
  if (used && used.paymentId !== input.paymentId) throw new Error("That transaction was already credited to another run.");

  const [transaction, receipt, latestBlockHex] = await Promise.all([
    rpcCall<PaymentEvidenceTransaction | null>(quote.network, "eth_getTransactionByHash", [input.txHash]),
    rpcCall<PaymentEvidenceReceipt | null>(quote.network, "eth_getTransactionReceipt", [input.txHash]),
    rpcCall<string>(quote.network, "eth_blockNumber", []),
  ]);
  if (!transaction || !receipt) return { ...quote, pending: true as const, confirmations: 0 };
  if (receipt.transactionHash?.toLowerCase() !== input.txHash.toLowerCase() || transaction.hash?.toLowerCase() !== input.txHash.toLowerCase()) {
    throw new Error("The RPC transaction and receipt did not match the submitted hash.");
  }
  const direct = transaction.from?.toLowerCase() === quote.walletAddress.toLowerCase()
    && transaction.to?.toLowerCase() === quote.routerAddress.toLowerCase();
  if (!receipt.blockNumber || !/^0x[0-9a-fA-F]+$/.test(receipt.blockNumber)) throw new Error("The payment receipt has no valid mined block.");
  const payerCode = direct ? undefined : await rpcCall<string>(quote.network, "eth_getCode", [quote.walletAddress, receipt.blockNumber]);
  const evidence = validatePaymentEvidence(quote, transaction, receipt, latestBlockHex, payerCode ? { payerCode } : undefined);
  if (!evidence.confirmed) return { ...quote, pending: true as const, confirmations: evidence.confirmations };

  const verified: ArcadePaymentQuote = { ...quote, status: "verified", txHash: input.txHash.toLowerCase(), blockNumber: evidence.blockNumber, verifiedAt: new Date().toISOString() };
  await paymentStore.setJSON(receiptKey, { paymentId: quote.paymentId, playerKey: quote.playerKey, runId: quote.runId, verifiedAt: verified.verifiedAt });
  await paymentStore.setJSON(quoteKey(input.paymentId), verified);
  return { ...verified, pending: false as const, confirmations: evidence.confirmations, explorerUrl: `${paymentNetworkConfig(quote.network).explorerUrl}/tx/${input.txHash}` };
}

export async function requirePaymentForScore(input: { paymentId: string; playerKey: string; runId: string }) {
  if (!validKey(input.paymentId)) throw new Error("A verified MSS2 entry payment is required before this flight can be saved.");
  const quote = await store().get(quoteKey(input.paymentId), { type: "json" }) as ArcadePaymentQuote | null;
  if (!quote || quote.status !== "verified" || quote.playerKey !== input.playerKey || quote.runId !== input.runId || !quote.txHash) {
    throw new Error("A verified MSS2 entry payment is required before this flight can be saved.");
  }
  return { mode: "paid" as const, network: quote.network, walletAddress: quote.walletAddress, verifiedAt: quote.verifiedAt };
}
