import { createArcadePaymentQuote, createDemoRunAuthorization, verifyArcadePayment } from "../../../db/arcade-payments";
import { paymentReadiness, readVerifiedMarketQuote, type Mss2PaymentNetwork } from "../../../lib/mss2-payment";

export const dynamic = "force-dynamic";

function requestedNetwork(value: string | null): Mss2PaymentNetwork {
  return value?.toLowerCase() === "arc" ? "arc" : "robinhood";
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const network = requestedNetwork(url.searchParams.get("chain"));
  const readiness = paymentReadiness(network);
  if (url.searchParams.get("diagnostics") !== "1") {
    return Response.json(readiness, { headers: { "Cache-Control": "no-store" } });
  }
  try {
    const market = await readVerifiedMarketQuote(network, BigInt(0));
    return Response.json({ ...readiness, diagnostics: { deployment: "VERIFIED", decimals: 18, priceSource: network === "arc" ? "Topaz API · Arc · MSS2/USDC" : "DEX Screener · Robinhood · Topaz", priceUsd: market.priceUsd, liquidityUsd: market.liquidityUsd, indicativeAmount: market.displayAmount, checkedAt: market.checkedAt } }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json({ ...readiness, diagnostics: { deployment: "UNAVAILABLE", error: error instanceof Error ? error.message : "Payment diagnostics failed." } }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}

export async function POST(request: Request) {
  try {
    const payload = await request.json() as Record<string, unknown>;
    const action = String(payload.action ?? "");
    const playerKey = String(payload.playerKey ?? "").trim();
    const walletAddress = String(payload.walletAddress ?? "").trim();
    if (action === "demo-run") {
      const network = String(payload.network ?? "").trim();
      if (network !== "robinhood" && network !== "arc") return Response.json({ error: "Choose Robinhood Chain or Arc." }, { status: 400 });
      return Response.json(await createDemoRunAuthorization({ playerKey, network }), { headers: { "Cache-Control": "no-store" } });
    }
    if (action === "quote") {
      const runId = String(payload.runId ?? "").trim();
      const networkValue = String(payload.network ?? "").trim().toLowerCase();
      if (networkValue !== "robinhood" && networkValue !== "arc") {
        return Response.json({ error: "Choose Robinhood Chain or Arc." }, { status: 400 });
      }
      const network: Mss2PaymentNetwork = networkValue;
      return Response.json(await createArcadePaymentQuote({ playerKey, runId, walletAddress, network }), { headers: { "Cache-Control": "no-store" } });
    }
    if (action === "verify") {
      const paymentId = String(payload.paymentId ?? "").trim();
      const txHash = String(payload.txHash ?? "").trim();
      const result = await verifyArcadePayment({ paymentId, playerKey, walletAddress, txHash });
      return Response.json(result, { status: "pending" in result && result.pending ? 202 : 200, headers: { "Cache-Control": "no-store" } });
    }
    return Response.json({ error: "Choose a supported payment action." }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "The MSS2 payment could not be processed." }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }
}
