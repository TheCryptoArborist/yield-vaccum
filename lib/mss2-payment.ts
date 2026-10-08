import { Interface, getAddress, id, parseUnits, zeroPadValue } from "ethers";
import deployments from "../deployment/mss2-entry-router/deployments.json";
import { deploymentContext } from "./deployment-context";
import {
  MSS2_COMMUNITY_AIRDROP_RESERVE,
  MSS2_DEAD_ADDRESS,
  MSS2_ENTRY_AIRDROP_RESERVE_BPS,
  MSS2_ENTRY_DEAD_ADDRESS_BPS,
} from "./mss2-payment-shared";

export type Mss2PaymentNetwork = "robinhood" | "arc";

export const MSS2_TOKEN = "0x091F0c7e675A787A4018eb47c30BeD3FA2013B65";
export const MSS2_DECIMALS = 18;
export const ENTRY_PRICE_USD = 1;
export const PAYMENT_QUOTE_LIFETIME_MS = 90_000;
export const PAYMENT_CONFIRMATION_GRACE_MS = 180_000;
export const MIN_LIQUIDITY_USD = 25_000;
export const TRANSFER_TOPIC = id("Transfer(address,address,uint256)").toLowerCase();
export const ENTRY_PAID_TOPIC = id("EntryPaid(bytes32,address,address,uint256,uint256,uint256)").toLowerCase();
export const BPS_DENOMINATOR = BigInt(10_000);

export const ROBINHOOD_CHAIN_ID = 4663;
export const ROBINHOOD_CHAIN_HEX = "0x1237";
export const ROBINHOOD_RPC_URL = "https://rpc.mainnet.chain.robinhood.com";
export const ROBINHOOD_EXPLORER_URL = "https://robinhoodchain.blockscout.com";
export const MSS2_PAIR = "0xdfcc6ad671033f7d3eceb24cbae5c0f7f6f8d91e";
export const MSS2_PAIR_URL = `https://dexscreener.com/robinhood/${MSS2_PAIR}`;
export const MSS2_PRICE_API = `https://api.dexscreener.com/latest/dex/pairs/robinhood/${MSS2_PAIR}`;

export const ARC_CHAIN_ID = 5042;
export const ARC_CHAIN_HEX = "0x13b2";
export const ARC_RPC_URL = "https://rpc.mainnet.arc.io";
export const ARC_EXPLORER_URL = "https://explorer.arc.io";
export const ARC_USDC = "0x3600000000000000000000000000000000000000";
export const ARC_MSS2_POOL = "0x01a19ee4688aac8918b99faa6ecb6f2cc3a97a31";
export const ARC_MSS2_POOL_URL = `https://api.topazdex.com/v1/pools/${ARC_CHAIN_ID}/${ARC_MSS2_POOL}?scope=all`;
export const ARC_MSS2_PRICE_API = `https://api.topazdex.com/v1/tokens/${ARC_CHAIN_ID}/${MSS2_TOKEN}`;
export const MAX_ARC_OBSERVATION_AGE_MS = 30 * 60_000;

// Public entry was approved after both router deployments and paid canaries
// were verified. Preview entry remains restricted to its approved tester.
const LIVE_PAYMENT_RELEASED = true;
const DEPLOY_PREVIEW_CANARY_RELEASED = true;
const DEPLOY_PREVIEW_CANARY_WALLET = "0x90f9c1c0c675A0ce9D539c540DB7F4A1f7e583AE";

export type PaymentReleaseMode = "disabled" | "canary" | "production";

export const ENTRY_ROUTER_INTERFACE = new Interface([
  "function enter(bytes32 paymentId,uint256 totalAmount)",
  "event EntryPaid(bytes32 indexed paymentId,address indexed payer,address indexed token,uint256 totalAmount,uint256 deadAddressAmount,uint256 communityReserveAmount)",
]);

export type PaymentNetworkConfig = {
  id: Mss2PaymentNetwork;
  chainId: number;
  chainHex: `0x${string}`;
  name: string;
  rpcUrl: string;
  explorerUrl: string;
  confirmations: number;
  routerAddress: string | null;
};

export type PaymentReadiness = {
  enabled: boolean;
  chainId: number;
  chainHex: `0x${string}`;
  network: string;
  networkId: Mss2PaymentNetwork;
  tokenAddress: string;
  tokenSymbol: "MSS2";
  tokenDecimals: number;
  entryPriceUsd: string;
  confirmations: number;
  routerAddress: string | null;
  releaseMode: PaymentReleaseMode;
  canaryWalletAddress: string | null;
  deadAddress: string;
  communityAirdropReserve: string;
  deadAddressBps: number;
  communityAirdropReserveBps: number;
  reason: string | null;
};

