"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import WalletConnect, { type WalletConnection } from "../wallet-connect";
import Mss2Commitments from "./mss2-commitments";
import MintFlyerLeaderboard, { type LeaderboardFlightResult } from "./mint-flyer-leaderboard";
import { ensureMintFlyerPlayerKey } from "../../lib/arcade-player";
import { MSS2_COMMUNITY_AIRDROP_RESERVE, MSS2_DEAD_ADDRESS } from "../../lib/mss2-payment-shared";
import type { Mss2EntryBalance } from "../../lib/mss2-entry-balance";
import styles from "./mint-flyer.module.css";

type FlightPhase = "ready" | "countdown" | "playing" | "paused" | "crashed" | "victory";
type FlightStage = 1 | 2 | 3;
type EntryQuote = {
  source: string;
  status: "indicative";
  quoteId: string;
  chainId: "robinhood" | "arc";
  pairAddress: string;
  tokenAddress: string;
  pairUrl: string;
  priceUsd: string;
  entryPriceUsd: string;
  indicativeMss2ForEntry: string;
  liquidityUsd: number | null;
  observedAt: string;
  checkedAt: string;
  validUntil: string;
};
type PaymentReadiness = {
  enabled: boolean;
  chainId: number;
  chainHex: `0x${string}`;
  network: string;
  networkId: "robinhood" | "arc";
  tokenAddress: string;
  tokenSymbol: "MSS2";
  tokenDecimals: number;
  entryPriceUsd: string;
  confirmations: number;
  routerAddress: string | null;
  releaseMode: "disabled" | "canary" | "production";
  canaryWalletAddress: string | null;
  reason: string | null;
};
type LivePaymentQuote = {
  balanceCheck?: Mss2EntryBalance;
  paymentId: string;
  runId: string;
  network: "robinhood" | "arc";
  chainId: number;
  tokenAddress: string;
  routerAddress: string;
  amountRaw: string;
  displayAmount: string;
  entryPriceUsd: string;
  priceUsd: string;
  liquidityUsd: number;
  pairAddress: string;
  pairUrl: string;
  explorerUrl: string;
  createdAt: string;
  expiresAt: string;
  status: "pending";
  walletAddress: string;
  approval: { from: string; to: string; data: string; value: string };
  entry: { from: string; to: string; data: string; value: string };
};
type DemoRunAuthorization = {
  authorizationId: string;
  runId: string;
  network: "robinhood" | "arc";
  mode: "demo";
  createdAt: string;
  expiresAt: string;
};
type FlyerEntity = {
  id: number;
  kind: "mint" | "hazard";
  x: number;
  y: number;
  size: number;
};
type FlightEffect = {
  id: number;
  kind: "collect" | "hit";
  x: number;
  y: number;
  bornAt: number;
  label?: string;
};

function isTextEntryTarget(target: EventTarget | null) {
  return target instanceof HTMLElement && (
    target.isContentEditable ||
    target.tagName === "INPUT" ||
    target.tagName === "TEXTAREA" ||
    target.tagName === "SELECT"
  );
}

const MAX_LIVES = 3;
const DEMO_CONTINUE_COST = 100;
const STARTING_DEMO_CREDITS = 100;
const BEST_SCORE_KEY = "yield-vacuum-mss2-mint-flyer-best";
const COMMUNITY_AIRDROP_WALLET = MSS2_COMMUNITY_AIRDROP_RESERVE;
const DEAD_ADDRESS = MSS2_DEAD_ADDRESS;
const ENTRY_PRICE_USD = 1;
const MSS2_BUY_URLS = {
  robinhood: "https://www.mintstakeshare.com/robinhood?ref=0xF2Ab1eEBbEcb4E315FE95D8b532D1aB00F1A8789",
  arc: "https://www.mintstakeshare.com/arc?ref=0xF2Ab1eEBbEcb4E315FE95D8b532D1aB00F1A8789",
};
const ROBINHOOD_CHAIN_HEX = "0x1237";
const ARC_CHAIN_HEX = "0x13b2";
const SOUND_PREFERENCE_KEY = "yield-vacuum-mss2-mint-flyer-sound";
const MOON_DISTANCE = 3000;
const FLIGHT_STAGES: Array<{ id: FlightStage; name: string; start: number; instruction: string }> = [
  { id: 1, name: "MINT STREAM", start: 0, instruction: "Collect cyan Mint Credits and build your combo." },
  { id: 2, name: "BLOCK SURGE", start: 650, instruction: "Faster corrupted blocks now arrive in formations." },
  { id: 3, name: "MOON RUN", start: 1650, instruction: "Survive maximum speed and reach the Moon." },
];
const GRADE_TARGETS = [
  { grade: "B", score: 40000 },
  { grade: "A", score: 50000 },
  { grade: "S", score: 62000 },
] as const;
const GRADE_LADDER = [
  { grade: "C", score: 0 },
  ...GRADE_TARGETS,
] as const;

function comboMultiplier(streak: number) {
  if (streak >= 10) return 5;
  if (streak >= 6) return 3;
  if (streak >= 3) return 2;
  return 1;
}

function stageForDistance(distance: number): FlightStage {
  if (distance >= FLIGHT_STAGES[2].start) return 3;
  if (distance >= FLIGHT_STAGES[1].start) return 2;
  return 1;
}

function gradeForScore(score: number) {
  if (score >= 62000) return "S";
  if (score >= 50000) return "A";
  if (score >= 40000) return "B";
  return "C";
}

