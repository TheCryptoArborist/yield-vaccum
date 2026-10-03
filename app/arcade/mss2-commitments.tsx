"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import styles from "./mss2-commitments.module.css";

type DemoStage = "amount" | "review" | "verifying" | "recorded";
type DemoRecord = {
  id: string;
  amount: string;
  recordedAt: string;
  status: "simulated";
};

const ROBINHOOD_CHAIN_ID = 4663;
const MSS2_TOKEN = "0x091F0c7e675A787A4018eb47c30BeD3FA2013B65";
const DEAD_ADDRESS = "0x000000000000000000000000000000000000dEaD";
const DEMO_RECORDS_KEY = "yield-vacuum-mss2-commitments-demo-v1";
const DECIMAL_SCALE = BigInt(10) ** BigInt(18);

const steps = ["Demo wallet", "Amount", "Warning", "Demo check", "Demo record"];

function isPositiveMss2Amount(value: string) {
  const trimmed = value.trim();
  return /^\d+(?:\.\d{0,18})?$/.test(trimmed) && trimmed.replace(/[.0]/g, "").length > 0;
}

function amountToUnits(value: string) {
  const [whole, fraction = ""] = value.split(".");
  return BigInt(whole) * DECIMAL_SCALE + BigInt(fraction.padEnd(18, "0"));
}

function unitsToAmount(value: bigint) {
  const whole = value / DECIMAL_SCALE;
  const fraction = (value % DECIMAL_SCALE).toString().padStart(18, "0").replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : whole.toString();
}

function shortAddress(address: string) {
  return `${address.slice(0, 8)}…${address.slice(-6)}`;
}

