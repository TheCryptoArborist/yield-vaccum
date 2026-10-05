"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import WalletConnect, { type WalletConnection } from "../wallet-connect";
import Mss2Commitments from "./mss2-commitments";
import MintFlyerLeaderboard, { type LeaderboardFlightResult } from "./mint-flyer-leaderboard";
import { ensureMintFlyerPlayerKey } from "../../lib/arcade-player";
import { MSS2_COMMUNITY_AIRDROP_RESERVE, MSS2_DEAD_ADDRESS } from "../../lib/mss2-payment-shared";
import styles from "./mint-flyer.module.css";

type FlightPhase = "ready" | "countdown" | "playing" | "paused" | "crashed" | "victory";
type FlightStage = 1 | 2 | 3;
type EntryQuote = {
  source: string;
  status: "indicative";
  quoteId: string;
  pairUrl: string;
  priceUsd: string;
  entryPriceUsd: string;
  indicativeMss2ForEntry: string;
  liquidityUsd: number | null;
  checkedAt: string;
  validUntil: string;
};
type PaymentReadiness = {
  enabled: boolean;
  recipient: string;
  recipientConfirmed: boolean;
  chainId: number;
  chainHex: `0x${string}`;
  network: string;
  tokenAddress: string;
  tokenSymbol: "MSS2";
  tokenDecimals: number;
  entryPriceUsd: string;
  confirmations: number;
  arcEnabled: false;
  reason: string | null;
};
type LivePaymentQuote = {
  paymentId: string;
  runId: string;
  chainId: number;
  tokenAddress: string;
  recipient: string;
  amountRaw: string;
  displayAmount: string;
  entryPriceUsd: string;
  priceUsd: string;
  liquidityUsd: number;
  pairAddress: string;
  pairUrl: string;
  createdAt: string;
  expiresAt: string;
  status: "pending";
  walletAddress: string;
  transfer: { from: string; to: string; data: string; value: string };
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

const MAX_LIVES = 3;
const DEMO_CONTINUE_COST = 100;
const STARTING_DEMO_CREDITS = 100;
const BEST_SCORE_KEY = "yield-vacuum-mss2-mint-flyer-best";
const COMMUNITY_AIRDROP_WALLET = MSS2_COMMUNITY_AIRDROP_RESERVE;
const DEAD_ADDRESS = MSS2_DEAD_ADDRESS;
const ENTRY_PRICE_USD = 1;
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
  const [paymentTxHash, setPaymentTxHash] = useState("");
  const [paymentBusy, setPaymentBusy] = useState(false);
  const [paymentMessage, setPaymentMessage] = useState("");

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
    fetch("/api/arcade-payment", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("Payment readiness unavailable.");
        return await response.json() as PaymentReadiness;
      })
      .then((status) => { if (!cancelled) setPaymentReadiness(status); })
      .catch(() => { if (!cancelled) setPaymentReadiness(null); });
    return () => { cancelled = true; };
  }, []);

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
    try {
      const response = await fetch("/api/mss2-price", { cache: "no-store" });
      if (!response.ok) throw new Error("MSS2 quote unavailable");
      const quote = await response.json() as EntryQuote;
      setEntryQuote(quote);
      setQuoteUnavailable(false);
      setQuoteClock(Date.now());
    } catch {
      setEntryQuote(null);
      setQuoteUnavailable(true);
      setReviewingEntry(false);
    }
  }, []);

  useEffect(() => {
    if (reviewingEntry) return;
    const initial = window.setTimeout(loadEntryQuote, 0);
    const refresh = window.setInterval(loadEntryQuote, 30_000);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(refresh);
    };
  }, [loadEntryQuote, reviewingEntry]);

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
    if (paymentReadiness?.enabled) {
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
          body: JSON.stringify({ action: "quote", playerKey, runId: pendingRunId, walletAddress: walletConnection.account }),
        });
        const data = await response.json() as LivePaymentQuote & { error?: string };
        if (!response.ok) throw new Error(data.error || "A live MSS2 entry quote could not be created.");
        setLivePaymentQuote(data);
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
    if (!entryQuote || Date.now() >= Date.parse(entryQuote.validUntil)) {
      setQuoteClock(Date.now());
      void loadEntryQuote();
      return;
    }
    setQuoteClock(Date.now());
    setReviewingEntry(true);
  }, [entryQuote, loadEntryQuote, paymentBusy, paymentReadiness, playerKey, walletConnection]);

  const confirmDemoEntry = useCallback(() => {
    if (!entryQuote || Date.now() >= Date.parse(entryQuote.validUntil)) {
      setQuoteClock(Date.now());
      return;
    }
    primeAudio();
    resetFlight();
  }, [entryQuote, primeAudio, resetFlight]);

  const confirmLivePayment = useCallback(async () => {
    if (!paymentReadiness?.enabled || !walletConnection || !livePaymentQuote || paymentBusy) return;
    if (Date.now() >= Date.parse(livePaymentQuote.expiresAt)) {
      setPaymentMessage("This live quote expired. Go back and request a new one.");
      setQuoteClock(Date.now());
      return;
    }
    setPaymentBusy(true);
    setPaymentMessage("Check your wallet. Review the MSS2 token, exact amount, Robinhood Chain, and recipient before approving.");
    try {
      if (walletConnection.chainId.toLowerCase() !== paymentReadiness.chainHex) await walletConnection.switchChain(paymentReadiness.chainHex);
      const txHash = paymentTxHash || await walletConnection.sendTransaction(livePaymentQuote.transfer);
      if (!paymentTxHash) setPaymentTxHash(txHash);
      setPaymentMessage(`${paymentTxHash ? "Rechecking" : "Transfer submitted. Checking"} the Robinhood receipt and confirmations…`);
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
      setPaymentMessage("MSS2 payment verified. Starting the paid flight.");
      primeAudio();
      resetFlight(livePaymentQuote.runId);
    } catch (error) {
      setPaymentMessage(error instanceof Error ? error.message : "The MSS2 payment could not be completed.");
    } finally {
      setPaymentBusy(false);
    }
  }, [livePaymentQuote, paymentBusy, paymentReadiness, paymentTxHash, playerKey, primeAudio, resetFlight, walletConnection]);

  const prepareAnotherRun = useCallback(() => {
    setPhase("ready");
    setReviewingEntry(false);
    setLivePaymentQuote(null);
    setActivePaymentId("");
    setPaymentTxHash("");
    setPaymentMessage("");
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
  const leaderboardResult: LeaderboardFlightResult | null = phase === "victory" && runId ? {
    runId,
    score,
    distance,
    mintsCollected,
    maxCombo,
    hits: totalHits,
    lives,
    reachedMoon: true,
    continued,
    paymentId: activePaymentId || undefined,
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
          <WalletConnect theme="mss" onConnectionChange={setWalletConnection} />
          <div className={`${styles.paymentStatus} ${paymentReadiness?.enabled ? styles.paymentLive : ""}`}><i aria-hidden="true" /><span><small>ROBINHOOD MSS2</small><strong>{paymentReadiness?.enabled ? "LIVE" : "LOCKED"}</strong></span></div>
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
          <b>{paymentReadiness?.enabled ? "$1 MSS2 ENTRY" : "SAFE DEMO FLIGHT"}</b>
          <span>{paymentReadiness?.enabled ? "One verified Robinhood MSS2 transfer unlocks one scored run." : "Real transfers remain off while the payment release is reviewed."}</span>
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
                <small>HOW TO PLAY · {paymentReadiness?.enabled ? "PAID ROBINHOOD FLIGHT" : "SAFE DEMO FLIGHT"}</small>
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
                <p className={styles.demoGameNote}>{paymentReadiness?.enabled
                  ? <><b>LIVE ENTRY:</b> The verified entry router sends 50% to the dead address and 50% to the Community Airdrop Reserve in one transaction.</>
                  : <><b>FREE PREVIEW:</b> Play without sending funds. The proposed entry split sends 50% to the dead address and 50% to the designated Community Airdrop Reserve. Real transfers remain disabled.</>}</p>
                {paymentMessage && <p className={styles.paymentMessage} role="status">{paymentMessage}</p>}
                <button onClick={() => void reviewEntry()} disabled={paymentBusy || (paymentReadiness?.enabled ? !walletConnection || !playerKey : !entryQuote || quoteExpired)}>{paymentBusy ? "PREPARING…" : paymentReadiness?.enabled ? walletConnection ? "REVIEW MSS2 ENTRY" : "CONNECT WALLET ABOVE" : !entryQuote ? quoteUnavailable ? "QUOTE UNAVAILABLE" : "LOADING DEMO" : quoteExpired ? "REFRESHING DEMO" : "REVIEW SAFE DEMO"}</button>
              </> : <>
                <small>{paymentReadiness?.enabled ? "LIVE MSS2 ENTRY · ROBINHOOD CHAIN" : "SAFE ENTRY REVIEW · NO TRANSACTION"}</small>
                <h2>{paymentReadiness?.enabled ? "REVIEW + PAY" : "REVIEW THE RUN"}</h2>
                <p>{paymentReadiness?.enabled ? "The wallet will request one exact MSS2 transfer. No token approval is needed. Check every field in your wallet before approving." : "Confirm the simulated entry details below, then start the flight. This screen does not request a token approval, signature, network switch, or transfer."}</p>
                <div className={styles.reviewReminder}>
                  <span><i className={styles.guideMintIcon}><Image className={styles.mintGuideLogo} src="/mss2-flyer-emblem.png" alt="" width={64} height={64} /></i><b>MSS2 LOGO = COLLECT</b><small>+250 POINTS</small></span>
                  <span><i className={styles.guideHazardIcon}>!</i><b>PINK = AVOID</b><small>-1 LIFE</small></span>
                  <span><i className={styles.guideMoveIcon}>↕</i><b><span className={styles.desktopControlText}>MOUSE OR KEYS</span><span className={styles.mobileControlText}>PRESS + SLIDE</span></b><small>MOVE UP + DOWN</small></span>
                </div>
                <div className={styles.entryReview} aria-label="Demo MSS2 entry review">
                  <span><small>RUN PRICE</small><strong>${paymentReadiness?.enabled ? livePaymentQuote?.entryPriceUsd : entryQuote?.entryPriceUsd ?? ENTRY_PRICE_USD.toFixed(2)} USD</strong></span>
                  <span><small>{paymentReadiness?.enabled ? "EXACT TRANSFER" : "INDICATIVE AMOUNT"}</small><strong>{paymentReadiness?.enabled ? livePaymentQuote ? `${livePaymentQuote.displayAmount} MSS2` : "UNAVAILABLE" : entryQuote ? `${entryQuote.indicativeMss2ForEntry} MSS2` : "UNAVAILABLE"}</strong></span>
                  <span><small>PRICE REFERENCE</small><strong>ROBINHOOD CHAIN · TOPAZ</strong></span>
                  <span><small>QUOTE EXPIRES</small><strong className={(paymentReadiness?.enabled ? liveQuoteExpired : quoteExpired) ? styles.expiredText : ""}>{paymentReadiness?.enabled ? liveQuoteExpired ? "EXPIRED" : `${liveQuoteSecondsRemaining}s` : quoteExpired ? "EXPIRED" : `${quoteSecondsRemaining}s`}</strong></span>
                  <span className={styles.reviewWide}><small>50% · DEAD ADDRESS</small><code>{DEAD_ADDRESS}</code></span>
                  <span className={styles.reviewWide}><small>50% · COMMUNITY AIRDROP RESERVE</small><code>{COMMUNITY_AIRDROP_WALLET}</code></span>
                  <span className={styles.reviewWide}><small>{paymentReadiness?.enabled ? "SERVER PAYMENT ID" : "DEMO QUOTE REFERENCE"}</small><code>{paymentReadiness?.enabled ? livePaymentQuote?.paymentId : entryQuote?.quoteId ?? "UNAVAILABLE"}</code></span>
                </div>
                <p className={styles.entryWarning}><b>{paymentReadiness?.enabled ? "FINAL TRANSFER" : "NO FUNDS MOVE"}</b><span>{paymentReadiness?.enabled ? "After wallet approval, the router splits the MSS2 entry 50/50 between the dead address and Community Airdrop Reserve. Transfers are intended to be final and do not guarantee an airdrop, income, token value, or uninterrupted service." : "This review is simulated. Real entry payments stay disabled until the 50/50 router and backend verification are complete."}</span></p>
                {paymentMessage && <p className={styles.paymentMessage} role="status">{paymentMessage}</p>}
                {paymentTxHash && <a className={styles.paymentTxLink} href={`https://robin.etherscan.io/tx/${paymentTxHash}`} target="_blank" rel="noreferrer">VIEW SUBMITTED TRANSACTION ↗</a>}
                <div className={styles.entryActions}>
                  <button className={styles.secondaryEntryButton} onClick={() => setReviewingEntry(false)} disabled={paymentBusy}>← BACK</button>
                  {paymentReadiness?.enabled
                    ? <button onClick={() => void confirmLivePayment()} disabled={paymentBusy || (liveQuoteExpired && !paymentTxHash) || !livePaymentQuote}>{paymentBusy ? "VERIFYING PAYMENT…" : paymentTxHash ? "RECHECK PAYMENT + START" : liveQuoteExpired ? "QUOTE EXPIRED" : "PAY MSS2 + START"}</button>
                    : <button onClick={confirmDemoEntry} disabled={quoteExpired || !entryQuote}>{quoteExpired ? "QUOTE EXPIRED" : "CONFIRM SAFE DEMO + START"}</button>}
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
              <div className={styles.finalScore}>
                <span><small>LOCAL BEST</small><strong>{bestScore.toLocaleString()}</strong></span>
                <span><small>MINT CREDITS</small><strong>{mintsCollected}</strong></span>
                <span><small>DISTANCE</small><strong>{distance}m</strong></span>
                <span><small>BEST COMBO</small><strong>{maxCombo} · {comboMultiplier(maxCombo)}X</strong></span>
                <span><small>BLOCK HITS</small><strong>{totalHits}</strong></span>
              </div>
              <div className={styles.crashActions}>
                {!continued && demoCredits >= DEMO_CONTINUE_COST && (
                  <button className={styles.continueButton} onClick={continueFlight}>
                    CONTINUE THIS RUN
                    <small>{DEMO_CONTINUE_COST} DEMO CREDITS · RESTORES 3 LIVES</small>
                  </button>
                )}
                <button className={styles.restartButton} onClick={prepareAnotherRun}>↻ {paymentReadiness?.enabled ? "REVIEW ANOTHER MSS2 ENTRY" : "REVIEW ANOTHER SAFE DEMO"} <small>EVERY NEW SCORED RUN USES A NEW QUOTE</small></button>
              </div>
              {continued && <p className={styles.usedNotice}>The one continue for this flight has been used. A new scored run requires a new entry review.</p>}
              <section className={styles.lockedPayments} aria-label="Token payment readiness">
                <div><small>MSS2 GAME ENTRY</small><strong>{paymentReadiness?.enabled ? "ROBINHOOD LIVE" : "RELEASE LOCKED"}</strong></div>
                <ul>
                  <li><b>ROBINHOOD CHAIN</b><span>{paymentReadiness?.enabled ? "Each scored run uses one exact MSS2 entry split. The server checks the chain, token, sender, both destinations, both amounts, receipt, confirmations, and duplicate use." : "The payment code is gated until the 50/50 router and matching backend verifier are complete."}</span></li>
                  <li><b>ARC</b><span>Locked until the live Arc MSS2 pool, quote source, RPC receipt path, and end-to-end verifier pass independently.</span></li>
                </ul>
                <p>{paymentReadiness?.enabled ? "The wallet shows the final router transaction before anything moves. Half goes to the dead address and half goes to the Community Airdrop Reserve." : "This preview requests no token approval or transfer. Permanent MSS2 commitments remain a separate Robinhood Chain-only demo."}</p>
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
              <a className={styles.leaderboardJump} href="#mint-flyer-leaderboard">SAVE SCORE + VIEW LEADERBOARD ↓</a>
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

      <MintFlyerLeaderboard result={leaderboardResult} walletConnection={walletConnection} />

      <details className={styles.infoDrawer} id="payment-safety">
        <summary><span><small>PAYMENT SAFETY</small><strong>{paymentReadiness?.enabled ? "ROBINHOOD MSS2 ENTRY IS LIVE" : "REAL MSS2 REMAINS LOCKED"}</strong></span><b>VIEW DETAILS +</b></summary>
        <div className={styles.drawerBody}>
          <p>Continue credits are game-only. They have no cash value and cannot be purchased, transferred, withdrawn, or redeemed.</p>
          <p>The proposed entry target is $1.00 in MSS2 using a short-lived Robinhood/Topaz market quote. A future verified router would send <b>50%</b> to <code>{DEAD_ADDRESS}</code> and <b>50%</b> to the Community Airdrop Reserve at <code>{COMMUNITY_AIRDROP_WALLET}</code>.</p>
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