export type VerifiedMarketQuote = {
  network: Mss2PaymentNetwork;
  priceUsd: string;
  liquidityUsd: number;
  displayAmount: string;
  amountRaw: string;
  checkedAt: string;
  pairAddress: string;
  pairUrl: string;
};

type RpcResponse<T> = { result?: T; error?: { message?: string } };
type DexPair = {
  chainId?: string;
  dexId?: string;
  pairAddress?: string;
  baseToken?: { address?: string; symbol?: string };
  priceUsd?: string | null;
  liquidity?: { usd?: number | null } | null;
};
type ArcPricePayload = {
  ok?: boolean;
  data?: {
    chainId?: number;
    address?: string;
    symbol?: string;
    decimals?: number;
    status?: string;
    priceUsd?: string | null;
    priceObservation?: {
      chainId?: number;
      address?: string;
      decimals?: number;
      priceUsd?: string | null;
      status?: string;
      indexedAt?: string;
      availableAt?: string;
      provenance?: {
        status?: string;
        chainId?: number;
        priceUsd?: string | null;
        provenance?: { source?: string; path?: string[]; pools?: string[]; trustedLiquidityUsd?: string | null };
      };
    } | null;
    marketData?: { status?: string; snapshotAt?: string } | null;
  };
  meta?: { staleChainIds?: number[]; failedChainIds?: number[] };
};

function configuredRouter(network: Mss2PaymentNetwork) {
  if (LIVE_PAYMENT_RELEASED && deploymentContext() === "production") {
    const recorded = deployments[network];
    return recorded.status === "verified" ? getAddress(recorded.router) : null;
  }
  let value = network === "arc" ? process.env.MSS2_ENTRY_ROUTER_ARC : process.env.MSS2_ENTRY_ROUTER_ROBINHOOD;
  if (!value && deploymentContext() === "deploy-preview") {
    const recorded = deployments[network];
    if (recorded.status === "verified" && recorded.router) value = recorded.router;
  }
  if (!value) return null;
  try {
    return getAddress(value);
  } catch {
    return null;
  }
}

function configuredCanaryWallet() {
  if (deploymentContext() !== "deploy-preview" || !DEPLOY_PREVIEW_CANARY_RELEASED) return null;
  const value = process.env.MSS2_CANARY_WALLET || DEPLOY_PREVIEW_CANARY_WALLET;
  if (!value) return null;
  try {
    const address = getAddress(value);
    return address === getAddress(MSS2_COMMUNITY_AIRDROP_RESERVE) ? null : address;
  } catch {
    return null;
  }
}

function paymentReleaseMode(): PaymentReleaseMode {
  if (LIVE_PAYMENT_RELEASED && deploymentContext() === "production") return "production";
  return configuredCanaryWallet() ? "canary" : "disabled";
}

export function paymentNetworkConfig(network: Mss2PaymentNetwork): PaymentNetworkConfig {
  return network === "arc"
    ? {
        id: "arc",
        chainId: ARC_CHAIN_ID,
        chainHex: ARC_CHAIN_HEX,
        name: "Arc",
        rpcUrl: ARC_RPC_URL,
        explorerUrl: ARC_EXPLORER_URL,
        confirmations: 1,
        routerAddress: configuredRouter("arc"),
      }
    : {
        id: "robinhood",
        chainId: ROBINHOOD_CHAIN_ID,
        chainHex: ROBINHOOD_CHAIN_HEX,
        name: "Robinhood Chain",
        rpcUrl: ROBINHOOD_RPC_URL,
        explorerUrl: ROBINHOOD_EXPLORER_URL,
        confirmations: 2,
        routerAddress: configuredRouter("robinhood"),
      };
}

