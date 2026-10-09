import { getDatabase } from "@netlify/database";
import { createPublicClient, http } from "viem";
import { paymentNetworkConfig } from "../../../lib/mss2-payment";
import { trialMessage, validateTrialChallenge, type TrialChallenge } from "../../../lib/mint-flyer-trial";

export const dynamic = "force-dynamic";
let database: ReturnType<typeof getDatabase> | undefined;
const trialDatabase = () => database ??= getDatabase({ connectionString: process.env.NETLIFY_DB_URL });
const headers = { "Cache-Control": "no-store" };

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const challenge: TrialChallenge = { wallet: url.searchParams.get("wallet") ?? "", playerKey: url.searchParams.get("playerKey") ?? "", network: url.searchParams.get("network") as TrialChallenge["network"], runId: crypto.randomUUID(), issuedAt: Date.now() };
    validateTrialChallenge(challenge);
    const db = trialDatabase();
    const rows = await db.sql`SELECT wallet FROM mint_flyer_trials WHERE wallet = ${challenge.wallet.toLowerCase()}`;
    return Response.json({ available: rows.length === 0, challenge, message: trialMessage(challenge, url.host) }, { headers });
  } catch {
    return Response.json({ error: "Free-flight availability could not be checked. Paid entry remains available." }, { status: 503, headers });
  }
}

export async function POST(request: Request) {
  try {
    if (Number(request.headers.get("content-length") ?? 0) > 32_000) throw new Error("Request too large.");
    const body = await request.text();
    if (body.length > 32_000) throw new Error("Request too large.");
    const { challenge, signature } = JSON.parse(body) as { challenge: TrialChallenge; signature: string };
    validateTrialChallenge(challenge);
    if (typeof signature !== "string" || !/^0x[0-9a-fA-F]+$/.test(signature) || signature.length > 20_000) throw new Error("A wallet signature is required.");
    const config = paymentNetworkConfig(challenge.network);
    const client = createPublicClient({ transport: http(config.rpcUrl, { timeout: 12_000, retryCount: 0 }) });
    if (await client.getChainId() !== config.chainId) throw new Error("The wallet verification network is unavailable.");
    // viem verifies EOAs, ERC-1271 smart wallets, and counterfactual ERC-6492 signatures.
    const verified = await client.verifyMessage({ address: challenge.wallet as `0x${string}`, message: trialMessage(challenge, new URL(request.url).host), signature: signature as `0x${string}` });
    if (!verified) throw new Error("This signature does not belong to the connected wallet.");
    const db = trialDatabase();
    const wallet = challenge.wallet.toLowerCase();
    const created = await db.sql`INSERT INTO mint_flyer_trials (wallet, player_key, run_id, network) VALUES (${wallet}, ${challenge.playerKey}, ${challenge.runId}, ${challenge.network}) ON CONFLICT (wallet) DO NOTHING RETURNING run_id`;
    if (!created.length) {
      const existing = await db.sql<{ run_id: string; player_key: string; network: string }>`SELECT run_id, player_key, network FROM mint_flyer_trials WHERE wallet = ${wallet}`;
      if (existing[0]?.run_id !== challenge.runId || existing[0]?.player_key !== challenge.playerKey || existing[0]?.network !== challenge.network) {
        return Response.json({ error: "This wallet has already used its free introductory flight. Please use paid entry.", used: true }, { status: 409, headers });
      }
    }
    return Response.json({ authorized: true, runId: challenge.runId, network: challenge.network }, { headers });
  } catch (error) {
    return Response.json({ error: error instanceof Error && /^(Your free-flight|Request too large|A wallet signature|The wallet verification|This signature)/.test(error.message) ? error.message : "Your free flight could not be authorized. Please retry." }, { status: 400, headers });
  }
}
