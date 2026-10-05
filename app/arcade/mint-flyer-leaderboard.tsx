"use client";

import { useCallback, useEffect, useState } from "react";
import { MINT_FLYER_ACHIEVEMENTS, type MintFlyerAchievementId } from "../../lib/mint-flyer-achievements";
import styles from "./mint-flyer-leaderboard.module.css";

type Entry = {
  playerKey: string;
  nickname: string;
  bestScore: number;
  bestGrade: "S" | "A" | "B" | "C";
  bestCombo: number;
  totalMints: number;
  runs: number;
  moonClears: number;
  unlocked: MintFlyerAchievementId[];
  displayedAchievements: MintFlyerAchievementId[];
  mss2Held: null;
};

export type LeaderboardFlightResult = {
  runId: string;
  score: number;
  distance: number;
  mintsCollected: number;
  maxCombo: number;
  hits: number;
  lives: number;
  reachedMoon: boolean;
  continued: boolean;
};

const PLAYER_KEY = "yield-vacuum-mint-flyer-player";
const NICKNAME_KEY = "yield-vacuum-mint-flyer-nickname";

function achievement(id: MintFlyerAchievementId) {
  return MINT_FLYER_ACHIEVEMENTS.find((item) => item.id === id);
}

export default function MintFlyerLeaderboard({ result }: { result: LeaderboardFlightResult | null }) {
  const [playerKey, setPlayerKey] = useState("");
  const [nickname, setNickname] = useState("");
  const [entries, setEntries] = useState<Entry[]>([]);
  const [unlocked, setUnlocked] = useState<MintFlyerAchievementId[]>([]);
  const [newAchievements, setNewAchievements] = useState<MintFlyerAchievementId[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedRunId, setSavedRunId] = useState("");
  const [message, setMessage] = useState("");

  const load = useCallback(async (key: string) => {
    setLoading(true);
    try {
      const response = await fetch(`/api/arcade-leaderboard?playerKey=${encodeURIComponent(key)}`, { cache: "no-store" });
      const data = await response.json() as { entries?: Entry[]; profile?: Entry | null; error?: string };
      if (!response.ok) throw new Error(data.error || "Leaderboard unavailable.");
      setEntries(data.entries ?? []);
      setUnlocked(data.profile?.unlocked ?? []);
      setMessage("");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Leaderboard unavailable.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const key = window.localStorage.getItem(PLAYER_KEY) || crypto.randomUUID();
      const storedNickname = window.localStorage.getItem(NICKNAME_KEY) || "";
      window.localStorage.setItem(PLAYER_KEY, key);
      setPlayerKey(key);
      setNickname(storedNickname);
      void load(key);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [load]);

  const submit = async () => {
    if (!result || !result.reachedMoon || saving) return;
    if (nickname.trim().length < 2) {
      setMessage("Choose a nickname with at least two letters or numbers.");
      return;
    }
    setSaving(true);
    setMessage("");
    try {
      const response = await fetch("/api/arcade-leaderboard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...result, playerKey, nickname }),
      });
      const data = await response.json() as { error?: string; newAchievements?: MintFlyerAchievementId[] };
      if (!response.ok) throw new Error(data.error || "Score could not be saved.");
      window.localStorage.setItem(NICKNAME_KEY, nickname.trim());
      setNewAchievements(data.newAchievements ?? []);
      setSavedRunId(result.runId);
      setMessage(data.newAchievements?.length ? `${data.newAchievements.length} achievement${data.newAchievements.length === 1 ? "" : "s"} unlocked.` : "Moon Run saved to the leaderboard.");
      await load(playerKey);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Score could not be saved.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section id="mint-flyer-leaderboard" className={styles.board} aria-label="Mint Flyer leaderboard and achievements">
      <header>
        <span><small>MSS2 ARCADE · PREVIEW BOARD</small><strong>MINT FLYER LEADERBOARD</strong></span>
        <b>BEST MOON RUN</b>
      </header>

      {result?.reachedMoon && (
        <div className={styles.submitCard}>
          <div><small>MOON RUN READY</small><strong>{result.score.toLocaleString()} POINTS · COMBO {result.maxCombo}</strong><span>Save this completed flight and check for new achievements.</span></div>
          <input aria-label="Mint Flyer leaderboard nickname" maxLength={22} value={nickname} onChange={(event) => setNickname(event.target.value)} placeholder="Choose a nickname" />
          <button type="button" onClick={submit} disabled={saving || savedRunId === result.runId}>{savedRunId === result.runId ? "SCORE SAVED ✓" : saving ? "SAVING…" : "SAVE MOON RUN"}</button>
        </div>
      )}

      {message && <p className={styles.message} role="status">{message}</p>}
      {newAchievements.length > 0 && <div className={styles.unlocks}>{newAchievements.map((id) => { const item = achievement(id); return item ? <span key={id}><i>{item.icon}</i><b>{item.name}</b></span> : null; })}</div>}

      <div className={styles.table}>
        <div className={styles.tableHead}><span>RANK</span><span>PLAYER + BADGES</span><span>MOON CLEARS</span><span>BEST</span></div>
        {loading ? <p>LOADING FLIGHT RECORDS…</p> : entries.length === 0 ? <p>NO MOON RUNS RECORDED YET. CLAIM THE FIRST RANK.</p> : entries.map((entry, index) => (
          <div className={`${styles.row} ${index < 3 ? styles.podium : ""}`} key={entry.playerKey}>
            <span className={styles.rank}>{index + 1}</span>
            <span className={styles.identity}><strong>{entry.nickname}</strong><em>{entry.displayedAchievements.map((id) => { const item = achievement(id); return item ? <i key={id} title={`${item.name}: ${item.description}`}>{item.icon}</i> : null; })}</em><small>{entry.unlocked.length} BADGES · {entry.totalMints} MINT CREDITS</small></span>
            <span className={styles.clears}>{entry.moonClears}</span>
            <span className={styles.score}><b>{entry.bestScore.toLocaleString()}</b><small>GRADE {entry.bestGrade}</small></span>
          </div>
        ))}
      </div>

      <div className={styles.achievementSection}>
        <div className={styles.achievementHeading}><span><small>YOUR CABINET</small><strong>MINT FLYER ACHIEVEMENTS</strong></span><b>{unlocked.length}/{MINT_FLYER_ACHIEVEMENTS.length} UNLOCKED</b></div>
        <div className={styles.achievementGrid}>{MINT_FLYER_ACHIEVEMENTS.map((item) => {
          const earned = unlocked.includes(item.id);
          return <article key={item.id} className={earned ? styles.earned : styles.locked}><i>{earned ? item.icon : "?"}</i><span><strong>{item.name}</strong><small>{item.description}</small><em>{earned ? `UNLOCKED · ${item.rarity}` : `LOCKED · ${item.rarity}`}</em></span></article>;
        })}</div>
      </div>

      <footer><b>WALLET DATA IS OFF</b><span>MSS2 held is not displayed until the token deployment, network reads, and player opt-in are verified. Permanent dead-address commitments are not labeled as staking.</span></footer>
    </section>
  );
}