export function paymentReadiness(network: Mss2PaymentNetwork = "robinhood", walletAddress = ""): PaymentReadiness {
  const config = paymentNetworkConfig(network);
  const releaseMode = paymentReleaseMode();
  const canaryWalletAddress = configuredCanaryWallet();
  const reservePayer = walletAddress.toLowerCase() === MSS2_COMMUNITY_AIRDROP_RESERVE.toLowerCase();
  let walletEligible = releaseMode === "production";
  if (releaseMode === "canary" && canaryWalletAddress && walletAddress) {
    try {
      walletEligible = getAddress(walletAddress) === canaryWalletAddress;
    } catch {
      walletEligible = false;
    }
  }
  const enabled = Boolean(config.routerAddress) && walletEligible && !reservePayer;
  const reason = enabled
    ? null
    : reservePayer
      ? "Use a different wallet for entry. The Community Airdrop Reserve cannot pay itself."
    : releaseMode === "canary"
      ? `The payment canary on ${config.name} is restricted to its approved non-reserve tester wallet.`
      : `Real MSS2 entries on ${config.name} remain locked while the payment canary is prepared.`;
  return {
    enabled,
    chainId: config.chainId,
    chainHex: config.chainHex,
    network: config.name,
    networkId: config.id,
    tokenAddress: MSS2_TOKEN,
    tokenSymbol: "MSS2",
    tokenDecimals: MSS2_DECIMALS,
    entryPriceUsd: ENTRY_PRICE_USD.toFixed(2),
    confirmations: config.confirmations,
    routerAddress: config.routerAddress,
    releaseMode,
    canaryWalletAddress,
    deadAddress: getAddress(MSS2_DEAD_ADDRESS),
    communityAirdropReserve: getAddress(MSS2_COMMUNITY_AIRDROP_RESERVE),
    deadAddressBps: MSS2_ENTRY_DEAD_ADDRESS_BPS,
    communityAirdropReserveBps: MSS2_ENTRY_AIRDROP_RESERVE_BPS,
    reason,
  };
}

export async function rpcCall<T>(network: Mss2PaymentNetwork, method: string, params: unknown[], rpcUrl?: string) {
  const config = paymentNetworkConfig(network);
  const response = await fetch(rpcUrl || config.rpcUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json", "User-Agent": "Yield Vacuum/1.0" },
    body: JSON.stringify({ jsonrpc: "2.0", id: crypto.randomUUID(), method, params }),
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`${config.name} RPC did not answer the payment check.`);
  const payload = await response.json() as RpcResponse<T>;
  if (payload.error || payload.result === undefined) throw new Error(payload.error?.message || `${config.name} returned an invalid payment response.`);
  return payload.result;
}

export async function verifyMss2Deployment(network: Mss2PaymentNetwork) {
  const config = paymentNetworkConfig(network);
  const [chainId, code, decimals] = await Promise.all([
    rpcCall<string>(network, "eth_chainId", []),
    rpcCall<string>(network, "eth_getCode", [MSS2_TOKEN, "latest"]),
    rpcCall<string>(network, "eth_call", [{ to: MSS2_TOKEN, data: "0x313ce567" }, "latest"]),
  ]);
  if (Number(BigInt(chainId)) !== config.chainId) throw new Error(`The RPC chain ID did not match ${config.name}.`);
  if (!/^0x[0-9a-fA-F]+$/.test(code) || code === "0x") throw new Error(`MSS2 was not deployed at the configured ${config.name} address.`);
  if (Number(BigInt(decimals)) !== MSS2_DECIMALS) throw new Error(`The ${config.name} MSS2 decimals did not match the published 18-decimal configuration.`);
}

function quotedAmount(priceUsd: number, uniqueSuffix: bigint) {
  const amountRoundedUp = Math.ceil((ENTRY_PRICE_USD / priceUsd) * 1_000_000) / 1_000_000;
  if (!Number.isFinite(amountRoundedUp) || amountRoundedUp <= 0 || amountRoundedUp > 1_000_000) {
    throw new Error("The MSS2 entry amount was outside the allowed range.");
  }
  const baseAmount = parseUnits(amountRoundedUp.toFixed(6), MSS2_DECIMALS);
  const suffix = uniqueSuffix % BigInt("1000000000000");
  return {
    displayAmount: amountRoundedUp.toFixed(6).replace(/0+$/, "").replace(/\.$/, ""),
    amountRaw: (baseAmount + suffix).toString(),
  };
}

async function readRobinhoodMarketQuote(uniqueSuffix: bigint): Promise<VerifiedMarketQuote> {
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
  return {
    network: "robinhood",
    priceUsd: String(pair?.priceUsd),
    liquidityUsd,
    ...quotedAmount(priceUsd, uniqueSuffix),
    checkedAt: new Date().toISOString(),
    pairAddress: MSS2_PAIR,
    pairUrl: MSS2_PAIR_URL,
  };
}

