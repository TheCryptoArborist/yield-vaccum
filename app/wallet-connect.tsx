"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import styles from "./wallet-connect.module.css";

type WalletRequest = {
  method: string;
  params?: unknown[];
};

type WalletProvider = {
  request: (request: WalletRequest) => Promise<unknown>;
  on?: (event: string, listener: (...args: unknown[]) => void) => void;
  removeListener?: (event: string, listener: (...args: unknown[]) => void) => void;
  providers?: WalletProvider[];
  isMetaMask?: boolean;
  isRabby?: boolean;
};

type WalletInfo = {
  uuid: string;
  name: string;
  rdns: string;
};

type WalletOption = {
  info: WalletInfo;
  provider: WalletProvider;
};

type WalletNetwork = {
  chainId: `0x${string}`;
  name: string;
  shortName: string;
  icon: string;
  nativeCurrency: { name: string; symbol: string; decimals: number };
  rpcUrls: string[];
  blockExplorerUrls: string[];
};

type WalletProviderError = Error & { code?: number };

type ProviderAnnouncement = CustomEvent<{ info: WalletInfo; provider: WalletProvider }>;

export type WalletConnection = {
  account: string;
  chainId: string;
  signMessage: (message: string) => Promise<string>;
  switchChain: (chainId: `0x${string}`) => Promise<void>;
  sendTransaction: (transaction: { to?: string; data: string; value?: string; gas?: string }) => Promise<string>;
};

declare global {
  interface Window {
    ethereum?: WalletProvider;
  }
}

const SELECTED_WALLET_KEY = "yield-vacuum-selected-wallet";

const SUPPORTED_NETWORKS: WalletNetwork[] = [
  {
    chainId: "0x38",
    name: "BNB Smart Chain",
    shortName: "BNB CHAIN",
    icon: "/fee-bnb.png",
    nativeCurrency: { name: "BNB", symbol: "BNB", decimals: 18 },
    rpcUrls: ["https://bsc-dataseed.bnbchain.org"],
    blockExplorerUrls: ["https://bscscan.com"],
  },
  {
    chainId: "0x1237",
    name: "Robinhood Chain",
    shortName: "ROBINHOOD CHAIN",
    icon: "/network-robinhood-chain.jpg",
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    rpcUrls: ["https://rpc.mainnet.chain.robinhood.com"],
    blockExplorerUrls: ["https://robinhoodchain.blockscout.com"],
  },
  {
    chainId: "0x13b2",
    name: "Arc",
    shortName: "ARC",
    icon: "/network-arc.svg",
    nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
    rpcUrls: ["https://rpc.mainnet.arc.io"],
    blockExplorerUrls: ["https://explorer.arc.io"],
  },
];

