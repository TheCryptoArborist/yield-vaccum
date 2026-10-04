"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import WalletConnect from "../wallet-connect";
import Mss2Commitments from "./mss2-commitments";
import styles from "./mint-flyer.module.css";

type FlightPhase = "ready" | "playing" | "crashed";
type FlyerEntity = {
  id: number;
  kind: "mint" | "hazard";
  x: number;
  y: number;
  size: number;
};

const MAX_LIVES = 3;
const DEMO_CONTINUE_COST = 100;
const STARTING_DEMO_CREDITS = 100;
const BEST_SCORE_KEY = "yield-vacuum-mss2-mint-flyer-best";
const DEVELOPER_WALLET = "0xF2Ab1eEBbEcb4E315FE95D8b532D1aB00F1A8789";

export default function MintFlyer() {
  const [phase, setPhase] = useState<FlightPhase>("ready");
  const [playerY, setPlayerY] = useState(0.5);
  const [entities, setEntities] = useState<FlyerEntity[]>([]);
  const [score, setScore] = useState(0);
  const [distance, setDistance] = useState(0);
  const [lives, setLives] = useState(MAX_LIVES);
  const [demoCredits, setDemoCredits] = useState(STARTING_DEMO_CREDITS);
  const [continued, setContinued] = useState(false);
  const [bestScore, setBestScore] = useState(0);
  const [newBest, setNewBest] = useState(false);

  const playerYRef = useRef(0.5);
  const entitiesRef = useRef<FlyerEntity[]>([]);
  const scoreRef = useRef(0);
  const distanceRef = useRef(0);
  const livesRef = useRef(MAX_LIVES);
  const spawnTimerRef = useRef(0);
  const entityIdRef = useRef(0);
  const collectedRef = useRef(0);
  const invulnerableUntilRef = useRef(0);
  const heldKeysRef = useRef(new Set<string>());

  useEffect(() => {
    const frame = requestAnimationFrame(() => setBestScore(Number(window.localStorage.getItem(BEST_SCORE_KEY) || 0)));
    return () => cancelAnimationFrame(frame);
  }, []);

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
    entitiesRef.current = [];
    scoreRef.current = 0;
    distanceRef.current = 0;
    livesRef.current = MAX_LIVES;
    spawnTimerRef.current = 0;
    collectedRef.current = 0;
    invulnerableUntilRef.current = performance.now() + 900;
    setPlayerY(0.5);
    setEntities([]);
    setScore(0);
    setDistance(0);
    setLives(MAX_LIVES);
    setDemoCredits(STARTING_DEMO_CREDITS);
    setContinued(false);
    setNewBest(false);
    setPhase("playing");
  }, []);

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
      if (event.code === "Space" && phase !== "playing") resetFlight();
    };
    const onKeyUp = (event: KeyboardEvent) => heldKeysRef.current.delete(event.code);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [phase, resetFlight]);

  useEffect(() => {
    if (phase !== "playing") return;
    let animation = 0;
    let lastTime = performance.now();

    const frame = (now: number) => {
      const dt = Math.min(0.034, Math.max(0.001, (now - lastTime) / 1000));
      lastTime = now;

      const keys = heldKeysRef.current;
      const direction = Number(keys.has("ArrowDown") || keys.has("KeyS")) - Number(keys.has("ArrowUp") || keys.has("KeyW"));
      if (direction !== 0) playerYRef.current = Math.max(0.08, Math.min(0.92, playerYRef.current + direction * dt * 0.68));

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
            continue;
          }
          if (now >= invulnerableUntilRef.current) {
            remainingLives -= 1;
            livesRef.current = remainingLives;
            invulnerableUntilRef.current = now + 1250;
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
    playerYRef.current = Math.max(0.08, Math.min(0.92, (event.clientY - rect.top) / rect.height));
    setPlayerY(playerYRef.current);
  };

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
          <span><small>SCORE</small><strong>{score.toLocaleString()}</strong></span>
          <span><small>DISTANCE</small><strong>{distance}m</strong></span>
          <span><small>LIVES</small><strong>{"◆".repeat(lives)}<i>{"◇".repeat(MAX_LIVES - lives)}</i></strong></span>
          <span className={styles.demoBalance}><small>DEMO CREDITS</small><strong>{demoCredits}</strong></span>
        </div>

        <div
          className={styles.playfield}
          onPointerDown={(event) => {
            if (phase !== "playing") return;
            event.currentTarget.setPointerCapture(event.pointerId);
            moveWithPointer(event);
          }}
          onPointerMove={(event) => { if (event.buttons || event.pointerType === "touch") moveWithPointer(event); }}
        >
          <div className={styles.speedLines} aria-hidden="true"><i /><i /><i /><i /><i /><i /></div>
          <div className={`${styles.flyer} ${phase === "playing" ? styles.flying : ""}`} style={{ top: `${playerY * 100}%` }} aria-label="Mint Flyer">
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

          {phase === "ready" && (
            <div className={styles.overlay}>
              <small>MSS2 GAME ENTRY · DEMO</small>
              <h2>FLY THE MINT STREAM</h2>
              <p>Each future scored run will require a verified MSS2 payment. This preview simulates that entry without requesting a wallet, signature, or token.</p>
              <div className={styles.entryTerms} aria-label="Future MSS2 game entry terms">
                <span><small>ENTRY ASSET</small><strong>MSS2 REQUIRED</strong></span>
                <span><small>PRICE</small><strong>NOT SET</strong></span>
                <span><small>RECIPIENT</small><strong>{DEVELOPER_WALLET.slice(0, 8)}…{DEVELOPER_WALLET.slice(-6)}</strong></span>
              </div>
              <p className={styles.entryWallet}><b>PROPOSED DEVELOPER RECIPIENT</b><code>{DEVELOPER_WALLET}</code></p>
              <div className={styles.legend}><span><i className={styles.mintDot} /> COLLECT MINTS</span><span><i className={styles.hazardDot} /> AVOID BLOCKS</span></div>
              <button onClick={resetFlight}>SIMULATE MSS2 ENTRY + START</button>
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
                <button className={styles.restartButton} onClick={resetFlight}>↻ START ANOTHER DEMO RUN <small>LIVE VERSION REQUIRES A NEW MSS2 ENTRY</small></button>
              </div>
              {continued && <p className={styles.usedNotice}>The one demo continue for this flight has been used. A new demo run simulates a new MSS2 entry.</p>}
              <section className={styles.lockedPayments} aria-label="Token continue readiness">
                <div><small>FUTURE GAME PAYMENTS</small><strong>LOCKED</strong></div>
                <ul>
                  <li><b>MSS2</b><span>Required for every new scored run. Developer wallet is configured for preview; entry price remains pending.</span></li>
                  <li><b>TOPAZ</b><span>Possible continue option under review; it does not replace the MSS2 entry requirement.</span></li>
                </ul>
                <p>No signature, approval, transfer, or network switch is requested in this preview.</p>
              </section>
            </div>
          )}
        </div>

        <footer className={styles.gameFooter}>
          <span><b>CONTROL</b> DRAG, W/S OR ↑/↓</span>
          <span><b>GOAL</b> COLLECT MINTS + BUILD DISTANCE</span>
          <span><b>ENTRY</b> MSS2 PER SCORED RUN</span>
        </footer>
      </section>

      <section className={styles.demoDisclosure}>
        <div><small>PAY-PER-GAME DEMONSTRATION</small><strong>NO REAL MSS2 IS CHARGED</strong></div>
        <p>Demo credits exist only to test the continue screen. They have no cash value, cannot be purchased, transferred, withdrawn, or redeemed, and do not create an onchain transaction.</p>
        <span>Proposed developer recipient: {DEVELOPER_WALLET}. The developer intends to add proceeds to liquidity manually, but no automatic liquidity action or guarantee is active. Price, refund policy, and backend verification remain unconfirmed.</span>
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
