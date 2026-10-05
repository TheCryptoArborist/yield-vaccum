import { readRoundedRobinhoodMss2Balance } from "../../../lib/mss2-balance";

export async function GET(request: Request) {
  const address = new URL(request.url).searchParams.get("address")?.trim() ?? "";
  if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
    return Response.json({ error: "Connect a valid EVM wallet to view its MSS2 balance." }, { status: 400 });
  }

  try {
    const rounded = await readRoundedRobinhoodMss2Balance(address);
    return Response.json(
      { address: address.toLowerCase(), rounded, network: "Robinhood Chain", token: "MSS2" },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "The Robinhood MSS2 balance is temporarily unavailable." },
      { status: 502, headers: { "Cache-Control": "private, no-store" } },
    );
  }
}
