import { getDeployStore, getStore } from "@netlify/blobs";
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
import { validatePaymentEvidence, type PaymentEvidenceReceipt, type PaymentEvidenceTransaction } from "../lib/mss2-payment-verifier";

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
  const readiness = paymentReadiness(input.network);
  if (readiness.enabled) throw new Error(`${readiness.network} scored runs now require a verified MSS2 entry.`);

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

export async function createArcadePaymentQuote(input: { playerKey: string; runId: string; walletAddress: string; network: Mss2PaymentNetwork }) {
  const readiness = paymentReadiness(input.network);
  const networkConfig = paymentNetworkConfig(input.network);
  if (!readiness.enabled) throw new Error(readiness.reason || "Real MSS2 payments are disabled.");
  if (!readiness.routerAddress) throw new Error(`The ${readiness.network} entry router is not configured.`);
  if (!validKey(input.playerKey) || !validKey(input.runId)) throw new Error("The arcade profile or run could not be validated.");
  const walletAddress = getAddress(input.walletAddress);
  const paymentId = crypto.randomUUID();
  const suffix = BigInt(`0x${paymentId.replaceAll("-", "").slice(0, 16)}`);
  const market = await readVerifiedMarketQuote(input.network, suffix);
  const split = splitEntryAmount(market.amountRaw);
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

  const used = await paymentStore.get(transactionKey(input.txHash), { type: "json" }) as { paymentId?: string } | null;
  if (used && used.paymentId !== input.paymentId) throw new Error("That transaction was already credited to another run.");

  const [transaction, receipt, latestBlockHex] = await Promise.all([
    rpcCall<PaymentEvidenceTransaction | null>(quote.network, "eth_getTransactionByHash", [input.txHash]),
    rpcCall<PaymentEvidenceReceipt | null>(quote.network, "eth_getTransactionReceipt", [input.txHash]),
    rpcCall<string>(quote.network, "eth_blockNumber", []),
  ]);
  if (!transaction || !receipt) return { ...quote, pending: true as const, confirmations: 0 };
  const evidence = validatePaymentEvidence(quote, transaction, receipt, latestBlockHex);
  if (!evidence.confirmed) return { ...quote, pending: true as const, confirmations: evidence.confirmations };

  const verified: ArcadePaymentQuote = { ...quote, status: "verified", txHash: input.txHash.toLowerCase(), blockNumber: evidence.blockNumber, verifiedAt: new Date().toISOString() };
  await paymentStore.setJSON(transactionKey(input.txHash), { paymentId: quote.paymentId, playerKey: quote.playerKey, runId: quote.runId, verifiedAt: verified.verifiedAt });
  await paymentStore.setJSON(quoteKey(input.paymentId), verified);
  return { ...verified, pending: false as const, confirmations: evidence.confirmations, explorerUrl: `${paymentNetworkConfig(quote.network).explorerUrl}/tx/${input.txHash}` };
}

export async function requirePaymentForScore(input: { paymentId: string; runAuthorizationId: string; playerKey: string; runId: string }) {
  const paymentStore = store();
  if (input.paymentId) {
    const quote = await paymentStore.get(quoteKey(input.paymentId), { type: "json" }) as ArcadePaymentQuote | null;
    if (!quote || quote.status !== "verified" || quote.playerKey !== input.playerKey || quote.runId !== input.runId || !quote.txHash) {
      throw new Error("A verified MSS2 entry payment is required before this Moon Run can be saved.");
    }
    return { mode: "paid" as const, network: quote.network };
  }

  const authorization = await paymentStore.get(demoRunKey(input.runAuthorizationId), { type: "json" }) as ArcadeDemoRunAuthorization | null;
  if (!authorization
    || authorization.mode !== "demo"
    || authorization.playerKey !== input.playerKey
    || authorization.runId !== input.runId
    || Date.now() > Date.parse(authorization.expiresAt)) {
    throw new Error("This free flight could not be matched to its server-issued run authorization.");
  }

  const readiness = paymentReadiness(authorization.network);
  if (readiness.enabled) throw new Error(`A verified MSS2 entry is now required for ${readiness.network} scored runs.`);
  return { mode: "demo" as const, network: authorization.network };
}