export default function MintFlyer() {
  const [finishPanel, setFinishPanel] = useState<HTMLDivElement | null>(null);
  const [phase, setPhase] = useState<FlightPhase>("ready");
  const [playerY, setPlayerY] = useState(0.5);
  const [entities, setEntities] = useState<FlyerEntity[]>([]);
  const [score, setScore] = useState(0);
  const [distance, setDistance] = useState(0);
  const [mintsCollected, setMintsCollected] = useState(0);
  const [lives, setLives] = useState(MAX_LIVES);
  const [demoCredits, setDemoCredits] = useState(STARTING_DEMO_CREDITS);
  const [continued, setContinued] = useState(false);
  const [bestScore, setBestScore] = useState(0);
  const [newBest, setNewBest] = useState(false);
  const [entryQuote, setEntryQuote] = useState<EntryQuote | null>(null);
  const [quoteUnavailable, setQuoteUnavailable] = useState(false);
  const [quoteBusy, setQuoteBusy] = useState(false);
  const [quoteClock, setQuoteClock] = useState(0);
  const [reviewingEntry, setReviewingEntry] = useState(false);
  const [effects, setEffects] = useState<FlightEffect[]>([]);
  const [countdown, setCountdown] = useState(3);
  const [combo, setCombo] = useState(0);
  const [maxCombo, setMaxCombo] = useState(0);
  const [totalHits, setTotalHits] = useState(0);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [stage, setStage] = useState<FlightStage>(1);
  const [stageNotice, setStageNotice] = useState(false);
  const [moonBonus, setMoonBonus] = useState(0);
  const [runId, setRunId] = useState("");
  const [walletConnection, setWalletConnection] = useState<WalletConnection | null>(null);
  const [playerKey, setPlayerKey] = useState("");
  const [paymentReadiness, setPaymentReadiness] = useState<PaymentReadiness | null>(null);
  const [livePaymentQuote, setLivePaymentQuote] = useState<LivePaymentQuote | null>(null);
  const [activePaymentId, setActivePaymentId] = useState("");
  const [activeRunAuthorizationId, setActiveRunAuthorizationId] = useState("");
  const [activeRunNetwork, setActiveRunNetwork] = useState<"robinhood" | "arc">("robinhood");
  const [paymentTxHash, setPaymentTxHash] = useState("");
  const [paymentBusy, setPaymentBusy] = useState(false);
  const [paymentMessage, setPaymentMessage] = useState("");
  const [entryBalance, setEntryBalance] = useState<{ paymentId: string; check: Mss2EntryBalance } | null>(null);
  const walletContextRef = useRef<WalletConnection | null>(null);
  const currentBalanceCheck = entryBalance?.paymentId === livePaymentQuote?.paymentId ? entryBalance?.check : null;

  const connectedChainId = walletConnection?.chainId.toLowerCase() ?? "";
  const selectedMss2Network = connectedChainId === ARC_CHAIN_HEX
    ? "arc"
    : connectedChainId === ROBINHOOD_CHAIN_HEX || !walletConnection
      ? "robinhood"
      : "unsupported";
  const isArcContext = selectedMss2Network === "arc";
  const isRobinhoodContext = selectedMss2Network === "robinhood";
  const liveEntryEnabled = Boolean(paymentReadiness?.enabled && paymentReadiness.networkId === selectedMss2Network);
  const canaryEntryEnabled = liveEntryEnabled && paymentReadiness?.releaseMode === "canary";
  const selectedNetworkLabel = isArcContext ? "ARC" : isRobinhoodContext ? "ROBINHOOD CHAIN" : "SELECT NETWORK";
  const handleWalletConnectionChange = useCallback((connection: WalletConnection | null) => {
    walletContextRef.current = connection;
    setWalletConnection(connection);
    setEntryQuote(null);
    setQuoteUnavailable(false);
    setReviewingEntry(false);
    setLivePaymentQuote(null);
    setPaymentTxHash("");
    setPaymentMessage("");
    setEntryBalance(null);
  }, []);

  const playerYRef = useRef(0.5);
  const targetYRef = useRef(0.5);
  const entitiesRef = useRef<FlyerEntity[]>([]);
  const effectsRef = useRef<FlightEffect[]>([]);
  const scoreRef = useRef(0);
  const distanceRef = useRef(0);
  const livesRef = useRef(MAX_LIVES);
  const spawnTimerRef = useRef(0);
  const entityIdRef = useRef(0);
  const effectIdRef = useRef(0);
  const collectedRef = useRef(0);
  const invulnerableUntilRef = useRef(0);
  const heldKeysRef = useRef(new Set<string>());
  const comboRef = useRef(0);
  const maxComboRef = useRef(0);
  const mintScoreRef = useRef(0);
  const totalHitsRef = useRef(0);
  const soundEnabledRef = useRef(true);
  const audioContextRef = useRef<AudioContext | null>(null);
  const stageRef = useRef<FlightStage>(1);
  const stageNoticeTimerRef = useRef<number | null>(null);
  const quoteRequestRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      setPlayerKey(ensureMintFlyerPlayerKey());
      setBestScore(Number(window.localStorage.getItem(BEST_SCORE_KEY) || 0));
      const storedSound = window.localStorage.getItem(SOUND_PREFERENCE_KEY) !== "off";
      soundEnabledRef.current = storedSound;
      setSoundEnabled(storedSound);
    });
    return () => cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (selectedMss2Network === "unsupported") return;
    const walletQuery = walletConnection?.account ? `&wallet=${encodeURIComponent(walletConnection.account)}` : "";
    fetch(`/api/arcade-payment?chain=${selectedMss2Network}${walletQuery}`, { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("Payment readiness unavailable.");
        return await response.json() as PaymentReadiness;
      })
      .then((status) => { if (!cancelled) setPaymentReadiness(status); })
      .catch(() => { if (!cancelled) setPaymentReadiness(null); });
    return () => { cancelled = true; };
  }, [selectedMss2Network, walletConnection?.account]);

  const primeAudio = useCallback(() => {
    if (!soundEnabledRef.current) return;
    if (!audioContextRef.current) audioContextRef.current = new AudioContext();
    if (audioContextRef.current.state === "suspended") void audioContextRef.current.resume();
  }, []);

  const playTone = useCallback((frequency: number, duration: number, type: OscillatorType = "square", volume = 0.035) => {
    if (!soundEnabledRef.current) return;
    const context = audioContextRef.current;
    if (!context || context.state === "closed") return;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, context.currentTime);
    gain.gain.setValueAtTime(volume, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + duration);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + duration);
  }, []);

  const toggleSound = useCallback(() => {
    const next = !soundEnabledRef.current;
    soundEnabledRef.current = next;
    setSoundEnabled(next);
    window.localStorage.setItem(SOUND_PREFERENCE_KEY, next ? "on" : "off");
    if (next) {
      primeAudio();
      window.setTimeout(() => playTone(660, 0.09, "square", 0.025), 20);
    }
  }, [playTone, primeAudio]);

  const loadEntryQuote = useCallback(async () => {
    if (selectedMss2Network === "unsupported") return null;
    quoteRequestRef.current?.abort();
    const controller = new AbortController();
    quoteRequestRef.current = controller;
    setQuoteBusy(true);
    setQuoteUnavailable(false);
    const timeout = window.setTimeout(() => controller.abort(), 12_000);
    try {
      const response = await fetch(`/api/mss2-price?chain=${selectedMss2Network}`, {
        cache: "no-store",
        signal: controller.signal,
      });
      const quote = await response.json() as EntryQuote & { error?: string };
      if (!response.ok) throw new Error(quote.error || "MSS2 quote unavailable");
      if (quote.chainId !== selectedMss2Network) throw new Error("MSS2 quote network mismatch");
      if (quoteRequestRef.current !== controller) return null;
      setEntryQuote(quote);
      setQuoteUnavailable(false);
      setQuoteClock(Date.now());
      setPaymentMessage("");
      return quote;
    } catch (error) {
      if (quoteRequestRef.current !== controller) return null;
      setEntryQuote(null);
      setQuoteUnavailable(true);
      setReviewingEntry(false);
      setPaymentMessage(error instanceof DOMException && error.name === "AbortError"
        ? "The verified market quote took too long. Tap Retry Quote to try again."
        : error instanceof Error ? error.message : "The MSS2 quote is temporarily unavailable.");
      return null;
    } finally {
      window.clearTimeout(timeout);
      if (quoteRequestRef.current === controller) {
        quoteRequestRef.current = null;
        setQuoteBusy(false);
      }
    }
  }, [selectedMss2Network]);

  useEffect(() => {
    if (reviewingEntry || selectedMss2Network === "unsupported") return;
    const initial = window.setTimeout(loadEntryQuote, 0);
    const refresh = window.setInterval(loadEntryQuote, 30_000);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(refresh);
      quoteRequestRef.current?.abort();
    };
  }, [loadEntryQuote, reviewingEntry, selectedMss2Network]);

  useEffect(() => {
    const clock = window.setInterval(() => setQuoteClock(Date.now()), 1_000);
    return () => window.clearInterval(clock);
  }, []);

  const quoteExpiry = entryQuote ? Date.parse(entryQuote.validUntil) : 0;
  const quoteSecondsRemaining = entryQuote && Number.isFinite(quoteExpiry)
    ? Math.max(0, Math.ceil((quoteExpiry - quoteClock) / 1_000))
    : 0;
  const quoteExpired = Boolean(entryQuote) && quoteSecondsRemaining <= 0;
  const liveQuoteExpiry = livePaymentQuote ? Date.parse(livePaymentQuote.expiresAt) : 0;
  const liveQuoteSecondsRemaining = livePaymentQuote && Number.isFinite(liveQuoteExpiry)
    ? Math.max(0, Math.ceil((liveQuoteExpiry - quoteClock) / 1_000))
    : 0;
  const liveQuoteExpired = Boolean(livePaymentQuote) && liveQuoteSecondsRemaining <= 0;

  const publishBest = useCallback((finalScore: number) => {
    const stored = Number(window.localStorage.getItem(BEST_SCORE_KEY) || 0);
    if (finalScore > stored) {
      window.localStorage.setItem(BEST_SCORE_KEY, String(finalScore));
      setBestScore(finalScore);
      setNewBest(true);
    } else {
      setBestScore(stored);
      setNewBest(false);
    }
  }, []);

  const resetFlight = useCallback((verifiedRunId?: string) => {
    if (stageNoticeTimerRef.current !== null) window.clearTimeout(stageNoticeTimerRef.current);
    stageNoticeTimerRef.current = null;
    playerYRef.current = 0.5;
    targetYRef.current = 0.5;
    entitiesRef.current = [];
    effectsRef.current = [];
    scoreRef.current = 0;
    distanceRef.current = 0;
    livesRef.current = MAX_LIVES;
    spawnTimerRef.current = 0;
    collectedRef.current = 0;
    comboRef.current = 0;
    maxComboRef.current = 0;
    mintScoreRef.current = 0;
    totalHitsRef.current = 0;
    stageRef.current = 1;
    invulnerableUntilRef.current = performance.now() + 900;
    setPlayerY(0.5);
    setEntities([]);
    setEffects([]);
    setScore(0);
    setDistance(0);
    setMintsCollected(0);
    setCombo(0);
    setMaxCombo(0);
    setTotalHits(0);
    setStage(1);
    setStageNotice(false);
    setMoonBonus(0);
    setLives(MAX_LIVES);
    setDemoCredits(STARTING_DEMO_CREDITS);
    setContinued(false);
    setNewBest(false);
    setReviewingEntry(false);
    setRunId(verifiedRunId || crypto.randomUUID());
    setCountdown(3);
    setPhase("countdown");
  }, []);

  const reviewEntry = useCallback(async () => {
    if (selectedMss2Network === "unsupported") {
      setPaymentMessage("Select Robinhood Chain or Arc in the wallet bar before reviewing a run.");
      return;
    }
    if (liveEntryEnabled) {
      if (!paymentReadiness) return;
      if (!walletConnection || !playerKey || paymentBusy) {
        setPaymentMessage("Connect MetaMask or Rabby above before requesting a live MSS2 entry quote.");
        return;
      }
      setPaymentBusy(true);
      setPaymentMessage("");
      try {
        if (walletConnection.chainId.toLowerCase() !== paymentReadiness.chainHex) {
          setPaymentMessage("Switching the wallet to Robinhood Chain…");
          await walletConnection.switchChain(paymentReadiness.chainHex);
        }
        const pendingRunId = crypto.randomUUID();
        const response = await fetch("/api/arcade-payment", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "quote", playerKey, runId: pendingRunId, walletAddress: walletConnection.account, network: selectedMss2Network }),
        });
        const data = await response.json() as LivePaymentQuote & { error?: string };
        if (!response.ok) throw new Error(data.error || "A live MSS2 entry quote could not be created.");
        setLivePaymentQuote(data);
        setEntryBalance(data.balanceCheck ? { paymentId: data.paymentId, check: data.balanceCheck } : null);
        setPaymentTxHash("");
        setQuoteClock(Date.now());
        setReviewingEntry(true);
      } catch (error) {
        setPaymentMessage(error instanceof Error ? error.message : "The live MSS2 entry quote could not be created.");
      } finally {
        setPaymentBusy(false);
      }
      return;
    }
    let currentQuote = entryQuote;
    if (!currentQuote || Date.now() >= Date.parse(currentQuote.validUntil)) {
      setQuoteClock(Date.now());
      currentQuote = await loadEntryQuote();
      if (!currentQuote) return;
    }
    setQuoteClock(Date.now());
    setReviewingEntry(true);
  }, [entryQuote, liveEntryEnabled, loadEntryQuote, paymentBusy, paymentReadiness, playerKey, selectedMss2Network, walletConnection]);

  const confirmDemoEntry = useCallback(async () => {
    if (!entryQuote || Date.now() >= Date.parse(entryQuote.validUntil)) {
      setQuoteClock(Date.now());
      return;
    }
    if (!playerKey || paymentBusy || (selectedMss2Network !== "robinhood" && selectedMss2Network !== "arc")) return;
    setPaymentBusy(true);
    setPaymentMessage("");
    try {
      const response = await fetch("/api/arcade-payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "demo-run", playerKey, network: selectedMss2Network, walletAddress: walletConnection?.account ?? "" }),
      });
      const authorization = await response.json() as DemoRunAuthorization & { error?: string };
      if (!response.ok) throw new Error(authorization.error || "The free flight could not be authorized.");
      setActivePaymentId("");
      setActiveRunAuthorizationId(authorization.authorizationId);
      setActiveRunNetwork(authorization.network);
      primeAudio();
      resetFlight(authorization.runId);
    } catch (error) {
      setPaymentMessage(error instanceof Error ? error.message : "The free flight could not be authorized.");
    } finally {
      setPaymentBusy(false);
    }
  }, [entryQuote, paymentBusy, playerKey, primeAudio, resetFlight, selectedMss2Network, walletConnection]);

  const readLiveEntryBalance = useCallback(async () => {
    if (!livePaymentQuote || !walletConnection) throw new Error("Connect your wallet and request a new entry quote.");
    const response = await fetch("/api/arcade-payment", {
      method: "POST", headers: { "Content-Type": "application/json" }, signal: AbortSignal.timeout(15_000),
      body: JSON.stringify({ action: "balance-check", paymentId: livePaymentQuote.paymentId, playerKey, walletAddress: walletConnection.account }),
    });
    const data = await response.json() as { paymentId?: string; balanceCheck?: Mss2EntryBalance; error?: string };
    if (!response.ok || !data.balanceCheck || data.paymentId !== livePaymentQuote.paymentId || data.balanceCheck.requiredRaw !== livePaymentQuote.amountRaw) {
      throw new Error(data.error || "Your MSS2 balance could not be checked. Please retry before paying.");
    }
    if (walletContextRef.current?.account.toLowerCase() !== livePaymentQuote.walletAddress.toLowerCase()
      || walletContextRef.current.chainId.toLowerCase() !== `0x${livePaymentQuote.chainId.toString(16)}`) {
      throw new Error("Your wallet or network changed. Request a new entry quote.");
    }
    setEntryBalance({ paymentId: livePaymentQuote.paymentId, check: data.balanceCheck });
    return data.balanceCheck;
  }, [livePaymentQuote, playerKey, walletConnection]);

  const refreshLiveBalance = useCallback(async () => {
    if (paymentBusy) return;
    setPaymentBusy(true);
    setPaymentMessage("Checking your MSS2 balance…");
    try {
      const balance = await readLiveEntryBalance();
      setPaymentMessage(balance.sufficient ? "Your MSS2 balance covers this entry. Review the amount, then open your wallet to pay." : "");
    } catch (error) {
      setEntryBalance(null);
      setPaymentMessage(error instanceof Error ? error.message : "Your MSS2 balance could not be checked. Please retry.");
    } finally { setPaymentBusy(false); }
  }, [paymentBusy, readLiveEntryBalance]);

  const confirmLivePayment = useCallback(async () => {
    if (!liveEntryEnabled || !paymentReadiness || !walletConnection || !livePaymentQuote || paymentBusy) return;
    if (!paymentTxHash && Date.now() >= Date.parse(livePaymentQuote.expiresAt)) {
      setPaymentMessage("This live quote expired. Go back and request a new one.");
      setQuoteClock(Date.now());
      return;
    }
    setPaymentBusy(true);
    setPaymentMessage(paymentTxHash ? "Rechecking your submitted payment…" : "Checking your MSS2 balance before opening the wallet…");
    try {
      if (walletConnection.chainId.toLowerCase() !== paymentReadiness.chainHex) await walletConnection.switchChain(paymentReadiness.chainHex);
      if (!paymentTxHash) {
        const balance = await readLiveEntryBalance();
        if (!balance.sufficient) { setPaymentMessage(""); return; }
        if (Date.now() >= Date.parse(livePaymentQuote.expiresAt)) throw new Error("This entry quote expired during the balance check. Go back and request a new one.");
        setPaymentMessage(`Check your wallet. First approve the exact MSS2 amount for the verified ${paymentReadiness.network} router.`);
        await walletConnection.sendTransaction(livePaymentQuote.approval);
        setPaymentMessage("Approval submitted. Now review the router entry that sends 20% to the dead address and 80% to the Community Airdrop Reserve.");
      }
      const txHash = paymentTxHash || await walletConnection.sendTransaction(livePaymentQuote.entry);
      if (!paymentTxHash) setPaymentTxHash(txHash);
      setPaymentMessage(`${paymentTxHash ? "Rechecking" : "Entry submitted. Checking"} the ${paymentReadiness.network} receipt and confirmations…`);
      let verified = false;
      for (let attempt = 0; attempt < 30; attempt += 1) {
        const response = await fetch("/api/arcade-payment", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "verify", paymentId: livePaymentQuote.paymentId, playerKey, walletAddress: walletConnection.account, txHash }),
        });
        const data = await response.json() as { pending?: boolean; confirmations?: number; error?: string };
        if (response.ok && !data.pending) {
          verified = true;
          break;
        }
        if (response.status !== 202) throw new Error(data.error || "The MSS2 transfer could not be verified.");
        setPaymentMessage(`Transfer found. Waiting for ${paymentReadiness.confirmations} confirmations (${data.confirmations ?? 0}/${paymentReadiness.confirmations})…`);
        await new Promise((resolve) => window.setTimeout(resolve, 2_000));
      }
      if (!verified) throw new Error("The payment is still pending. Keep the transaction hash and try verification again shortly.");
      setActivePaymentId(livePaymentQuote.paymentId);
      setActiveRunAuthorizationId("");
      setActiveRunNetwork(livePaymentQuote.network);
      setPaymentMessage("MSS2 payment verified. Starting the paid flight.");
      primeAudio();
      resetFlight(livePaymentQuote.runId);
    } catch (error) {
      setPaymentMessage(error instanceof Error ? error.message : "The MSS2 payment could not be completed.");
    } finally {
      setPaymentBusy(false);
    }
  }, [liveEntryEnabled, livePaymentQuote, paymentBusy, paymentReadiness, paymentTxHash, playerKey, primeAudio, readLiveEntryBalance, resetFlight, walletConnection]);

  const prepareAnotherRun = useCallback(() => {
    setPhase("ready");
    setReviewingEntry(false);
    setLivePaymentQuote(null);
    setActivePaymentId("");
    setActiveRunAuthorizationId("");
    setPaymentTxHash("");
    setPaymentMessage("");
    setEntryBalance(null);
    if (!entryQuote || Date.now() >= Date.parse(entryQuote.validUntil)) void loadEntryQuote();
  }, [entryQuote, loadEntryQuote]);

  const continueFlight = useCallback(() => {
    if (continued || demoCredits < DEMO_CONTINUE_COST) return;
    livesRef.current = MAX_LIVES;
    invulnerableUntilRef.current = performance.now() + 1500;
    entitiesRef.current = entitiesRef.current.filter((entity) => entity.x > 0.58);
    setLives(MAX_LIVES);
    setDemoCredits((current) => current - DEMO_CONTINUE_COST);
    setContinued(true);
    setEntities([...entitiesRef.current]);
    setCountdown(3);
    setPhase("countdown");
  }, [continued, demoCredits]);

  const pauseFlight = useCallback(() => {
    if (phase === "playing" || phase === "countdown") setPhase("paused");
  }, [phase]);

  const resumeFlight = useCallback(() => {
    primeAudio();
    setCountdown(3);
    setPhase("countdown");
  }, [primeAudio]);

  useEffect(() => {
    if (phase !== "countdown") return;
    playTone(countdown > 0 ? 430 + (3 - countdown) * 120 : 880, countdown > 0 ? 0.08 : 0.14, "square", 0.03);
    if (countdown <= 0) {
      const launch = window.setTimeout(() => setPhase("playing"), 360);
      return () => window.clearTimeout(launch);
    }
    const timer = window.setTimeout(() => setCountdown((current) => current - 1), 720);
    return () => window.clearTimeout(timer);
  }, [countdown, phase, playTone]);

  useEffect(() => {
    const pauseForInterruption = () => {
      setPhase((current) => current === "playing" || current === "countdown" ? "paused" : current);
      heldKeysRef.current.clear();
    };
    const protectFlight = () => {
      if (document.visibilityState === "hidden") pauseForInterruption();
    };
    document.addEventListener("visibilitychange", protectFlight);
    window.addEventListener("blur", pauseForInterruption);
    window.addEventListener("pagehide", pauseForInterruption);
    return () => {
      document.removeEventListener("visibilitychange", protectFlight);
      window.removeEventListener("blur", pauseForInterruption);
      window.removeEventListener("pagehide", pauseForInterruption);
    };
  }, []);

  useEffect(() => () => {
    if (stageNoticeTimerRef.current !== null) window.clearTimeout(stageNoticeTimerRef.current);
    if (audioContextRef.current?.state !== "closed") void audioContextRef.current?.close();
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (isTextEntryTarget(event.target)) return;
      if (["ArrowUp", "ArrowDown", "KeyW", "KeyS", "Space", "KeyP", "Escape"].includes(event.code)) event.preventDefault();
      heldKeysRef.current.add(event.code);
      if (event.code === "Space" && phase === "ready" && !reviewingEntry) reviewEntry();
      if ((event.code === "KeyP" || event.code === "Escape") && (phase === "playing" || phase === "countdown")) pauseFlight();
      if ((event.code === "KeyP" || event.code === "Escape") && phase === "paused") resumeFlight();
    };
    const onKeyUp = (event: KeyboardEvent) => heldKeysRef.current.delete(event.code);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [pauseFlight, phase, resumeFlight, reviewEntry, reviewingEntry]);

  useEffect(() => {
    if (phase !== "playing") return;
    let animation = 0;
    let lastTime = performance.now();

    const frame = (now: number) => {
      const dt = Math.min(0.034, Math.max(0.001, (now - lastTime) / 1000));
      lastTime = now;

      const keys = heldKeysRef.current;
      const direction = Number(keys.has("ArrowDown") || keys.has("KeyS")) - Number(keys.has("ArrowUp") || keys.has("KeyW"));
      if (direction !== 0) targetYRef.current = Math.max(0.08, Math.min(0.92, targetYRef.current + direction * dt * 1.08));
      const controlSmoothing = 1 - Math.exp(-18 * dt);
      playerYRef.current += (targetYRef.current - playerYRef.current) * controlSmoothing;

      const effectCountBeforeCleanup = effectsRef.current.length;
      effectsRef.current = effectsRef.current.filter((effect) => now - effect.bornAt < 820);
      if (effectsRef.current.length !== effectCountBeforeCleanup) setEffects([...effectsRef.current]);

      distanceRef.current += dt * 34;
      const activeStage = stageForDistance(distanceRef.current);
      if (activeStage !== stageRef.current) {
        stageRef.current = activeStage;
        setStage(activeStage);
        setStageNotice(true);
        playTone(activeStage === 3 ? 920 : 760, 0.16, "square", 0.04);
        if (stageNoticeTimerRef.current !== null) window.clearTimeout(stageNoticeTimerRef.current);
        stageNoticeTimerRef.current = window.setTimeout(() => setStageNotice(false), 1700);
      }

      if (distanceRef.current >= MOON_DISTANCE) {
        const arrivalBonus = 5000 + livesRef.current * 750 + maxComboRef.current * 50;
        const finalScore = Math.floor(MOON_DISTANCE * 10) + mintScoreRef.current + arrivalBonus;
        distanceRef.current = MOON_DISTANCE;
        scoreRef.current = finalScore;
        entitiesRef.current = [];
        setMoonBonus(arrivalBonus);
        setDistance(MOON_DISTANCE);
        setScore(finalScore);
        setEntities([]);
        publishBest(finalScore);
        playTone(1040, 0.22, "sine", 0.045);
        window.setTimeout(() => playTone(1310, 0.2, "sine", 0.04), 170);
        window.setTimeout(() => playTone(1560, 0.34, "sine", 0.035), 340);
        setPhase("victory");
        return;
      }

      spawnTimerRef.current += dt;
      const spawnEvery = activeStage === 1 ? 0.76 : activeStage === 2 ? 0.46 : 0.32;
      const mintChance = activeStage === 1 ? 0.65 : activeStage === 2 ? 0.47 : 0.38;
      if (spawnTimerRef.current >= spawnEvery) {
        spawnTimerRef.current = 0;
        const kind: FlyerEntity["kind"] = Math.random() < mintChance ? "mint" : "hazard";
        const entityY = 0.12 + Math.random() * 0.76;
        const entitySize = kind === "mint" ? 0.055 : 0.075 + Math.random() * 0.025;
        entitiesRef.current.push({
          id: entityIdRef.current++,
          kind,
          x: 1.08,
          y: entityY,
          size: entitySize,
        });
        const formationChance = activeStage === 2 ? 0.3 : activeStage === 3 ? 0.52 : 0;
        if (kind === "hazard" && Math.random() < formationChance) {
          const partnerY = Math.max(0.12, Math.min(0.88, entityY + (entityY < 0.5 ? 0.3 : -0.3)));
          entitiesRef.current.push({
            id: entityIdRef.current++,
            kind: "hazard",
            x: 1.13,
            y: partnerY,
            size: Math.max(0.07, entitySize - 0.008),
          });
        }
      }

      const speed = activeStage === 1 ? 0.25 : activeStage === 2 ? 0.39 : 0.54;
      const nextEntities: FlyerEntity[] = [];
      let remainingLives = livesRef.current;

      for (const entity of entitiesRef.current) {
        const moved = { ...entity, x: entity.x - speed * dt };
        const horizontalHit = Math.abs(moved.x - 0.2) < moved.size * 0.72 + 0.035;
        const verticalHit = Math.abs(moved.y - playerYRef.current) < moved.size * 0.72 + 0.035;

        if (horizontalHit && verticalHit) {
          if (moved.kind === "mint") {
            collectedRef.current += 1;
            comboRef.current += 1;
            maxComboRef.current = Math.max(maxComboRef.current, comboRef.current);
            const multiplier = comboMultiplier(comboRef.current);
            const mintAward = 250 * multiplier;
            mintScoreRef.current += mintAward;
            setMintsCollected(collectedRef.current);
            setCombo(comboRef.current);
            setMaxCombo(maxComboRef.current);
            effectsRef.current.push({ id: effectIdRef.current++, kind: "collect", x: moved.x, y: moved.y, bornAt: now, label: `+${mintAward}${multiplier > 1 ? ` · ${multiplier}X` : ""}` });
            setEffects([...effectsRef.current]);
            playTone(620 + Math.min(comboRef.current, 10) * 36, 0.1, "square", 0.028);
            if (soundEnabledRef.current && "vibrate" in navigator) navigator.vibrate(12);
            continue;
          }
          if (now >= invulnerableUntilRef.current) {
            remainingLives -= 1;
            livesRef.current = remainingLives;
            comboRef.current = 0;
            totalHitsRef.current += 1;
            invulnerableUntilRef.current = now + 1250;
            setCombo(0);
            setTotalHits(totalHitsRef.current);
            effectsRef.current.push({ id: effectIdRef.current++, kind: "hit", x: moved.x, y: moved.y, bornAt: now, label: "−1 LIFE · COMBO LOST" });
            setEffects([...effectsRef.current]);
            playTone(120, 0.28, "sawtooth", 0.055);
            if (soundEnabledRef.current && "vibrate" in navigator) navigator.vibrate([55, 35, 90]);
            if (remainingLives <= 0) {
              const finalScore = Math.floor(distanceRef.current * 10) + mintScoreRef.current;
              scoreRef.current = finalScore;
              setScore(finalScore);
              setLives(0);
              publishBest(finalScore);
              setPhase("crashed");
              setEntities(nextEntities);
              return;
            }
          }
          continue;
        }

        if (moved.x > -0.12) nextEntities.push(moved);
      }

      entitiesRef.current = nextEntities;
      const nextScore = Math.floor(distanceRef.current * 10) + mintScoreRef.current;
      scoreRef.current = nextScore;
      setPlayerY(playerYRef.current);
      setEntities([...nextEntities]);
      setDistance(Math.floor(distanceRef.current));
      setScore(nextScore);
      setLives(remainingLives);
      animation = requestAnimationFrame(frame);
    };

    animation = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(animation);
  }, [phase, playTone, publishBest]);

  const moveWithPointer = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (phase !== "playing") return;
    const rect = event.currentTarget.getBoundingClientRect();
    targetYRef.current = Math.max(0.08, Math.min(0.92, (event.clientY - rect.top) / rect.height));
  };

  const hasCollectEffect = effects.some((effect) => effect.kind === "collect");
  const hasHitEffect = effects.some((effect) => effect.kind === "hit");
  const currentMultiplier = comboMultiplier(combo);
  const currentStage = FLIGHT_STAGES[stage - 1];
  const flightProgress = Math.min(100, (distance / MOON_DISTANCE) * 100);
  const runGrade = gradeForScore(score);
  const nextGradeTarget = GRADE_TARGETS.find((target) => score < target.score);
  const stageClass = stage === 1 ? styles.stageMint : stage === 2 ? styles.stageSurge : styles.stageMoon;
  const gradeClass = runGrade === "S" ? styles.gradeS : runGrade === "A" ? styles.gradeA : runGrade === "B" ? styles.gradeB : styles.gradeC;
  const distanceScore = Math.min(Math.floor(distance * 10), MOON_DISTANCE * 10);
  const mintPoints = Math.max(0, score - distanceScore - moonBonus);
  const replayCoach = totalHits > 0
    ? `Avoid ${totalHits === 1 ? "the block hit" : `all ${totalHits} block hits`} to keep your combo and preserve the full arrival bonus.`
    : maxCombo < 10
      ? "Chain 10 Mint Credits without a hit to unlock the 5X multiplier."
      : "Clean flight. Hold the 5X combo longer and collect more Mint Credits to raise your score.";
  const headerQuoteAmount = livePaymentQuote && !liveQuoteExpired
    ? livePaymentQuote.displayAmount
    : entryQuote && !quoteExpired
      ? entryQuote.indicativeMss2ForEntry
      : "";
  const headerQuoteStatus = selectedMss2Network === "unsupported"
    ? "SELECT NETWORK"
    : headerQuoteAmount
      ? `$1 = ${headerQuoteAmount} MSS2`
      : quoteUnavailable
        ? "RETRY QUOTE BELOW"
        : quoteExpired
          ? "REFRESHING QUOTE"
          : quoteBusy ? "FETCHING VERIFIED QUOTE" : "LOADING QUOTE";
  const headerQuoteMeta = headerQuoteAmount
    ? `${livePaymentQuote && !liveQuoteExpired ? "ENTRY QUOTE" : "DEMO QUOTE"} · ${livePaymentQuote && !liveQuoteExpired ? liveQuoteSecondsRemaining : quoteSecondsRemaining}s`
    : liveEntryEnabled ? "LIVE PAYMENT MODE" : "REAL PAYMENTS LOCKED";
  const leaderboardResult: LeaderboardFlightResult | null = (phase === "crashed" || phase === "victory") && runId ? {
    runId,
    score,
    distance,
    mintsCollected,
    maxCombo,
    hits: totalHits,
    lives,
    reachedMoon: phase === "victory",
    continued,
    paymentId: activePaymentId || undefined,
    runAuthorizationId: activeRunAuthorizationId || undefined,
    entryNetwork: activeRunNetwork,
  } : null;

  return (
    <main className={styles.arcadeShell}>
      <header className={styles.siteHeader}>
        <Link href="/" className={styles.homeLink} aria-label="Return to Yield Vacuum">
          <img src="/topaz-mark.png" alt="" />
          <span><small>RETURN TO</small><strong>YIELD VACUUM</strong></span>
        </Link>
        <div className={styles.arcadeIdentity}>
          <small>OPTIONAL GAME MODE · MSS2 ARCADE</small>
          <span className={styles.brandPlate}>
            <Image
              src="/mss2-logo-wide-colour-light.png"
              alt="MintStakeShare 2"
              width={1893}
              height={339}
              priority
            />
          </span>
        </div>
        <div className={styles.walletZone}>
          <WalletConnect theme="mss" onConnectionChange={handleWalletConnectionChange} />
          <div className={`${styles.paymentStatus} ${headerQuoteAmount ? styles.quoteReady : ""} ${liveEntryEnabled ? styles.paymentLive : ""}`} aria-label={`${selectedNetworkLabel} MSS2 one dollar quote`}>
            <i aria-hidden="true" />
            <span><small>{selectedNetworkLabel} MSS2</small><strong>{headerQuoteStatus}</strong><em>{headerQuoteMeta}</em></span>
          </div>
        </div>
      </header>

      <section className={styles.hero}>
        <div>
          <p>ARCADE TEST FLIGHT 01</p>
          <h1>MINT <span>FLYER</span></h1>
          <strong>Thread the mint stream. Collect clean credits. Avoid corrupted blocks.</strong>
        </div>
        <aside>
          <small>GAME STATUS</small>
          <b>{liveEntryEnabled ? "$1 MSS2 ENTRY" : "$1 MSS2 QUOTE DEMO"}</b>
          <span>{liveEntryEnabled ? "One verified Robinhood MSS2 transfer unlocks one scored run." : `${selectedNetworkLabel} calculates the MSS2 equivalent of $1.00. Real transfers remain disabled.`}</span>
        </aside>
      </section>

      <nav className={styles.arcadeNav} aria-label="Arcade sections">
        <a className={styles.activeNav} href="#mint-flyer"><small>PLAY NOW</small><strong>MINT FLYER</strong></a>
        <a href="#mint-flyer-leaderboard"><small>RANKS + BADGES</small><strong>LEADERBOARD</strong></a>
        <a href="#mss2-commitments"><small>OPTIONAL DEMO</small><strong>MSS2 COMMITMENTS</strong></a>
        <a href="#about-creator"><small>INDEPENDENT PROJECT</small><strong>ABOUT THE CREATOR</strong></a>
      </nav>

      <section id="mint-flyer" className={styles.gameCard} aria-label="Mint Flyer game">
        <div className={styles.hud}>
          <span className={hasCollectEffect ? styles.hudPulse : ""}><small>SCORE</small><strong>{score.toLocaleString()}</strong></span>
          <span><small>DISTANCE</small><strong>{distance}m</strong></span>
          <span className={styles.mintCounter}><small>MINT CREDITS</small><strong>{mintsCollected}</strong></span>
          <span className={combo >= 3 ? styles.comboActive : ""}><small>COMBO</small><strong>{combo} · {currentMultiplier}X</strong></span>
          <span><small>LIVES</small><strong>{"◆".repeat(lives)}<i>{"◇".repeat(MAX_LIVES - lives)}</i></strong></span>
          <span className={styles.demoBalance}><small>CONTINUE CREDITS</small><strong>{demoCredits}</strong></span>
        </div>

        <div className={styles.flightProgress} aria-label={`Stage ${stage} of 3: ${currentStage.name}. ${Math.round(flightProgress)} percent to the Moon.`}>
          <div className={styles.stageLabels}>
            {FLIGHT_STAGES.map((item) => <span key={item.id} className={stage === item.id ? styles.currentStage : stage > item.id ? styles.clearedStage : ""}><b>{item.id}</b>{item.name}</span>)}
          </div>
          <div className={styles.progressTrack}><i style={{ width: `${flightProgress}%` }} /><b style={{ left: `${flightProgress}%` }}>◆</b></div>
          <small>{Math.max(0, MOON_DISTANCE - distance).toLocaleString()}m TO THE MOON</small>
        </div>

        <div
          className={`${styles.playfield} ${stageClass} ${hasHitEffect ? styles.impactShake : ""} ${hasCollectEffect ? styles.collectGlow : ""}`}
          data-stream-label={`MINT STREAM // ${selectedNetworkLabel} $1 QUOTE DEMO // MSS2 ARCADE`}
          onPointerDown={(event) => {
            if (phase !== "playing") return;
            event.currentTarget.setPointerCapture(event.pointerId);
            moveWithPointer(event);
          }}
          onPointerMove={(event) => {
            if (["mouse", "pen", "touch"].includes(event.pointerType) || event.buttons) moveWithPointer(event);
          }}
        >
          <div className={styles.stageScenery} aria-hidden="true"><i /><i /><i /><i /><i /><span /></div>
          {stageNotice && phase === "playing" && (
            <div className={styles.stageTransition} role="status">
              <small>STAGE {stage} OF 3</small>
              <strong>{currentStage.name}</strong>
              <span>{currentStage.instruction}</span>
            </div>
          )}
          {phase === "playing" && (
            <div className={styles.playGuide} aria-label="Mint Flyer objective and controls">
              <span><i className={styles.guideMintIcon}><Image className={styles.mintGuideLogo} src="/mss2-flyer-emblem.png" alt="" width={64} height={64} /></i><b>COLLECT MSS2 MINT CREDITS</b><small>+250 POINTS EACH</small></span>
              <span><i className={styles.guideHazardIcon}>!</i><b>AVOID PINK BLOCKS</b><small>LOSE 1 OF 3 LIVES</small></span>
              <span className={styles.desktopControlGuide}><i className={styles.guideMoveIcon}>↕</i><b>STEER WITH YOUR MOUSE</b><small>NO CLICK NEEDED · W/S OR ARROWS ALSO WORK</small></span>
              <span className={styles.mobileControlGuide}><i className={styles.guideMoveIcon}>↕</i><b>PRESS + SLIDE TO STEER</b><small>DRAG YOUR FINGER UP + DOWN ANYWHERE</small></span>
            </div>
          )}
          {(phase === "playing" || phase === "countdown") && (
            <div className={styles.flightTools}>
              <button type="button" onPointerDown={(event) => event.stopPropagation()} onClick={toggleSound} aria-pressed={soundEnabled}>{soundEnabled ? "FX ON" : "FX OFF"}</button>
              <button type="button" onPointerDown={(event) => event.stopPropagation()} onClick={pauseFlight}>Ⅱ PAUSE</button>
            </div>
          )}
          <div className={styles.speedLines} aria-hidden="true"><i /><i /><i /><i /><i /><i /></div>
          <div className={`${styles.flyer} ${phase === "playing" ? styles.flying : ""} ${hasCollectEffect ? styles.flyerBoost : ""} ${hasHitEffect ? styles.flyerDamaged : ""}`} style={{ top: `${playerY * 100}%` }} aria-label="Mint Flyer">
            <Image className={styles.flyerLogo} src="/mss2-flyer-emblem.png" alt="" width={256} height={256} priority /><i /><b />
          </div>

          {entities.map((entity) => (
            <div
              key={entity.id}
              className={entity.kind === "mint" ? styles.mint : styles.hazard}
              style={{ left: `${entity.x * 100}%`, top: `${entity.y * 100}%`, width: `${entity.size * 100}%` }}
              aria-hidden="true"
            >
              {entity.kind === "mint" ? <><Image className={styles.mintLogo} src="/mss2-flyer-emblem.png" alt="" width={64} height={64} /><i /></> : <><span>!</span><i /><b /></>}
            </div>
          ))}

          {effects.map((effect) => (
            <div
              key={effect.id}
              className={`${styles.flightEffect} ${effect.kind === "collect" ? styles.collectEffect : styles.hitEffect}`}
              style={{ left: `${effect.x * 100}%`, top: `${effect.y * 100}%` }}
              aria-hidden="true"
            >
              <strong>{effect.label ?? (effect.kind === "collect" ? "+250" : "−1 LIFE")}</strong>
              <i /><i /><i /><i /><i /><i />
            </div>
          ))}

          {phase === "countdown" && (
            <div className={styles.countdownOverlay} aria-live="assertive">
              <small>GET READY</small>
              <strong key={countdown}>{countdown > 0 ? countdown : "FLY!"}</strong>
              <span className={styles.desktopControlText}>MOVE YOUR MOUSE TO STEER</span>
              <span className={styles.mobileControlText}>PRESS + SLIDE TO STEER</span>
            </div>
          )}

          {phase === "paused" && (
            <div className={`${styles.overlay} ${styles.pauseOverlay}`}>
              <small>FLIGHT PROTECTED</small>
              <h2>PAUSED</h2>
              <p>Your score, combo, lives, and position are safe. Resume when you are ready.</p>
              <button type="button" onClick={resumeFlight}>RESUME WITH COUNTDOWN</button>
            </div>
          )}

          {phase === "ready" && (
            <div className={`${styles.overlay} ${reviewingEntry ? styles.entryReviewOverlay : styles.briefingOverlay}`}>
              {!reviewingEntry ? <>
                <small>HOW TO PLAY · {canaryEntryEnabled ? `${selectedNetworkLabel} PAYMENT CANARY` : liveEntryEnabled ? `PAID ${selectedNetworkLabel} FLIGHT` : `${selectedNetworkLabel} $1 QUOTE DEMO`}</small>
                <h2>FLY. COLLECT. SURVIVE.</h2>
                <p className={styles.briefingLead}>Pilot the <b>MSS2 flyer</b> through all three stages, build the biggest combo, and reach the Moon with the highest score you can.</p>
                <div className={styles.whyPlay} aria-label="Why play Mint Flyer">
                  <span><i aria-hidden="true">🌕</i><b>REACH THE MOON</b><small>Survive 3,000 meters</small></span>
                  <span><i aria-hidden="true">🏆</i><b>CLIMB THE BOARD</b><small>Beat the top score</small></span>
                  <span><i aria-hidden="true">★</i><b>UNLOCK BADGES</b><small>Master clean runs and combos</small></span>
                </div>
                <div className={styles.howToGrid} aria-label="How to play Mint Flyer">
                  <article>
                    <i className={styles.howToMove}>↕</i>
                    <span><b>MOVE</b><small><span className={styles.desktopControlText}>Move your mouse up and down. No click needed.</span><span className={styles.mobileControlText}>Press and slide your finger up or down.</span></small></span>
                  </article>
                  <article>
                    <i className={styles.howToMint}><Image className={styles.howToMintLogo} src="/mss2-flyer-emblem.png" alt="" width={96} height={96} /></i>
                    <span><b>COLLECT MSS2 CREDITS</b><small>The glowing logo coins add <strong>+250 points</strong> and build your combo.</small></span>
                  </article>
                  <article>
                    <i className={styles.howToHazard}>!</i>
                    <span><b>AVOID PINK</b><small>A corrupted block removes one of your three lives.</small></span>
                  </article>
                </div>
                <div className={styles.routePreview} aria-label="Three flight stages"><span>1 <b>MINT STREAM</b></span><i>→</i><span>2 <b>BLOCK SURGE</b></span><i>→</i><span>3 <b>MOON RUN</b></span></div>
                <p className={styles.demoGameNote}>{liveEntryEnabled
                  ? <><b>{canaryEntryEnabled ? "RESTRICTED CANARY:" : "LIVE ENTRY:"}</b> The verified entry router sends 20% to the dead address and 80% to the Community Airdrop Reserve in one transaction.</>
                  : paymentReadiness?.routerAddress && paymentReadiness.releaseMode === "disabled"
                    ? <><b>ROUTERS VERIFIED:</b> This remains a free preview while a separate non-reserve tester wallet is selected for the controlled payment canary.</>
                  : isArcContext
                    ? <><b>ARC PRICE PREVIEW:</b> See the current MSS2 equivalent of $1.00 from the Arc MSS2/USDC market, then play free. No approval, signature, or payment is requested.</>
                    : <><b>FREE PREVIEW:</b> Play without sending funds. The proposed entry split sends 20% to the dead address and 80% to the designated Community Airdrop Reserve—a 4:1 community allocation. Real transfers remain disabled.</>}</p>
                {paymentMessage && <p className={styles.paymentMessage} role="status">{paymentMessage}</p>}
                <button onClick={() => void reviewEntry()} disabled={paymentBusy || quoteBusy || selectedMss2Network === "unsupported" || (liveEntryEnabled && (!walletConnection || !playerKey))}>{paymentBusy ? "PREPARING…" : selectedMss2Network === "unsupported" ? "SELECT ROBINHOOD OR ARC ABOVE" : liveEntryEnabled ? walletConnection ? canaryEntryEnabled ? "REVIEW CANARY ENTRY" : "REVIEW MSS2 ENTRY" : "CONNECT WALLET ABOVE" : quoteBusy ? "FETCHING VERIFIED MARKET…" : !entryQuote ? quoteUnavailable ? "RETRY $1 QUOTE" : "LOAD $1 QUOTE" : quoteExpired ? "REFRESH $1 QUOTE" : `REVIEW ${selectedNetworkLabel} $1 QUOTE`}</button>
                {selectedMss2Network !== "unsupported" && <div className={styles.buyMss2Prompt}><a className={styles.buyMss2Link} href={MSS2_BUY_URLS[isArcContext ? "arc" : "robinhood"]} target="_blank" rel="noopener noreferrer">BUY MSS2 ↗</a><small>Buy MSS2 on {selectedNetworkLabel} for this flight.</small></div>}
              </> : <>
                <small>{liveEntryEnabled ? `${canaryEntryEnabled ? "RESTRICTED CANARY" : "LIVE MSS2 ENTRY"} · ${selectedNetworkLabel}` : `${selectedNetworkLabel} $1 QUOTE · NO TRANSACTION`}</small>
                <h2>{liveEntryEnabled ? canaryEntryEnabled ? "REVIEW CANARY + PAY" : "REVIEW + PAY" : "REVIEW THE RUN"}</h2>
                <p>{liveEntryEnabled ? "The quote itself never moves tokens. Use the payment control below to open your wallet: confirmation 1 approves only the exact MSS2 amount, and confirmation 2 submits the 20/80 entry transaction." : `The current ${selectedNetworkLabel} price calculates how much MSS2 equals $1.00. This preview does not request approval, a signature, a network switch, or a transfer.`}</p>
                <div className={styles.reviewReminder}>
                  <span><i className={styles.guideMintIcon}><Image className={styles.mintGuideLogo} src="/mss2-flyer-emblem.png" alt="" width={64} height={64} /></i><b>MSS2 LOGO = COLLECT</b><small>+250 POINTS</small></span>
                  <span><i className={styles.guideHazardIcon}>!</i><b>PINK = AVOID</b><small>-1 LIFE</small></span>
                  <span><i className={styles.guideMoveIcon}>↕</i><b><span className={styles.desktopControlText}>MOUSE OR KEYS</span><span className={styles.mobileControlText}>PRESS + SLIDE</span></b><small>MOVE UP + DOWN</small></span>
                </div>
                <div className={styles.entryReview} aria-label="MSS2 entry review">
                  <span><small>RUN PRICE</small><strong>${liveEntryEnabled ? livePaymentQuote?.entryPriceUsd : entryQuote?.entryPriceUsd ?? ENTRY_PRICE_USD.toFixed(2)} USD</strong></span>
                  <span><small>{liveEntryEnabled ? "EXACT TRANSFER" : "INDICATIVE AMOUNT"}</small><strong>{liveEntryEnabled ? livePaymentQuote ? `${livePaymentQuote.displayAmount} MSS2` : "UNAVAILABLE" : entryQuote ? `${entryQuote.indicativeMss2ForEntry} MSS2` : "UNAVAILABLE"}</strong></span>
                  <span><small>PRICE REFERENCE</small><strong>{isArcContext ? "ARC · TOPAZ MSS2/USDC" : "ROBINHOOD · TOPAZ MSS2/WETH"}</strong></span>
                  <span><small>QUOTE EXPIRES</small><strong className={(liveEntryEnabled ? liveQuoteExpired : quoteExpired) ? styles.expiredText : ""}>{liveEntryEnabled ? liveQuoteExpired ? "EXPIRED" : `${liveQuoteSecondsRemaining}s` : quoteExpired ? "EXPIRED" : `${quoteSecondsRemaining}s`}</strong></span>
                  <span className={styles.reviewWide}><small>20% · DEAD ADDRESS</small><code>{DEAD_ADDRESS}</code></span>
                  <span className={styles.reviewWide}><small>80% · COMMUNITY AIRDROP RESERVE</small><code>{COMMUNITY_AIRDROP_WALLET}</code></span>
                  <span className={styles.reviewWide}><small>{liveEntryEnabled ? "SERVER PAYMENT ID" : "DEMO QUOTE REFERENCE"}</small><code>{liveEntryEnabled ? livePaymentQuote?.paymentId : entryQuote?.quoteId ?? "UNAVAILABLE"}</code></span>
                </div>
                <p className={styles.entryWarning}><b>{liveEntryEnabled ? "FINAL TRANSFER" : "NO FUNDS MOVE"}</b><span>{liveEntryEnabled ? "After wallet approval, the router sends 20% of the MSS2 entry to the dead address and 80% to the Community Airdrop Reserve. Transfers are intended to be final and do not guarantee an airdrop, income, token value, or uninterrupted service." : `This ${selectedNetworkLabel} quote is simulated for review. Real entry payments stay disabled until that chain's 20/80 router and backend verifier are complete.`}</span></p>
                {liveEntryEnabled && currentBalanceCheck && !currentBalanceCheck.sufficient && !paymentTxHash && <div className={styles.insufficientMss2} role="alert">
                  <strong>NOT ENOUGH MSS2 TO PLAY ON {currentBalanceCheck.network.toUpperCase()}</strong>
                  <div><span><small>ENTRY COST</small><b>≈ {currentBalanceCheck.requiredDisplay} MSS2</b></span><span><small>YOUR BALANCE</small><b>≈ {currentBalanceCheck.balanceDisplay} MSS2</b></span></div>
                  <p>Add at least <b>{currentBalanceCheck.shortfallDisplay} MSS2</b> to this wallet on <b>{currentBalanceCheck.network}</b>, then refresh your balance.</p>
                  <div className={styles.buyMss2Prompt}><a className={styles.buyMss2Link} href={MSS2_BUY_URLS[currentBalanceCheck.network === "arc" ? "arc" : "robinhood"]} target="_blank" rel="noopener noreferrer">BUY MSS2 ↗</a><small>Use the same wallet on {currentBalanceCheck.network === "arc" ? "Arc" : "Robinhood Chain"}, then return here to refresh your balance.</small></div>
                </div>}
                {paymentMessage && <p className={styles.paymentMessage} role="status">{paymentMessage}</p>}
                {paymentTxHash && <a className={styles.paymentTxLink} href={`${livePaymentQuote?.explorerUrl}/tx/${paymentTxHash}`} target="_blank" rel="noreferrer">VIEW SUBMITTED TRANSACTION ↗</a>}
                <div className={styles.entryActions} aria-label={liveEntryEnabled ? "MSS2 payment controls" : "Demo flight controls"}>
                  <button className={styles.secondaryEntryButton} onClick={() => setReviewingEntry(false)} disabled={paymentBusy}>← BACK</button>
                  {liveEntryEnabled
                    ? <button onClick={() => void (!paymentTxHash && !currentBalanceCheck?.sufficient ? refreshLiveBalance() : confirmLivePayment())} disabled={paymentBusy || (liveQuoteExpired && !paymentTxHash) || !livePaymentQuote}>{paymentBusy ? "PROCESSING…" : paymentTxHash ? "RECHECK PAYMENT + START" : liveQuoteExpired ? "QUOTE EXPIRED · GO BACK" : !currentBalanceCheck ? "CHECK MSS2 BALANCE" : !currentBalanceCheck.sufficient ? "REFRESH MSS2 BALANCE" : "OPEN WALLET · APPROVE + PAY MSS2"}</button>
                    : <button onClick={() => void confirmDemoEntry()} disabled={paymentBusy || quoteExpired || !entryQuote || !playerKey}>{paymentBusy ? "PREPARING FREE FLIGHT…" : quoteExpired ? "QUOTE EXPIRED" : `CONFIRM ${selectedNetworkLabel} DEMO + START`}</button>}
                </div>
              </>}
            </div>
          )}

          {phase === "crashed" && (
            <div className={`${styles.overlay} ${styles.crashOverlay}`}>
              <small>FLIGHT ENDED</small>
              <h2>{newBest ? "NEW LOCAL BEST" : "MINT STREAM CLOSED"}</h2>
              <div className={styles.scoreCeremony}>
                <small>FINAL SCORE</small>
                <strong>{score.toLocaleString()}</strong>
                {newBest && <b>★ PERSONAL BEST ★</b>}
              </div>
              <div ref={setFinishPanel} className={styles.finishPanel} />
              <div className={styles.finalScore}>
                <span><small>LOCAL BEST</small><strong>{bestScore.toLocaleString()}</strong></span>
                <span><small>MINT CREDITS</small><strong>{mintsCollected}</strong></span>
                <span><small>DISTANCE</small><strong>{distance}m</strong></span>
                <span><small>BEST COMBO</small><strong>{maxCombo} · {comboMultiplier(maxCombo)}X</strong></span>
                <span><small>BLOCK HITS</small><strong>{totalHits}</strong></span>
              </div>
              <a className={styles.leaderboardJump} href="#mint-flyer-leaderboard">VIEW LEADERBOARD ↓</a>
              <div className={`${styles.crashActions} ${continued || demoCredits < DEMO_CONTINUE_COST ? styles.singleCrashAction : ""}`}>
                {!continued && demoCredits >= DEMO_CONTINUE_COST && (
                  <button className={styles.continueButton} onClick={continueFlight}>
                    CONTINUE FREE · NO MSS2
                    <small>USES {DEMO_CONTINUE_COST} DEMO CREDITS · RESTORES 3 LIVES</small>
                  </button>
                )}
                <button className={styles.restartButton} onClick={prepareAnotherRun}>
                  ↻ {liveEntryEnabled ? "START A NEW $1 MSS2 FLIGHT" : "REVIEW A NEW $1 MSS2 FLIGHT"}
                  <small>{selectedNetworkLabel} · FRESH QUOTE · {liveEntryEnabled ? "WALLET APPROVAL REQUIRED" : "PREVIEW ONLY · NO FUNDS MOVE"}</small>
                </button>
              </div>
              {continued && <p className={styles.usedNotice}>The one continue for this flight has been used. A new scored run requires a new entry review.</p>}
              <section className={styles.runEntrySummary} aria-label="Future MSS2 entry allocation">
                <header>
                  <span><small>FUTURE $1 MSS2 GAME ENTRY</small><strong>{selectedNetworkLabel}</strong></span>
                  <b>{liveEntryEnabled ? "LIVE ENTRY" : "PREVIEW ONLY · PAYMENT LOCKED"}</b>
                </header>
                <div className={styles.allocationBar} aria-label="20 percent dead address and 80 percent Community Airdrop Reserve">
                  <span className={styles.deadAllocation}><b>20%</b><small>DEAD ADDRESS</small></span>
                  <span className={styles.communityAllocation}><b>80%</b><small>COMMUNITY AIRDROP RESERVE</small></span>
                </div>
                <p><b>0% RETAINED BY YIELD VACUUM</b><span>{liveEntryEnabled ? "The verified router performs both transfers in one wallet-approved transaction." : "This is the proposed allocation. The demo does not request approval, a signature, or a transfer."}</span></p>
              </section>
            </div>
          )}

          {phase === "victory" && (
            <div className={`${styles.overlay} ${styles.victoryOverlay}`}>
              <div className={styles.moonArrival} aria-hidden="true"><i /><span>✓</span></div>
              <small>ALL THREE STAGES CLEARED</small>
              <h2>MOON REACHED</h2>
              <p>You crossed the Mint Stream, survived the Block Surge, and completed the Moon Run.</p>
              <div className={styles.victoryScore}>
                <span><small>FINAL SCORE</small><strong>{score.toLocaleString()}</strong>{newBest && <b>NEW LOCAL BEST</b>}</span>
                <span className={`${styles.gradeBadge} ${gradeClass}`}><small>FLIGHT GRADE</small><strong>{runGrade}</strong></span>
              </div>
              <div ref={setFinishPanel} className={styles.finishPanel} />
              <div className={styles.arrivalBonus}><small>MOON ARRIVAL BONUS</small><strong>+{moonBonus.toLocaleString()}</strong><span>Completion + surviving lives + best combo</span></div>
              <div className={styles.scoreBreakdown} aria-label="Final score breakdown">
                <span><small>FLIGHT DISTANCE</small><strong>+{distanceScore.toLocaleString()}</strong></span>
                <i>+</i>
                <span><small>MINT + COMBO POINTS</small><strong>+{mintPoints.toLocaleString()}</strong></span>
                <i>+</i>
                <span><small>MOON BONUS</small><strong>+{moonBonus.toLocaleString()}</strong></span>
                <i>=</i>
                <span className={styles.scoreTotal}><small>FINAL SCORE</small><strong>{score.toLocaleString()}</strong></span>
              </div>
              <div className={styles.gradeLadder} aria-label={`Flight grade ${runGrade}`}>
                {GRADE_LADDER.map((target) => (
                  <span key={target.grade} className={runGrade === target.grade ? styles.activeGrade : score >= target.score ? styles.passedGrade : ""}>
                    <b>{target.grade}</b>
                    <small>{target.grade === "C" ? "COMPLETE" : `${target.score / 1000}K`}</small>
                  </span>
                ))}
              </div>
              <div className={styles.finalScore}>
                <span><small>LOCAL BEST</small><strong>{bestScore.toLocaleString()}</strong></span>
                <span><small>MINT CREDITS</small><strong>{mintsCollected}</strong></span>
                <span><small>DISTANCE</small><strong>{distance}m</strong></span>
                <span><small>BEST COMBO</small><strong>{maxCombo} · {comboMultiplier(maxCombo)}X</strong></span>
                <span><small>BLOCK HITS</small><strong>{totalHits}</strong></span>
              </div>
              <p className={styles.replayTarget}>{nextGradeTarget ? <><b>{(nextGradeTarget.score - score).toLocaleString()} MORE POINTS FOR GRADE {nextGradeTarget.grade}</b><span>{replayCoach}</span></> : <><b>GRADE S ACHIEVED</b><span>{replayCoach} Replay to beat your local best of {bestScore.toLocaleString()}.</span></>}</p>
              <a className={styles.leaderboardJump} href="#mint-flyer-leaderboard">VIEW LEADERBOARD ↓</a>
              <button className={styles.moonReplayButton} onClick={prepareAnotherRun}>↻ FLY TO THE MOON AGAIN</button>
            </div>
          )}
        </div>

        <footer className={styles.gameFooter}>
          <span><b>CONTROL</b> <span className={styles.desktopControlText}>MOUSE, W/S OR ↑/↓</span><span className={styles.mobileControlText}>PRESS + SLIDE</span> TO MOVE</span>
          <span><b>COLLECT</b> CYAN MINT CREDITS · +250 POINTS</span>
          <span><b>AVOID</b> PINK BLOCKS · -1 LIFE</span>
        </footer>
      </section>

      <MintFlyerLeaderboard result={leaderboardResult} finishPanel={finishPanel} walletConnection={walletConnection} />

      <details className={styles.infoDrawer} id="payment-safety">
        <summary><span><small>PAYMENT SAFETY · {selectedNetworkLabel}</small><strong>{liveEntryEnabled ? "ROBINHOOD MSS2 ENTRY IS LIVE" : "$1 QUOTE DEMO · REAL MSS2 LOCKED"}</strong></span><b>VIEW DETAILS +</b></summary>
        <div className={styles.drawerBody}>
          <p>Continue credits are game-only. They have no cash value and cannot be purchased, transferred, withdrawn, or redeemed.</p>
          {isArcContext
            ? <p>The proposed Arc entry target is $1.00 in MSS2 using a short-lived Topaz API observation from the independent Arc MSS2/USDC market. The preview requests no approval, signature, or transfer.</p>
            : <p>The proposed entry target is $1.00 in MSS2 using a short-lived Robinhood/Topaz market quote. A future verified router would send <b>20%</b> to <code>{DEAD_ADDRESS}</code> and <b>80%</b> to the Community Airdrop Reserve at <code>{COMMUNITY_AIRDROP_WALLET}</code>.</p>}
          <p>The reserve is designated for a possible future community airdrop. No distribution, eligibility rule, timing, income, token appreciation, or preferential leaderboard treatment is promised. Real payments remain locked until the router and backend verifier are reviewed and tested.</p>
        </div>
      </details>

      <details className={styles.commitmentsDrawer} id="mss2-commitments">
        <summary><span><small>OPTIONAL MEMBERSHIP DEMO</small><strong>MSS2 COMMITMENTS</strong><em>Preview the proposed permanent-contribution flow. No real tokens move.</em></span><b>OPEN DEMO +</b></summary>
        <Mss2Commitments />
      </details>

      <details className={styles.creatorPanel} id="about-creator">
        <summary>
          <div className={styles.creatorPortrait}>
            <Image
              src="/crypto-arborist-mss2.webp"
              alt="The Crypto Arborist tree hero wearing a MintStakeShare 2 championship belt"
              width={640}
              height={960}
            />
          </div>
          <span><small>INDEPENDENT COMMUNITY ARCADE</small><strong>BUILT BY THE CRYPTO ARBORIST</strong><em>Meet the creator and view the project disclosure.</em></span>
          <b>ABOUT +</b>
        </summary>
        <div className={styles.creatorCopy}>
          <p>Yield Vacuum and Mint Flyer were independently created by The Crypto Arborist as educational and arcade experiences for the broader crypto community.</p>
          <p className={styles.creatorDisclosure}>This is not an official product of Topaz DEX, MintStakeShare, Robinhood Chain, Arc, or their affiliates. No endorsement, partnership, or sponsorship is implied.</p>
          <a href="https://x.com/thickquidity" target="_blank" rel="noreferrer">FOLLOW THE CRYPTO ARBORIST ON X ↗</a>
        </div>
      </details>
    </main>
  );
}
