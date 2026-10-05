const DEXSCREENER_PAIR_API = "https://api.dexscreener.com/latest/dex/pairs/robinhood/0xdfcc6ad671033f7d3eceb24cbae5c0f7f6f8d91e";
const PAIR_URL = "https://dexscreener.com/robinhood/0xdfcc6ad671033f7d3eceb24cbae5c0f7f6f8d91e";
const EXPECTED_PAIR = "0xdfcc6ad671033f7d3eceb24cbae5c0f7f6f8d91e";
const EXPECTED_MSS2 = "0x091f0c7e675a787a4018eb47c30bed3fa2013b65";
const ENTRY_PRICE_USD = 1;
const QUOTE_LIFETIME_MS = 90_000;

type DexPair = {
  chainId?: string;
  dexId?: string;
  pairAddress?: string;
  baseToken?: { address?: string; name?: string; symbol?: string };
  quoteToken?: { address?: string; name?: string; symbol?: string };
  priceUsd?: string | null;
  liquidity?: { usd?: number | null } | null;
};

function displayAmount(value: number) {
  if (value >= 1000) return value.toFixed(2);
  if (value >= 1) return value.toFixed(4);
  return value.toFixed(8);
}

export async function GET() {
  try {
    const response = await fetch(DEXSCREENER_PAIR_API, {
      headers: { Accept: "application/json", "User-Agent": "Yield Vacuum/1.0" },
      next: { revalidate: 30 },
    });
    if (!response.ok) throw new Error(`DEX Screener returned ${response.status}`);

    const data = await response.json() as { pair?: DexPair; pairs?: DexPair[] };
    const pair = data.pair ?? data.pairs?.find((item) => item.pairAddress?.toLowerCase() === EXPECTED_PAIR);
    const validPair = pair?.chainId?.toLowerCase() === "robinhood"
      && pair.dexId?.toLowerCase() === "topaz"
      && pair.pairAddress?.toLowerCase() === EXPECTED_PAIR
      && pair.baseToken?.address?.toLowerCase() === EXPECTED_MSS2
      && pair.baseToken?.symbol?.toUpperCase() === "MSS2";
    const priceUsd = Number(pair?.priceUsd);

    if (!validPair || !Number.isFinite(priceUsd) || priceUsd <= 0) {
      throw new Error("DEX Screener returned an unexpected MSS2 pair or price");
    }

    const checkedAt = new Date();
    const quoteId = `demo-${checkedAt.getTime().toString(36)}-${Math.round(priceUsd * 1e12).toString(36)}`;

    return Response.json({
      source: "DEX Screener",
      status: "indicative",
      quoteId,
      chainId: "robinhood",
      dexId: "topaz",
      pairAddress: EXPECTED_PAIR,
      tokenAddress: EXPECTED_MSS2,
      pairUrl: PAIR_URL,
      priceUsd: pair?.priceUsd,
      entryPriceUsd: ENTRY_PRICE_USD.toFixed(2),
      indicativeMss2ForEntry: displayAmount(ENTRY_PRICE_USD / priceUsd),
      liquidityUsd: pair?.liquidity?.usd ?? null,
      checkedAt: checkedAt.toISOString(),
      validUntil: new Date(checkedAt.getTime() + QUOTE_LIFETIME_MS).toISOString(),
    }, {
      headers: { "Cache-Control": "public, max-age=15, s-maxage=30, stale-while-revalidate=120" },
    });
  } catch {
    return Response.json({
      error: "The indicative MSS2 quote is temporarily unavailable.",
      pairUrl: PAIR_URL,
      checkedAt: new Date().toISOString(),
    }, {
      status: 503,
      headers: { "Cache-Control": "public, max-age=10, s-maxage=15" },
    });
  }
}
