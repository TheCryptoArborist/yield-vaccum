"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import WalletConnect, { type WalletConnection } from "../wallet-connect";
import Mss2Commitments from "./mss2-commitments";
import MintFlyerLeaderboard, { type LeaderboardFlightResult } from "./mint-flyer-leaderboard";
import Mss2EntryTotals from "./mss2-entry-totals";
import { ensureMintFlyerPlayerKey } from "../../lib/arcade-player";
import { MSS2_COMMUNITY_AIRDROP_RESERVE, MSS2_DEAD_ADDRESS } from "../../lib/mss2-payment-shared";
import type { Mss2EntryBalance } from "../../lib/mss2-entry-balance";
import { mintFlyerEntryAction } from "../../lib/mint-flyer-entry";
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
const BEST_SCORE_KEY = "yield-vacuum-mss2-mint-flyer-best";
const COMMUNITY_AIRDROP_WALLET = MSS2_COMMUNITY_AIRDROP_RESERVE;
const DEAD_ADDRESS = MSS2_DEAD_ADDRESS;
const MSS2_BUY_URLS = {
  robinhood: "https://www.mintstakeshare.com/robinhood?ref=0xF2Ab1eEBbEcb4E315FE95D8b532D1aB00F1A8789",
  arc: "https://www.mintstakeshare.com/arc?ref=0xF2Ab1eEBbEcb4E315FE95D8b532D1aB00F1A8789",
};
const ROBINHOOD_CHAIN_HEX = "0x1237";
const ARC_CHAIN_HEX = "0x13b2";
const SOUND_PREFERENCE_KEY = "yield-vacuum-mss2-mint-flyer-sound";
const MOON_DISTANCE = 3000;
const FLIGHT_STAGES: Array<{ id: FlightStage; name: string; start: number; instruction: string }> = [
  { id: 1, name: "MINT STREAM", start: 0, instruction: "Collect MSS2 coins and build your combo." },
  { id: 2, name: "BLOCK SURGE", start: 650, instruction: "Faster Glitch Blocks now arrive in formations." },
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
const GRADE_NAMES = { C: "Completed Flight", B: "Strong Flight", A: "Excellent Flight", S: "Elite Flight" } as const;

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
  const pageTopRef = useRef<HTMLElement>(null);
  const [showBackToTop, setShowBackToTop] = useState(false);

  useEffect(() => {
    const updateVisibility = () => setShowBackToTop(window.scrollY > 320);
    updateVisibility();
    window.addEventListener("scroll", updateVisibility, { passive: true });
    return () => window.removeEventListener("scroll", updateVisibility);
  }, []);

  const [finishPanel, setFinishPanel] = useState<HTMLDivElement | null>(null);
  const [phase, setPhase] = useState<FlightPhase>("ready");
  const [playerY, setPlayerY] = useState(0.5);
  const [entities, setEntities] = useState<FlyerEntity[]>([]);
  const [score, setScore] = useState(0);
  const [distance, setDistance] = useState(0);
  const [mintsCollected, setMintsCollected] = useState(0);
  const [lives, setLives] = useState(MAX_LIVES);
  const [bestScore, setBestScore] = useState(0);
  const [newBest, setNewBest] = useState(false);
  const [entryQuote, setEntryQuote] = useState<EntryQuote | null>(null);
  const [quoteUnavailable, setQuoteUnavailable] = useState(false);
  const [quoteBusy, setQuoteBusy] = useState(false);
  const [quoteClock, setQuoteClock] = useState(0);
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
  const [readinessFailed, setReadinessFailed] = useState(false);
  const [readinessRetry, setReadinessRetry] = useState(0);
  const [livePaymentQuote, setLivePaymentQuote] = useState<LivePaymentQuote | null>(null);
  const [activePaymentId, setActivePaymentId] = useState("");
  const [activeRunNetwork, setActiveRunNetwork] = useState<"robinhood" | "arc">("robinhood");
  const [paymentTxHash, setPaymentTxHash] = useState("");
  const [paymentBusy, setPaymentBusy] = useState(false);
  const [paymentMessage, setPaymentMessage] = useState("");
  const [entryBalance, setEntryBalance] = useState<{ paymentId: string; check: Mss2EntryBalance } | null>(null);
  const walletContextRef = useRef<WalletConnection | null>(null);
  const liveQuoteRequestRef = useRef<AbortController | null>(null);
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
    liveQuoteRequestRef.current?.abort();
    liveQuoteRequestRef.current = null;
    setPaymentBusy(false);
    setPaymentReadiness(null);
    setReadinessFailed(false);
    setWalletConnection(connection);
    setEntryQuote(null);
    setQuoteUnavailable(false);
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
    fetch(`/api/arcade-payment?chain=${selectedMss2Network}${walletQuery}`, { cache: "no-store", signal: AbortSignal.timeout(15_000) })
      .then(async (response) => {
        if (!response.ok) throw new Error("Payment readiness unavailable.");
        return await response.json() as PaymentReadiness;
      })
      .then((status) => { if (!cancelled) { setPaymentReadiness(status); setReadinessFailed(false); } })
      .catch(() => { if (!cancelled) { setPaymentReadiness(null); setReadinessFailed(true); } });
    return () => { cancelled = true; };
  }, [readinessRetry, selectedMss2Network, walletConnection?.account]);

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
      return quote;
    } catch {
      if (quoteRequestRef.current !== controller) return null;
      setEntryQuote(null);
      setQuoteUnavailable(true);
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
    if (selectedMss2Network === "unsupported") return;
    const initial = window.setTimeout(loadEntryQuote, 0);
    const refresh = window.setInterval(loadEntryQuote, 30_000);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(refresh);
      quoteRequestRef.current?.abort();
    };
  }, [loadEntryQuote, selectedMss2Network]);

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

  const resetFlight = useCallback((verifiedRunId: string) => {
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
    setNewBest(false);
    setRunId(verifiedRunId);
    setCountdown(3);
    setPhase("countdown");
  }, []);

  const loadLiveEntryQuote = useCallback(async () => {
    if (!liveEntryEnabled || !paymentReadiness || !walletConnection || !playerKey || paymentTxHash || selectedMss2Network === "unsupported") return;
    liveQuoteRequestRef.current?.abort();
    const controller = new AbortController();
    liveQuoteRequestRef.current = controller;
    setPaymentBusy(true);
    setPaymentMessage("");
    setLivePaymentQuote(null);
    setEntryBalance(null);
    try {
      const response = await fetch("/api/arcade-payment", {
        method: "POST", headers: { "Content-Type": "application/json" },
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15_000)]),
        body: JSON.stringify({ action: "quote", playerKey, runId: crypto.randomUUID(), walletAddress: walletConnection.account, network: selectedMss2Network }),
      });
      const data = await response.json() as LivePaymentQuote & { error?: string };
      if (!response.ok) throw new Error(data.error || "The MSS2 entry quote is unavailable. Please retry.");
      if (liveQuoteRequestRef.current !== controller || controller.signal.aborted) return;
      if (data.network !== selectedMss2Network || data.walletAddress.toLowerCase() !== walletContextRef.current?.account.toLowerCase()
        || walletContextRef.current?.chainId.toLowerCase() !== `0x${data.chainId.toString(16)}`) {
        throw new Error("Your wallet or network changed. Request a fresh entry quote.");
      }
      setLivePaymentQuote(data);
      setEntryBalance(data.balanceCheck ? { paymentId: data.paymentId, check: data.balanceCheck } : null);
      setQuoteClock(Date.now());
    } catch (error) {
      if (liveQuoteRequestRef.current !== controller || controller.signal.aborted) return;
      setPaymentMessage(error instanceof Error ? error.message : "The MSS2 entry quote is unavailable. Please retry.");
    } finally {
      if (liveQuoteRequestRef.current === controller) {
        liveQuoteRequestRef.current = null;
        setPaymentBusy(false);
      }
    }
  }, [liveEntryEnabled, paymentReadiness, paymentTxHash, playerKey, selectedMss2Network, walletConnection]);

  useEffect(() => {
    if (phase !== "ready" || !liveEntryEnabled || paymentTxHash) return;
    // Quote and balance preparation is read-only. Only Pay & Fly opens the wallet.
    const initial = window.setTimeout(() => void loadLiveEntryQuote(), 0);
    return () => {
      window.clearTimeout(initial);
      liveQuoteRequestRef.current?.abort();
    };
  }, [liveEntryEnabled, loadLiveEntryQuote, paymentTxHash, phase]);

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
      setPaymentMessage(balance.sufficient ? "Your MSS2 balance covers this entry. Choose Pay & Fly to open your wallet." : "");
    } catch (error) {
      setEntryBalance(null);
      setPaymentMessage(error instanceof Error ? error.message : "Your MSS2 balance could not be checked. Please retry.");
    } finally { setPaymentBusy(false); }
  }, [paymentBusy, readLiveEntryBalance]);

  const confirmLivePayment = useCallback(async () => {
    if (!liveEntryEnabled || !paymentReadiness || !walletConnection || !livePaymentQuote || paymentBusy) return;
    if (!paymentTxHash && Date.now() >= Date.parse(livePaymentQuote.expiresAt)) {
      setPaymentMessage("This live quote expired. Refresh the entry quote to continue.");
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
        if (Date.now() >= Date.parse(livePaymentQuote.expiresAt)) throw new Error("This entry quote expired during the balance check. Refresh the entry quote to continue.");
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

  const entryAction = mintFlyerEntryAction({
    supportedNetwork: selectedMss2Network !== "unsupported",
    readinessKnown: Boolean(paymentReadiness), readinessFailed, playerReady: Boolean(playerKey),
    live: liveEntryEnabled, walletConnected: Boolean(walletConnection),
    hasQuote: Boolean(livePaymentQuote), quoteExpired: liveQuoteExpired,
    balanceSufficient: currentBalanceCheck?.sufficient, paymentSubmitted: Boolean(paymentTxHash),
  });
  const launchFlight = useCallback(() => {
    if (paymentBusy) return;
    if (entryAction === "retry-readiness") { setReadinessFailed(false); setReadinessRetry((value) => value + 1); }
    if (entryAction === "prepare-quote") void loadLiveEntryQuote();
    if (entryAction === "refresh-balance") void refreshLiveBalance();
    if (entryAction === "pay" || entryAction === "verify-payment") void confirmLivePayment();
  }, [confirmLivePayment, entryAction, loadLiveEntryQuote, paymentBusy, refreshLiveBalance]);
  const launchLabel = paymentBusy ? paymentTxHash ? "VERIFYING PAYMENT…" : "PREPARING…" : {
    wait: "CHECKING ENTRY…", "select-network": "SELECT ROBINHOOD OR ARC ABOVE",
    "retry-readiness": "RETRY ENTRY CHECK", "connect-wallet": "CONNECT WALLET TO PLAY", unavailable: "PAID ENTRY UNAVAILABLE",
    "prepare-quote": livePaymentQuote ? "REFRESH ENTRY QUOTE" : "RETRY ENTRY QUOTE",
    "refresh-balance": currentBalanceCheck ? "REFRESH MSS2 BALANCE" : "CHECK MSS2 BALANCE",
    pay: "PAY & FLY", "verify-payment": "RECHECK PAYMENT & FLY",
  }[entryAction];

  const prepareAnotherRun = useCallback(() => {
    setPhase("ready");
    setLivePaymentQuote(null);
    setActivePaymentId("");
    setPaymentTxHash("");
    setPaymentMessage("");
    setEntryBalance(null);
    if (!liveEntryEnabled && (!entryQuote || Date.now() >= Date.parse(entryQuote.validUntil))) void loadEntryQuote();
  }, [entryQuote, liveEntryEnabled, loadEntryQuote]);

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
      if (isTextEntryTarget(event.target) || (event.target instanceof Element && event.target.closest("button, a, summary"))) return;
      if (phase !== "playing" && phase !== "countdown" && phase !== "paused") return;
      if (["ArrowUp", "ArrowDown", "KeyW", "KeyS", "Space", "KeyP", "Escape"].includes(event.code)) event.preventDefault();
      heldKeysRef.current.add(event.code);
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
  }, [pauseFlight, phase, resumeFlight]);

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
        ? "MARKET QUOTE UNAVAILABLE"
        : quoteExpired
          ? "REFRESHING MARKET QUOTE"
          : quoteBusy ? "FETCHING VERIFIED QUOTE" : "LOADING QUOTE";
  const headerQuoteMeta = headerQuoteAmount
    ? `${livePaymentQuote && !liveQuoteExpired ? "ENTRY QUOTE" : "MARKET REFERENCE"} · ${livePaymentQuote && !liveQuoteExpired ? liveQuoteSecondsRemaining : quoteSecondsRemaining}s`
    : liveEntryEnabled ? "PAID FLIGHT" : paymentReadiness ? "PAID ENTRY UNAVAILABLE" : "CHECKING ENTRY";
  const leaderboardResult: LeaderboardFlightResult | null = (phase === "crashed" || phase === "victory") && runId ? {
    runId,
    score,
    distance,
    mintsCollected,
    maxCombo,
    hits: totalHits,
    lives,
    reachedMoon: phase === "victory",
    continued: false,
    paymentId: activePaymentId || undefined,
    entryNetwork: activeRunNetwork,
  } : null;

  return (
    <main className={styles.arcadeShell}>
      <header ref={pageTopRef} tabIndex={-1} className={styles.siteHeader}>
        <Link href="/" className={styles.homeLink} aria-label="Return to Yield Vacuum">
          <Image src="/topaz-mark.png" alt="" width={40} height={40} />
          <span><small>RETURN TO</small><strong>YIELD VACUUM</strong></span>
        </Link>
        <div className={styles.arcadeIdentity}>
          <small>MSS2 COMMUNITY ARCADE</small>
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
        <div className={styles.walletZone} id="mss2-wallet">
          <WalletConnect theme="mss" onConnectionChange={handleWalletConnectionChange} />
          <div className={`${styles.paymentStatus} ${headerQuoteAmount ? styles.quoteReady : ""} ${liveEntryEnabled ? styles.paymentLive : ""}`} aria-label={`${selectedNetworkLabel} MSS2 one dollar quote`}>
            <i aria-hidden="true" />
            <span><small>{selectedNetworkLabel} MSS2</small><strong>{headerQuoteStatus}</strong><em>{headerQuoteMeta}</em></span>
          </div>
        </div>
      </header>

      <section className={styles.hero}>
        <div>
          <p>COLLECT. COMBO. CLIMB THE BOARD.</p>
          <h1>MINT <span>FLYER</span></h1>
          <strong>Collect MSS2 coins. Dodge Glitch Blocks. Reach the Moon.</strong>
        </div>
        <aside>
          <small>$1 WORTH OF MSS2 PER FLIGHT</small>
          <b>{!walletConnection ? "CONNECT TO PLAY" : selectedMss2Network === "unsupported" ? "CHOOSE A NETWORK" : !paymentReadiness ? readinessFailed ? "ENTRY CHECK UNAVAILABLE" : "CHECKING ENTRY" : liveEntryEnabled ? canaryEntryEnabled ? "PAID TEST ENTRY" : "PAID ENTRY READY" : "PAID ENTRY UNAVAILABLE"}</b>
          <span>{!walletConnection ? "Connect MetaMask or Rabby. Choose Robinhood Chain or Arc." : liveEntryEnabled ? "One entry payment. Three stages. Your next personal best." : paymentReadiness?.releaseMode === "canary" ? "Paid testing is open to the approved test wallet. Public entry is not open yet." : "Check the entry panel below for availability."}</span>
        </aside>
      </section>

      <nav className={styles.arcadeNav} aria-label="Arcade sections">
        <a className={styles.activeNav} href="#mint-flyer"><small>THE GAME</small><strong>Play Mint Flyer</strong></a>
        <a href="#mint-flyer-leaderboard"><small>FLIGHTS + REWARDS</small><strong>Leaderboard</strong></a>
        <a href="#mss2-commitments"><small>OPTIONAL DEMO</small><strong>MSS2 Commitments</strong></a>
        <a href="#about-creator"><small>COMMUNITY PROJECT</small><strong>About the creator</strong></a>
      </nav>

      <section id="mint-flyer" className={`${styles.gameCard} ${phase === "ready" ? styles.readyGame : ""}`} aria-label="Mint Flyer game">
        <div className={styles.hud}>
          <span className={hasCollectEffect ? styles.hudPulse : ""}><small>SCORE</small><strong>{score.toLocaleString()}</strong></span>
          <span><small>DISTANCE</small><strong>{distance}m</strong></span>
          <span className={styles.mintCounter}><small>MINT CREDITS</small><strong>{mintsCollected}</strong></span>
          <span className={combo >= 3 ? styles.comboActive : ""}><small>COMBO</small><strong>{combo} · {currentMultiplier}X</strong></span>
          <span><small>LIVES</small><strong>{"◆".repeat(lives)}<i>{"◇".repeat(MAX_LIVES - lives)}</i></strong></span>
          <span><small>ENTRY</small><strong>$1 MSS2</strong></span>
        </div>

        <div className={styles.flightProgress} aria-label={`Stage ${stage} of 3: ${currentStage.name}. ${Math.round(flightProgress)} percent to the Moon.`}>
          <div className={styles.stageLabels}>
            {FLIGHT_STAGES.map((item) => <span key={item.id} className={stage === item.id ? styles.currentStage : stage > item.id ? styles.clearedStage : ""}><b>{item.id}</b>{item.name}</span>)}
          </div>
          <div className={styles.progressTrack}><i style={{ width: `${flightProgress}%` }} /><b style={{ left: `${flightProgress}%` }}>◆</b></div>
          <small>{Math.max(0, MOON_DISTANCE - distance).toLocaleString()}m TO THE MOON</small>
        </div>

        <div
          className={`${styles.playfield} ${phase === "ready" ? styles.launchPlayfield : phase === "crashed" || phase === "victory" ? styles.resultsPlayfield : ""} ${stageClass} ${hasHitEffect ? styles.impactShake : ""} ${hasCollectEffect ? styles.collectGlow : ""}`}
          data-stream-label={`MINT STREAM // ${selectedNetworkLabel} // MSS2 ARCADE`}
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
              <span><i className={styles.guideHazardIcon}>!</i><b>AVOID GLITCH BLOCKS</b><small>LOSE 1 OF 3 LIVES</small></span>
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
            <div className={`${styles.overlay} ${styles.launchOverlay}`}>
              <header className={styles.launchHeader}>
                <small>MINT FLYER · {selectedNetworkLabel}</small>
                <h2>YOUR NEXT MOON RUN.</h2>
                <p>3,000 meters. Three lives. How high can you score?</p>
              </header>
              <div className={styles.launchGrid}>
                <div className={styles.launchInstructions} aria-label="How to play Mint Flyer">
                  <div className={styles.launchScene} aria-hidden="true">
                    <span className={styles.sceneOrbit} />
                    <span className={styles.sceneMoon} />
                    <span className={styles.sceneTrail} />
                    <span className={styles.sceneShip}><Image src="/mss2-flyer-emblem.png" alt="" width={64} height={64} /></span>
                    <span className={`${styles.sceneCoin} ${styles.sceneCoinOne}`}><Image src="/mss2-flyer-emblem.png" alt="" width={64} height={64} /></span>
                    <span className={`${styles.sceneCoin} ${styles.sceneCoinTwo}`}><Image src="/mss2-flyer-emblem.png" alt="" width={64} height={64} /></span>
                    <span className={`${styles.sceneCoin} ${styles.sceneCoinThree}`}><Image src="/mss2-flyer-emblem.png" alt="" width={64} height={64} /></span>
                    <span className={`${styles.sceneGlitch} ${styles.sceneGlitchOne}`}><i /><b /></span>
                    <span className={`${styles.sceneGlitch} ${styles.sceneGlitchTwo}`}><i /><b /></span>
                    <strong>CHASE YOUR BEST.</strong>
                    <small>THE MOON IS WAITING.</small>
                  </div>
                  <div><i className={styles.howToMove} aria-hidden="true">↕</i><span><b>Steer</b><small><span className={styles.desktopControlText}>Mouse, W/S, or ↑/↓.</span><span className={styles.mobileControlText}>Press + slide your finger.</span></small></span></div>
                  <div><i className={styles.howToMint} aria-hidden="true"><Image className={styles.howToMintLogo} src="/mss2-flyer-emblem.png" alt="" width={96} height={96} /></i><span><b>Collect MSS2 coins</b><small>+250 points. Chain coins for up to 5×.</small></span></div>
                  <div><i className={styles.howToHazard} aria-hidden="true">!</i><span><b>Dodge Glitch Blocks</b><small>Each hit costs one life.</small></span></div>
                </div>
                <section className={styles.launchEntry} aria-label="Flight entry">
                  <small className={styles.launchMode}>{!paymentReadiness ? "ENTRY STATUS" : liveEntryEnabled ? canaryEntryEnabled ? "PAID TEST FLIGHT" : "PAID FLIGHT" : "MSS2 PAYMENT REQUIRED"}</small>
                  {liveEntryEnabled && walletConnection ? <>
                    <div className={styles.launchAmounts}>
                      <span><small>Entry cost · $1 USD</small><strong>{livePaymentQuote ? `${livePaymentQuote.displayAmount} MSS2` : "Getting quote…"}</strong></span>
                      <span><small>Your MSS2 balance</small><b>{currentBalanceCheck ? `${currentBalanceCheck.balanceDisplay} MSS2` : "Checking…"}</b></span>
                    </div>
                    <p className={styles.launchExpiry}>{livePaymentQuote ? paymentTxHash ? "Payment submitted. Recheck to start without paying again." : liveQuoteExpired ? "Quote expired. Refresh it below." : `Quote valid for ${liveQuoteSecondsRemaining}s.` : "Checking the entry cost and your balance. This does not open your wallet."}</p>
                    {!paymentTxHash && <p className={styles.launchConsent}>Transfers are final. Pay & Fly opens your wallet to approve MSS2, then confirm payment.</p>}
                    {currentBalanceCheck && !currentBalanceCheck.sufficient && !paymentTxHash && <div className={styles.insufficientMss2} role="alert">
                      <strong>NOT ENOUGH MSS2 TO PLAY</strong>
                      <p>Add at least <b>{currentBalanceCheck.shortfallDisplay} MSS2</b> to this wallet on <b>{currentBalanceCheck.network === "arc" ? "Arc" : "Robinhood Chain"}</b>, then refresh your balance below.</p>
                    </div>}
                  </> : <p className={styles.launchStatus}><b>Every flight requires $1 worth of MSS2.</b><br />{selectedMss2Network === "unsupported" ? "Choose Robinhood Chain or Arc in the wallet bar above." : !walletConnection ? "Connect your wallet above to check entry availability." : readinessFailed ? "Entry availability could not be checked. Please retry." : !paymentReadiness ? "Checking flight availability…" : paymentReadiness.releaseMode === "canary" ? "Paid testing is limited to the approved test wallet. Public entry is not open yet." : "Paid entry is not available yet. Please check back later."}</p>}
                  <div className={styles.entryBreakdown} aria-label="One dollar MSS2 entry breakdown">
                    <h3>Where your $1 in MSS2 goes</h3>
                    <div className={styles.entryBreakdownCards}>
                      <div className={styles.entryDeadShare}>
                        <strong>20% <span>· $0.20 worth</span></strong>
                        <b>Dead address</b>
                        <p>MSS2 permanently removed from circulation.</p>
                      </div>
                      <div className={styles.entryRewardsShare}>
                        <strong>80% <span>· $0.80 worth</span></strong>
                        <b>Community rewards</b>
                        <p>MSS2 sent to the Community Airdrop Reserve.</p>
                      </div>
                    </div>
                    <p className={styles.entryBreakdownNote}><b>0% kept by Yield Vacuum.</b> Network fees are extra. Community reward distribution details will be announced.</p>
                  </div>
                  {paymentMessage && <p className={styles.paymentMessage} role="status">{paymentMessage}</p>}
                  {entryAction === "connect-wallet" ? <a className={styles.launchButton} href="#mss2-wallet">{launchLabel}</a> : <button type="button" className={styles.launchButton} onClick={launchFlight} disabled={paymentBusy || entryAction === "wait" || entryAction === "select-network" || entryAction === "unavailable"}>{launchLabel}</button>}
                  {paymentTxHash && <a className={styles.paymentTxLink} href={`${livePaymentQuote?.explorerUrl}/tx/${paymentTxHash}`} target="_blank" rel="noreferrer">View submitted transaction ↗</a>}
                  {selectedMss2Network !== "unsupported" && <div className={styles.buyMss2Prompt}><a className={styles.buyMss2Link} href={MSS2_BUY_URLS[isArcContext ? "arc" : "robinhood"]} target="_blank" rel="noopener noreferrer">BUY MSS2 ↗</a><small>Buy on {isArcContext ? "Arc" : "Robinhood Chain"} using the same wallet.</small></div>}
                  {livePaymentQuote && liveEntryEnabled && <details className={styles.launchDetails}>
                    <summary>Payment details</summary>
                    <dl>
                      <div><dt>Wallet</dt><dd><code>{livePaymentQuote.walletAddress}</code></dd></div>
                      <div><dt>Price reference</dt><dd><a href={livePaymentQuote.pairUrl} target="_blank" rel="noopener noreferrer">{isArcContext ? "Arc · Topaz MSS2/USDC" : "Robinhood · Topaz MSS2/WETH"} ↗</a></dd></div>
                      <div><dt>20% · Dead address</dt><dd><code>{DEAD_ADDRESS}</code></dd></div>
                      <div><dt>80% · Community Airdrop Reserve</dt><dd><code>{COMMUNITY_AIRDROP_WALLET}</code></dd></div>
                      <div><dt>Verified router</dt><dd><code>{livePaymentQuote.routerAddress}</code></dd></div>
                      <div><dt>Payment reference</dt><dd><code>{livePaymentQuote.paymentId}</code></dd></div>
                    </dl>
                  </details>}
                </section>
                <details className={styles.mobileInstructions}>
                  <summary>How to play · 3 lives · 3,000m</summary>
                  <p><b>Steer:</b> press and slide your finger.</p>
                  <p><b>Collect MSS2 coins:</b> +250 points, with combos up to 5×.</p>
                  <p><b>Dodge Glitch Blocks:</b> each hit costs one life.</p>
                </details>
              </div>
            </div>
          )}

          {phase === "crashed" && (
            <div className={`${styles.overlay} ${styles.crashOverlay}`}>
              <small>FLIGHT ENDED</small>
              <h2>{newBest ? "NEW LOCAL BEST" : "FLIGHT COMPLETE"}</h2>
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
              <div className={`${styles.crashActions} ${styles.singleCrashAction}`}>
                <button className={styles.restartButton} onClick={prepareAnotherRun}>
                  ↻ NEW FLIGHT · $1 IN MSS2
                  <small>NEW ENTRY PAYMENT REQUIRED</small>
                </button>
              </div>
              <details className={styles.runEntrySummary}>
                <summary>Where your entry went</summary>
                <header>
                  <span><small>$1 MSS2 GAME ENTRY</small><strong>{selectedNetworkLabel}</strong></span>
                  <b>{liveEntryEnabled ? "LIVE ENTRY" : "PAID ENTRY REQUIRED"}</b>
                </header>
                <div className={styles.allocationBar} aria-label="20 percent dead address and 80 percent Community Airdrop Reserve">
                  <span className={styles.deadAllocation}><b>20%</b><small>DEAD ADDRESS</small></span>
                  <span className={styles.communityAllocation}><b>80%</b><small>COMMUNITY AIRDROP RESERVE</small></span>
                </div>
                <p><b>0% RETAINED BY YIELD VACUUM</b><span>{liveEntryEnabled ? "The verified router performs both transfers in one wallet-approved transaction." : "Every new flight requires a verified payment using this 20/80 allocation."}</span></p>
              </details>
            </div>
          )}

          {phase === "victory" && (
            <div className={`${styles.overlay} ${styles.victoryOverlay}`}>
              <div className={styles.moonArrival} aria-hidden="true"><i /><span>✓</span></div>
              <small>ALL THREE STAGES CLEARED</small>
              <h2>MOON REACHED</h2>
              <p>All three stages cleared. Your score is ready for the leaderboard.</p>
              <div className={styles.victoryScore}>
                <span><small>FINAL SCORE</small><strong>{score.toLocaleString()}</strong>{newBest && <b>NEW LOCAL BEST</b>}</span>
                <span className={`${styles.gradeBadge} ${gradeClass}`}><small>YOUR FLIGHT GRADE</small><strong>{runGrade}</strong><b>{GRADE_NAMES[runGrade]}</b></span>
              </div>
              <section className={styles.flightGradeScale} aria-label="Flight grade scale">
                <h3>{runGrade} · {GRADE_NAMES[runGrade]}</h3>
                <p>{runGrade === "S" ? "You earned the highest grade with 62,000 points or more." : `S is the highest grade. Earn ${(62000 - score).toLocaleString()} more points to reach it.`}</p>
                <div className={styles.gradeLadder}>
                  {GRADE_LADDER.map((target, index) => (
                    <span key={target.grade} className={runGrade === target.grade ? styles.activeGrade : score >= target.score ? styles.passedGrade : ""} aria-current={runGrade === target.grade ? "true" : undefined}>
                      <b>{target.grade}</b>
                      <strong>{GRADE_NAMES[target.grade]}</strong>
                      <small>{index === GRADE_LADDER.length - 1 ? `${target.score.toLocaleString()}+ points` : `${target.score.toLocaleString()}–${(GRADE_LADDER[index + 1].score - 1).toLocaleString()} points`}</small>
                      {runGrade === target.grade && <em>YOUR GRADE</em>}
                    </span>
                  ))}
                </div>
              </section>
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
              <div className={styles.finalScore}>
                <span><small>LOCAL BEST</small><strong>{bestScore.toLocaleString()}</strong></span>
                <span><small>MINT CREDITS</small><strong>{mintsCollected}</strong></span>
                <span><small>DISTANCE</small><strong>{distance}m</strong></span>
                <span><small>BEST COMBO</small><strong>{maxCombo} · {comboMultiplier(maxCombo)}X</strong></span>
                <span><small>BLOCK HITS</small><strong>{totalHits}</strong></span>
              </div>
              <p className={styles.replayTarget}>{nextGradeTarget ? <><b>{(nextGradeTarget.score - score).toLocaleString()} MORE POINTS FOR GRADE {nextGradeTarget.grade}</b><span>{replayCoach}</span></> : <><b>S · ELITE FLIGHT — HIGHEST GRADE</b><span>{replayCoach} Replay to beat your local best of {bestScore.toLocaleString()}.</span></>}</p>
              <a className={styles.leaderboardJump} href="#mint-flyer-leaderboard">VIEW LEADERBOARD ↓</a>
              <button className={styles.moonReplayButton} onClick={prepareAnotherRun}>↻ NEW MOON FLIGHT · $1 IN MSS2</button>
            </div>
          )}
        </div>

        <footer className={styles.gameFooter}>
          <span><b>CONTROL</b> <span className={styles.desktopControlText}>MOUSE, W/S OR ↑/↓</span><span className={styles.mobileControlText}>PRESS + SLIDE</span> TO MOVE</span>
          <span><b>COLLECT</b> MSS2 COINS · +250 GAME POINTS</span>
          <span><b>AVOID</b> GLITCH BLOCKS · -1 LIFE</span>
        </footer>
      </section>

      <Mss2EntryTotals network={isArcContext ? "arc" : "robinhood"} paymentId={activePaymentId} />

      <MintFlyerLeaderboard result={leaderboardResult} finishPanel={finishPanel} />

      <details className={styles.infoDrawer} id="payment-safety">
        <summary><span><small>PAYMENT SAFETY · {selectedNetworkLabel}</small><strong>{liveEntryEnabled ? `${selectedNetworkLabel} MSS2 ENTRY` : "$1 MSS2 REQUIRED PER FLIGHT"}</strong></span><b>VIEW DETAILS +</b></summary>
        <div className={styles.drawerBody}>
          <p>Each flight requires $1.00 worth of MSS2 on the selected network. Starting a new flight requires a new payment. Free flights and free continues are disabled.</p>
          <p>The entry quote uses the {isArcContext ? "Arc MSS2/USDC" : "Robinhood MSS2/WETH"} market. The verified router sends <b>20%</b> to <code>{DEAD_ADDRESS}</code> and <b>80%</b> to the Community Airdrop Reserve at <code>{COMMUNITY_AIRDROP_WALLET}</code>.</p>
          <p>The Community Airdrop Reserve funds community rewards. Eligibility, timing, and distribution details will be announced.</p>
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
      <footer className={styles.arcadeFooter}>
        <span><strong>Mint Flyer</strong><small>An independent community arcade by The Crypto Arborist.</small></span>
        <div>
          <Link href="/">Yield Vacuum</Link>
          <a href={MSS2_BUY_URLS[isArcContext ? "arc" : "robinhood"]} target="_blank" rel="noopener noreferrer">Buy MSS2 ↗</a>
        </div>
      </footer>
      {showBackToTop && !["countdown", "playing", "paused"].includes(phase) && (
        <button
          type="button"
          className={styles.backToTop}
          onClick={() => {
            pageTopRef.current?.focus({ preventScroll: true });
            window.scrollTo({
              top: 0,
              behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth",
            });
          }}
        >
          <span aria-hidden="true">↑</span> Back to Top
        </button>
      )}
    </main>
  );
}
