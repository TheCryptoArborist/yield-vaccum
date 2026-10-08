import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import type { TopazIdProvider } from "@topazdex/id-connect/provider";
import { displayNameForWallet } from "@topazdex/id-connect";
import { createTopazIdWallet } from "../lib/topaz-id-wallet";
import { createTopazIdClient } from "@topazdex/id-connect/actions";

const account = "0x1111111111111111111111111111111111111111" as const;

const operationHash = `0x${"aa".repeat(32)}`;
const transactionHash = `0x${"bb".repeat(32)}`;
function fixture(arcade = false, rejectBatch = false, failedOperation = false, pending = false) {
  const calls: string[] = [];
  const requests: { method: string; params?: unknown[] }[] = [];
  const userOperationLog = {
    address: "0x0000000071727De22E5E9d8BAf0edAc6f37da032",
    topics: ["0x49628fd1471006c1482da88028e9ce4dbb080b815c9b0344d39e5a8e6ec1419f", operationHash, `0x${"0".repeat(24)}${account.slice(2)}`],
    data: `0x${"0".repeat(64)}${(failedOperation ? "0" : "1").padStart(64, "0")}${"0".repeat(128)}`,
    transactionHash,
  };
  const provider: TopazIdProvider = {
    request: async (request) => {
      requests.push(request);
      if (request.method === "privy_sendSmartWalletTx") {
        if (rejectBatch) throw new Error("batch unsupported");
        return operationHash;
      }
      if (request.method === "eth_getTransactionReceipt") return request.params?.[0] === operationHash ? null : { transactionHash, status: "0x1", logs: [userOperationLog] };
      if (request.method === "eth_blockNumber") return "0x100";
      if (request.method === "eth_getLogs") return [userOperationLog];
      throw new Error("Unexpected raw wallet request");
    },
    on: () => undefined,
    removeListener: () => undefined,
  };
  const wallet = createTopazIdWallet({
    createTopazIdProvider: (options) => {
      assert.deepEqual(options?.chains?.map((chain) => chain.id), arcade ? [4663, 5042] : [56, 4663, 5042]);
      calls.push("create");
      return provider;
    },
    connectTopazId: async (value) => {
      assert.equal(value, provider);
      calls.push("connect");
      return { account, chainId: 4663 };
    },
    disconnectTopazId: async (value) => {
      assert.equal(value, provider);
      calls.push("disconnect");
    },
    fetchTopazIdProfile: async () => null,
    displayNameForWallet,
    createTopazIdClient: async (options) => {
      const client = await createTopazIdClient(options);
      return pending ? { ...client, waitForReceipt: async () => null } : client;
    },
  }, arcade);
  return { wallet, calls, requests };
}

test("Topaz ID uses official consent and revocation, never injected wallet permissions", async () => {
  const { wallet, calls } = fixture();
  assert.deepEqual(calls, ["create"]); // creating an option never prompts
  assert.deepEqual(await wallet.connect(), { account, chainId: "0x1237" });
  await wallet.disconnect();
  assert.deepEqual(calls, ["create", "connect", "disconnect"]);
});

test("an unavailable public profile falls back to the smart wallet address", async () => {
  const { wallet } = fixture();
  assert.equal(await wallet.label(account), displayNameForWallet(null, account));
});

test("Topaz ID is browser-loaded for both games with a separate smart-payment path", () => {
  const source = readFileSync(new URL("../app/wallet-connect.tsx", import.meta.url), "utf8");
  assert.match(source, /createTopazIdWallet\(undefined, theme === "mss"\)/);
  assert.match(source, /if \(selectedWallet\.connect\) throw new Error\("Use the atomic Topaz ID/);
  assert.match(source, /method: "eth_accounts"/); // silent restore, no requestAccounts on load
  assert.match(source, /sendCalls: selectedWallet\.sendCalls/);
  assert.match(source, /Free campaign progress stays on this device/);
  assert.match(source, /removeListener\?\.\("disconnect", handleDisconnect\)/);
});

test("Topaz ID submits approval and entry once, on the requested chain, atomically", async () => {
  const { wallet, requests } = fixture(true);
  await wallet.connect();
  const calls = [{ to: account, data: "0x1234", value: "0x0" }, { to: account, data: "0xabcd", value: "0x0" }];
  assert.equal(await wallet.sendCalls(account, "0x13b2", calls), operationHash);
  assert.deepEqual(requests, [{ method: "privy_sendSmartWalletTx", params: [{ from: account, chainId: 5042, calls: calls.map((call) => ({ ...call, value: 0 })) }] }]);
  assert.equal(await wallet.resolveTransaction(account, "0x13b2", operationHash), transactionHash);
});

test("unsupported atomic batching never falls back to extra consent or separate payments", async () => {
  const { wallet, requests } = fixture(true, true);
  await wallet.connect();
  await assert.rejects(wallet.sendCalls(account, "0x1237", [{ to: account, data: "0x" }, { to: account, data: "0x" }]), /batch unsupported/);
  assert.equal(requests.length, 1);
});

test("a successful outer bundle with a failed UserOperation does not authorize flight", async () => {
  const { wallet } = fixture(true, false, true);
  await wallet.connect();
  await assert.rejects(wallet.resolveTransaction(account, "0x1237", operationHash), /operation failed/);
});

test("wrong account, unsupported chain and native-currency transfers cannot be sent", async () => {
  const { wallet } = fixture(true);
  await wallet.connect();
  assert.throws(() => wallet.sendCalls("0x2222222222222222222222222222222222222222", "0x1237", []), /preparing/);
  assert.throws(() => wallet.sendCalls(account, "0x38", []), /preparing/);
  assert.throws(() => wallet.sendCalls(account, "0x1237", [{ to: account, data: "0x", value: "0x1" }]), /must not send native/);
  await wallet.disconnect();
  assert.throws(() => wallet.sendCalls(account, "0x1237", []), /preparing/);
});

test("pending receipt retries never submit approval or payment again", async () => {
  const { wallet, requests } = fixture(true, false, false, true);
  await wallet.connect();
  const hash = await wallet.sendCalls(account, "0x1237", [{ to: account, data: "0x" }, { to: account, data: "0x" }]);
  assert.equal(await wallet.resolveTransaction(account, "0x1237", hash), null);
  assert.equal(await wallet.resolveTransaction(account, "0x1237", hash), null);
  assert.equal(requests.length, 1);
});

test("Mint Flyer invokes smart consent before HTTP balance checks and retains pending operations", () => {
  const source = readFileSync(new URL("../app/arcade/mint-flyer.tsx", import.meta.url), "utf8");
  const smartPath = source.slice(source.indexOf("if (!txHash && smartWallet)"), source.indexOf("} else if (!txHash)"));
  assert.doesNotMatch(smartPath, /await readLiveEntryBalance/);
  assert.match(smartPath, /await walletConnection.sendCalls/);
  assert.match(smartPath, /pendingPaymentsRef.current.set/);
  assert.match(source, /paymentInFlightRef.current = true/);
  assert.match(source, /if \(!resolved\) throw new Error\("Your Topaz ID operation is still pending/);
  assert.match(source, /pendingPaymentsRef.current.get/);
});
