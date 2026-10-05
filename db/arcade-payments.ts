import { getDeployStore, getStore } from "@netlify/blobs";
import { getAddress } from "ethers";
import {
  MSS2_PAIR,
  MSS2_PAIR_URL,
  MSS2_TOKEN,
  PAYMENT_CONFIRMATION_GRACE_MS,
  PAYMENT_QUOTE_LIFETIME_MS,
  ROBINHOOD_CHAIN_ID,
  ROBINHOOD_EXPLORER_URL,
  encodeMss2Transfer,
  paymentReadiness,
  readVerifiedMarketQuote,
  rpcCall,
} from "../lib/mss2-payment";
import { validatePaymentEvidence, type PaymentEvidenceReceipt, type PaymentEvidenceTransaction } from "../lib/mss2-payment-verifier";

export type ArcadePaymentQuote = {
  paymentId: string;
  playerKey: string;
  runId: string;
  walletAddress: string;
  chainId: number;
  tokenAddress: string;
  recipient: string;
  amountRaw: string;
  displayAmount: string;
  entryPriceUsd: string;
  priceUsd: string;
  liquidityUsd: number;
  pairAddress: string;
  pairUrl: string;
  createdAt: string;
  expiresAt: string;
  status: "pending" | "verified";
  txHash?: string;
  blockNumber?: number;
  verifiedAt?: string;
};

export type ArcadeDemoRunAuthorization = {
  authorizationId: string;
  playerKey: string;
  runId: string;
  network: "robinhood" | "arc";
  mode: "demo";
  createdAt: string;
  expiresAt: string;
};

function store() {
  return process.env.CONTEXT === "production"
    ? getStore("mint-flyer-payments", { consistency: "strong" })
    : getDeployStore("mint-flyer-payments");
}

function quoteKey(paymentId: string) {
  return `quotes/${paymentId}.json`;
}

function transactionKey(txHash: string) {
  return `transactions/${txHash.toLowerCase()}.json`;
}

function demoRunKey(authorizationId: string) {
  return `demo-runs/${authorizationId}.json`;
}

function validKey(value: string) {
  return /^[a-zA-Z0-9-]{16,80}$/.test(value);
}

export async function createDemoRunAuthorization(input: { playerKey: string; network: "robinhood" | "arc" }) {
  if (!validKey(input.playerKey)) throw new Error("The arcade profile could not be validated.");
  const readiness = paymentReadiness();
  if (input.network === "robinhood" && readiness.enabled) throw new Error("Robinhood scored runs now require a verified MSS2 entry.");
  if (input.network === "arc" && readiness.arcEnabled) throw new Error("Arc scored runs now require a verified MSS2 entry.");

  const createdAt = new Date();
  const authorization: ArcadeDemoRunAuthorization = {
    authorizationId: crypto.randomUUID(),
    playerKey: input.playerKey,
    runId: crypto.randomUUID(),
    network: input.network,
    mode: "demo",
    createdAt: createdAt.toISOString(),
    expiresAt: new Date(createdAt.getTime() + 24 * 60 * 60_000).toISOString(),
  };
  await store().setJSON(demoRunKey(authorization.authorizationId), authorization);
  return { ...authorization, playerKey: undefined };
}

export async function createArcadePaymentQuote(input: { playerKey: string; runId: string; walletAddress: string }) {
  const readiness = paymentReadiness();
  if (!readiness.enabled) throw new Error(readiness.reason || "Real MSS2 payments are disabled.");
  if (!validKey(input.playerKey) || !validKey(input.runId)) throw new Error("The arcade profile or run could not be validated.");
  const walletAddress = getAddress(input.walletAddress);
  const paymentId = crypto.randomUUID();
  const suffix = BigInt(`0x${paymentId.replaceAll("-", "").slice(0, 16)}`);
  const market = await readVerifiedMarketQuote(suffix);
  const createdAt = new Date();
  const quote: ArcadePaymentQuote = {
    paymentId,
    playerKey: input.playerKey,
    runId: input.runId,
    walletAddress: walletAddress.toLowerCase(),
    chainId: ROBINHOOD_CHAIN_ID,
    tokenAddress: MSS2_TOKEN,
    recipient: readiness.recipient,
    amountRaw: market.amountRaw,
    displayAmount: market.displayAmount,
    entryPriceUsd: readiness.entryPriceUsd,
    priceUsd: market.priceUsd,
    liquidityUsd: market.liquidityUsd,
    pairAddress: MSS2_PAIR,
    pairUrl: MSS2_PAIR_URL,
    createdAt: createdAt.toISOString(),
    expiresAt: new Date(createdAt.getTime() + PAYMENT_QUOTE_LIFETIME_MS).toISOString(),
    status: "pending",
  };
  await store().setJSON(quoteKey(paymentId), quote);
  return {
    ...quote,
    playerKey: undefined,
    walletAddress: getAddress(walletAddress),
    transfer: { from: getAddress(walletAddress), to: MSS2_TOKEN, data: encodeMss2Transfer(readiness.recipient, market.amountRaw), value: "0x0" },
  };
}

