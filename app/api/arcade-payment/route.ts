import { arcadeGame } from "../../../lib/arcade-game";
import { checkArcadePaymentBalance, createArcadePaymentQuote, verifyArcadePayment } from "../../../db/arcade-payments";
import { paymentReadiness, readVerifiedMarketQuote, rpcCall, type Mss2PaymentNetwork } from "../../../lib/mss2-payment";

export const dynamic = "force-dynamic";

function requestedNetwork(value: string | null): Mss2PaymentNetwork {
  return value?.toLowerCase() === "arc" ? "arc" : "robinhood";
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const network = requestedNetwork(url.searchParams.get("chain"));
  const readiness = paymentReadiness(network, url.searchParams.get("wallet") ?? "");
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
    const game = arcadeGame(payload.game);
    const action = String(payload.action ?? "");
    const playerKey = String(payload.playerKey ?? "").trim();
    const walletAddress = String(payload.walletAddress ?? "").trim();
    if (action === "demo-run") {
      return Response.json({ error: "Free flights are disabled. Each flight requires a verified MSS2 entry payment." }, { status: 403, headers: { "Cache-Control": "no-store" } });
    }
    if (action === "approval-check") {
      if (!/^0x[0-9a-fA-F]{64}$/.test(String(payload.txHash))) throw new Error("Invalid approval transaction hash.");
      const network = String(payload.network);
      if (network !== "arc" && network !== "robinhood") throw new Error("Choose Robinhood Chain or Arc.");
      const receipt = await rpcCall<{ status?: string } | null>(network, "eth_getTransactionReceipt", [payload.txHash]);
      if (!receipt) return Response.json({ pending: true }, { status: 202, headers: { "Cache-Control": "no-store" } });
      if (receipt.status !== "0x1") throw new Error("The approval transaction reverted. No entry payment was sent.");
      return Response.json({ pending: false }, { headers: { "Cache-Control": "no-store" } });
    }
    if (action === "quote") {
      const runId = String(payload.runId ?? "").trim();
      const networkValue = String(payload.network ?? "").trim().toLowerCase();
      if (networkValue !== "robinhood" && networkValue !== "arc") {
        return Response.json({ error: "Choose Robinhood Chain or Arc." }, { status: 400 });
      }
      const network: Mss2PaymentNetwork = networkValue;
      return Response.json(await createArcadePaymentQuote({ playerKey, runId, walletAddress, network, game }), { headers: { "Cache-Control": "no-store" } });
    }
    if (action === "verify") {
      const paymentId = String(payload.paymentId ?? "").trim();
      const txHash = String(payload.txHash ?? "").trim();
      const result = await verifyArcadePayment({ paymentId, playerKey, walletAddress, txHash, game });
      return Response.json(result, { status: "pending" in result && result.pending ? 202 : 200, headers: { "Cache-Control": "no-store" } });
    }
    if (action === "balance-check") {
      const paymentId = String(payload.paymentId ?? "").trim();
      if (!/^[a-zA-Z0-9-]{16,80}$/.test(paymentId)) return Response.json({ error: "Request a valid entry quote first." }, { status: 400 });
      return Response.json(await checkArcadePaymentBalance({ paymentId, playerKey, walletAddress, game }), { headers: { "Cache-Control": "no-store" } });
    }
    return Response.json({ error: "Choose a supported payment action." }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "The MSS2 payment could not be processed." }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }
}
