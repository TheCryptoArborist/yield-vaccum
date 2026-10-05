import { getAddress, id, parseUnits, verifyMessage, zeroPadValue } from "ethers";
import { MSS2_PAYMENT_RECIPIENT, MSS2_RECIPIENT_CONFIRMATION_MESSAGE } from "./mss2-payment-shared";

export const ROBINHOOD_CHAIN_ID = 4663;
export const ROBINHOOD_CHAIN_HEX = "0x1237";
export const ROBINHOOD_RPC_URL = "https://rpc.mainnet.chain.robinhood.com";
export const ROBINHOOD_EXPLORER_URL = "https://robin.etherscan.io";
export const MSS2_TOKEN = "0x091F0c7e675A787A4018eb47c30BeD3FA2013B65";
export const MSS2_DECIMALS = 18;
export const MSS2_PAIR = "0xdfcc6ad671033f7d3eceb24cbae5c0f7f6f8d91e";
export const MSS2_PAIR_URL = `https://dexscreener.com/robinhood/${MSS2_PAIR}`;
export const MSS2_PRICE_API = `https://api.dexscreener.com/latest/dex/pairs/robinhood/${MSS2_PAIR}`;
export const EXPECTED_PAYMENT_RECIPIENT = MSS2_PAYMENT_RECIPIENT;
export const RECIPIENT_CONFIRMATION_MESSAGE = MSS2_RECIPIENT_CONFIRMATION_MESSAGE;
export const ENTRY_PRICE_USD = 1;
export const PAYMENT_QUOTE_LIFETIME_MS = 90_000;
export const PAYMENT_CONFIRMATION_GRACE_MS = 180_000;
export const MIN_LIQUIDITY_USD = 25_000;
export const REQUIRED_CONFIRMATIONS = 2;
export const TRANSFER_TOPIC = id("Transfer(address,address,uint256)").toLowerCase();

type RpcResponse<T> = { result?: T; error?: { message?: string } };
type DexPair = {
  chainId?: string;
  dexId?: string;
  pairAddress?: string;
  baseToken?: { address?: string; symbol?: string };
  priceUsd?: string | null;
  liquidity?: { usd?: number | null } | null;
};

export type PaymentReadiness = {
  enabled: boolean;
  recipient: string;
  recipientConfirmed: boolean;
  chainId: number;
  chainHex: string;
  network: string;
  tokenAddress: string;
  tokenSymbol: "MSS2";
  tokenDecimals: number;
  entryPriceUsd: string;
  confirmations: number;
  arcEnabled: false;
  reason: string | null;
};

export type VerifiedMarketQuote = {
  priceUsd: string;
  liquidityUsd: number;
  displayAmount: string;
  amountRaw: string;
  checkedAt: string;
};

function configuredRecipient() {
  const value = process.env.MSS2_PAYMENT_RECIPIENT || EXPECTED_PAYMENT_RECIPIENT;
  try {
    return getAddress(value);
  } catch {
    return EXPECTED_PAYMENT_RECIPIENT;
  }
}

export function paymentReadiness(): PaymentReadiness {
  const recipient = configuredRecipient();
  let recipientConfirmed = false;
  const signature = process.env.MSS2_PAYMENT_RECIPIENT_SIGNATURE || "";
  try {
    recipientConfirmed = recipient.toLowerCase() === EXPECTED_PAYMENT_RECIPIENT.toLowerCase()
      && /^0x[0-9a-fA-F]{130}$/.test(signature)
      && verifyMessage(RECIPIENT_CONFIRMATION_MESSAGE, signature).toLowerCase() === recipient.toLowerCase();
  } catch {
    recipientConfirmed = false;
  }
  const enabled = process.env.CONTEXT === "production"
    && process.env.MSS2_PAYMENTS_ENABLED === "true"
    && recipientConfirmed;
  let reason: string | null = null;
  if (!recipientConfirmed) reason = "The payment recipient still needs an ownership confirmation.";
  else if (process.env.CONTEXT !== "production") reason = "Real transfers stay disabled on preview deployments.";
  else if (process.env.MSS2_PAYMENTS_ENABLED !== "true") reason = "The production payment switch is off.";

  return {
    enabled,
    recipient,
    recipientConfirmed,
    chainId: ROBINHOOD_CHAIN_ID,
    chainHex: ROBINHOOD_CHAIN_HEX,
    network: "Robinhood Chain",
    tokenAddress: MSS2_TOKEN,
    tokenSymbol: "MSS2",
    tokenDecimals: MSS2_DECIMALS,
    entryPriceUsd: ENTRY_PRICE_USD.toFixed(2),
    confirmations: REQUIRED_CONFIRMATIONS,
    arcEnabled: false,
    reason,
  };
}

