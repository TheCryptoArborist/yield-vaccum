import { createTopazIdProvider, connectTopazId, disconnectTopazId } from "@topazdex/id-connect/provider";
import { bsc, robinhood, arc } from "@topazdex/id-connect/chains";
import { displayNameForWallet, fetchTopazIdProfile } from "@topazdex/id-connect";
import { createTopazIdClient, type TopazIdClient, type TopazIdCall } from "@topazdex/id-connect/actions";

// Loaded only in the browser, before the user clicks: opening the consent
// popup must remain inside the original user gesture (especially on mobile).
const sdk = { createTopazIdProvider, connectTopazId, disconnectTopazId, displayNameForWallet, fetchTopazIdProfile, createTopazIdClient };

export type TopazWalletCall = { to?: string; data: string; value?: string; gas?: string };

export function createTopazIdWallet(api = sdk, arcade = false) {
  const chains = arcade ? [robinhood, arc] as const : [bsc, robinhood, arc] as const;
  const provider = api.createTopazIdProvider({ chains });
  const clients = new Map<string, TopazIdClient>();
  const key = (account: string, chainId: string) => `${account.toLowerCase()}:${Number(chainId)}`;
  const prepare = async (account: string) => {
    await Promise.all(chains.map(async (chain) => {
      const client = await api.createTopazIdClient({ provider, account: account as `0x${string}`, chainId: chain.id });
      clients.set(key(account, String(chain.id)), client);
    }));
  };
  const clientFor = (account: string, chainId: string) => {
    const client = clients.get(key(account, chainId));
    if (!client || client.chainId !== Number(chainId) || client.account.toLowerCase() !== account.toLowerCase()) {
      throw new Error("Topaz ID is preparing this account and network. Please retry shortly.");
    }
    return client;
  };
  return {
    info: { uuid: "topaz-id", name: "Topaz ID", rdns: "com.topazdex.id" },
    provider,
    connect: async () => {
      const result = await api.connectTopazId(provider);
      await prepare(result.account);
      return { account: result.account, chainId: `0x${result.chainId.toString(16)}` };
    },
    prepare,
    disconnect: async () => { await api.disconnectTopazId(provider); clients.clear(); },
    // Clients are prepared before Pay & Fly, so SDK consent is invoked directly
    // from its click handler without RPC awaits losing the popup gesture.
    sendCalls: (account: string, chainId: string, calls: TopazWalletCall[]) => {
      const client = clientFor(account, chainId);
      const normalized: TopazIdCall[] = calls.map((call) => {
        if (!call.to || !/^0x[0-9a-fA-F]{40}$/.test(call.to) || !/^0x(?:[0-9a-fA-F]{2})*$/.test(call.data)) throw new Error("Invalid Topaz ID payment call.");
        if (BigInt(call.value ?? "0") !== BigInt(0)) throw new Error("MSS2 flight entry must not send native currency.");
        return { to: call.to as `0x${string}`, data: call.data as `0x${string}`, value: BigInt(0) };
      });
      return client.sendCalls({ calls: normalized, atomicRequired: true }).then((hash) => {
        if (!/^0x[0-9a-fA-F]{64}$/.test(hash)) throw new Error("Topaz ID did not return a valid payment operation hash.");
        return hash;
      });
    },
    resolveTransaction: async (account: string, chainId: string, hash: string) => {
      if (!/^0x[0-9a-fA-F]{64}$/.test(hash)) throw new Error("Invalid Topaz ID payment operation hash.");
      const receipt = await clientFor(account, chainId).waitForReceipt(hash as `0x${string}`);
      if (!receipt) return null; // retain the submitted operation for retry, never pay again
      if (receipt.status !== "0x1" || (receipt.userOperation && (!receipt.userOperation.success || receipt.userOperation.sender.toLowerCase() !== account.toLowerCase()))) {
        throw new Error("The Topaz ID payment operation failed. No flight was authorized.");
      }
      if (!/^0x[0-9a-fA-F]{64}$/.test(receipt.transactionHash)) throw new Error("Topaz ID did not resolve a valid transaction hash.");
      return receipt.transactionHash;
    },
    label: async (account: string) => {
      const profile = await api.fetchTopazIdProfile(account);
      return api.displayNameForWallet(profile, account);
    },
  };
}
