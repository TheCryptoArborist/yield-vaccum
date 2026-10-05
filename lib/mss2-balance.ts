const ROBINHOOD_RPC_URL = "https://rpc.mainnet.chain.robinhood.com";
const MSS2_ROBINHOOD_CONTRACT = "0x091F0c7e675A787A4018eb47c30BeD3FA2013B65";
const MSS2_DECIMALS = 18;

const BALANCE_OF_SELECTOR = "70a08231";
const DECIMALS_SELECTOR = "313ce567";

type RpcResponse = {
  result?: string;
  error?: { message?: string };
};

function isAddress(value: string) {
  return /^0x[a-fA-F0-9]{40}$/.test(value);
}

async function rpcCall(data: string) {
  const response = await fetch(ROBINHOOD_RPC_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_call", params: [{ to: MSS2_ROBINHOOD_CONTRACT, data }, "latest"] }),
    cache: "no-store",
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) throw new Error("Robinhood RPC did not answer the balance request.");
  const payload = await response.json() as RpcResponse;
  if (payload.error || !payload.result || !/^0x[0-9a-fA-F]+$/.test(payload.result)) {
    throw new Error(payload.error?.message || "Robinhood returned an invalid token response.");
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

export async function readRoundedRobinhoodMss2Balance(address: string) {
  if (!isAddress(address)) throw new Error("A valid EVM wallet address is required.");
  const encodedAddress = address.toLowerCase().slice(2).padStart(64, "0");
  const [balanceHex, decimalsHex] = await Promise.all([
    rpcCall(`0x${BALANCE_OF_SELECTOR}${encodedAddress}`),
    rpcCall(`0x${DECIMALS_SELECTOR}`),
  ]);
  if (Number(BigInt(decimalsHex)) !== MSS2_DECIMALS) {
    throw new Error("The MSS2 token decimals did not match the verified configuration.");
  }
  return roundedTokenBalance(BigInt(balanceHex));
}