export async function rpcCall<T>(method: string, params: unknown[]) {
  const response = await fetch(ROBINHOOD_RPC_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json", "User-Agent": "Yield Vacuum/1.0" },
    body: JSON.stringify({ jsonrpc: "2.0", id: crypto.randomUUID(), method, params }),
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error("Robinhood RPC did not answer the payment check.");
  const payload = await response.json() as RpcResponse<T>;
  if (payload.error || payload.result === undefined) throw new Error(payload.error?.message || "Robinhood returned an invalid payment response.");
  return payload.result;
}

export async function verifyMss2Deployment() {
  const [chainId, code, decimals] = await Promise.all([
    rpcCall<string>("eth_chainId", []),
    rpcCall<string>("eth_getCode", [MSS2_TOKEN, "latest"]),
    rpcCall<string>("eth_call", [{ to: MSS2_TOKEN, data: "0x313ce567" }, "latest"]),
  ]);
  if (Number(BigInt(chainId)) !== ROBINHOOD_CHAIN_ID) throw new Error("The RPC chain ID did not match Robinhood Chain.");
  if (!/^0x[0-9a-fA-F]+$/.test(code) || code === "0x") throw new Error("The MSS2 contract was not deployed at the configured address.");
  if (Number(BigInt(decimals)) !== MSS2_DECIMALS) throw new Error("The MSS2 decimals did not match the published 18-decimal configuration.");
}

export async function readVerifiedMarketQuote(uniqueSuffix: bigint): Promise<VerifiedMarketQuote> {
  await verifyMss2Deployment();
  const response = await fetch(MSS2_PRICE_API, {
    headers: { Accept: "application/json", "User-Agent": "Yield Vacuum/1.0" },
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`DEX Screener returned ${response.status}.`);
  const data = await response.json() as { pair?: DexPair; pairs?: DexPair[] };
  const pair = data.pair ?? data.pairs?.find((item) => item.pairAddress?.toLowerCase() === MSS2_PAIR);
  const priceUsd = Number(pair?.priceUsd);
  const liquidityUsd = Number(pair?.liquidity?.usd);
  const valid = pair?.chainId?.toLowerCase() === "robinhood"
    && pair.dexId?.toLowerCase() === "topaz"
    && pair.pairAddress?.toLowerCase() === MSS2_PAIR
    && pair.baseToken?.address?.toLowerCase() === MSS2_TOKEN.toLowerCase()
    && pair.baseToken?.symbol?.toUpperCase() === "MSS2"
    && Number.isFinite(priceUsd)
    && priceUsd > 0
    && Number.isFinite(liquidityUsd)
    && liquidityUsd >= MIN_LIQUIDITY_USD;
  if (!valid) throw new Error("The Robinhood MSS2 market did not pass the payment quote safeguards.");

  const amountRoundedUp = Math.ceil((ENTRY_PRICE_USD / priceUsd) * 1_000_000) / 1_000_000;
  if (!Number.isFinite(amountRoundedUp) || amountRoundedUp <= 0 || amountRoundedUp > 1_000_000) {
    throw new Error("The MSS2 entry amount was outside the allowed range.");
  }
  const baseAmount = parseUnits(amountRoundedUp.toFixed(6), MSS2_DECIMALS);
  const suffix = uniqueSuffix % BigInt("1000000000000");
  const amountRaw = baseAmount + suffix;
  return {
    priceUsd: String(pair?.priceUsd),
    liquidityUsd,
    displayAmount: amountRoundedUp.toFixed(6).replace(/0+$/, "").replace(/\.$/, ""),
    amountRaw: amountRaw.toString(),
    checkedAt: new Date().toISOString(),
  };
}

export function encodeMss2Transfer(recipient: string, amountRaw: string) {
  const selector = "a9059cbb";
  const addressWord = recipient.toLowerCase().replace(/^0x/, "").padStart(64, "0");
  const amountWord = BigInt(amountRaw).toString(16).padStart(64, "0");
  return `0x${selector}${addressWord}${amountWord}`;
}

export function addressTopic(address: string) {
  return zeroPadValue(getAddress(address), 32).toLowerCase();
}
