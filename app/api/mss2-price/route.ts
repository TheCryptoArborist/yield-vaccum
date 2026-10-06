const ROBINHOOD_PAIR_API = "https://api.dexscreener.com/latest/dex/pairs/robinhood/0xdfcc6ad671033f7d3eceb24cbae5c0f7f6f8d91e";
const ROBINHOOD_PAIR_URL = "https://dexscreener.com/robinhood/0xdfcc6ad671033f7d3eceb24cbae5c0f7f6f8d91e";
const ROBINHOOD_PAIR = "0xdfcc6ad671033f7d3eceb24cbae5c0f7f6f8d91e";
const ARC_CHAIN_ID = 5042;
const ARC_USDC = "0x3600000000000000000000000000000000000000";
const ARC_MSS2_POOL = "0x01a19ee4688aac8918b99faa6ecb6f2cc3a97a31";
const ARC_TOKEN_API = "https://api.topazdex.com/v1/tokens/5042/0x091F0c7e675A787A4018eb47c30BeD3FA2013B65";
const ARC_POOL_URL = `https://api.topazdex.com/v1/pools/${ARC_CHAIN_ID}/${ARC_MSS2_POOL}?scope=all`;
const EXPECTED_MSS2 = "0x091f0c7e675a787a4018eb47c30bed3fa2013b65";
const ENTRY_PRICE_USD = 1;
const QUOTE_LIFETIME_MS = 90_000;
const MIN_LIQUIDITY_USD = 25_000;
const MAX_ARC_OBSERVATION_AGE_MS = 30 * 60_000;

type DexPair = {
  chainId?: string;
  dexId?: string;
  pairAddress?: string;
  baseToken?: { address?: string; name?: string; symbol?: string };
  quoteToken?: { address?: string; name?: string; symbol?: string };
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
        provenance?: {
          source?: string;
          path?: string[];
          pools?: string[];
          trustedLiquidityUsd?: string | null;
        };
      };
    } | null;
    marketData?: { status?: string; snapshotAt?: string } | null;
  };
  meta?: { staleChainIds?: number[]; failedChainIds?: number[] };
};

function displayAmount(value: number) {
  if (value >= 1000) return value.toFixed(2);
  if (value >= 1) return value.toFixed(4);
  return value.toFixed(8);
}

function quoteResponse(input: {
  source: string;
  chainId: "robinhood" | "arc";
  pairAddress: string;
  pairUrl: string;
  priceUsd: string;
  liquidityUsd: number | null;
  observedAt: string;
}) {
  const priceUsd = Number(input.priceUsd);
  if (!Number.isFinite(priceUsd) || priceUsd <= 0) throw new Error("The MSS2 USD price was invalid.");
  const checkedAt = new Date();
  const quoteId = `demo-${input.chainId}-${checkedAt.getTime().toString(36)}-${Math.round(priceUsd * 1e12).toString(36)}`;

  return Response.json({
    source: input.source,
    status: "indicative",
    quoteId,
    chainId: input.chainId,
    dexId: "topaz",
    pairAddress: input.pairAddress,
    tokenAddress: EXPECTED_MSS2,
    pairUrl: input.pairUrl,
    priceUsd: input.priceUsd,
    entryPriceUsd: ENTRY_PRICE_USD.toFixed(2),
    indicativeMss2ForEntry: displayAmount(ENTRY_PRICE_USD / priceUsd),
    liquidityUsd: input.liquidityUsd,
    observedAt: input.observedAt,
    checkedAt: checkedAt.toISOString(),
    validUntil: new Date(checkedAt.getTime() + QUOTE_LIFETIME_MS).toISOString(),
  }, {
    headers: {
      "Cache-Control": "no-store, max-age=0",
      "Netlify-CDN-Cache-Control": "no-store",
    },
  });
}

