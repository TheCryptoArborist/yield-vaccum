import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import type { TopazIdProvider } from "@topazdex/id-connect/provider";
import { displayNameForWallet } from "@topazdex/id-connect";
import { createTopazIdWallet } from "../lib/topaz-id-wallet";

const account = "0x1111111111111111111111111111111111111111" as const;

function fixture() {
  const calls: string[] = [];
  const provider: TopazIdProvider = {
    request: async () => { throw new Error("Raw wallet requests must not replace SDK consent"); },
    on: () => undefined,
    removeListener: () => undefined,
  };
  const wallet = createTopazIdWallet({
    createTopazIdProvider: (options) => {
      assert.deepEqual(options?.chains?.map((chain) => chain.id), [56, 4663, 5042]);
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
  });
  return { wallet, calls };
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

test("Topaz ID is browser-loaded only for the free campaign, not paid MSS2 entries", () => {
  const source = readFileSync(new URL("../app/wallet-connect.tsx", import.meta.url), "utf8");
  assert.match(source, /if \(theme !== "topaz"\) return;[\s\S]*import\("\.\.\/lib\/topaz-id-wallet"\)/);
  assert.match(source, /if \(selectedWallet\.connect\) throw new Error\("Topaz ID is available for sign-in only/);
  assert.match(source, /method: "eth_accounts"/); // silent restore, no requestAccounts on load
  assert.match(source, /theme === "topaz" && <div/);
  assert.match(source, /Free campaign progress stays on this device/);
  assert.match(source, /removeListener\?\.\("disconnect", handleDisconnect\)/);
});
