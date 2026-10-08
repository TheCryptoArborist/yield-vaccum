const MSS2_CONTRACT = "0x091F0c7e675A787A4018eb47c30BeD3FA2013B65";
const MSS2_DECIMALS = 18;

const MSS2_NETWORKS = {
  "0x1237": {
    name: "Robinhood Chain",
    rpcUrl: "https://rpc.mainnet.chain.robinhood.com",
  },
  "0x13b2": {
    name: "Arc",
    rpcUrl: "https://rpc.mainnet.arc.io",
  },
} as const;

export type Mss2BalanceChainId = keyof typeof MSS2_NETWORKS;

const BALANCE_OF_SELECTOR = "70a08231";
const DECIMALS_SELECTOR = "313ce567";

type RpcResponse = {
  result?: string;
  error?: { message?: string };
};

function isAddress(value: string) {
  return /^0x[a-fA-F0-9]{40}$/.test(value);
}

async function rpcCall(chainId: Mss2BalanceChainId, data: string) {
  const network = MSS2_NETWORKS[chainId];
  const response = await fetch(network.rpcUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_call", params: [{ to: MSS2_CONTRACT, data }, "latest"] }),
    cache: "no-store",
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) throw new Error(`${network.name} RPC did not answer the balance request.`);
  const payload = await response.json() as RpcResponse;
  if (payload.error || !payload.result || !/^0x[0-9a-fA-F]+$/.test(payload.result)) {
    throw new Error(payload.error?.message || `${network.name} returned an invalid token response.`);
  }
  return payload.result;
}

function roundedTokenBalance(rawBalance: bigint) {
  const hundred = BigInt(100);
  const base = BigInt(10) ** BigInt(MSS2_DECIMALS);
  const whole = rawBalance / base;
  const units = [
    { size: BigInt("1000000000000000"), suffix: "Q" },
    { size: BigInt("1000000000000"), suffix: "T" },
    { size: BigInt("1000000000"), suffix: "B" },
    { size: BigInt("1000000"), suffix: "M" },
    { size: BigInt("1000"), suffix: "K" },
  ];
  const unit = units.find((candidate) => whole >= candidate.size);
  if (!unit) {
    const hundredths = (rawBalance * hundred) / base;
    return new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(Number(hundredths) / 100);
  }
  const hundredths = (rawBalance * hundred) / (base * unit.size);
  const compact = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(Number(hundredths) / 100);
  return `${compact}${unit.suffix}`;
}

export function isMss2BalanceChainId(chainId: string): chainId is Mss2BalanceChainId {
  return chainId in MSS2_NETWORKS;
}

export async function readRawMss2Balance(address: string, chainId: Mss2BalanceChainId) {
  if (!isAddress(address)) throw new Error("A valid EVM wallet address is required.");
  const encodedAddress = address.toLowerCase().slice(2).padStart(64, "0");
  const [balanceHex, decimalsHex] = await Promise.all([
    rpcCall(chainId, `0x${BALANCE_OF_SELECTOR}${encodedAddress}`),
    rpcCall(chainId, `0x${DECIMALS_SELECTOR}`),
  ]);
  if (Number(BigInt(decimalsHex)) !== MSS2_DECIMALS) {
    throw new Error("The MSS2 token decimals did not match the verified configuration.");
  }
  return {
    raw: BigInt(balanceHex).toString(),
    network: MSS2_NETWORKS[chainId].name,
  };
}

export async function readRoundedMss2Balance(address: string, chainId: Mss2BalanceChainId) {
  const balance = await readRawMss2Balance(address, chainId);
  return { rounded: roundedTokenBalance(BigInt(balance.raw)), network: balance.network };
}

export async function readRoundedRobinhoodMss2Balance(address: string) {
  return (await readRoundedMss2Balance(address, "0x1237")).rounded;
}
