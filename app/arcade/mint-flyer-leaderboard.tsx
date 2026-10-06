"use client";

import { useCallback, useEffect, useState } from "react";
import { MINT_FLYER_ACHIEVEMENTS, type MintFlyerAchievementId } from "../../lib/mint-flyer-achievements";
import { ensureMintFlyerPlayerKey } from "../../lib/arcade-player";
import styles from "./mint-flyer-leaderboard.module.css";

type Entry = {
  nickname: string;
  bestScore: number;
  bestGrade: "S" | "A" | "B" | "C";
  bestCombo: number;
  totalMints: number;
  runs: number;
  moonClears: number;
  unlocked: MintFlyerAchievementId[];
  displayedAchievements: MintFlyerAchievementId[];
  displayMss2Balance?: boolean;
  mss2HeldRounded?: string | null;
  mss2BalanceCheckedAt?: string | null;
  mss2WalletVerifiedAt?: string | null;
  updatedAt: string;
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
  paymentId?: string;
  runAuthorizationId?: string;
  entryNetwork: "robinhood" | "arc";
};

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
      const key = ensureMintFlyerPlayerKey();
      const storedNickname = window.localStorage.getItem(NICKNAME_KEY) || "";
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

  const achievementProgress = Math.round((unlocked.length / MINT_FLYER_ACHIEVEMENTS.length) * 100);
  const podiumOrder = [1, 0, 2];

  return (
    <section id="mint-flyer-leaderboard" className={styles.board} aria-label="Mint Flyer leaderboard and achievements">
      <header>
        <span><small>MSS2 ARCADE · MOON RANKINGS</small><strong><i aria-hidden="true">🏆</i> MINT FLYER LEADERBOARD</strong><em>Fly farther. Stack combos. Own the Moon.</em></span>
        <b><i aria-hidden="true" /> BEST MOON RUNS</b>
      </header>

      <div className={styles.boardStats} aria-label="Leaderboard summary">
        <span><small>PILOTS RANKED</small><strong>{entries.length}</strong></span>
        <span><small>TOP SCORE</small><strong>{entries[0]?.bestScore.toLocaleString() ?? "—"}</strong></span>
        <span><small>YOUR BADGES</small><strong>{unlocked.length}<em> / {MINT_FLYER_ACHIEVEMENTS.length}</em></strong></span>
      </div>

      {result?.reachedMoon && (
        <div className={styles.submitCard}>
          <div><small>MOON RUN READY</small><strong>{result.score.toLocaleString()} POINTS · COMBO {result.maxCombo}</strong><span>Save this completed flight and check for new achievements.</span></div>
          <input aria-label="Mint Flyer leaderboard nickname" maxLength={22} value={nickname} onChange={(event) => setNickname(event.target.value)} placeholder="Choose a nickname" />
          <button type="button" onClick={submit} disabled={saving || savedRunId === result.runId}>{savedRunId === result.runId ? "SCORE SAVED ✓" : saving ? "SAVING…" : "SAVE MOON RUN"}</button>
        </div>
      )}

      {message && <p className={styles.message} role="status">{message}</p>}
      {newAchievements.length > 0 && <div className={styles.unlocks}>{newAchievements.map((id) => { const item = achievement(id); return item ? <span key={id}><i>{item.icon}</i><b>{item.name}</b></span> : null; })}</div>}

      <section className={styles.rankingArena} aria-label="Mint Flyer rankings">
        <div className={styles.arenaHeading}><span><small>TOP PILOTS</small><strong>MOON PODIUM</strong></span><b>WEEKLY GLORY · PERSONAL BESTS</b></div>
        {loading ? <div className={styles.loadingCard}>SCANNING THE FLIGHT LOG…</div> : (
          <div className={styles.podiumGrid}>
            {podiumOrder.map((entryIndex) => {
              const entry = entries[entryIndex];
              const place = entryIndex + 1;
              return (
                <article key={entry ? `${entry.nickname}-${entry.updatedAt}` : `open-${place}`} className={`${styles.podiumCard} ${styles[`place${place}`]}`}>
                  <div className={styles.medal} aria-label={`Rank ${place}`}>{place === 1 ? "👑" : place === 2 ? "★" : "◆"}<b>#{place}</b></div>
                  {entry ? <>
                    <small>{place === 1 ? "MOON CHAMPION" : "TOP PILOT"}</small>
                    <strong>{entry.nickname}</strong>
                    <div className={styles.podiumScore}>{entry.bestScore.toLocaleString()}<em>PTS</em></div>
                    <span>GRADE {entry.bestGrade} · {entry.moonClears} MOON {entry.moonClears === 1 ? "CLEAR" : "CLEARS"}</span>
                    <div className={styles.podiumBadges}>{entry.displayedAchievements.map((id) => { const item = achievement(id); return item ? <i key={id} title={`${item.name}: ${item.description}`}>{item.icon}</i> : null; })}</div>
                    {entry.mss2HeldRounded && <b className={styles.heldBalance}>✓ {entry.mss2HeldRounded} MSS2</b>}
                  </> : <>
                    <small>SEAT AVAILABLE</small>
                    <strong>UNCLAIMED</strong>
                    <div className={styles.openScore}>—</div>
                    <span>REACH THE MOON TO TAKE THIS SPOT</span>
                  </>}
                </article>
              );
            })}
          </div>
        )}

        {!loading && entries.length === 0 && <div className={styles.firstRunChallenge}><i aria-hidden="true">🚀</i><span><small>THE BOARD IS WIDE OPEN</small><strong>BE THE FIRST PILOT ON THE MOON</strong><em>Complete a Moon Run, save your score, and claim the crown.</em></span><b>CLAIM #1</b></div>}

        {entries.length > 0 && <div className={styles.table}>
          <div className={styles.tableHead}><span>RANK</span><span>PILOT + BADGES</span><span>MOON CLEARS</span><span>BEST SCORE</span></div>
          {entries.map((entry, index) => (
            <div className={`${styles.row} ${index < 3 ? styles.podium : ""}`} key={`${entry.nickname}-${entry.updatedAt}`}>
              <span className={styles.rank}><i>{index === 0 ? "👑" : index === 1 ? "★" : index === 2 ? "◆" : ""}</i>{index + 1}</span>
              <span className={styles.identity}><strong>{entry.nickname}</strong><em>{entry.displayedAchievements.map((id) => { const item = achievement(id); return item ? <i key={id} title={`${item.name}: ${item.description}`}>{item.icon}</i> : null; })}</em><small>{entry.unlocked.length} BADGES · {entry.totalMints} MINT CREDITS</small>{entry.mss2HeldRounded && <b className={styles.heldBalance}>✓ {entry.mss2HeldRounded} MSS2</b>}</span>
              <span className={styles.clears}><b>{entry.moonClears}</b><small>MOON RUNS</small></span>
              <span className={styles.score}><b>{entry.bestScore.toLocaleString()}</b><small>GRADE {entry.bestGrade}</small></span>
            </div>
          ))}
        </div>}
      </section>

      <div className={styles.achievementSection}>
        <div className={styles.achievementHeading}><span><small>YOUR TROPHY BAY</small><strong>MINT FLYER ACHIEVEMENTS</strong><em>Complete daring flights to light up every badge.</em></span><b>{unlocked.length}/{MINT_FLYER_ACHIEVEMENTS.length} UNLOCKED</b></div>
        <div className={styles.achievementProgress}><i style={{ width: `${achievementProgress}%` }} /><span>{achievementProgress}% COMPLETE</span></div>
        <div className={styles.achievementGrid}>{MINT_FLYER_ACHIEVEMENTS.map((item) => {
          const earned = unlocked.includes(item.id);
          return <article key={item.id} className={`${earned ? styles.earned : styles.locked} ${styles[`rarity${item.rarity}`]}`}><i>{earned ? item.icon : "?"}</i><span><strong>{item.name}</strong><small>{item.description}</small><em>{earned ? `UNLOCKED · ${item.rarity}` : `LOCKED · ${item.rarity}`}</em></span></article>;
        })}</div>
      </div>

    </section>
  );
}
