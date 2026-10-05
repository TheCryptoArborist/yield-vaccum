import { createArcadePaymentQuote, verifyArcadePayment } from "../../../db/arcade-payments";
import { paymentReadiness } from "../../../lib/mss2-payment";

export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json(paymentReadiness(), { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  try {
    const payload = await request.json() as Record<string, unknown>;
    const action = String(payload.action ?? "");
    const playerKey = String(payload.playerKey ?? "").trim();
    const walletAddress = String(payload.walletAddress ?? "").trim();
    if (action === "quote") {
      const runId = String(payload.runId ?? "").trim();
      return Response.json(await createArcadePaymentQuote({ playerKey, runId, walletAddress }), { headers: { "Cache-Control": "no-store" } });
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
