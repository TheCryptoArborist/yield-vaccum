"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import WalletConnect, { type WalletConnection } from "../../wallet-connect";
import styles from "./deploy-console.module.css";

const APPROVED_WALLET = "0xE8b63245DdDAB73C7A276818942341D8Cfb7D7A7";
const ARC_CHAIN_HEX = "0x13b2";
const CONFIRMATION = "DEPLOY ARC";

type ArtifactSummary = {
  bytecode: string;
  compilerVersion: string;
  sourceSha256: string;
  creationCodeHash: string;
  runtimeCodeHash: string;
};

type Verification = {
  state?: "pending" | "verified";
  message?: string;
  error?: string;
  txHash?: string;
  contractAddress?: string;
  blockNumber?: number | null;
  runtimeCodeHash?: string;
  explorerUrl?: string;
};

function short(value: string, lead = 10, tail = 8) {
  return value.length > lead + tail + 1 ? `${value.slice(0, lead)}…${value.slice(-tail)}` : value;
}

export default function DeployConsole({ previewEnabled, artifact, robinhoodRouter }: { previewEnabled: boolean; artifact: ArtifactSummary; robinhoodRouter: string }) {
  const [connection, setConnection] = useState<WalletConnection | null>(null);
  const [confirmation, setConfirmation] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("Connect the approved wallet to begin the final review.");
  const [txHash, setTxHash] = useState("");
  const [verification, setVerification] = useState<Verification | null>(null);

  const correctWallet = connection?.account.toLowerCase() === APPROVED_WALLET.toLowerCase();
  const correctNetwork = connection?.chainId.toLowerCase() === ARC_CHAIN_HEX;
  const armed = previewEnabled && correctWallet && correctNetwork && acknowledged && confirmation === CONFIRMATION && !busy && !txHash;

  const checkpoints = useMemo(() => [
    { label: "Preview-only release", ready: previewEnabled, detail: previewEnabled ? "Netlify deploy-preview context" : "Disabled outside an approved deploy preview" },
    { label: "Approved wallet", ready: Boolean(correctWallet), detail: connection ? short(connection.account) : short(APPROVED_WALLET) },
    { label: "Robinhood prerequisite", ready: true, detail: `Verified · ${short(robinhoodRouter)}` },
    { label: "Arc", ready: Boolean(correctNetwork), detail: connection ? `Active chain ${Number.parseInt(connection.chainId || "0", 16) || "unknown"}` : "Chain 5042 required" },
    { label: "Reviewed bytecode", ready: true, detail: short(artifact.creationCodeHash) },
    { label: "Transaction value", ready: true, detail: "0 USDC · contract creation only" },
  ], [artifact.creationCodeHash, connection, correctNetwork, correctWallet, previewEnabled, robinhoodRouter]);

  const verify = useCallback(async (hash: string) => {
    const response = await fetch(`/api/mss2-router-deployment?network=arc&txHash=${encodeURIComponent(hash)}`, { cache: "no-store" });
    const result = await response.json() as Verification;
    if (!response.ok) throw new Error(result.error || "The deployment could not be verified.");
    setVerification(result);
    return result;
  }, []);

  useEffect(() => {
    if (!txHash || verification?.state === "verified") return;
    let cancelled = false;
    let attempts = 0;
    const poll = async () => {
      attempts += 1;
      try {
        const result = await verify(txHash);
        if (cancelled) return;
        if (result.state === "verified") {
          setStatus("Arc router deployed and bytecode verified.");
          setBusy(false);
          return;
        }
        setStatus(result.message || "Waiting for the Arc receipt…");
      } catch (error) {
        if (cancelled) return;
        setStatus(error instanceof Error ? error.message : "Deployment verification failed.");
        setBusy(false);
        return;
      }
      if (!cancelled && attempts < 90) window.setTimeout(poll, 4_000);
      else if (!cancelled) {
        setStatus("Verification timed out. The transaction can be checked again using its hash.");
        setBusy(false);
      }
    };
    void poll();
    return () => { cancelled = true; };
  }, [txHash, verification?.state, verify]);

  const switchToArc = async () => {
    if (!connection) return;
    setStatus("Check your wallet to approve the network switch. This does not submit a transaction.");
    try {
      await connection.switchChain(ARC_CHAIN_HEX);
      setStatus("Arc selected. Review every checkpoint before deployment.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "The network switch was cancelled.");
    }
  };

  const deploy = async () => {
    if (!connection || !armed) return;
    setBusy(true);
    setStatus("Opening the wallet’s final contract-creation review…");
    try {
      const hash = await connection.sendTransaction({ data: artifact.bytecode, value: "0x0" });
      setTxHash(hash);
      setStatus("Transaction submitted. Waiting for the Arc receipt and bytecode verification…");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "The deployment request was cancelled.");
      setBusy(false);
    }
  };

  return (
    <main className={styles.shell}>
      <header className={styles.header}>
        <Link href="/arcade" className={styles.back}>← BACK TO MSS2 ARCADE</Link>
        <span className={styles.preview}>REVIEWED DEPLOYMENT CONSOLE</span>
        <WalletConnect compact theme="mss" onConnectionChange={setConnection} />
      </header>

      <section className={styles.hero}>
        <div>
          <p className={styles.eyebrow}>MSS2 ENTRY ROUTER · RELEASE STEP 2</p>
          <h1>Deploy on <em>Arc</em></h1>
          <p>This console prepares one immutable, zero-value contract-creation transaction. The router will later split each verified MSS2 arcade entry directly: 20% to the dead address and 80% to the Community Airdrop Reserve.</p>
        </div>
        <div className={styles.sequence}>
          <span><b>✓</b> ROBINHOOD VERIFIED</span>
          <i />
          <span className={styles.active}><b>2</b> ARC</span>
          <i />
          <span className={styles.locked}><b>3</b> VERIFY</span>
        </div>
      </section>

      {!previewEnabled && <section className={styles.blocked}><strong>DEPLOYMENT DISABLED</strong><p>This action is available only in the approved Netlify deploy preview. Production payments remain locked.</p></section>}

      <div className={styles.grid}>
        <section className={styles.panel}>
          <div className={styles.panelHeading}><span>01</span><div><small>PRE-FLIGHT</small><h2>Safety checkpoints</h2></div></div>
          <div className={styles.checkpoints}>
            {checkpoints.map((checkpoint) => <div key={checkpoint.label} className={checkpoint.ready ? styles.ready : styles.waiting}>
              <i>{checkpoint.ready ? "✓" : "!"}</i><span><b>{checkpoint.label}</b><small>{checkpoint.detail}</small></span>
            </div>)}
          </div>
          {connection && !correctWallet && <p className={styles.danger}>Wrong wallet connected. Switch to {short(APPROVED_WALLET)} inside MetaMask or Rabby.</p>}
          {connection && correctWallet && !correctNetwork && <button className={styles.switchButton} type="button" onClick={switchToArc}>SWITCH TO ARC</button>}
        </section>

        <section className={styles.panel}>
          <div className={styles.panelHeading}><span>02</span><div><small>IMMUTABLE CONFIGURATION</small><h2>Review the router</h2></div></div>
          <dl className={styles.details}>
            <div><dt>MSS2 token</dt><dd>0x091F…3B65</dd></div>
            <div><dt>Dead address</dt><dd>20% · 0x0000…dEaD</dd></div>
            <div><dt>Community reserve</dt><dd>80% · 0xE8b6…D7A7</dd></div>
            <div><dt>Compiler</dt><dd>{artifact.compilerVersion.split("+")[0]}</dd></div>
            <div><dt>Creation hash</dt><dd title={artifact.creationCodeHash}>{short(artifact.creationCodeHash)}</dd></div>
            <div><dt>Runtime hash</dt><dd title={artifact.runtimeCodeHash}>{short(artifact.runtimeCodeHash)}</dd></div>
          </dl>
          <p className={styles.notice}>No owner · No upgrade key · No withdrawal function · No native value · No MSS2 approval during deployment</p>
        </section>

        <section className={`${styles.panel} ${styles.actionPanel}`}>
          <div className={styles.panelHeading}><span>03</span><div><small>WALLET SIGNATURE</small><h2>Final confirmation</h2></div></div>
          <label className={styles.acknowledge}>
            <input type="checkbox" checked={acknowledged} onChange={(event) => setAcknowledged(event.target.checked)} disabled={!previewEnabled || busy || Boolean(txHash)} />
            <span>I understand this deploys an immutable router on Arc and spends USDC only for network gas.</span>
          </label>
          <label className={styles.confirmLabel}>
            <span>TYPE <b>{CONFIRMATION}</b></span>
            <input value={confirmation} onChange={(event) => setConfirmation(event.target.value.toUpperCase())} placeholder={CONFIRMATION} disabled={!previewEnabled || busy || Boolean(txHash)} autoComplete="off" />
          </label>
          <button className={styles.deployButton} type="button" onClick={deploy} disabled={!armed}>
            {busy ? "WAITING FOR VERIFICATION…" : txHash ? "TRANSACTION SUBMITTED" : "OPEN WALLET DEPLOYMENT REVIEW"}
          </button>
          <p className={styles.status} role="status">{status}</p>
          {txHash && <a className={styles.txLink} href={`https://explorer.arc.io/tx/${txHash}`} target="_blank" rel="noreferrer">VIEW TRANSACTION ↗</a>}
          {verification?.state === "verified" && verification.contractAddress && <div className={styles.success}>
            <strong>ROUTER VERIFIED</strong>
            <p>{verification.contractAddress}</p>
            <a href={verification.explorerUrl} target="_blank" rel="noreferrer">OPEN VERIFIED BYTECODE ↗</a>
          </div>}
        </section>
      </div>

      <footer className={styles.footer}>Yield Vacuum · Preview deployment tool · Production game payments remain disabled until both routers and the backend canaries are separately approved.</footer>
    </main>
  );
}
