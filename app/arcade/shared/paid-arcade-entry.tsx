"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import WalletConnect, { type WalletConnection } from "../../wallet-connect";
import type { ArcadePaymentQuote } from "../../../db/arcade-payments";
import type { Mss2EntryBalance } from "../../../lib/mss2-entry-balance";
import type { PaymentReadiness } from "../../../lib/mss2-payment";
import { TopazIdPaymentFailedError } from "../../../lib/topaz-id-payment-error";
import styles from "../mint-invaders/mint-invaders.module.css";
export type PaidArcadeAuthorization = { paymentId: string; runId: string; playerKey: string; network: "arc" | "robinhood" };
type Quote = ArcadePaymentQuote & { approval: { to: string; data: string; value: string }; entry: { to: string; data: string; value: string }; balanceCheck: Mss2EntryBalance; nativeGasBalanceRaw: string };
type Pending = { quote: Quote; hash: string; operation: boolean; playerKey: string };
const pendingKey = "mint-invaders-pending-payment-v1";
export default function PaidArcadeEntry({ onAuthorized }: { onAuthorized: (entry: PaidArcadeAuthorization) => void }) {
  const [wallet, setWallet] = useState<WalletConnection | null>(null);
  const context = useRef<WalletConnection | null>(null);
  const [playerKey, setPlayerKey] = useState("");
  const [readiness, setReadiness] = useState<PaymentReadiness | null>(null);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [busy, setBusy] = useState(false);
  const locked = useRef(false);
  const [message, setMessage] = useState("");
  const [clock, setClock] = useState(0);
  const network = wallet?.chainId.toLowerCase() === "0x13b2" ? "arc" : wallet?.chainId.toLowerCase() === "0x1237" ? "robinhood" : null;
  const connectionChange = useCallback((connection: WalletConnection | null) => { context.current = connection; setWallet(connection); setQuote(null); setReadiness(null); }, []);
  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        let key = localStorage.getItem("mint-invaders-player-v1");
        if (!key || !/^[a-zA-Z0-9-]{16,80}$/.test(key)) { key = crypto.randomUUID(); localStorage.setItem("mint-invaders-player-v1", key); }
        setPlayerKey(key);
        const saved = JSON.parse(localStorage.getItem(pendingKey) ?? "null") as Pending | null;
        if (saved?.quote?.game === "mint-invaders" && saved.playerKey === key && /^0x[0-9a-fA-F]{64}$/.test(saved.hash)) setPending(saved);
      } catch { setPlayerKey(crypto.randomUUID()); }
    }, 0);
    const interval = setInterval(() => setClock(Date.now()), 1000);
    return () => { clearTimeout(timer); clearInterval(interval); };
  }, []);
  useEffect(() => {
    if (!wallet || !network) return;
    const controller = new AbortController();
    void fetch(`/api/arcade-payment?chain=${network}&wallet=${wallet.account}`, { cache: "no-store", signal: controller.signal }).then(r => r.json()).then(data => { if (!controller.signal.aborted) setReadiness(data); }).catch(() => { if (!controller.signal.aborted) setMessage("Entry availability could not be checked. Reconnect to retry."); });
    return () => controller.abort();
  }, [wallet, network]);
  const retain = (value: Pending | null) => { setPending(value); try { if (value) localStorage.setItem(pendingKey, JSON.stringify(value)); else localStorage.removeItem(pendingKey); } catch { /* Keep in-memory pending payment. */ } };
  const matching = (q: Quote) => context.current?.account.toLowerCase() === q.walletAddress.toLowerCase() && Number(context.current.chainId) === q.chainId;
  const jsonPost = async (body: Record<string, unknown>) => {
    const response = await fetch("/api/arcade-payment", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...body, game: "mint-invaders" }), signal: AbortSignal.timeout(20_000) });
    const data = await response.json(); if (!response.ok) throw new Error(data.error || "Entry request failed."); return { data, response };
  };
  const prepare = async () => {
    if (!wallet || !network || !readiness?.enabled || !playerKey || locked.current || pending) return;
    locked.current = true; setBusy(true); setMessage("Checking the current MSS2 quote and wallet balance…");
    try {
      const { data } = await jsonPost({ action: "quote", network, playerKey, walletAddress: wallet.account, runId: crypto.randomUUID() });
      if (data.game !== "mint-invaders" || data.network !== network || !matching(data)) throw new Error("Wallet or network changed. Request a fresh quote.");
      setQuote(data); setClock(Date.now()); setMessage(data.balanceCheck?.sufficient ? "Quote ready. Pay & authorize opens your wallet." : "Add MSS2 to cover this entry, then refresh the quote.");
    } catch (e) { setMessage(e instanceof Error ? e.message : "Quote unavailable."); }
    finally { locked.current = false; setBusy(false); }
  };
  const pay = async () => {
    const q = pending?.quote ?? quote;
    if (!wallet || !q || locked.current) return;
    locked.current = true; setBusy(true);
    let record = pending;
    const assertContext = () => { if (!matching(q)) throw new Error("Reconnect the paying wallet on its original network to recheck the retained payment."); };
    try {
      assertContext();
      if (!record) {
        if (Date.now() >= Date.parse(q.expiresAt)) throw new Error("Quote expired. Refresh it before paying.");
        if (!q.balanceCheck?.sufficient) throw new Error("This wallet needs more MSS2. Refresh the quote after funding.");
        let hash: string;
        if (wallet.kind === "topaz-id") {
          if (!wallet.sendCalls || BigInt(q.nativeGasBalanceRaw || "0") <= BigInt(0)) throw new Error("Fund your Topaz ID wallet with native gas and refresh the quote.");
          // Start consent directly from this click so the Topaz ID popup is permitted.
          hash = await wallet.sendCalls([q.approval,q.entry]);
          record = { quote: q, hash, operation: true, playerKey }; retain(record); assertContext();
        } else {
          const { data } = await jsonPost({ action: "balance-check", paymentId: q.paymentId, playerKey, walletAddress: wallet.account }); assertContext();
          if (!data.balanceCheck?.sufficient || data.balanceCheck.requiredRaw !== q.amountRaw) throw new Error("Refresh the quote after funding your MSS2 balance.");
          if (Date.now() >= Date.parse(q.expiresAt)) throw new Error("Quote expired before payment. Refresh it.");
          const approvalHash = await wallet.sendTransaction(q.approval); assertContext();
          let approved = false;
          for (let attempt = 0; attempt < 20; attempt++) {
            setMessage("Waiting for the exact MSS2 approval to confirm…");
            const { data: approval } = await jsonPost({ action: "approval-check", network: q.network, txHash: approvalHash }); assertContext();
            if (!approval.pending) { approved = true; break; }
            await new Promise(resolve => setTimeout(resolve, 1500));
          }
          if (!approved) throw new Error("Approval is still pending. No entry payment has been sent. Wait for confirmation before retrying.");
          if (Date.now() >= Date.parse(q.expiresAt)) throw new Error("Quote expired while approval confirmed. Refresh before entry payment.");
          hash = await wallet.sendTransaction(q.entry);
          record = { quote: q, hash, operation: false, playerKey }; retain(record); assertContext();
        }
      }
      if (record.operation) {
        if (!wallet.resolveTransaction) throw new Error("Receipt resolution unavailable. Keep the pending payment and reconnect Topaz ID.");
        const hash = await wallet.resolveTransaction(record.hash); assertContext();
        if (!hash) throw new Error("Payment is pending. Recheck it; do not pay again.");
        record = { ...record, hash, operation: false }; retain(record);
      }
      for (let attempt = 0; attempt < 15; attempt++) {
        setMessage("Verifying the entry receipt and its 20/80 transfers…");
        const { data } = await jsonPost({ action: "verify", paymentId: q.paymentId, playerKey: record.playerKey, walletAddress: q.walletAddress, txHash: record.hash }); assertContext();
        if (!data.pending && data.status === "verified" && data.game === "mint-invaders" && data.runId === q.runId && data.paymentId === q.paymentId) {
          retain(null); onAuthorized({ paymentId: q.paymentId, runId: q.runId, playerKey: record.playerKey, network: q.network }); setMessage("Payment verified. Start your game below."); return;
        }
        if (!data.pending) throw new Error("The verified payment did not match this game.");
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
      throw new Error("Your payment is still pending. Recheck it without paying again.");
    } catch (e) {
      if (e instanceof TopazIdPaymentFailedError) { retain(null); setQuote(null); }
      setMessage(e instanceof Error ? e.message : "Payment could not be verified. Recheck any pending entry.");
    } finally { locked.current = false; setBusy(false); }
  };
  const expired = Boolean(quote && Date.parse(quote.expiresAt) <= clock);
  return <section className={styles.entryPanel} aria-label="Mint Invaders paid entry">
    <WalletConnect theme="mss" onConnectionChange={connectionChange} />
    <div className={styles.entrySummary}><p><b>$1 WORTH OF MSS2 PER GAME</b><span>20% to the dead address · 80% to community rewards reserve</span></p><div className={styles.entryActions}>
    {wallet && !network && <p>Select Robinhood Chain or Arc in the wallet bar.</p>}
    {network && readiness && !readiness.enabled && <p>{readiness.reason}</p>}
    {quote && <p><b>{quote.displayAmount} MSS2</b> on {quote.network === "arc" ? "Arc" : "Robinhood Chain"}. {expired ? "Quote expired." : "Current entry quote."}</p>}
    {pending ? <button onClick={() => void pay()} disabled={busy || !wallet}>RECHECK SUBMITTED PAYMENT</button> : <><button onClick={() => void prepare()} disabled={busy || !readiness?.enabled || !playerKey}>{quote ? "REFRESH ENTRY QUOTE" : "GET ENTRY QUOTE"}</button>{quote && <button onClick={() => void pay()} disabled={busy || expired || !quote.balanceCheck?.sufficient}>PAY & AUTHORIZE GAME</button>}</>}
    </div></div>
    <p className={styles.entryStatus} role="status">{busy ? "Please keep this page open. " : ""}{message}</p>
    <small>Each game requires a new verified entry. No automatic reward payouts. Pending payments are retained for rechecking.</small>
  </section>;
}
