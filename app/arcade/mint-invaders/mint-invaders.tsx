"use client";
import Link from "next/link";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { createBunkers, createInvadersGame, tickInvaders, type InvadersGame } from "../../../lib/mint-invaders";
import styles from "./mint-invaders.module.css";

const sprites = [
  ["00100100", "00011000", "00111100", "01111110", "11011011", "11111111", "10100101", "00100100"],
  ["00011000", "00111100", "01111110", "11011011", "11111111", "00100100", "01011010", "10100101"],
  ["00111100", "01111110", "11111111", "11011011", "11111111", "01000010", "10100101", "01000010"],
];
const alternateSprites = [
  ["00100100", "00011000", "00111100", "01111110", "11011011", "11111111", "01011010", "10000001"],
  ["00011000", "00111100", "01111110", "11011011", "11111111", "01011010", "10100101", "01000010"],
  ["00111100", "01111110", "11111111", "11011011", "11111111", "10100101", "01000010", "10000001"],
];
const melody = [64, 0, 67, 71, 76, 71, 67, 0, 62, 0, 66, 69, 74, 69, 66, 0, 60, 0, 64, 67, 72, 67, 64, 0, 59, 62, 66, 69, 71, 69, 66, 62];
const bossMelody = [64, 67, 70, 71, 76, 71, 70, 67, 62, 65, 68, 69, 74, 69, 68, 65];
const displayBunkers = createBunkers();
const ship = ["0001000", "0011100", "0011100", "0111110", "1111111", "1101011", "1000001"];
function pixels(ctx: CanvasRenderingContext2D, bitmap: string[], x: number, y: number, size: number, color: string) {
  ctx.fillStyle = color;
  bitmap.forEach((row, iy) => [...row].forEach((pixel, ix) => { if (pixel === "1") ctx.fillRect(Math.round(x + (ix - row.length / 2) * size), Math.round(y + (iy - bitmap.length / 2) * size), size, size); }));
}
function draw(ctx: CanvasRenderingContext2D, g: InvadersGame | null, seconds: number) {
  ctx.fillStyle = "#050b19"; ctx.fillRect(0, 0, 560, 640);
  for (let i = 0; i < 75; i++) {
    ctx.fillStyle = i % 3 ? "#264d69" : "#80dbe4";
    ctx.fillRect((i * 173 + 17) % 560, (i * 97) % 640, i % 7 === 0 ? 2 : 1, 2);
  }
  ctx.strokeStyle = "#143142"; ctx.beginPath(); ctx.moveTo(0, 540); ctx.lineTo(560, 540); ctx.stroke();
  ctx.fillStyle = "#58ec9b";
  for (const bunker of g?.bunkers ?? displayBunkers) bunker.cells.forEach((solid, index) => { if (solid) ctx.fillRect(bunker.x + index % 16 * 4, bunker.y + Math.floor(index / 16) * 4, 4, 4); });
  if (!g) {
    sprites.forEach((sprite, i) => pixels(ctx, sprite, 170 + i * 110, 170 + Math.sin(seconds * 2 + i) * 8, 5, ["#00f5d4", "#bb76ff", "#ff6eac"][i]));
    pixels(ctx, ship, 280, 580, 5, "#00f5d4"); return;
  }
  g.enemies.forEach(e => {
    if (e.boss) {
      pixels(ctx, sprites[1], e.x, e.y, 11, "#ff6eac");
      ctx.fillStyle = "#452b48"; ctx.fillRect(e.x - 48, e.y - 46, 96, 4);
      ctx.fillStyle = "#ff6eac"; ctx.fillRect(e.x - 48, e.y - 46, 96 * e.hp / (20 + g.wave * 3), 4);
    } else pixels(ctx, (g.marchStep % 2 ? alternateSprites : sprites)[e.kind], e.x, e.y, 4, ["#00f5d4", "#bb76ff", "#ffba63"][e.kind]);
  });
  g.shots.forEach(b => { ctx.fillStyle = b.enemy ? "#ff6eac" : "#b5fff4"; if (b.enemy) { for (let i = 0; i < 4; i++) ctx.fillRect(b.x + ((i + Math.floor(g.time * 12)) % 2 ? -2 : 1), b.y - 6 + i * 3, 3, 3); } else ctx.fillRect(b.x - 1, b.y - 6, 3, 12); });
  g.drops.forEach(d => { ctx.fillStyle = d.type === "shield" ? "#00f5d4" : "#bb76ff"; ctx.fillRect(d.x - 12, d.y - 12, 24, 24); ctx.fillStyle = "#050b19"; ctx.font = "bold 17px monospace"; ctx.textAlign = "center"; ctx.fillText(d.type === "shield" ? "S" : "2", d.x, d.y + 6); });
  if (g.shield) { ctx.strokeStyle = "#00f5d4"; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(g.x, 580, 27, 0, Math.PI * 2); ctx.stroke(); }
  if (g.time >= g.invincibleUntil || Math.floor(g.time * 12) % 2 === 0) pixels(ctx, ship, g.x, 580, 5, "#00f5d4");
  if (g.nextWaveAt) { ctx.fillStyle = "#b5fff4"; ctx.textAlign = "center"; ctx.font = "bold 25px monospace"; ctx.fillText("WAVE CLEARED", 280, 290); ctx.font = "16px monospace"; ctx.fillText(`NEXT: ${((g.wave + 1) % 4 === 0) ? "MOTHERSHIP" : "WAVE " + (g.wave + 1)}`, 280, 323); }
}
export default function MintInvaders() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const game = useRef<InvadersGame | null>(null);
  const input = useRef({ left: false, right: false, fire: false, targetX: undefined as number | undefined });
  const paused = useRef(false);
  const [phase, setPhase] = useState<"ready" | "playing" | "paused" | "over">("ready");
  const [hud, setHud] = useState({ score: 0, lives: 3, wave: 1, shield: false, double: false, reason: "" });
  const [best, setBest] = useState(0);
  const [sound, setSound] = useState(true);
  const soundEnabled = useRef(true);
  const [music, setMusic] = useState(true);
  const [audioBlocked, setAudioBlocked] = useState(false);
  const musicEnabled = useRef(true);
  const musicStep = useRef(-1);
  const audio = useRef<AudioContext | null>(null);
  const bestRef = useRef(0);
  const beep = (frequency: number, duration = .06, level = .07, voice: OscillatorType = "square") => {
    const a = audio.current;
    if (!a || !soundEnabled.current || a.state !== "running") return;
    const osc = a.createOscillator(); const volume = a.createGain(); osc.type = voice; osc.frequency.value = frequency;
    volume.gain.setValueAtTime(level, a.currentTime); volume.gain.exponentialRampToValueAtTime(.001, a.currentTime + duration);
    osc.connect(volume); volume.connect(a.destination); osc.start(); osc.stop(a.currentTime + duration);
  };
  const enableAudio = () => {
    try {
      if (!audio.current || audio.current.state === "closed") {
        const Audio = window.AudioContext ?? (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!Audio) throw new Error("Audio is unavailable.");
        audio.current = new Audio();
      }
      const context = audio.current;
      void context.resume().then(() => { setAudioBlocked(context.state !== "running"); }).catch(() => setAudioBlocked(true));
    } catch { setAudioBlocked(true); }
  };
  const start = () => {
    enableAudio(); musicStep.current = -1;
    game.current = createInvadersGame(); paused.current = false;
    input.current = { left: false, right: false, fire: false, targetX: undefined };
    setHud({ score: 0, lives: 3, wave: 1, shield: false, double: false, reason: "" }); setPhase("playing"); canvas.current?.focus({ preventScroll: true });
  };
  const pause = () => { if (game.current?.phase === "playing") { paused.current = !paused.current; input.current.fire = false; input.current.left = false; input.current.right = false; input.current.targetX = undefined; setPhase(paused.current ? "paused" : "playing"); if (!paused.current) { enableAudio(); canvas.current?.focus({ preventScroll: true }); } } };
  useEffect(() => {
    try { const value = Number(localStorage.getItem("mint-invaders-preview-best")); if (Number.isSafeInteger(value) && value >= 0) bestRef.current = value; } catch { /* Local best is optional. */ }
    let frame = 0, previous = 0, hudAt = 0;
    const loop = (now: number) => {
      const dt = previous ? (now - previous) / 1000 : 0; previous = now;
      const g = game.current;
      if (g && !paused.current && g.phase === "playing") {
        const oldLives = g.lives, oldScore = g.score, oldShot = g.shootAt, oldMarch = g.marchStep;
        tickInvaders(g, dt, { move: Number(input.current.right) - Number(input.current.left), targetX: input.current.targetX, fire: input.current.fire });
        if (g.lives < oldLives) beep(100, .2); else if (g.score > oldScore) beep(650); else if (g.shootAt > oldShot) beep(240, .025);
        if (g.marchStep > oldMarch) beep([220, 196, 175, 165][g.marchStep % 4], .09, .085, "triangle");
        const beatLength = Math.max(.16, .25 - (g.wave - 1) * .006);
        const step = Math.floor(g.time / beatLength);
        if (musicEnabled.current && step !== musicStep.current && audio.current?.state === "running") {
          musicStep.current = step;
          const tune = g.wave % 4 === 0 ? bossMelody : melody;
          const note = tune[step % tune.length];
          if (note) beep(440 * 2 ** ((note - 69) / 12), beatLength * .65, .035);
          if (step % 4 === 0) { const bass = [40, 38, 36, 35][Math.floor(step / 8) % 4]; beep(440 * 2 ** ((bass - 69) / 12), beatLength * 1.4, .08, "triangle"); }
        }
        if ((g as InvadersGame).phase === "over") {
          setPhase("over"); bestRef.current = Math.max(bestRef.current, g.score);
          try { localStorage.setItem("mint-invaders-preview-best", String(bestRef.current)); } catch { /* Keep session best. */ }
        }
      }
      if (now - hudAt > 100) { hudAt = now; setBest(bestRef.current); if (g) setHud({ score: g.score, lives: g.lives, wave: g.wave, shield: g.shield, double: g.doubleUntil > g.time, reason: g.reason }); }
      const ctx = canvas.current?.getContext("2d"); if (ctx) draw(ctx, g, g?.time ?? now / 1000);
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    const key = (event: KeyboardEvent, down: boolean) => {
      if (!["ArrowLeft", "ArrowRight", "a", "d", "A", "D", " "].includes(event.key)) return;
      if (!game.current || game.current.phase !== "playing" || paused.current || (event.target instanceof Element && event.target.closest("button,a,input"))) return;
      event.preventDefault(); input.current.targetX = undefined;
      if (["ArrowLeft", "a", "A"].includes(event.key)) input.current.left = down;
      if (["ArrowRight", "d", "D"].includes(event.key)) input.current.right = down;
      if (event.key === " ") input.current.fire = down;
    };
    const down = (e: KeyboardEvent) => key(e, true), up = (e: KeyboardEvent) => key(e, false);
    const blur = () => { input.current = { left: false, right: false, fire: false, targetX: undefined }; if (game.current?.phase === "playing") { paused.current = true; setPhase("paused"); } };
    const visibility = () => { if (document.hidden) blur(); };
    window.addEventListener("keydown", down); window.addEventListener("keyup", up); window.addEventListener("blur", blur); document.addEventListener("visibilitychange", visibility);
    return () => { cancelAnimationFrame(frame); window.removeEventListener("keydown", down); window.removeEventListener("keyup", up); window.removeEventListener("blur", blur); document.removeEventListener("visibilitychange", visibility); void audio.current?.close(); audio.current = null; };
  }, []);
  return <main className={styles.page}>
    <header className={styles.header}><Link href="/">← YIELD VACCUM</Link><span>MSS2 COMMUNITY ARCADE</span><Link href="/arcade">MINT FLYER ↗</Link></header>
    <section className={styles.title}><Image src="/mss2-flyer-emblem.png" alt="MSS2" width="60" height="60" /><div><small>DEFEND THE MINT. HOLD THE LINE.</small><h1>MINT <span>INVADERS</span></h1></div><b>GAMEPLAY PREVIEW</b></section>
    <div className={styles.layout}>
      <section className={styles.cabinet} aria-label="Mint Invaders game">
        <div className={styles.hud}><span><small>SCORE</small><b>{hud.score.toLocaleString()}</b></span><span><small>WAVE</small><b>{hud.wave % 4 === 0 ? "BOSS " : ""}{hud.wave.toString().padStart(2, "0")}</b></span><span><small>SHIPS</small><b>{"♥ ".repeat(hud.lives) || "0"}</b></span></div>
        <div className={styles.screen}>
          <canvas ref={canvas} tabIndex={0} width="560" height="640" aria-label="Space shooter: move left and right and fire at incoming invaders" onPointerDown={e => { if (phase !== "playing") return; e.currentTarget.setPointerCapture(e.pointerId); const rect = e.currentTarget.getBoundingClientRect(); input.current.targetX = (e.clientX - rect.left) / rect.width * 560; input.current.fire = true; }} onPointerMove={e => { if (phase !== "playing" || !e.currentTarget.hasPointerCapture(e.pointerId)) return; const rect = e.currentTarget.getBoundingClientRect(); input.current.targetX = (e.clientX - rect.left) / rect.width * 560; }} onPointerUp={() => { input.current.fire = false; }} onPointerCancel={() => { input.current.fire = false; }} />
          {phase !== "playing" && <div className={styles.overlay}><small>{phase === "ready" ? "SECTOR 02 · MSS2" : phase === "paused" ? "TAKE A BREATHER" : "MISSION REPORT"}</small><h2>{phase === "ready" ? <>THE MINT<br />NEEDS YOU.</> : phase === "paused" ? "PAUSED" : "GAME OVER"}</h2><p>{phase === "ready" ? "Three ships. Endless waves. One defense line." : phase === "paused" ? "Your wave is waiting. Resume when ready." : hud.reason}</p>{phase === "over" && <strong>{hud.score.toLocaleString()} POINTS · WAVE {hud.wave}</strong>}<button onClick={phase === "paused" ? pause : start}>{phase === "ready" ? "START PREVIEW" : phase === "paused" ? "RESUME GAME" : "PLAY AGAIN"} →</button><span>No wallet or payment in this preview.</span></div>}
        </div>
        <div className={styles.console}><span>{hud.shield ? "◈ SHIELD READY" : hud.double ? "✦ DOUBLE SHOT ACTIVE" : "DRAG TO MOVE + FIRE"}</span><button disabled={phase !== "playing" && phase !== "paused"} onClick={pause}>{phase === "paused" ? "RESUME" : "PAUSE"}</button><button aria-pressed={music} onClick={() => { musicEnabled.current = !music; setMusic(!music); if (!music) enableAudio(); if (phase === "playing") canvas.current?.focus({ preventScroll: true }); }}>{music ? "MUSIC ON" : "MUSIC OFF"}</button><button aria-pressed={sound} onClick={() => { const enabled = audioBlocked || !sound; soundEnabled.current = enabled; setSound(enabled); if (enabled) enableAudio(); if (phase === "playing") canvas.current?.focus({ preventScroll: true }); }}>{audioBlocked ? "ENABLE AUDIO" : sound ? "SOUND ON" : "SOUND OFF"}</button></div>
        {audioBlocked && <p className={styles.audioNotice} role="status">Audio needs another tap to start. Select Enable Audio, and check your device volume.</p>}
      </section>
      <aside className={styles.side}>
        <article><small>YOUR NEXT HIGH SCORE</small><h2>CLASSIC ARCADE.<br /><span>MSS2 ENERGY.</span></h2><p>Aliens march sideways in steps, drop toward your ship at the edges, and speed up as you thin their ranks. Shelter beneath four destructible bunkers. A mothership arrives every fourth wave.</p><div className={styles.best}><span>LOCAL BEST</span><b>{best.toLocaleString()}</b></div></article>
        <article><small>FLIGHT MANUAL</small><h3>MOVE. FIRE. SURVIVE.</h3><p><b>Desktop:</b> A/D or ←/→ to move. Hold Space to fire.</p><p><b>Mobile:</b> Press and drag inside the game to move and fire together.</p><p><b>Pause:</b> Use the button below the game. Switching tabs pauses your run.</p><p><b>Audio:</b> Music and effects start when you press Play. Music has its own switch; Sound mutes everything.</p><div className={styles.power}><b>FOUR DEFENSE BUNKERS</b><span>Enemy shots chip them away. Your shots carve firing lanes from below. Descending aliens can crush them.</span><b>S · SHIELD</b><span>Absorbs one enemy hit.</span><b>2 · DOUBLE SHOT</b><span>Two shots for eight seconds.</span></div></article>
        <article className={styles.preview}><small>FIRST PLAYABLE BUILD</small><h3>TRY THE GAMEPLAY</h3><p>This preview records only your local best. Paid entry, public rankings, and community rewards are not active here.</p><p>Planned entry: <b>$1 worth of MSS2</b> on Robinhood Chain or Arc, with 20% to the dead address and 80% to the community rewards reserve.</p></article>
      </aside>
    </div>
    <footer className={styles.footer}>MINT INVADERS · ORIGINAL MSS2 ARCADE GAME · GAMEPLAY PREVIEW</footer>
  </main>;
}
