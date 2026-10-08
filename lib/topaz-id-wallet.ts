import { createTopazIdProvider, connectTopazId, disconnectTopazId } from "@topazdex/id-connect/provider";
import { bsc, robinhood, arc } from "@topazdex/id-connect/chains";
import { displayNameForWallet, fetchTopazIdProfile } from "@topazdex/id-connect";

// Loaded only in the browser, before the user clicks: opening the consent
// popup must remain inside the original user gesture (especially on mobile).
const sdk = { createTopazIdProvider, connectTopazId, disconnectTopazId, displayNameForWallet, fetchTopazIdProfile };

export function createTopazIdWallet(api = sdk) {
  const provider = api.createTopazIdProvider({ chains: [bsc, robinhood, arc] });
  return {
    info: { uuid: "topaz-id", name: "Topaz ID", rdns: "com.topazdex.id" },
    provider,
    connect: async () => {
      const result = await api.connectTopazId(provider);
      return { account: result.account, chainId: `0x${result.chainId.toString(16)}` };
    },
    disconnect: () => api.disconnectTopazId(provider),
    label: async (account: string) => {
      const profile = await api.fetchTopazIdProfile(account);
      return api.displayNameForWallet(profile, account);
    },
  };
}
