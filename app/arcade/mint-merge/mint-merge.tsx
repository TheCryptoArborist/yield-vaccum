"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Direction, MergeState, isOver, move, newGame, validState } from "../../../lib/mint-merge";
import styles from "./mint-merge.module.css";

const STORAGE = "mss2-mint-merge-preview-v1";
const initial = newGame(20261008);
type Session = { current: MergeState; previous: MergeState | null; undoUsed: boolean };

export default function MintMerge() {
  const [session, setSession] = useState<Session>({ current: initial, previous: null, undoUsed: false });
  const [ready, setReady] = useState(false);
  const [best, setBest] = useState(0);
  const [merged, setMerged] = useState<number[]>([]);
  const [notice, setNotice] = useState("Swipe to combine matching tiles.");
  const [confirmReset, setConfirmReset] = useState(false);
  const [storageWarning, setStorageWarning] = useState(false);
  const touch = useRef<{ x: number; y: number; id: number } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // Restore browser-only progress after the server-rendered frame hydrates.
    const frame = requestAnimationFrame(() => {
    try {
      const raw = localStorage.getItem(STORAGE);
      if (raw) {
        const saved = JSON.parse(raw);
        if (validState(saved.current) && (saved.previous === null || validState(saved.previous)) && typeof saved.undoUsed === "boolean") setSession(saved);
        if (Number.isSafeInteger(saved.best) && saved.best >= 0) setBest(saved.best);
      }
    } catch { setStorageWarning(true); }
    setReady(true);
    });
    return () => { cancelAnimationFrame(frame); if (timer.current) clearTimeout(timer.current); };
  }, []);

  useEffect(() => {
    if (!ready) return;
    try { localStorage.setItem(STORAGE, JSON.stringify({ ...session, best })); }
    catch {
      const frame = requestAnimationFrame(() => setStorageWarning(true));
      return () => cancelAnimationFrame(frame);
    }
  }, [session, best, ready]);

  const play = useCallback((direction: Direction) => {
    if (!ready || confirmReset) return;
    const result = move(session.current, direction);
    if (!result.changed) { setNotice("No tiles moved. Try another direction."); return; }
    setSession({ ...session, current: result.state, previous: session.current });
    setBest(value => Math.max(value, result.state.score));
    setMerged(result.merged);
    setNotice(isOver(result.state.board) ? "Board full. No moves remain." : result.merged.length ? `Merged! +${result.state.score - session.current.score} points.` : "Keep building your next merge.");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setMerged([]), 220);
  }, [session, ready, confirmReset]);

  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLElement && event.target.closest("button, a, input, textarea, select")) return;
      const direction = ({ ArrowLeft: "left", ArrowRight: "right", ArrowUp: "up", ArrowDown: "down" } as Record<string, Direction>)[event.key];
      if (direction) { event.preventDefault(); play(direction); }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [play]);

  const over = isOver(session.current.board);
  const highest = Math.max(...session.current.board);
  const reset = () => {
    const seed = crypto.getRandomValues(new Uint32Array(1))[0];
    setSession({ current: newGame(seed), previous: null, undoUsed: false });
    setMerged([]); setConfirmReset(false); setNotice("New board. Make every move count.");
  };

  return <main className={styles.shell}>
    <div className={styles.game}>
      <header className={styles.header}><Link href="/arcade">← MSS2 Arcade</Link><span>GAMEPLAY PREVIEW</span></header>
      <div className={styles.title}><Image src="/mss2-logo-site-colour-dark.png" alt="MintStakeShare 2" width={56} height={56} /><div><p>MSS2 COMMUNITY ARCADE</p><h1>MINT <span>MERGE</span></h1></div></div>
      <p className={styles.tagline}>Small tiles. Big moves. Reach the Moon.</p>
      <div className={styles.stats}><div><span>SCORE</span><strong>{session.current.score.toLocaleString()}</strong></div><div><span>BEST · THIS DEVICE</span><strong>{best.toLocaleString()}</strong></div><div><span>TOP TILE</span><strong>{highest.toLocaleString()}</strong></div></div>
      <div className={styles.boardWrap}>
        <div className={styles.board} role="group" aria-label="Mint Merge board. Swipe or use the arrow buttons to move." tabIndex={0}
          onPointerDown={event => { if (!ready || event.button !== 0) return; touch.current = { x: event.clientX, y: event.clientY, id: event.pointerId }; event.currentTarget.setPointerCapture(event.pointerId); }}
          onPointerCancel={() => { touch.current = null; }}
          onPointerUp={event => { const start = touch.current; touch.current = null; if (!start || start.id !== event.pointerId) return; const dx = event.clientX - start.x, dy = event.clientY - start.y; if (Math.max(Math.abs(dx), Math.abs(dy)) < 24) return; play(Math.abs(dx) > Math.abs(dy) ? dx > 0 ? "right" : "left" : dy > 0 ? "down" : "up"); }}>
          {session.current.board.map((value, i) => <div key={i} className={`${styles.tile} ${value ? styles.filled : ""} ${merged.includes(i) ? styles.merged : ""}`} data-tier={value ? Math.min(Math.log2(value), 11) : 0} aria-label={`Row ${Math.floor(i / 4) + 1}, column ${i % 4 + 1}: ${value || "empty"}`}><span>{value || ""}</span>{value >= 128 && <small>{value >= 2048 ? "MOON" : "MSS2"}</small>}</div>)}
        </div>
        {over && <div className={styles.finished}><strong>RUN COMPLETE</strong><span>{session.current.score.toLocaleString()} points · {session.current.moves} moves</span><button onClick={reset}>New preview run</button>{!session.undoUsed && session.previous && <span>Or use your remaining undo below.</span>}</div>}
      </div>
      <p className={styles.status} role="status">{highest >= 2048 && !over ? "🌙 Moon Mode unlocked — keep merging! " : ""}{notice}</p>
      <div className={styles.actions}><button disabled={!ready || !session.previous || session.undoUsed || confirmReset} onClick={() => { if (!session.previous) return; setSession({ current: session.previous, previous: null, undoUsed: true }); setMerged([]); setNotice("Move undone. Your one undo is used."); }}>↶ {session.undoUsed ? "Undo used" : "Undo · 1 per run"}</button><button disabled={!ready} onClick={() => setConfirmReset(true)}>New run</button><span>{session.current.moves} moves</span></div>
      {confirmReset && <div className={styles.confirm} role="group" aria-label="Confirm new run"><p>End this run and start a new board?</p><button onClick={reset}>Start new run</button><button onClick={() => setConfirmReset(false)}>Keep playing</button></div>}
      <div className={styles.directions} aria-label="Direction controls">{(["left", "up", "down", "right"] as Direction[]).map((direction, i) => <button key={direction} aria-label={`Move ${direction}`} disabled={!ready || over || confirmReset} onClick={() => play(direction)}>{["←", "↑", "↓", "→"][i]}</button>)}</div>
      <p className={styles.help}>Swipe or use arrow keys. Match equal tiles. Each merge scores its new value. Reach <b>2048</b>, then keep going.</p>
      <aside className={styles.preview}><strong>DEVELOPMENT PREVIEW · NO PAYMENT</strong><p>Game values are not token balances or earnings. No wallet connection, token prizes, or leaderboard submissions in this preview.</p><span>Planned paid entry: $1 worth of MSS2 · 20% dead address · 80% community rewards reserve.</span></aside>
      {storageWarning && <p className={styles.warning}>This browser cannot save progress. Keep this tab open to retain your run.</p>}
    </div>
  </main>;
}
