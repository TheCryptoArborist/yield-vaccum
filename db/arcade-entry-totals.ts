import { getStore } from "@netlify/blobs";
import deployments from "../deployment/mss2-entry-router/deployments.json";
import { rpcCall, type Mss2PaymentNetwork } from "../lib/mss2-payment";
import { findRouterStartBlock, publicEntryTotals, scanEntryTotals, type TotalsRpc, type TotalsSnapshot } from "../lib/mss2-entry-totals";

const memory = new Map<string, TotalsSnapshot>();
const inFlight = new Map<string, Promise<ReturnType<typeof publicEntryTotals>>>();

export function readArcadeEntryTotals(network: Mss2PaymentNetwork) {
  const context = process.env.CONTEXT || process.env.NEXT_PUBLIC_NETLIFY_CONTEXT || "local";
  const key = `${context}/${network}/${deployments[network].router}`;
  const running = inFlight.get(key);
  if (running) return running;
  const read = async () => {
    // Caches are isolated by context, but survive preview redeployments. They
    // contain only public contract aggregates, never player or payment records.
    let cache: ReturnType<typeof getStore> | null = null;
    try { cache = getStore(`mint-flyer-entry-totals-${context}`, { consistency: "strong" }); } catch { /* Local development has no Blobs context. */ }
    const blobKey = `${network}/${deployments[network].router}.json`;
    let snapshot = memory.get(key) ?? null;
    if (!snapshot && cache) {
      try { snapshot = await cache.get(blobKey, { type: "json" }) as TotalsSnapshot | null; } catch { /* Chain reads can continue without a cache. */ }
    }
    if (snapshot && Date.now() - Date.parse(snapshot.checkedAt) < (snapshot.complete ? 30_000 : 3_000)) return publicEntryTotals(network, snapshot);
    const rpc: TotalsRpc = (method, params) => rpcCall(network, method, params);
    let startBlock = snapshot?.startBlock;
    if (startBlock === undefined && cache) {
      try { startBlock = (await cache.get(`${blobKey}.origin`, { type: "json" }) as { block?: number } | null)?.block; } catch { /* Discover from the RPC below. */ }
    }
    if (startBlock === undefined) {
      const head = Number(BigInt(await rpc<string>("eth_blockNumber", [])));
      // Confirm that code exists before discovering the first historical block.
      if (await rpc<string>("eth_getCode", [deployments[network].router, "latest"]) === "0x") throw new Error("Entry router is unavailable.");
      startBlock = await findRouterStartBlock(rpc, deployments[network].router, head);
      if (cache) { try { await cache.setJSON(`${blobKey}.origin`, { block: startBlock }); } catch { /* Cache persistence is optional. */ } }
    }
    const next = await scanEntryTotals(network, rpc, snapshot, startBlock);
    memory.set(key, next);
    if (cache) { try { await cache.setJSON(blobKey, next); } catch { /* The verified response is still usable. */ } }
    return publicEntryTotals(network, next);
  };
  const promise = read().catch(() => publicEntryTotals(network, null)).finally(() => inFlight.delete(key));
  inFlight.set(key, promise);
  return promise;
}
