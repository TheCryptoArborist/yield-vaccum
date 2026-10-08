import { readArcadeEntryTotals } from "../../../db/arcade-entry-totals";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const network = new URL(request.url).searchParams.get("chain");
  if (network !== "robinhood" && network !== "arc") return Response.json({ error: "Choose Robinhood Chain or Arc." }, { status: 400 });
  const totals = await readArcadeEntryTotals(network);
  return Response.json(totals, { status: totals.status === "unavailable" ? 503 : 200, headers: { "Cache-Control": "no-store" } });
}