async function robinhoodQuote() {
  const response = await fetch(ROBINHOOD_PAIR_API, {
    headers: { Accept: "application/json", "User-Agent": "Yield Vacuum/1.0" },
    next: { revalidate: 30 },
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`DEX Screener returned ${response.status}.`);

  const data = await response.json() as { pair?: DexPair; pairs?: DexPair[] };
  const pair = data.pair ?? data.pairs?.find((item) => item.pairAddress?.toLowerCase() === ROBINHOOD_PAIR);
  const liquidityUsd = Number(pair?.liquidity?.usd);
  const validPair = pair?.chainId?.toLowerCase() === "robinhood"
    && pair.dexId?.toLowerCase() === "topaz"
    && pair.pairAddress?.toLowerCase() === ROBINHOOD_PAIR
    && pair.baseToken?.address?.toLowerCase() === EXPECTED_MSS2
    && pair.baseToken?.symbol?.toUpperCase() === "MSS2";

  if (!validPair || !Number.isFinite(liquidityUsd) || liquidityUsd < MIN_LIQUIDITY_USD) {
    throw new Error("The Robinhood MSS2 market did not pass the quote safeguards.");
  }

  return quoteResponse({
    source: "DEX Screener · Robinhood · Topaz",
    chainId: "robinhood",
    pairAddress: ROBINHOOD_PAIR,
    pairUrl: ROBINHOOD_PAIR_URL,
    priceUsd: String(pair?.priceUsd ?? ""),
    liquidityUsd,
    observedAt: new Date().toISOString(),
  });
}

async function arcQuote() {
  const response = await fetch(ARC_TOKEN_API, {
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
  const path = provenance?.path?.map((address) => address.toLowerCase()) ?? [];
  const pools = provenance?.pools?.map((address) => address.toLowerCase()) ?? [];
  const valid = payload.ok === true
    && token?.chainId === ARC_CHAIN_ID
    && token.address?.toLowerCase() === EXPECTED_MSS2
    && token.symbol?.toUpperCase() === "MSS2"
    && token.decimals === 18
    && token.status === "active"
    && observation?.chainId === ARC_CHAIN_ID
    && observation.address?.toLowerCase() === EXPECTED_MSS2
    && observation.decimals === 18
    && observation.status === "resolved"
    && observation.priceUsd === token.priceUsd
    && observation.provenance?.status === "resolved"
    && observation.provenance.chainId === ARC_CHAIN_ID
    && observation.provenance.priceUsd === token.priceUsd
    && provenance?.source === "topaz-direct"
    && path[0] === EXPECTED_MSS2
    && path.at(-1) === ARC_USDC
    && pools.includes(ARC_MSS2_POOL)
    && Number.isFinite(liquidityUsd)
    && liquidityUsd >= MIN_LIQUIDITY_USD
    && token.marketData?.status === "fresh"
    && !payload.meta?.staleChainIds?.includes(ARC_CHAIN_ID)
    && !payload.meta?.failedChainIds?.includes(ARC_CHAIN_ID)
    && Number.isFinite(observedTime)
    && Math.abs(Date.now() - observedTime) <= MAX_ARC_OBSERVATION_AGE_MS;

  if (!valid) throw new Error("The Arc MSS2 market did not pass the quote safeguards.");

  return quoteResponse({
    source: "Topaz API · Arc · MSS2/USDC",
    chainId: "arc",
    pairAddress: ARC_MSS2_POOL,
    pairUrl: ARC_POOL_URL,
    priceUsd: String(token?.priceUsd ?? ""),
    liquidityUsd,
    observedAt,
  });
}

export async function GET(request: Request) {
  const chain = new URL(request.url).searchParams.get("chain")?.toLowerCase() === "arc" ? "arc" : "robinhood";
  try {
    return chain === "arc" ? await arcQuote() : await robinhoodQuote();
  } catch {
    return Response.json({
      error: `The indicative ${chain === "arc" ? "Arc" : "Robinhood"} MSS2 quote is temporarily unavailable.`,
      pairUrl: chain === "arc" ? ARC_POOL_URL : ROBINHOOD_PAIR_URL,
      checkedAt: new Date().toISOString(),
    }, {
      status: 503,
      headers: {
        "Cache-Control": "no-store, max-age=0",
        "Netlify-CDN-Cache-Control": "no-store",
      },
    });
  }
}
