import { AbiCoder, keccak256 } from "ethers";
import deployments from "../deployment/mss2-entry-router/deployments.json";
import { ENTRY_PAID_TOPIC, MSS2_TOKEN, addressTopic, paymentNetworkConfig, splitEntryAmount, type Mss2PaymentNetwork } from "./mss2-payment";

export type EntryTotals = {
  network: Mss2PaymentNetwork;
  status: "ready" | "syncing" | "unavailable";
  deadAmountRaw: string | null;
  communityAmountRaw: string | null;
  entries: number | null;
  checkedAt: string | null;
  throughBlock: number | null;
  routerAddress: string;
  explorerUrl: string;
};

export type EntryLog = { address: string; topics: string[]; data: string; blockNumber: string; transactionHash: string; logIndex: string; removed?: boolean };
type BlockTotal = { block: number; dead: string; community: string; entries: number };
export type TotalsSnapshot = {
  version: 1;
  router: string;
  startBlock: number;
  throughBlock: number;
  anchorBlock: number;
  anchorHash: string | null;
  dead: string;
  community: string;
  entries: number;
  recent: BlockTotal[];
  complete: boolean;
  checkedAt: string;
};
export type TotalsRpc = <T>(method: string, params: unknown[]) => Promise<T>;
const REORG_WINDOW = 64;
const PAGE_BLOCKS = 10_000;
const MAX_PAGES = 8;
const hex = (block: number) => `0x${block.toString(16)}`;

export function sumEntryLogs(logs: EntryLog[], router: string, fromBlock: number, toBlock: number): BlockTotal[] {
  const seen = new Set<string>();
  const blocks = new Map<number, BlockTotal>();
  for (const log of logs) {
    if (log.removed) continue;
    if (log.address.toLowerCase() !== router.toLowerCase() || log.topics[0]?.toLowerCase() !== ENTRY_PAID_TOPIC
      || log.topics[3]?.toLowerCase() !== addressTopic(MSS2_TOKEN)) throw new Error("Unexpected entry log source.");
    const block = Number(BigInt(log.blockNumber));
    if (!Number.isSafeInteger(block) || block < fromBlock || block > toBlock) throw new Error("Entry log outside the requested confirmed range.");
    if (!/^0x[0-9a-f]{64}$/i.test(log.transactionHash) || !/^0x[0-9a-f]+$/i.test(log.logIndex)) throw new Error("Entry log identity is missing.");
    const identity = `${log.transactionHash.toLowerCase()}:${BigInt(log.logIndex)}`;
    if (seen.has(identity)) continue;
    seen.add(identity);
    const [total, dead, community] = AbiCoder.defaultAbiCoder().decode(["uint256", "uint256", "uint256"], log.data) as unknown as [bigint, bigint, bigint];
    const split = splitEntryAmount(total.toString());
    if (total < BigInt(5) || dead !== BigInt(split.deadAddressAmount) || community !== BigInt(split.communityReserveAmount)) throw new Error("Entry log allocation did not match the router.");
    const row = blocks.get(block) ?? { block, dead: "0", community: "0", entries: 0 };
    row.dead = (BigInt(row.dead) + dead).toString();
    row.community = (BigInt(row.community) + community).toString();
    row.entries += 1;
    blocks.set(block, row);
  }
  return [...blocks.values()].sort((a, b) => a.block - b.block);
}

export async function readRouterStartBlock(network: Mss2PaymentNetwork, rpc: TotalsRpc) {
  const record = deployments[network];
  const receipt = await rpc<{ status?: string; contractAddress?: string; transactionHash?: string; blockNumber?: string } | null>("eth_getTransactionReceipt", [record.deploymentTransactionHash]);
  if (receipt?.status !== "0x1" || receipt.contractAddress?.toLowerCase() !== record.router.toLowerCase()
    || receipt.transactionHash?.toLowerCase() !== record.deploymentTransactionHash.toLowerCase() || !receipt.blockNumber) throw new Error("The router creation receipt could not be verified.");
  const block = Number(BigInt(receipt.blockNumber));
  if (!Number.isSafeInteger(block) || block < 0) throw new Error("Invalid router creation block.");
  return block;
}

