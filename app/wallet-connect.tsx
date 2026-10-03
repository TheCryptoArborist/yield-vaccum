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

type ProviderAnnouncement = CustomEvent<{ info: WalletInfo; provider: WalletProvider }>;

declare global {
  interface Window {
    ethereum?: WalletProvider;
  }
}

const SELECTED_WALLET_KEY = "yield-vacuum-selected-wallet";

function shortAddress(address: string) {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

function chainLabel(chainId: string) {
  if (chainId.toLowerCase() === "0x38") return "BNB CHAIN";
  if (chainId.toLowerCase() === "0x1") return "ETHEREUM";
  if (chainId.toLowerCase() === "0x2105") return "BASE";
  if (chainId.toLowerCase() === "0x13b2") return "ARC";
  const numericId = Number.parseInt(chainId, 16);
  return Number.isFinite(numericId) ? `CHAIN ${numericId}` : "NETWORK UNKNOWN";
}

function normalizedAccounts(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function legacyWalletName(provider: WalletProvider, index: number) {
  if (provider.isRabby) return "Rabby Wallet";
  if (provider.isMetaMask) return "MetaMask";
  return index ? `Browser wallet ${index + 1}` : "Browser wallet";
}

export default function WalletConnect({ compact = false, theme = "topaz" }: { compact?: boolean; theme?: "topaz" | "mss" }) {
  const [wallets, setWallets] = useState<WalletOption[]>([]);
  const [selectedWallet, setSelectedWallet] = useState<WalletOption | null>(null);
  const [account, setAccount] = useState("");
  const [chainId, setChainId] = useState("");
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
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
    if (!open) return;
    const closeOnOutside = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", closeOnOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeOnOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  const connect = useCallback(async (wallet: WalletOption) => {
    setBusy(true);
    setMessage("");
    try {
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

  const forget = () => {
    window.sessionStorage.removeItem(SELECTED_WALLET_KEY);
    setSelectedWallet(null);
    setAccount("");
    setChainId("");
    setMessage("Site connection cleared. Disconnect permissions inside your wallet if desired.");
    setOpen(false);
  };

  return (
    <div ref={rootRef} className={`${styles.walletConnect} ${compact ? styles.compact : ""} ${theme === "mss" ? styles.mss : ""}`}>
      <button
        type="button"
        className={`${styles.trigger} ${account ? styles.connected : ""}`}
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        aria-haspopup="dialog"
      >
        <i aria-hidden="true" />
        <span>
          <small>{account ? selectedWallet?.info.name || "WALLET CONNECTED" : "METAMASK · RABBY"}</small>
          <strong>{account ? shortAddress(account) : "CONNECT WALLET"}</strong>
        </span>
        {account && <em>{chainLabel(chainId)}</em>}
      </button>

      {open && (
        <section className={styles.popover} role="dialog" aria-label="Wallet connection">
          <header>
            <span><small>OPTIONAL WALLET</small><strong>{account ? "CONNECTION STATUS" : "CHOOSE A WALLET"}</strong></span>
            <button type="button" onClick={() => setOpen(false)} aria-label="Close wallet panel">×</button>
          </header>

          <p className={styles.locked}>CONNECTION ONLY · GAME PAYMENTS LOCKED</p>

          {account ? (
            <div className={styles.accountCard}>
              <small>{selectedWallet?.info.name || "CONNECTED WALLET"}</small>
              <strong>{shortAddress(account)}</strong>
              <span>{chainLabel(chainId)}</span>
              <button type="button" onClick={forget}>CLEAR SITE CONNECTION</button>
            </div>
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

          <p className={styles.disclosure}>Connecting only shares the selected public address and current network. This control never requests a signature, token approval, transfer, or network switch.</p>
          {message && <p className={styles.message} role="status">{message}</p>}
        </section>
      )}
    </div>
  );
}
