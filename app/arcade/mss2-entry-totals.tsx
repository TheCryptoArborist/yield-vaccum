"use client";

import { useEffect, useState } from "react";
import type { EntryTotals } from "../../lib/mss2-entry-totals";
import { formatEntryTotal } from "../../lib/mss2-entry-totals-display";
import { MSS2_COMMUNITY_AIRDROP_RESERVE, MSS2_DEAD_ADDRESS } from "../../lib/mss2-payment-shared";
import styles from "./mss2-entry-totals.module.css";

export default function Mss2EntryTotals({ network, paymentId }: { network: "robinhood" | "arc"; paymentId: string }) {
  const [selected, setSelected] = useState(network);
  const [data, setData] = useState<Partial<Record<"robinhood" | "arc", EntryTotals>>>({});
  const [retry, setRetry] = useState(0);
  const [busy, setBusy] = useState(false);
  useEffect(() => { setSelected(network); }, [network]);
  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const load = async () => {
      setBusy(true);
      let delay = 60_000;
      try {
        const response = await fetch(`/api/arcade-entry-totals?chain=${selected}`, { signal: controller.signal, cache: "no-store" });
        const totals = await response.json() as EntryTotals;
        if (totals.network !== selected || !["ready", "syncing", "unavailable"].includes(totals.status)) throw new Error("Invalid totals response.");
        if (!controller.signal.aborted) setData((previous) => ({ ...previous, [selected]: totals }));
        if (totals.status === "syncing") delay = 5_000;
      } catch {
        if (!controller.signal.aborted) setData((previous) => ({ ...previous, [selected]: { ...previous[selected], network: selected, status: "unavailable" } as EntryTotals }));
      } finally {
        if (!controller.signal.aborted) { setBusy(false); timer = setTimeout(() => void load(), delay); }
      }
    };
    void load();
    return () => { controller.abort(); clearTimeout(timer); };
  }, [selected, retry, paymentId]);
  const totals = data[selected];
  const ready = totals?.status === "ready";
  const networkLabel = selected === "arc" ? "Arc" : "Robinhood Chain";
  return <section className={styles.panel} id="mss2-entry-totals" aria-label="MSS2 entry contribution totals">
    <header>
      <span><small>EVERY PAID FLIGHT CONTRIBUTES</small><h2>MSS2 community impact</h2></span>
      <div className={styles.networks} aria-label="Contribution network">
        <button type="button" aria-pressed={selected === "robinhood"} onClick={() => setSelected("robinhood")}>Robinhood Chain</button>
        <button type="button" aria-pressed={selected === "arc"} onClick={() => setSelected("arc")}>Arc</button>
      </div>
    </header>
    <div className={styles.cards}>
      <article className={styles.dead}>
        <span><small>DEAD ADDRESS</small><b>20% OF EACH ENTRY</b></span>
        <strong>{ready && totals.deadAmountRaw !== null ? formatEntryTotal(totals.deadAmountRaw) : "—"}<small>MSS2 SENT</small></strong>
        <p>Permanently sent to the dead address.</p>
        {totals?.explorerUrl && <a href={`${totals.explorerUrl}/address/${MSS2_DEAD_ADDRESS}`} target="_blank" rel="noreferrer">View destination ↗</a>}
      </article>
      <article className={styles.community}>
        <span><small>COMMUNITY REWARDS RESERVE</small><b>80% OF EACH ENTRY</b></span>
        <strong>{ready && totals.communityAmountRaw !== null ? formatEntryTotal(totals.communityAmountRaw) : "—"}<small>MSS2 FUNDED</small></strong>
        <p>Sent to the Community Airdrop Reserve.</p>
        {totals?.explorerUrl && <a href={`${totals.explorerUrl}/address/${MSS2_COMMUNITY_AIRDROP_RESERVE}`} target="_blank" rel="noreferrer">View destination ↗</a>}
      </article>
    </div>
    <footer>
      <p role="status">{ready ? <><b>{totals.entries?.toLocaleString()} confirmed paid {totals.entries === 1 ? "entry" : "entries"}</b> on {networkLabel}. Checked {totals.checkedAt ? new Date(totals.checkedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : "just now"}.</> : totals?.status === "syncing" ? "Syncing confirmed entry history…" : totals?.status === "unavailable" ? "On-chain totals are temporarily unavailable. Please retry." : "Loading confirmed entry totals…"}</p>
      <button type="button" disabled={busy} onClick={() => setRetry((value) => value + 1)}>{busy ? "Checking…" : "Refresh totals"}</button>
    </footer>
    <p className={styles.scope}>Lifetime contributions through the Mint Flyer entry router on {networkLabel}, including paid test entries. Figures are rounded to six decimals. Reserve funding does not represent rewards distributed to players.</p>
    {totals?.explorerUrl && <a className={styles.proof} href={`${totals.explorerUrl}/address/${totals.routerAddress}`} target="_blank" rel="noreferrer">Verify entry payments on-chain ↗</a>}
  </section>;
}