export async function verifyArcadePayment(input: { paymentId: string; playerKey: string; walletAddress: string; txHash: string }) {
  if (!/^0x[0-9a-fA-F]{64}$/.test(input.txHash)) throw new Error("Enter a valid Robinhood transaction hash.");
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

  const used = await paymentStore.get(transactionKey(input.txHash), { type: "json" }) as { paymentId?: string } | null;
  if (used && used.paymentId !== input.paymentId) throw new Error("That transaction was already credited to another run.");

  const [transaction, receipt, latestBlockHex] = await Promise.all([
    rpcCall<PaymentEvidenceTransaction | null>("eth_getTransactionByHash", [input.txHash]),
    rpcCall<PaymentEvidenceReceipt | null>("eth_getTransactionReceipt", [input.txHash]),
    rpcCall<string>("eth_blockNumber", []),
  ]);
  if (!transaction || !receipt) return { ...quote, pending: true as const, confirmations: 0 };
  const evidence = validatePaymentEvidence(quote, transaction, receipt, latestBlockHex);
  if (!evidence.confirmed) return { ...quote, pending: true as const, confirmations: evidence.confirmations };

  const verified: ArcadePaymentQuote = { ...quote, status: "verified", txHash: input.txHash.toLowerCase(), blockNumber: evidence.blockNumber, verifiedAt: new Date().toISOString() };
  await paymentStore.setJSON(transactionKey(input.txHash), { paymentId: quote.paymentId, playerKey: quote.playerKey, runId: quote.runId, verifiedAt: verified.verifiedAt });
  await paymentStore.setJSON(quoteKey(input.paymentId), verified);
  return { ...verified, pending: false as const, confirmations: evidence.confirmations, explorerUrl: `${ROBINHOOD_EXPLORER_URL}/tx/${input.txHash}` };
}

export async function requirePaymentForScore(input: { paymentId: string; runAuthorizationId: string; playerKey: string; runId: string }) {
  const paymentStore = store();
  if (input.paymentId) {
    const quote = await paymentStore.get(quoteKey(input.paymentId), { type: "json" }) as ArcadePaymentQuote | null;
    if (!quote || quote.status !== "verified" || quote.playerKey !== input.playerKey || quote.runId !== input.runId || !quote.txHash) {
      throw new Error("A verified MSS2 entry payment is required before this Moon Run can be saved.");
    }
    return { mode: "paid" as const, network: "robinhood" as const };
  }

  const authorization = await paymentStore.get(demoRunKey(input.runAuthorizationId), { type: "json" }) as ArcadeDemoRunAuthorization | null;
  if (!authorization
    || authorization.mode !== "demo"
    || authorization.playerKey !== input.playerKey
    || authorization.runId !== input.runId
    || Date.now() > Date.parse(authorization.expiresAt)) {
    throw new Error("This free flight could not be matched to its server-issued run authorization.");
  }

  const readiness = paymentReadiness();
  if ((authorization.network === "robinhood" && readiness.enabled) || (authorization.network === "arc" && readiness.arcEnabled)) {
    throw new Error(`A verified MSS2 entry is now required for ${authorization.network === "arc" ? "Arc" : "Robinhood Chain"} scored runs.`);
  }
  return { mode: "demo" as const, network: authorization.network };
}