export default function Mss2Commitments() {
  const [stage, setStage] = useState<DemoStage>("amount");
  const [amount, setAmount] = useState("");
  const [acceptedWarning, setAcceptedWarning] = useState(false);
  const [records, setRecords] = useState<DemoRecord[]>([]);
  const [lastRecord, setLastRecord] = useState<DemoRecord | null>(null);
  const [message, setMessage] = useState("");
  const verificationTimer = useRef<number | null>(null);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      try {
        const stored = JSON.parse(window.localStorage.getItem(DEMO_RECORDS_KEY) || "[]") as unknown;
        if (!Array.isArray(stored)) return;
        const valid = stored.filter((record): record is DemoRecord => (
          typeof record === "object" && record !== null &&
          typeof (record as DemoRecord).id === "string" &&
          typeof (record as DemoRecord).amount === "string" &&
          typeof (record as DemoRecord).recordedAt === "string" &&
          (record as DemoRecord).status === "simulated"
        )).slice(0, 25);
        setRecords(valid);
      } catch {
        window.localStorage.removeItem(DEMO_RECORDS_KEY);
      }
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => () => {
    if (verificationTimer.current !== null) window.clearTimeout(verificationTimer.current);
  }, []);

  const demoTotal = useMemo(() => {
    const total = records.reduce((sum, record) => {
      try {
        return sum + amountToUnits(record.amount);
      } catch {
        return sum;
      }
    }, BigInt(0));
    return unitsToAmount(total);
  }, [records]);

  const activeStep = stage === "amount" ? 1 : stage === "review" ? 2 : stage === "verifying" ? 3 : 4;

  const reviewAmount = () => {
    if (!isPositiveMss2Amount(amount)) {
      setMessage("Enter a positive demo amount using no more than 18 decimal places.");
      return;
    }
    setMessage("");
    setAcceptedWarning(false);
    setStage("review");
  };

  const simulateVerification = () => {
    if (!acceptedWarning) {
      setMessage("Acknowledge the irreversible-transfer warning to continue the demo.");
      return;
    }
    setMessage("");
    setStage("verifying");
    verificationTimer.current = window.setTimeout(() => {
      const record: DemoRecord = {
        id: `demo-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
        amount: amount.trim(),
        recordedAt: new Date().toISOString(),
        status: "simulated",
      };
      const next = [record, ...records].slice(0, 25);
      window.localStorage.setItem(DEMO_RECORDS_KEY, JSON.stringify(next));
      setRecords(next);
      setLastRecord(record);
      setStage("recorded");
      verificationTimer.current = null;
    }, 900);
  };

  const resetDemo = () => {
    if (verificationTimer.current !== null) window.clearTimeout(verificationTimer.current);
    verificationTimer.current = null;
    setAmount("");
    setAcceptedWarning(false);
    setLastRecord(null);
    setMessage("");
    setStage("amount");
  };

  const clearDemoHistory = () => {
    window.localStorage.removeItem(DEMO_RECORDS_KEY);
    setRecords([]);
    setLastRecord(null);
  };

  return (
    <section id="mss2-commitments" className={styles.commitments} aria-labelledby="mss2-commitments-title">
      <header className={styles.heading}>
        <div>
          <small>OPTIONAL ARCADE PROGRAM · DEMONSTRATION</small>
          <h2 id="mss2-commitments-title">MSS2 COMMITMENTS</h2>
          <p>Preview how a future permanent-membership contribution could be reviewed and verified without sending a token.</p>
        </div>
        <div className={styles.statuses} aria-label="Commitment demo status">
          <span>ROBINHOOD ONLY</span>
          <span>ARC DISABLED</span>
          <strong>REAL TRANSFERS OFF</strong>
        </div>
      </header>

      <div className={styles.boundary}>
        <b>DEMO ONLY</b>
        <p>No approval, signature, transfer, network switch, backend credit, membership entitlement, or payout occurs here.</p>
      </div>

      <div className={styles.networkGrid}>
        <article><small>NETWORK</small><strong>Robinhood Chain</strong><span>Mainnet chain ID {ROBINHOOD_CHAIN_ID}</span></article>
        <article><small>MSS2 TOKEN</small><strong>{shortAddress(MSS2_TOKEN)}</strong><span>18 decimals · published address</span></article>
        <article><small>PROPOSED DESTINATION</small><strong>{shortAddress(DEAD_ADDRESS)}</strong><span>Dead address · not a treasury</span></article>
      </div>

      <div className={styles.addresses}>
        <p><b>Token:</b><code>{MSS2_TOKEN}</code></p>
        <p><b>Destination:</b><code>{DEAD_ADDRESS}</code></p>
        <span>Live readiness is not established by these labels. Independent onchain and backend verification remains required.</span>
      </div>

      <div className={styles.demoLayout}>
        <ol className={styles.steps} aria-label="Demonstration flow">
          {steps.map((step, index) => (
            <li key={step} className={index <= activeStep ? styles.stepActive : ""}>
              <i>{index + 1}</i><span>{step}</span>
            </li>
          ))}
        </ol>

        <div className={styles.demoPanel}>
          {stage === "amount" && (
            <div className={styles.stage}>
              <small>STEP 1–2 · SIMULATED INPUT</small>
              <h3>Choose a demo amount</h3>
              <p>The wallet step is simulated. The existing site wallet remains connection-only and is not asked to approve anything.</p>
              <label htmlFor="mss2-demo-amount">Demo MSS2 amount</label>
              <div className={styles.amountInput}>
                <input
                  id="mss2-demo-amount"
                  value={amount}
                  onChange={(event) => { setAmount(event.target.value); setMessage(""); }}
                  inputMode="decimal"
                  autoComplete="off"
                  placeholder="Enter demo amount"
                  aria-describedby="mss2-demo-message"
                />
                <span>MSS2</span>
              </div>
              <button type="button" onClick={reviewAmount}>REVIEW DEMO COMMITMENT</button>
            </div>
          )}

          {stage === "review" && (
            <div className={styles.stage}>
              <small>STEP 3 · REVIEW</small>
              <h3>Irreversible-transfer warning</h3>
              <dl className={styles.reviewGrid}>
                <div><dt>Sender</dt><dd>Demo wallet — not connected</dd></div>
                <div><dt>Network</dt><dd>Robinhood · chain {ROBINHOOD_CHAIN_ID}</dd></div>
                <div><dt>Amount</dt><dd>{amount} MSS2 · simulated</dd></div>
                <div><dt>Recipient</dt><dd>{shortAddress(DEAD_ADDRESS)}</dd></div>
              </dl>
              <div className={styles.warning}>
                <b>A real transfer would be intended to be permanent.</b>
                <p>Yield Vacuum could not recover MSS2 sent to the dead address. A contribution would not guarantee income, token-price appreciation, benefits, or continued operation of the service.</p>
              </div>
              <label className={styles.acknowledge}>
                <input type="checkbox" checked={acceptedWarning} onChange={(event) => setAcceptedWarning(event.target.checked)} />
                <span>I understand this is a simulation of an irreversible action.</span>
              </label>
              <div className={styles.actions}>
                <button type="button" className={styles.secondary} onClick={() => { setStage("amount"); setMessage(""); }}>BACK</button>
                <button type="button" onClick={simulateVerification}>SIMULATE VERIFICATION</button>
              </div>
            </div>
          )}

          {stage === "verifying" && (
            <div className={`${styles.stage} ${styles.verifying}`} aria-live="polite">
              <span className={styles.spinner} aria-hidden="true" />
              <small>STEP 4 · DEMO BACKEND</small>
              <h3>Simulating receipt checks</h3>
              <ul>
                <li>Correct network: Robinhood chain {ROBINHOOD_CHAIN_ID}</li>
                <li>Correct token and recipient</li>
                <li>Sender and amount match</li>
                <li>Successful receipt and unused transaction</li>
              </ul>
              <p>No RPC call, transaction hash, or blockchain write is being used.</p>
            </div>
          )}

          {stage === "recorded" && lastRecord && (
            <div className={styles.stage} aria-live="polite">
              <small>STEP 5 · DEMO RECORD</small>
              <h3>Simulated contribution recorded</h3>
              <div className={styles.receipt}>
                <span><small>DEMO AMOUNT</small><strong>{lastRecord.amount} MSS2</strong></span>
                <span><small>REFERENCE</small><strong>{lastRecord.id}</strong></span>
              </div>
              <p>This is local demonstration data. It is not a verified contribution, transaction receipt, membership balance, burn total, or claim on benefits.</p>
              <button type="button" onClick={resetDemo}>RUN ANOTHER DEMO</button>
            </div>
          )}

          {message && <p id="mss2-demo-message" className={styles.message} role="alert">{message}</p>}
        </div>
      </div>

      <div className={styles.recordSummary}>
        <div><small>SIMULATED MSS2 TOTAL</small><strong>{demoTotal}</strong><span>Browser-only demo data</span></div>
        <div><small>VERIFIED CONTRIBUTIONS</small><strong>NOT AVAILABLE</strong><span>No verification backend exists</span></div>
        <button type="button" onClick={clearDemoHistory} disabled={!records.length}>CLEAR DEMO HISTORY</button>
      </div>

      <div className={styles.programGrid}>
        <article>
          <small>MEMBERSHIP CONCEPT</small>
          <h3>Benefits remain under design</h3>
          <ul><li>Premium game content</li><li>Cosmetic unlocks</li><li>Capped continue allowances</li></ul>
          <p>No thresholds or entitlements are active. Free gameplay and free restarts remain available without a contribution.</p>
        </article>
        <article>
          <small>SEPARATE REVENUE CONCEPT</small>
          <h3>No income program is enabled</h3>
          <p>Any future distributions would need a separately funded, reviewed business-revenue program. They cannot come from dead-address tokens, new deposits, or promised MSS2 emissions. No fixed return is offered.</p>
        </article>
      </div>

      <footer className={styles.disclosure}>
        <b>Language matters.</b>
        <p>A future verified total would be described as “MSS2 sent to the dead address.” This demo does not call the transfers native staking or automatically claim that token total supply was reduced.</p>
      </footer>
    </section>
  );
}
