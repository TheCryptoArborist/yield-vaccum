"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import WalletConnect from "../wallet-connect";
import Mss2Commitments from "./mss2-commitments";
import styles from "./mint-flyer.module.css";

type FlightPhase = "ready" | "playing" | "crashed";
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
};

const MAX_LIVES = 3;
const DEMO_CONTINUE_COST = 100;
const STARTING_DEMO_CREDITS = 100;
const BEST_SCORE_KEY = "yield-vacuum-mss2-mint-flyer-best";
const DEVELOPER_WALLET = "0xF2Ab1eEBbEcb4E315FE95D8b532D1aB00F1A8789";
const ENTRY_PRICE_USD = 1;

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

  useEffect(() => {
    const frame = requestAnimationFrame(() => setBestScore(Number(window.localStorage.getItem(BEST_SCORE_KEY) || 0)));
    return () => cancelAnimationFrame(frame);
  }, []);

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

  const resetFlight = useCallback(() => {
    playerYRef.current = 0.5;
    targetYRef.current = 0.5;
    entitiesRef.current = [];
    effectsRef.current = [];
    scoreRef.current = 0;
    distanceRef.current = 0;
    livesRef.current = MAX_LIVES;
    spawnTimerRef.current = 0;
    collectedRef.current = 0;
    invulnerableUntilRef.current = performance.now() + 900;
    setPlayerY(0.5);
    setEntities([]);
    setEffects([]);
    setScore(0);
    setDistance(0);
    setMintsCollected(0);
    setLives(MAX_LIVES);
    setDemoCredits(STARTING_DEMO_CREDITS);
    setContinued(false);
    setNewBest(false);
    setReviewingEntry(false);
    setPhase("playing");
  }, []);

  const reviewEntry = useCallback(() => {
    if (!entryQuote || Date.now() >= Date.parse(entryQuote.validUntil)) {
      setQuoteClock(Date.now());
      void loadEntryQuote();
      return;
    }
    setQuoteClock(Date.now());
    setReviewingEntry(true);
  }, [entryQuote, loadEntryQuote]);

  const confirmDemoEntry = useCallback(() => {
    if (!entryQuote || Date.now() >= Date.parse(entryQuote.validUntil)) {
      setQuoteClock(Date.now());
      return;
    }
    resetFlight();
  }, [entryQuote, resetFlight]);

  const prepareAnotherRun = useCallback(() => {
    setPhase("ready");
    setReviewingEntry(false);
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
    setPhase("playing");
  }, [continued, demoCredits]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (["ArrowUp", "ArrowDown", "KeyW", "KeyS", "Space"].includes(event.code)) event.preventDefault();
      heldKeysRef.current.add(event.code);
      if (event.code === "Space" && phase === "ready" && !reviewingEntry) reviewEntry();
    };
    const onKeyUp = (event: KeyboardEvent) => heldKeysRef.current.delete(event.code);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [phase, reviewEntry, reviewingEntry]);

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
      spawnTimerRef.current += dt;
      const difficulty = Math.min(0.18, distanceRef.current / 2200);
      const spawnEvery = Math.max(0.56, 0.88 - difficulty);
      if (spawnTimerRef.current >= spawnEvery) {
        spawnTimerRef.current = 0;
        const kind: FlyerEntity["kind"] = Math.random() < 0.58 ? "mint" : "hazard";
        entitiesRef.current.push({
          id: entityIdRef.current++,
          kind,
          x: 1.08,
          y: 0.12 + Math.random() * 0.76,
          size: kind === "mint" ? 0.055 : 0.075 + Math.random() * 0.025,
        });
      }

      const speed = 0.24 + difficulty;
      const nextEntities: FlyerEntity[] = [];
      let remainingLives = livesRef.current;

      for (const entity of entitiesRef.current) {
        const moved = { ...entity, x: entity.x - speed * dt };
        const horizontalHit = Math.abs(moved.x - 0.2) < moved.size * 0.72 + 0.035;
        const verticalHit = Math.abs(moved.y - playerYRef.current) < moved.size * 0.72 + 0.035;

        if (horizontalHit && verticalHit) {
          if (moved.kind === "mint") {
            collectedRef.current += 1;
            setMintsCollected(collectedRef.current);
            effectsRef.current.push({ id: effectIdRef.current++, kind: "collect", x: moved.x, y: moved.y, bornAt: now });
            setEffects([...effectsRef.current]);
            continue;
          }
          if (now >= invulnerableUntilRef.current) {
            remainingLives -= 1;
            livesRef.current = remainingLives;
            invulnerableUntilRef.current = now + 1250;
            effectsRef.current.push({ id: effectIdRef.current++, kind: "hit", x: moved.x, y: moved.y, bornAt: now });
            setEffects([...effectsRef.current]);
            if (remainingLives <= 0) {
              const finalScore = Math.floor(distanceRef.current * 10) + collectedRef.current * 250;
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
      const nextScore = Math.floor(distanceRef.current * 10) + collectedRef.current * 250;
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
  }, [phase, publishBest]);

  const moveWithPointer = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (phase !== "playing") return;
    const rect = event.currentTarget.getBoundingClientRect();
    targetYRef.current = Math.max(0.08, Math.min(0.92, (event.clientY - rect.top) / rect.height));
  };

  const hasCollectEffect = effects.some((effect) => effect.kind === "collect");
  const hasHitEffect = effects.some((effect) => effect.kind === "hit");

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
              src="/mss2-logo-site-colour-dark.png"
              alt="MintStakeShare 2.0 — A New Chapter"
              width={2000}
              height={459}
              priority
            />
          </span>
        </div>
        <div className={styles.walletZone}>
          <WalletConnect theme="mss" />
          <div className={styles.paymentStatus}><i aria-hidden="true" /><span><small>REAL PAYMENTS</small><strong>DISABLED</strong></span></div>
        </div>
      </header>

      <section className={styles.hero}>
        <div>
          <p>ARCADE TEST FLIGHT 01</p>
          <h1>MINT <span>FLYER</span></h1>
          <strong>Thread the mint stream. Collect clean credits. Avoid corrupted blocks.</strong>
        </div>
        <aside>
          <small>PAY-PER-GAME PREVIEW</small>
          <b>MSS2 ENTRY PLANNED</b>
          <span>This demo does not request a wallet payment.</span>
        </aside>
      </section>

      <section className={styles.gameCard} aria-label="Mint Flyer game">
        <div className={styles.hud}>
          <span className={hasCollectEffect ? styles.hudPulse : ""}><small>SCORE</small><strong>{score.toLocaleString()}</strong></span>
          <span><small>DISTANCE</small><strong>{distance}m</strong></span>
          <span className={styles.mintCounter}><small>MINT CREDITS</small><strong>{mintsCollected}</strong></span>
          <span><small>LIVES</small><strong>{"◆".repeat(lives)}<i>{"◇".repeat(MAX_LIVES - lives)}</i></strong></span>
          <span className={styles.demoBalance}><small>DEMO CREDITS</small><strong>{demoCredits}</strong></span>
        </div>

        <div
          className={`${styles.playfield} ${hasHitEffect ? styles.impactShake : ""} ${hasCollectEffect ? styles.collectGlow : ""}`}
          onPointerDown={(event) => {
            if (phase !== "playing") return;
            event.currentTarget.setPointerCapture(event.pointerId);
            moveWithPointer(event);
          }}
          onPointerMove={(event) => {
            if (["mouse", "pen", "touch"].includes(event.pointerType) || event.buttons) moveWithPointer(event);
          }}
        >
          {phase === "playing" && (
            <div className={styles.playGuide} aria-label="Mint Flyer objective and controls">
              <span><i className={styles.guideMintIcon}>M</i><b>COLLECT CYAN MINT CREDITS</b><small>+250 POINTS EACH</small></span>
              <span><i className={styles.guideHazardIcon}>!</i><b>AVOID PINK BLOCKS</b><small>LOSE 1 OF 3 LIVES</small></span>
              <span className={styles.desktopControlGuide}><i className={styles.guideMoveIcon}>↕</i><b>STEER WITH YOUR MOUSE</b><small>NO CLICK NEEDED · W/S OR ARROWS ALSO WORK</small></span>
              <span className={styles.mobileControlGuide}><i className={styles.guideMoveIcon}>↕</i><b>PRESS + SLIDE TO STEER</b><small>DRAG YOUR FINGER UP + DOWN ANYWHERE</small></span>
            </div>
          )}
          <div className={styles.speedLines} aria-hidden="true"><i /><i /><i /><i /><i /><i /></div>
          <div className={`${styles.flyer} ${phase === "playing" ? styles.flying : ""} ${hasCollectEffect ? styles.flyerBoost : ""} ${hasHitEffect ? styles.flyerDamaged : ""}`} style={{ top: `${playerY * 100}%` }} aria-label="Mint Flyer">
            <span>MF</span><i /><b />
          </div>

          {entities.map((entity) => (
            <div
              key={entity.id}
              className={entity.kind === "mint" ? styles.mint : styles.hazard}
              style={{ left: `${entity.x * 100}%`, top: `${entity.y * 100}%`, width: `${entity.size * 100}%` }}
              aria-hidden="true"
            >
              {entity.kind === "mint" ? <><span>M</span><i /></> : <><span>!</span><i /><b /></>}
            </div>
          ))}

          {effects.map((effect) => (
            <div
              key={effect.id}
              className={`${styles.flightEffect} ${effect.kind === "collect" ? styles.collectEffect : styles.hitEffect}`}
              style={{ left: `${effect.x * 100}%`, top: `${effect.y * 100}%` }}
              aria-hidden="true"
            >
              <strong>{effect.kind === "collect" ? "+250" : "−1 LIFE"}</strong>
              <i /><i /><i /><i /><i /><i />
            </div>
          ))}

          {phase === "ready" && (
            <div className={`${styles.overlay} ${reviewingEntry ? styles.entryReviewOverlay : styles.briefingOverlay}`}>
              {!reviewingEntry ? <>
                <small>HOW TO PLAY · DEMO FLIGHT</small>
                <h2>FLY. COLLECT. SURVIVE.</h2>
                <p className={styles.briefingLead}>Move the <b>MF flyer</b> up and down. Collect the cyan circles, avoid the pink warning blocks, and stay alive as long as possible.</p>
                <div className={styles.howToGrid} aria-label="How to play Mint Flyer">
                  <article>
                    <i className={styles.howToMove}>↕</i>
                    <span><b>1. MOVE THE FLYER</b><small><span className={styles.desktopControlText}>Desktop: move your mouse up and down inside the flight area—no click needed. W/S and the arrow keys also work.</span><span className={styles.mobileControlText}>Mobile: press anywhere inside the flight area and slide your finger up or down. You can keep dragging without lifting your finger.</span></small></span>
                  </article>
                  <article>
                    <i className={styles.howToMint}>M</i>
                    <span><b>2. COLLECT MINT CREDITS</b><small>Cyan circles are in-game score pickups worth <strong>+250 points</strong> each. They are not MSS2 tokens.</small></span>
                  </article>
                  <article>
                    <i className={styles.howToHazard}>!</i>
                    <span><b>3. AVOID CORRUPTED BLOCKS</b><small>Touching a pink warning block removes one life. The flight ends after three hits.</small></span>
                  </article>
                  <article>
                    <i className={styles.howToScore}>★</i>
                    <span><b>4. BUILD YOUR SCORE</b><small>Earn 10 points per meter flown, plus 250 points for every Mint Credit collected.</small></span>
                  </article>
                </div>
                <p className={styles.demoGameNote}><b>DEMO FLIGHT:</b> No wallet payment, token approval, signature, or real MSS2 is requested.</p>
                <button onClick={reviewEntry} disabled={!entryQuote || quoteExpired}>{!entryQuote ? quoteUnavailable ? "QUOTE UNAVAILABLE" : "LOADING DEMO" : quoteExpired ? "REFRESHING DEMO" : "GOT IT — REVIEW DEMO ENTRY"}</button>
              </> : <>
                <small>DEMO ENTRY REVIEW · NO TRANSACTION</small>
                <h2>REVIEW THE RUN</h2>
                <p>Confirm the simulated entry details below, then start the flight. This screen does not request a token approval, signature, network switch, or transfer.</p>
                <div className={styles.reviewReminder}>
                  <span><i className={styles.guideMintIcon}>M</i><b>CYAN = COLLECT</b><small>+250 POINTS</small></span>
                  <span><i className={styles.guideHazardIcon}>!</i><b>PINK = AVOID</b><small>-1 LIFE</small></span>
                  <span><i className={styles.guideMoveIcon}>↕</i><b><span className={styles.desktopControlText}>MOUSE OR KEYS</span><span className={styles.mobileControlText}>PRESS + SLIDE</span></b><small>MOVE UP + DOWN</small></span>
                </div>
                <div className={styles.entryReview} aria-label="Demo MSS2 entry review">
                  <span><small>RUN PRICE</small><strong>${entryQuote?.entryPriceUsd ?? ENTRY_PRICE_USD.toFixed(2)} USD</strong></span>
                  <span><small>INDICATIVE AMOUNT</small><strong>{entryQuote ? `${entryQuote.indicativeMss2ForEntry} MSS2` : "UNAVAILABLE"}</strong></span>
                  <span><small>NETWORK / MARKET</small><strong>ROBINHOOD · TOPAZ</strong></span>
                  <span><small>QUOTE EXPIRES</small><strong className={quoteExpired ? styles.expiredText : ""}>{quoteExpired ? "EXPIRED" : `${quoteSecondsRemaining}s`}</strong></span>
                  <span className={styles.reviewWide}><small>PROPOSED RECIPIENT</small><code>{DEVELOPER_WALLET}</code></span>
                  <span className={styles.reviewWide}><small>DEMO QUOTE REFERENCE</small><code>{entryQuote?.quoteId ?? "UNAVAILABLE"}</code></span>
                </div>
                <p className={styles.entryWarning}><b>DEMO ONLY</b><span>A future live entry would be final and non-refundable after explicit wallet approval and successful backend verification. This preview moves no funds.</span></p>
                <div className={styles.entryActions}>
                  <button className={styles.secondaryEntryButton} onClick={() => setReviewingEntry(false)}>← BACK</button>
                  <button onClick={confirmDemoEntry} disabled={quoteExpired || !entryQuote}>{quoteExpired ? "QUOTE EXPIRED" : "CONFIRM DEMO ENTRY + START"}</button>
                </div>
              </>}
            </div>
          )}

          {phase === "crashed" && (
            <div className={`${styles.overlay} ${styles.crashOverlay}`}>
              <small>FLIGHT ENDED</small>
              <h2>{newBest ? "NEW LOCAL BEST" : "MINT STREAM CLOSED"}</h2>
              <div className={styles.finalScore}><span><small>FINAL SCORE</small><strong>{score.toLocaleString()}</strong></span><span><small>LOCAL BEST</small><strong>{bestScore.toLocaleString()}</strong></span></div>
              <div className={styles.crashActions}>
                {!continued && demoCredits >= DEMO_CONTINUE_COST && (
                  <button className={styles.continueButton} onClick={continueFlight}>
                    CONTINUE THIS RUN
                    <small>{DEMO_CONTINUE_COST} DEMO CREDITS · RESTORES 3 LIVES</small>
                  </button>
                )}
                <button className={styles.restartButton} onClick={prepareAnotherRun}>↻ REVIEW ANOTHER DEMO ENTRY <small>EVERY NEW SCORED RUN USES A NEW QUOTE</small></button>
              </div>
              {continued && <p className={styles.usedNotice}>The one demo continue for this flight has been used. A new demo run simulates a new MSS2 entry.</p>}
              <section className={styles.lockedPayments} aria-label="Token continue readiness">
                <div><small>FUTURE GAME PAYMENTS</small><strong>LOCKED</strong></div>
                <ul>
                  <li><b>MSS2</b><span>Required for every new scored run at a $1.00 USD target. The live MSS2 quote source remains pending.</span></li>
                  <li><b>TOPAZ</b><span>Possible continue option under review; it does not replace the MSS2 entry requirement.</span></li>
                </ul>
                <p>No signature, approval, transfer, or network switch is requested in this preview.</p>
              </section>
            </div>
          )}
        </div>

        <footer className={styles.gameFooter}>
          <span><b>CONTROL</b> DRAG, W/S OR ↑/↓ TO MOVE</span>
          <span><b>COLLECT</b> CYAN MINT CREDITS · +250 POINTS</span>
          <span><b>AVOID</b> PINK BLOCKS · -1 LIFE</span>
        </footer>
      </section>

      <section className={styles.demoDisclosure}>
        <div><small>PAY-PER-GAME DEMONSTRATION</small><strong>NO REAL MSS2 IS CHARGED</strong></div>
        <p>Demo credits exist only to test the continue screen. They have no cash value, cannot be purchased, transferred, withdrawn, or redeemed, and do not create an onchain transaction.</p>
        <span>Proposed developer recipient: {DEVELOPER_WALLET}. Each scored run targets $1.00 worth of MSS2. The developer intends to add proceeds to liquidity manually, but no automatic liquidity action or guarantee is active. Price source, quote rules, refund policy, and backend verification remain unconfirmed.</span>
      </section>

      <Mss2Commitments />

      <section className={styles.comingSoon}>
        <small>ARCADE ROADMAP</small>
        <strong>ONE GAME NOW. MORE FLIGHTS LATER.</strong>
        <p>Mint Flyer is the first optional MSS2 Arcade test. It does not change Yield Vacuum missions, progression, achievements, or leaderboard data.</p>
      </section>
    </main>
  );
}
