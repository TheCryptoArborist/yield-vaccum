import assert from "node:assert/strict";
import test from "node:test";
import { AbiCoder, parseUnits } from "ethers";
import artifact from "../deployment/mss2-entry-router/Mss2EntryRouter.artifact.json";
import deployments from "../deployment/mss2-entry-router/deployments.json";
import { ENTRY_PAID_TOPIC, MSS2_TOKEN, addressTopic, splitEntryAmount } from "../lib/mss2-payment";
import { readRouterStartBlock, publicEntryTotals, scanEntryTotals, sumEntryLogs, type EntryLog, type TotalsRpc } from "../lib/mss2-entry-totals";
import { formatEntryTotal } from "../lib/mss2-entry-totals-display";

const router = deployments.robinhood.router;
function entry(block: number, amount = "100000000000000000003", transaction = "ab"): EntryLog {
  const split = splitEntryAmount(amount);
  return {
    address: router, topics: [ENTRY_PAID_TOPIC, `0x${"11".repeat(32)}`, addressTopic("0x1111111111111111111111111111111111111111"), addressTopic(MSS2_TOKEN)],
    blockNumber: `0x${block.toString(16)}`, transactionHash: `0x${transaction.repeat(32)}`, logIndex: "0x0",
    data: AbiCoder.defaultAbiCoder().encode(["uint256", "uint256", "uint256"], [BigInt(split.totalAmount), BigInt(split.deadAddressAmount), BigInt(split.communityReserveAmount)]),
  };
}
function fixture(head: number, logs: EntryLog[], changedAnchor = false, rangeLimit = Infinity): TotalsRpc {
  return async <T>(method: string, params: unknown[]) => {
    let value: unknown;
    if (method === "eth_chainId") value = "0x1237";
    else if (method === "eth_blockNumber") value = `0x${head.toString(16)}`;
    else if (method === "eth_getCode") value = artifact.deployedBytecode;
    else if (method === "eth_getBlockByNumber") value = { hash: `${changedAnchor ? "new" : "original"}-${params[0]}` };
    else if (method === "eth_getLogs") {
      const filter = params[0] as { fromBlock: string; toBlock: string };
      const from = Number(BigInt(filter.fromBlock)); const to = Number(BigInt(filter.toBlock));
      if (to - from + 1 > rangeLimit) throw new Error("Block range limit exceeded");
      value = logs.filter((log) => Number(BigInt(log.blockNumber)) >= from && Number(BigInt(log.blockNumber)) <= to);
    } else throw new Error(`Unexpected method ${method}`);
    return value as T;
  };
}

test("entry totals deduplicate logs, ignore removed events, and preserve every raw token unit", () => {
  const log = entry(100);
  const rows = sumEntryLogs([log, log, { ...entry(100, "5", "cd"), removed: true }], router, 100, 100);
  assert.equal(rows.length, 1); assert.equal(rows[0].entries, 1);
  assert.equal(BigInt(rows[0].dead) + BigInt(rows[0].community), BigInt("100000000000000000003"));
  assert.equal(rows[0].dead, "20000000000000000000");
});

test("wrong token, router, range, or 20/80 allocation cannot become a public total", () => {
  const log = entry(100);
  assert.throws(() => sumEntryLogs([{ ...log, address: MSS2_TOKEN }], router, 100, 100));
  assert.throws(() => sumEntryLogs([{ ...log, topics: [...log.topics.slice(0, 3), addressTopic(router)] }], router, 100, 100));
  assert.throws(() => sumEntryLogs([log], router, 101, 110));
  assert.throws(() => sumEntryLogs([{ ...log, data: AbiCoder.defaultAbiCoder().encode(["uint256", "uint256", "uint256"], [100, 19, 81]) }], router, 100, 100));
});

test("confirmed scanning excludes the unconfirmed tip and refreshes without double counting", async () => {
  const logs = [entry(100), entry(101, "5000000000000000000", "cd"), entry(200, "5", "ef")];
  const first = await scanEntryTotals("robinhood", fixture(200, logs), null, 90);
  assert.equal(first.throughBlock, 199); assert.equal(first.entries, 2);
  const second = await scanEntryTotals("robinhood", fixture(201, logs), first, 90);
  assert.equal(second.entries, 3);
  const repeated = await scanEntryTotals("robinhood", fixture(201, logs), second, 90);
  assert.equal(repeated.dead, second.dead); assert.equal(repeated.community, second.community); assert.equal(repeated.entries, 3);
});

