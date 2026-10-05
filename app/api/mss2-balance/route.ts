import { isMss2BalanceChainId, readRoundedMss2Balance } from "../../../lib/mss2-balance";

export async function GET(request: Request) {
  const searchParams = new URL(request.url).searchParams;
  const address = searchParams.get("address")?.trim() ?? "";
  const chainId = searchParams.get("chainId")?.trim().toLowerCase() ?? "";
  if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
    return Response.json({ error: "Connect a valid EVM wallet to view its MSS2 balance." }, { status: 400 });
  }
  if (!isMss2BalanceChainId(chainId)) {
    return Response.json(
      { error: "MSS2 balances are available on Robinhood Chain and Arc." },
      { status: 400, headers: { "Cache-Control": "private, no-store" } },
    );
  }

  try {
    const balance = await readRoundedMss2Balance(address, chainId);
    return Response.json(
      { address: address.toLowerCase(), rounded: balance.rounded, network: balance.network, chainId, token: "MSS2" },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "The MSS2 balance is temporarily unavailable." },
      { status: 502, headers: { "Cache-Control": "private, no-store" } },
    );
  }
}