async function readArcMarketQuote(uniqueSuffix: bigint): Promise<VerifiedMarketQuote> {
  const response = await fetch(ARC_MSS2_PRICE_API, {
    headers: { Accept: "application/json", "User-Agent": "Yield Vacuum/1.0" },
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`Topaz returned ${response.status}.`);
  const payload = await response.json() as ArcPricePayload;
  const token = payload.data;
  const observation = token?.priceObservation;
  const provenance = observation?.provenance?.provenance;
  const observedAt = observation?.availableAt ?? observation?.indexedAt ?? token?.marketData?.snapshotAt ?? "";
  const observedTime = Date.parse(observedAt);
  const liquidityUsd = Number(provenance?.trustedLiquidityUsd);
  const priceUsd = Number(token?.priceUsd);
  const path = provenance?.path?.map((address) => address.toLowerCase()) ?? [];
  const pools = provenance?.pools?.map((address) => address.toLowerCase()) ?? [];
  const valid = payload.ok === true
    && token?.chainId === ARC_CHAIN_ID
    && token.address?.toLowerCase() === MSS2_TOKEN.toLowerCase()
    && token.symbol?.toUpperCase() === "MSS2"
    && token.decimals === MSS2_DECIMALS
    && token.status === "active"
    && observation?.chainId === ARC_CHAIN_ID
    && observation.address?.toLowerCase() === MSS2_TOKEN.toLowerCase()
    && observation.decimals === MSS2_DECIMALS
    && observation.status === "resolved"
    && observation.priceUsd === token.priceUsd
    && observation.provenance?.status === "resolved"
    && observation.provenance.chainId === ARC_CHAIN_ID
    && observation.provenance.priceUsd === token.priceUsd
    && provenance?.source === "topaz-direct"
    && path[0] === MSS2_TOKEN.toLowerCase()
    && path.at(-1) === ARC_USDC
    && pools.includes(ARC_MSS2_POOL)
    && Number.isFinite(priceUsd)
    && priceUsd > 0
    && Number.isFinite(liquidityUsd)
    && liquidityUsd >= MIN_LIQUIDITY_USD
    && token.marketData?.status === "fresh"
    && !payload.meta?.staleChainIds?.includes(ARC_CHAIN_ID)
    && !payload.meta?.failedChainIds?.includes(ARC_CHAIN_ID)
    && Number.isFinite(observedTime)
    && Math.abs(Date.now() - observedTime) <= MAX_ARC_OBSERVATION_AGE_MS;
  if (!valid) throw new Error("The Arc MSS2 market did not pass the payment quote safeguards.");
  return {
    network: "arc",
    priceUsd: String(token?.priceUsd),
    liquidityUsd,
    ...quotedAmount(priceUsd, uniqueSuffix),
    checkedAt: new Date().toISOString(),
    pairAddress: ARC_MSS2_POOL,
    pairUrl: ARC_MSS2_POOL_URL,
  };
}

export async function readVerifiedMarketQuote(network: Mss2PaymentNetwork, uniqueSuffix: bigint): Promise<VerifiedMarketQuote> {
  await verifyMss2Deployment(network);
  return network === "arc" ? readArcMarketQuote(uniqueSuffix) : readRobinhoodMarketQuote(uniqueSuffix);
}

export function splitEntryAmount(amountRaw: string) {
  const totalAmount = BigInt(amountRaw);
  if (totalAmount < BigInt(5)) throw new Error("The MSS2 entry amount is too small to split.");
  const deadAddressAmount = totalAmount * BigInt(MSS2_ENTRY_DEAD_ADDRESS_BPS) / BPS_DENOMINATOR;
  return {
    totalAmount: totalAmount.toString(),
    deadAddressAmount: deadAddressAmount.toString(),
    communityReserveAmount: (totalAmount - deadAddressAmount).toString(),
  };
}

export function paymentIdBytes32(paymentId: string) {
  const compact = paymentId.replaceAll("-", "");
  if (!/^[0-9a-fA-F]{32}$/.test(compact)) throw new Error("The payment identifier was invalid.");
  return zeroPadValue(`0x${compact}`, 32).toLowerCase();
}

export function encodeRouterEntry(paymentId: string, amountRaw: string) {
  return ENTRY_ROUTER_INTERFACE.encodeFunctionData("enter", [paymentIdBytes32(paymentId), BigInt(amountRaw)]);
}

export function encodeMss2Approval(routerAddress: string, amountRaw: string) {
  const token = new Interface(["function approve(address spender,uint256 amount)"]);
  return token.encodeFunctionData("approve", [getAddress(routerAddress), BigInt(amountRaw)]);
}

export function addressTopic(address: string) {
  return zeroPadValue(getAddress(address), 32).toLowerCase();
}