test("a recent reorganization replaces old contributions; a changed anchor rebuilds history", async () => {
  const first = await scanEntryTotals("robinhood", fixture(200, [entry(100), entry(180, "5000000000000000000", "cd")]), null, 90);
  const tailReorg = await scanEntryTotals("robinhood", fixture(200, [entry(100), entry(181, "1000000000000000000", "ef")]), first, 90);
  assert.equal(tailReorg.entries, 2); assert.equal(tailReorg.dead, "20200000000000000000");
  const deepReorg = await scanEntryTotals("robinhood", fixture(200, [entry(110, "5000000000000000000", "cd")], true), first, 90);
  assert.equal(deepReorg.entries, 1); assert.equal(deepReorg.dead, "1000000000000000000");
});

test("bounded history scans resume across requests and never label partial history as lifetime totals", async () => {
  const logs = [entry(100), entry(10000000, "5", "cd")];
  const first = await scanEntryTotals("robinhood", fixture(12000000, logs), null, 90);
  assert.equal(first.complete, false); assert.equal(publicEntryTotals("robinhood", first).status, "syncing");
  assert.equal(publicEntryTotals("robinhood", first).deadAmountRaw, null);
  const next = await scanEntryTotals("robinhood", fixture(12000000, logs), first, 90);
  assert.equal(next.complete, true); assert.equal(next.entries, 2);
});

test("RPC block-range limits use smaller pages without skipping contributions", async () => {
  const result = await scanEntryTotals("robinhood", fixture(5000, [entry(100), entry(4000, "5", "cd")], false, 1000), null, 90);
  assert.equal(result.complete, true); assert.equal(result.entries, 2);
});

test("a failed later RPC page preserves a resumable checkpoint without publishing partial totals", async () => {
  const underlying = fixture(2000000, [entry(100), entry(1500000, "5", "cd")]);
  const interrupted: TotalsRpc = (method, params) => {
    if (method === "eth_getLogs" && Number(BigInt((params[0] as { fromBlock: string }).fromBlock)) > 1000000) throw new Error("RPC temporarily unavailable");
    return underlying(method, params);
  };
  const first = await scanEntryTotals("robinhood", interrupted, null, 90);
  assert.equal(first.complete, false); assert.equal(first.entries, 1);
  assert.equal(publicEntryTotals("robinhood", first).deadAmountRaw, null);
  const next = await scanEntryTotals("robinhood", underlying, first, 90);
  assert.equal(next.complete, true); assert.equal(next.entries, 2);
});

test("unavailable history and wrong-chain evidence cannot be displayed as zero", async () => {
  assert.equal(publicEntryTotals("arc", null).deadAmountRaw, null);
  assert.equal(publicEntryTotals("arc", null).entries, null);
  await assert.rejects(scanEntryTotals("arc", fixture(200, []), null, 90));
  const failing: TotalsRpc = async () => { throw new Error("RPC unavailable"); };
  await assert.rejects(scanEntryTotals("robinhood", failing, null, 90));
});

test("only the fixed router's successful creation receipt establishes the start block", async () => {
  const receipt = { status: "0x1", contractAddress: router, transactionHash: deployments.robinhood.deploymentTransactionHash, blockNumber: "0x7b" };
  const rpc: TotalsRpc = async <T>() => receipt as T;
  assert.equal(await readRouterStartBlock("robinhood", rpc), 123);
  const wrongReceipt: TotalsRpc = async <T>() => ({ ...receipt, contractAddress: MSS2_TOKEN }) as T;
  await assert.rejects(readRouterStartBlock("robinhood", wrongReceipt));
  const failedReceipt: TotalsRpc = async <T>() => ({ ...receipt, status: "0x0" }) as T;
  await assert.rejects(readRouterStartBlock("robinhood", failedReceipt));
});

test("display rounding stays exact for large totals", () => {
  assert.equal(formatEntryTotal(parseUnits("123456789012345678.9999996", 18).toString()), "123,456,789,012,345,679");
  assert.equal(formatEntryTotal(parseUnits("12.000001", 18).toString()), "12.000001");
  assert.equal(formatEntryTotal("0"), "0");
});