export async function scanEntryTotals(network: Mss2PaymentNetwork, rpc: TotalsRpc, previous: TotalsSnapshot | null, startBlock: number): Promise<TotalsSnapshot> {
  const record = deployments[network];
  const config = paymentNetworkConfig(network);
  const [chain, headHex, code] = await Promise.all([
    rpc<string>("eth_chainId", []), rpc<string>("eth_blockNumber", []), rpc<string>("eth_getCode", [record.router, "latest"]),
  ]);
  if (Number(BigInt(chain)) !== config.chainId || keccak256(code) !== record.runtimeCodeHash) throw new Error("Entry totals source did not match the verified router and network.");
  const head = Number(BigInt(headHex)) - config.confirmations + 1;
  if (!Number.isSafeInteger(head) || head < startBlock) throw new Error("Router history has not reached the required confirmations.");
  let snapshot = previous?.version === 1 && previous.router === record.router && previous.startBlock === startBlock && previous.throughBlock <= head ? previous : null;
  if (snapshot?.anchorHash) {
    const anchor = await rpc<{ hash?: string } | null>("eth_getBlockByNumber", [hex(snapshot.anchorBlock), false]);
    if (anchor?.hash !== snapshot.anchorHash) snapshot = null;
  }
  const fromBlock = snapshot ? Math.max(startBlock, snapshot.throughBlock - REORG_WINDOW + 1) : startBlock;
  let dead = BigInt(snapshot?.dead ?? "0");
  let community = BigInt(snapshot?.community ?? "0");
  let entries = snapshot?.entries ?? 0;
  for (const row of snapshot?.recent ?? []) {
    dead -= BigInt(row.dead); community -= BigInt(row.community); entries -= row.entries;
  }
  let throughBlock = fromBlock - 1;
  const recent: BlockTotal[] = [];
  let pageSize = network === "robinhood" ? 1_000_000 : PAGE_BLOCKS;
  for (let page = 0; page < MAX_PAGES && throughBlock < head; page += 1) {
    const next = throughBlock + 1;
    let end = Math.min(head, next + pageSize - 1);
    let logs: EntryLog[];
    try {
      logs = await rpc<EntryLog[]>("eth_getLogs", [{ address: record.router, topics: [ENTRY_PAID_TOPIC], fromBlock: hex(next), toBlock: hex(end) }]);
    } catch (error) {
      // Some RPCs impose a smaller block-range limit. Retry the same page;
      // never skip a failed range or publish it as a zero contribution.
      if (pageSize <= 1_000) throw error;
      pageSize = 1_000;
      end = Math.min(head, next + pageSize - 1);
      logs = await rpc<EntryLog[]>("eth_getLogs", [{ address: record.router, topics: [ENTRY_PAID_TOPIC], fromBlock: hex(next), toBlock: hex(end) }]);
    }
    if (!Array.isArray(logs)) throw new Error("Entry log response was unavailable.");
    for (const row of sumEntryLogs(logs, record.router, next, end)) {
      dead += BigInt(row.dead); community += BigInt(row.community); entries += row.entries;
      recent.push(row);
    }
    throughBlock = end;
  }
  const anchorBlock = Math.max(startBlock - 1, throughBlock - REORG_WINDOW);
  const anchor = anchorBlock >= 0 ? await rpc<{ hash?: string } | null>("eth_getBlockByNumber", [hex(anchorBlock), false]) : null;
  if (anchorBlock >= 0 && !anchor?.hash) throw new Error("Entry history anchor was unavailable.");
  return {
    version: 1, router: record.router, startBlock, throughBlock, anchorBlock, anchorHash: anchor?.hash ?? null,
    dead: dead.toString(), community: community.toString(), entries,
    recent: recent.filter((row) => row.block > throughBlock - REORG_WINDOW),
    complete: throughBlock === head, checkedAt: new Date().toISOString(),
  };
}

export function publicEntryTotals(network: Mss2PaymentNetwork, snapshot: TotalsSnapshot | null): EntryTotals {
  return {
    network, status: !snapshot ? "unavailable" : snapshot.complete ? "ready" : "syncing",
    deadAmountRaw: snapshot?.complete ? snapshot.dead : null,
    communityAmountRaw: snapshot?.complete ? snapshot.community : null,
    entries: snapshot?.complete ? snapshot.entries : null,
    checkedAt: snapshot?.checkedAt ?? null, throughBlock: snapshot?.throughBlock ?? null,
    routerAddress: deployments[network].router, explorerUrl: paymentNetworkConfig(network).explorerUrl,
  };
}