function shortAddress(address: string) {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

function chainLabel(chainId: string) {
  const supported = SUPPORTED_NETWORKS.find((network) => network.chainId === chainId.toLowerCase());
  if (supported) return supported.shortName;
  if (chainId.toLowerCase() === "0x1") return "ETHEREUM";
  if (chainId.toLowerCase() === "0x2105") return "BASE";
  const numericId = Number.parseInt(chainId, 16);
  return Number.isFinite(numericId) ? `CHAIN ${numericId}` : "NETWORK UNKNOWN";
}

function providerErrorCode(error: unknown) {
  if (typeof error !== "object" || error === null || !("code" in error)) return undefined;
  return typeof error.code === "number" ? error.code : Number(error.code);
}

function isUnsupportedPermissionRequest(error: unknown) {
  const code = providerErrorCode(error);
  return code === -32601 || code === 4200;
}

function normalizedAccounts(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function legacyWalletName(provider: WalletProvider, index: number) {
  if (provider.isRabby) return "Rabby Wallet";
  if (provider.isMetaMask) return "MetaMask";
  return index ? `Browser wallet ${index + 1}` : "Browser wallet";
}

export default function WalletConnect({
  compact = false,
  theme = "topaz",
  onConnectionChange,
}: {
  compact?: boolean;
  theme?: "topaz" | "mss";
  onConnectionChange?: (connection: WalletConnection | null) => void;
}) {
  const [wallets, setWallets] = useState<WalletOption[]>([]);
  const [selectedWallet, setSelectedWallet] = useState<WalletOption | null>(null);
  const [account, setAccount] = useState("");
  const [chainId, setChainId] = useState("");
  const [open, setOpen] = useState(false);
  const [networkOpen, setNetworkOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [switchingChain, setSwitchingChain] = useState("");
  const [message, setMessage] = useState("");
  const [mss2BalanceResult, setMss2BalanceResult] = useState<{
    key: string;
    balance: string | null;
    state: "loading" | "ready" | "error";
  }>({ key: "", balance: null, state: "loading" });
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const discovered = new Map<string, WalletOption>();
    const announce = (event: Event) => {
      const detail = (event as ProviderAnnouncement).detail;
      if (!detail?.provider || !detail.info) return;
      const key = detail.info.uuid || detail.info.rdns;
      discovered.set(key, detail);
      setWallets(Array.from(discovered.values()));
    };

    window.addEventListener("eip6963:announceProvider", announce);
    window.dispatchEvent(new Event("eip6963:requestProvider"));

    const fallbackTimer = window.setTimeout(() => {
      if (!discovered.size && window.ethereum) {
        const providers = window.ethereum.providers?.length ? window.ethereum.providers : [window.ethereum];
        const fallbacks = providers.map((provider, index) => ({
          info: {
            uuid: `legacy-injected-${index}`,
            name: legacyWalletName(provider, index),
            rdns: provider.isRabby ? "io.rabby" : provider.isMetaMask ? "io.metamask" : `injected.wallet.${index}`,
          },
          provider,
        }));
        fallbacks.forEach((fallback) => discovered.set(fallback.info.uuid, fallback));
        setWallets(fallbacks);
      }
    }, 350);

    return () => {
      window.clearTimeout(fallbackTimer);
      window.removeEventListener("eip6963:announceProvider", announce);
    };
  }, []);

  useEffect(() => {
    if (!wallets.length || selectedWallet) return;
    const remembered = window.sessionStorage.getItem(SELECTED_WALLET_KEY);
    const wallet = wallets.find((option) => option.info.rdns === remembered);
    if (!wallet) return;

    let cancelled = false;
    Promise.all([
      wallet.provider.request({ method: "eth_accounts" }),
      wallet.provider.request({ method: "eth_chainId" }),
    ]).then(([accountsValue, chainValue]) => {
      const accounts = normalizedAccounts(accountsValue);
      if (cancelled || !accounts[0]) return;
      setSelectedWallet(wallet);
      setAccount(accounts[0]);
      setChainId(typeof chainValue === "string" ? chainValue : "");
    }).catch(() => undefined);
    return () => { cancelled = true; };
  }, [wallets, selectedWallet]);

  useEffect(() => {
    if (!selectedWallet?.provider.on) return;
    const handleAccounts = (...args: unknown[]) => {
      const accounts = normalizedAccounts(args[0]);
      setAccount(accounts[0] || "");
      if (!accounts[0]) {
        window.sessionStorage.removeItem(SELECTED_WALLET_KEY);
        setSelectedWallet(null);
        setChainId("");
        setMessage("Wallet disconnected in the extension.");
      }
    };
    const handleChain = (...args: unknown[]) => setChainId(typeof args[0] === "string" ? args[0] : "");
    selectedWallet.provider.on("accountsChanged", handleAccounts);
    selectedWallet.provider.on("chainChanged", handleChain);
    return () => {
      selectedWallet.provider.removeListener?.("accountsChanged", handleAccounts);
      selectedWallet.provider.removeListener?.("chainChanged", handleChain);
    };
  }, [selectedWallet]);

  useEffect(() => {
    if (!account || !selectedWallet) {
      onConnectionChange?.(null);
      return;
    }
    onConnectionChange?.({
      account,
      chainId,
      signMessage: async (message: string) => {
        const signature = await selectedWallet.provider.request({ method: "personal_sign", params: [message, account] });
        if (typeof signature !== "string") throw new Error("The wallet did not return a valid signature.");
        return signature;
      },
      switchChain: async (targetChainId: `0x${string}`) => {
        const network = SUPPORTED_NETWORKS.find((item) => item.chainId === targetChainId.toLowerCase());
        if (!network) throw new Error("That network is not supported by Yield Vacuum.");
        try {
          await selectedWallet.provider.request({ method: "wallet_switchEthereumChain", params: [{ chainId: network.chainId }] });
        } catch (error) {
          if (providerErrorCode(error) !== 4902) throw error;
          await selectedWallet.provider.request({
            method: "wallet_addEthereumChain",
            params: [{
              chainId: network.chainId,
              chainName: network.name,
              nativeCurrency: network.nativeCurrency,
              rpcUrls: network.rpcUrls,
              blockExplorerUrls: network.blockExplorerUrls,
            }],
          });
          await selectedWallet.provider.request({ method: "wallet_switchEthereumChain", params: [{ chainId: network.chainId }] });
        }
        const activeChain = await selectedWallet.provider.request({ method: "eth_chainId" });
        const normalized = typeof activeChain === "string" ? activeChain.toLowerCase() : "";
        if (normalized !== network.chainId) throw new Error(`The wallet did not switch to ${network.name}.`);
        setChainId(normalized);
      },
      sendTransaction: async (transaction) => {
        const request: Record<string, string> = {
          from: account,
          data: transaction.data,
          value: transaction.value ?? "0x0",
        };
        if (transaction.to) request.to = transaction.to;
        if (transaction.gas) request.gas = transaction.gas;
        const txHash = await selectedWallet.provider.request({
          method: "eth_sendTransaction",
          params: [request],
        });
        if (typeof txHash !== "string" || !/^0x[0-9a-fA-F]{64}$/.test(txHash)) throw new Error("The wallet did not return a valid transaction hash.");
        return txHash;
      },
    });
  }, [account, chainId, onConnectionChange, selectedWallet]);

  useEffect(() => {
    if (theme !== "mss" || !account) return;
    const activeChainId = chainId.toLowerCase();
    if (activeChainId !== "0x1237" && activeChainId !== "0x13b2") return;
    const requestKey = `${account.toLowerCase()}:${activeChainId}`;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setMss2BalanceResult({ key: requestKey, balance: null, state: "loading" });
      try {
        const params = new URLSearchParams({ address: account, chainId: activeChainId });
        const response = await fetch(`/api/mss2-balance?${params.toString()}`, { cache: "no-store", signal: controller.signal });
        const data = await response.json() as { error?: string; rounded?: string };
        if (!response.ok || typeof data.rounded !== "string") throw new Error(data.error || "Balance unavailable.");
        setMss2BalanceResult({ key: requestKey, balance: data.rounded, state: "ready" });
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setMss2BalanceResult({ key: requestKey, balance: null, state: "error" });
      }
    }, 0);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [account, chainId, theme]);

  useEffect(() => {
    if (!open && !networkOpen) return;
    const closeOnOutside = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
        setNetworkOpen(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        setNetworkOpen(false);
      }
    };
    document.addEventListener("mousedown", closeOnOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeOnOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [networkOpen, open]);

  const connect = useCallback(async (wallet: WalletOption) => {
    setBusy(true);
    setMessage("");
    try {
      try {
        await wallet.provider.request({ method: "wallet_requestPermissions", params: [{ eth_accounts: {} }] });
      } catch (error) {
        // MetaMask and Rabby receive the account-picker request. Wallets that
        // do not implement EIP-2255 fall back to their standard connection
        // screen, while a user rejection never reconnects silently.
        if (!isUnsupportedPermissionRequest(error)) throw error;
      }
      const accountsValue = await wallet.provider.request({ method: "eth_requestAccounts" });
      const accounts = normalizedAccounts(accountsValue);
      if (!accounts[0]) throw new Error("No account was selected.");
      const chainValue = await wallet.provider.request({ method: "eth_chainId" });
      setSelectedWallet(wallet);
      setAccount(accounts[0]);
      setChainId(typeof chainValue === "string" ? chainValue : "");
      window.sessionStorage.setItem(SELECTED_WALLET_KEY, wallet.info.rdns);
      setOpen(false);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Wallet connection was cancelled.");
    } finally {
      setBusy(false);
    }
  }, []);

  const switchAccount = useCallback(async () => {
    if (!selectedWallet || busy) return;
    setBusy(true);
    setMessage("Choose the account this site should use inside your wallet.");
    try {
      try {
        await selectedWallet.provider.request({ method: "wallet_requestPermissions", params: [{ eth_accounts: {} }] });
      } catch (error) {
        if (!isUnsupportedPermissionRequest(error)) throw error;
      }
      const accountsValue = await selectedWallet.provider.request({ method: "eth_requestAccounts" });
      const accounts = normalizedAccounts(accountsValue);
      if (!accounts[0]) throw new Error("No account was selected.");
      const chainValue = await selectedWallet.provider.request({ method: "eth_chainId" });
      setAccount(accounts[0]);
      setChainId(typeof chainValue === "string" ? chainValue : chainId);
      setMss2BalanceResult({ key: "", balance: null, state: "loading" });
      window.sessionStorage.setItem(SELECTED_WALLET_KEY, selectedWallet.info.rdns);
      setMessage(`Active account changed to ${shortAddress(accounts[0])}.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The account selection was cancelled.");
    } finally {
      setBusy(false);
    }
  }, [busy, chainId, selectedWallet]);

  const switchNetwork = useCallback(async (network: WalletNetwork) => {
    if (!selectedWallet) return;
    setSwitchingChain(network.chainId);
    setMessage("");
    try {
      try {
        await selectedWallet.provider.request({
          method: "wallet_switchEthereumChain",
          params: [{ chainId: network.chainId }],
        });
      } catch (error) {
        if (providerErrorCode(error) !== 4902) throw error;
        await selectedWallet.provider.request({
          method: "wallet_addEthereumChain",
          params: [{
            chainId: network.chainId,
            chainName: network.name,
            nativeCurrency: network.nativeCurrency,
            rpcUrls: network.rpcUrls,
            blockExplorerUrls: network.blockExplorerUrls,
          }],
        });
        await selectedWallet.provider.request({
          method: "wallet_switchEthereumChain",
          params: [{ chainId: network.chainId }],
        });
      }
      const chainValue = await selectedWallet.provider.request({ method: "eth_chainId" });
      setChainId(typeof chainValue === "string" ? chainValue : network.chainId);
      setMessage(`${network.name} selected. No transaction was requested.`);
      setNetworkOpen(false);
    } catch (error) {
      const walletError = error as WalletProviderError;
      setMessage(walletError?.message || `The request to switch to ${network.name} was cancelled.`);
    } finally {
      setSwitchingChain("");
    }
  }, [selectedWallet]);

  const forget = () => {
    window.sessionStorage.removeItem(SELECTED_WALLET_KEY);
    setSelectedWallet(null);
    setAccount("");
    setChainId("");
    setMessage("Yield Vacuum cleared its local connection. Use Switch Account when reconnecting, or revoke the site under Connected sites inside your wallet.");
    setOpen(false);
    setNetworkOpen(false);
  };

  const currentNetwork = SUPPORTED_NETWORKS.find((network) => network.chainId === chainId.toLowerCase());
  const balanceChainId = chainId.toLowerCase();
  const supportsMss2Balance = balanceChainId === "0x1237" || balanceChainId === "0x13b2";
  const availableNetworks = theme === "mss"
    ? SUPPORTED_NETWORKS.filter((network) => network.chainId === "0x1237" || network.chainId === "0x13b2")
    : SUPPORTED_NETWORKS;
  const displayedNetwork = theme === "mss" && !supportsMss2Balance ? undefined : currentNetwork;
  const activeBalanceKey = account ? `${account.toLowerCase()}:${balanceChainId}` : "";
  const mss2BalanceState: "idle" | "loading" | "ready" | "unsupported" | "error" = theme !== "mss" || !account
    ? "idle"
    : !supportsMss2Balance
      ? "unsupported"
      : mss2BalanceResult.key === activeBalanceKey
        ? mss2BalanceResult.state
        : "loading";
  const mss2Balance = mss2BalanceResult.key === activeBalanceKey ? mss2BalanceResult.balance : null;

  return (
    <div ref={rootRef} className={`${styles.walletConnect} ${compact ? styles.compact : ""} ${theme === "mss" ? styles.mss : ""}`}>
      <div className={styles.topControls}>
        <button
          type="button"
          className={`${styles.trigger} ${account ? styles.connected : ""}`}
          onClick={() => {
            setNetworkOpen(false);
            setOpen((current) => !current);
          }}
          aria-expanded={open}
          aria-haspopup="dialog"
        >
          <i aria-hidden="true" />
          <span>
            <small>{account ? `CONNECTED · ${selectedWallet?.info.name || "WALLET"}` : "METAMASK · RABBY"}</small>
            <strong>{account && theme === "mss"
              ? mss2BalanceState === "ready"
                ? `~${mss2Balance} MSS2`
                : mss2BalanceState === "unsupported"
                  ? "MSS2 NOT ON THIS CHAIN"
                  : mss2BalanceState === "error"
                    ? "BALANCE UNAVAILABLE"
                    : "CHECKING MSS2…"
              : account ? shortAddress(account) : "CONNECT WALLET"}</strong>
            {account && theme === "mss" && <em>{shortAddress(account)}</em>}
          </span>
        </button>

        <button
          type="button"
          className={`${styles.networkTrigger} ${account ? styles.networkReady : ""}`}
          onClick={() => {
            if (!account) {
              setNetworkOpen(false);
              setOpen(true);
              return;
            }
            setOpen(false);
            setNetworkOpen((current) => !current);
          }}
          aria-expanded={networkOpen}
          aria-haspopup="menu"
        >
          {displayedNetwork
            ? <img src={displayedNetwork.icon} alt="" aria-hidden="true" />
            : <i aria-hidden="true" />}
          <span>
            <small>{theme === "mss" ? "MSS2 NETWORK" : "NETWORK"}</small>
            <strong>{account
              ? theme === "mss" && !supportsMss2Balance ? "SELECT ROBINHOOD OR ARC" : chainLabel(chainId)
              : "CONNECT FIRST"}</strong>
          </span>
          <b aria-hidden="true">{networkOpen ? "▲" : "▼"}</b>
        </button>
      </div>

      {networkOpen && account && (
        <section className={`${styles.popover} ${styles.networkPopover}`} role="menu" aria-label={theme === "mss" ? "Select MSS2 network" : "Select wallet network"}>
          <header>
            <span><small>{theme === "mss" ? "MSS2 NETWORK" : "WALLET NETWORK"}</small><strong>{theme === "mss" ? "SELECT MSS2 NETWORK" : "CHOOSE A CHAIN"}</strong></span>
            <button type="button" onClick={() => setNetworkOpen(false)} aria-label="Close network menu">×</button>
          </header>
          <div className={styles.networkPicker}>
            {availableNetworks.map((network) => {
              const active = chainId.toLowerCase() === network.chainId;
              const switching = switchingChain === network.chainId;
              const paymentNote = network.chainId === "0x1237"
                ? "MSS2 PAYMENT TARGET"
                : network.chainId === "0x13b2"
                  ? "MSS2 PAYMENT LOCKED"
                  : "WALLET + TOPAZ SUPPORT";
              return (
                <button
                  key={network.chainId}
                  type="button"
                  role="menuitem"
                  className={active ? styles.activeNetwork : ""}
                  onClick={() => switchNetwork(network)}
                  disabled={Boolean(switchingChain) || active}
                >
                  <img src={network.icon} alt="" aria-hidden="true" />
                  <span><b>{network.shortName}</b><small>CHAIN {Number.parseInt(network.chainId, 16)} · {paymentNote}</small></span>
                  <em>{active ? "ACTIVE" : switching ? "CHECK WALLET" : "SWITCH"}</em>
                </button>
              );
            })}
            <p>{theme === "mss"
              ? "MSS2 is available on Robinhood and Arc. Switching networks never moves tokens. Arc entry payments stay locked until pricing and backend verification are reviewed."
              : "Switching networks never moves tokens. Select the network required for the feature you are using."}</p>
          </div>
          {message && <p className={styles.message} role="status">{message}</p>}
        </section>
      )}

      {open && (
        <section className={styles.popover} role="dialog" aria-label="Wallet connection">
          <header>
            <span><small>OPTIONAL WALLET</small><strong>{account ? "CONNECTION STATUS" : "CHOOSE A WALLET"}</strong></span>
            <button type="button" onClick={() => setOpen(false)} aria-label="Close wallet panel">×</button>
          </header>

          <p className={styles.locked}>WALLET + NETWORK · REVIEW EVERY REQUEST</p>

          {account ? (
            <>
              <div className={styles.accountCard}>
                <small>{selectedWallet?.info.name || "CONNECTED WALLET"}</small>
                <strong>{shortAddress(account)}</strong>
                <span>{chainLabel(chainId)}{theme === "mss" && mss2BalanceState === "ready" ? ` · ~${mss2Balance} MSS2` : ""}</span>
                <div className={styles.accountActions}>
                  <button type="button" onClick={() => void switchAccount()} disabled={busy}>{busy ? "CHECK WALLET…" : "SWITCH ACCOUNT"}</button>
                  <button type="button" onClick={forget} disabled={busy}>DISCONNECT FROM SITE</button>
                </div>
              </div>
            </>
          ) : wallets.length ? (
            <div className={styles.walletList}>
              {wallets.map((wallet) => (
                <button key={wallet.info.uuid || wallet.info.rdns} type="button" onClick={() => connect(wallet)} disabled={busy}>
                  <span>{wallet.info.name}</span><small>{wallet.info.rdns}</small><b>{busy ? "WAIT" : "CONNECT"}</b>
                </button>
              ))}
            </div>
          ) : (
            <div className={styles.noWallet}>
              <p>No compatible browser wallet was detected.</p>
              <div><a href="https://metamask.io/download/" target="_blank" rel="noreferrer">GET METAMASK ↗</a><a href="https://rabby.io/" target="_blank" rel="noreferrer">GET RABBY ↗</a></div>
            </div>
          )}

          <p className={styles.disclosure}>{theme === "mss"
            ? "Connecting activates wallet features across this arcade page and reads the rounded MSS2 balance for the selected Robinhood or Arc network without a signature. Switch Account opens your wallet's account selector. Paid arcade entry uses an exact MSS2 allowance only after a separate on-site review; it never requests an unlimited token approval."
            : "Connecting shares the selected public address and current network. Network buttons may ask the wallet to add or switch chains, but never request a signature, token approval, or transfer."}</p>
          {message && <p className={styles.message} role="status">{message}</p>}
        </section>
      )}
    </div>
  );
}
