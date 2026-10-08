"use client";

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { MINT_FLYER_ACHIEVEMENTS, type MintFlyerAchievementId } from "../../lib/mint-flyer-achievements";
import { ensureMintFlyerPlayerKey } from "../../lib/arcade-player";
import type { RewardWalletFields } from "../../lib/mint-flyer-rewards";
import styles from "./mint-flyer-leaderboard.module.css";

type Entry = Partial<RewardWalletFields> & {
  nickname: string;
  bestScore: number;
  bestDistance: number;
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
const GRADE_LABELS = { S: "Elite", A: "Excellent", B: "Strong", C: "Completed" } as const;
const REWARD_DISPLAY_KEY = "yield-vacuum-mint-flyer-show-reward-wallet";

function achievement(id: MintFlyerAchievementId) {
  return MINT_FLYER_ACHIEVEMENTS.find((item) => item.id === id);
}

function AchievementBadges({ ids }: { ids: MintFlyerAchievementId[] }) {
  return (
    <ul className={styles.badgeList} aria-label="Featured achievements">
      {ids.map((id) => {
        const item = achievement(id);
        return item ? (
          <li key={id} className={`${styles.achievementBadge} ${styles[`rarity${item.rarity}`]}`} title={`${item.name}: ${item.description}`}>
            <span aria-hidden="true">{item.icon}</span>
            <span>{item.name}</span>
          </li>
        ) : null;
      })}
    </ul>
  );
}

function RewardWallet({ entry }: { entry: Entry }) {
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState(false);
  if (!entry.displayRewardWallet || !entry.rewardWallet || !entry.rewardWalletVerifiedAt || !entry.rewardNetwork) return null;
  const address = entry.rewardWallet;
  const network = entry.rewardNetwork === "arc" ? "Arc" : "Robinhood";
  const explorer = entry.rewardNetwork === "arc" ? "https://explorer.arc.io" : "https://robinhoodchain.blockscout.com";
  const copy = async () => {
    try { await navigator.clipboard.writeText(address); setCopied(true); setCopyError(false); }
    catch { setCopyError(true); }
  };
  return <div className={styles.rewardWallet}>
    <span><small>✓ VERIFIED REWARD WALLET · {network}</small><button type="button" onClick={() => void copy()} aria-label={`Copy ${entry.nickname}'s ${network} reward wallet`}>{copied ? "COPIED ✓" : "COPY"}</button></span>
    <a href={`${explorer}/address/${address}`} target="_blank" rel="noreferrer"><code>{address}</code></a>
    {copyError && <small role="status">Select the address above to copy it.</small>}
  </div>;
}

export default function MintFlyerLeaderboard({ result, finishPanel }: { result: LeaderboardFlightResult | null; finishPanel: HTMLElement | null }) {
  const [playerKey, setPlayerKey] = useState("");
  const [nickname, setNickname] = useState("");
  const [rememberedNickname, setRememberedNickname] = useState("");
  const [editingName, setEditingName] = useState(false);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [unlocked, setUnlocked] = useState<MintFlyerAchievementId[]>([]);
  const [newAchievements, setNewAchievements] = useState<MintFlyerAchievementId[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedRunId, setSavedRunId] = useState("");
  const [message, setMessage] = useState("");
  const [feedbackRunId, setFeedbackRunId] = useState("");
  const [displayRewardWallet, setDisplayRewardWallet] = useState(false);
  const [showAchievements, setShowAchievements] = useState(false);

  const load = useCallback(async (key: string) => {
    setLoading(true);
    try {
      const response = await fetch(`/api/arcade-leaderboard?playerKey=${encodeURIComponent(key)}`, { cache: "no-store" });
      const data = await response.json() as { entries?: Entry[]; profile?: Entry | null; error?: string };
      if (!response.ok) throw new Error(data.error || "Leaderboard unavailable.");
      setEntries(data.entries ?? []);
      setUnlocked(data.profile?.unlocked ?? []);
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
      setRememberedNickname(storedNickname);
      setDisplayRewardWallet(window.localStorage.getItem(REWARD_DISPLAY_KEY) === "true");
      void load(key);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [load]);

  const submit = async () => {
    if (!result || saving || !playerKey || savedRunId === result.runId) return;
    setFeedbackRunId(result.runId);
    const chosenName = (editingName || !rememberedNickname ? nickname : rememberedNickname).replace(/[^a-zA-Z0-9 _.-]/g, "").trim().slice(0, 22);
    if (chosenName.length < 2) {
      setMessage("Choose a nickname with at least two letters or numbers.");
      return;
    }
    setSaving(true);
    setMessage("");
    try {
      if (!result.paymentId) throw new Error("A verified MSS2 entry payment is required to save this flight.");
      const response = await fetch("/api/arcade-leaderboard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...result, playerKey, nickname: chosenName, displayRewardWallet }),
      });
      const data = await response.json() as { error?: string; newAchievements?: MintFlyerAchievementId[] };
      if (!response.ok) throw new Error(data.error || "Score could not be saved.");
      window.localStorage.setItem(NICKNAME_KEY, chosenName);
      window.localStorage.setItem(REWARD_DISPLAY_KEY, String(displayRewardWallet));
      setNickname(chosenName);
      setRememberedNickname(chosenName);
      setEditingName(false);
      setNewAchievements(data.newAchievements ?? []);
      setSavedRunId(result.runId);
      setMessage(data.newAchievements?.length ? `${data.newAchievements.length} achievement${data.newAchievements.length === 1 ? "" : "s"} unlocked.` : `${result.reachedMoon ? "Moon Run" : "Flight result"} saved to the leaderboard.`);
      await load(playerKey);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Score could not be saved.");
    } finally {
      setSaving(false);
    }
  };

  const focusNickname = useCallback((input: HTMLInputElement | null) => {
    if (input && window.matchMedia("(pointer: fine)").matches) input.focus({ preventScroll: true });
  }, []);
  const achievementProgress = Math.round((unlocked.length / MINT_FLYER_ACHIEVEMENTS.length) * 100);
  const podiumOrder = [1, 0, 2];
  const scoreSaved = Boolean(result && savedRunId === result.runId);
  const finishCard = result ? (
    <form className={styles.finishCard} onSubmit={(event) => { event.preventDefault(); void submit(); }}>
      {rememberedNickname && !editingName ? (
        <div className={styles.savedName}>
          <span><small>LEADERBOARD NAME</small><strong>{rememberedNickname}</strong></span>
          {!scoreSaved && <button type="button" disabled={saving} onClick={() => { setNickname(rememberedNickname); setEditingName(true); }}>Change name</button>}
        </div>
      ) : (
        <label className={styles.nameField}>
          <span>YOUR LEADERBOARD NAME</span>
          <input aria-label="Mint Flyer leaderboard nickname" ref={focusNickname} maxLength={22} value={nickname} onChange={(event) => setNickname(event.target.value)} placeholder="Choose a nickname" disabled={saving} />
          <small>Choose once. We’ll remember it on this browser.</small>
        </label>
      )}
      <button className={styles.saveFlight} type="submit" disabled={saving || scoreSaved || !playerKey}>
        {scoreSaved ? "SAVED TO LEADERBOARD ✓" : saving ? "SAVING…" : "SAVE FLIGHT"}
      </button>
      {!scoreSaved && <label className={styles.rewardChoice}>
        <input type="checkbox" checked={displayRewardWallet} disabled={saving} onChange={(event) => setDisplayRewardWallet(event.target.checked)} />
        <span>Show my verified wallet for direct rewards<small>Uses your payment wallet. No extra signature. Your address will be public. Rewards are discretionary.</small></span>
      </label>}
      {message && feedbackRunId === result.runId && <p className={styles.finishMessage} role="status">{message}</p>}
    </form>
  ) : null;

  return (
    <section id="mint-flyer-leaderboard" className={styles.board} aria-label="Mint Flyer leaderboard and achievements">
      {finishPanel && finishCard && createPortal(finishCard, finishPanel)}
      <header>
        <span><small>MSS2 ARCADE · FLIGHT RANKINGS</small><strong><i aria-hidden="true">🏆</i> Mint Flyer leaderboard</strong><em>Ranked by personal best. Every saved flight counts, including crashes.</em></span>
        <b><i aria-hidden="true" /> BEST FLIGHTS</b>
      </header>

      <div className={styles.boardStats} aria-label="Leaderboard summary">
        <span><small>PILOTS RANKED</small><strong>{entries.length}</strong></span>
        <span><small>TOP SCORE</small><strong>{entries[0]?.bestScore.toLocaleString() ?? "—"}</strong></span>
        <span><small>YOUR BADGES</small><strong>{unlocked.length}<em> / {MINT_FLYER_ACHIEVEMENTS.length}</em></strong></span>
      </div>

      {message && <p className={styles.message} role="status">{message}</p>}
      {newAchievements.length > 0 && <div className={styles.unlocks}>{newAchievements.map((id) => { const item = achievement(id); return item ? <span key={id}><i>{item.icon}</i><b>{item.name}</b></span> : null; })}</div>}

      <section className={styles.rankingArena} aria-label="Mint Flyer rankings">
        <div className={styles.arenaHeading}><span><small>TOP PILOTS</small><strong>Top pilots</strong></span><b>Ranked by best score</b></div>
        {loading ? <div className={styles.loadingCard} role="status">Loading flight rankings…</div> : (
          <div className={styles.podiumGrid}>
            {podiumOrder.map((entryIndex) => {
              const entry = entries[entryIndex];
              const place = entryIndex + 1;
              return (
                <article key={entry ? `${entry.nickname}-${entry.updatedAt}` : `open-${place}`} className={`${styles.podiumCard} ${styles[`place${place}`]}`}>
                  <div className={styles.medal} aria-label={`Rank ${place}`}>{place === 1 ? "👑" : place === 2 ? "★" : "◆"}<b>#{place}</b></div>
                  {entry ? <>
                    <small>{place === 1 ? entry.moonClears > 0 ? "MOON CHAMPION" : "FLIGHT CHAMPION" : "TOP PILOT"}</small>
                    <strong>{entry.nickname}</strong>
                    <div className={styles.podiumScore}>{entry.bestScore.toLocaleString()}<em>PTS</em></div>
                    <span>{entry.bestGrade} · {GRADE_LABELS[entry.bestGrade]} · {entry.bestDistance.toLocaleString()}m BEST · {entry.moonClears} MOON {entry.moonClears === 1 ? "CLEAR" : "CLEARS"}</span>
                    <b className={styles.podiumFlights}>{entry.runs.toLocaleString()} SAVED {entry.runs === 1 ? "FLIGHT" : "FLIGHTS"}</b>
                    <div className={styles.podiumBadges}><AchievementBadges ids={entry.displayedAchievements} /></div>
                    {entry.mss2HeldRounded && <b className={styles.heldBalance}>✓ {entry.mss2HeldRounded} MSS2</b>}
                  </> : <>
                    <small>SEAT AVAILABLE</small>
                    <strong>UNCLAIMED</strong>
                    <div className={styles.openScore}>—</div>
                    <span>FINISH A FLIGHT TO TAKE THIS SPOT</span>
                  </>}
                </article>
              );
            })}
          </div>
        )}

        {!loading && entries.length === 0 && <div className={styles.firstRunChallenge}><i aria-hidden="true">🚀</i><span><small>THE BOARD IS WIDE OPEN</small><strong>BE THE FIRST RANKED PILOT</strong><em>Finish any flight, save your score, and claim the first seat.</em></span><a href="#mint-flyer">Play a flight ↑</a></div>}

        {entries.length > 0 && <div className={styles.table}>
          <div className={styles.tableHead}><span>RANK</span><span>PILOT + BADGES</span><span className={styles.flightColumn}>FLIGHTS</span><span>BEST DISTANCE</span><span>BEST SCORE</span></div>
          {entries.map((entry, index) => (
            <div className={`${styles.row} ${index < 3 ? styles.podium : ""}`} key={`${entry.nickname}-${entry.updatedAt}`}>
              <span className={styles.rank}><i>{index === 0 ? "👑" : index === 1 ? "★" : index === 2 ? "◆" : ""}</i>{index + 1}</span>
              <div className={styles.identity}><strong>{entry.nickname}</strong><AchievementBadges ids={entry.displayedAchievements} /><small>{entry.unlocked.length} BADGES · {entry.totalMints} MINT CREDITS<span className={styles.mobileFlights}> · {entry.runs.toLocaleString()} SAVED {entry.runs === 1 ? "FLIGHT" : "FLIGHTS"}</span></small><RewardWallet entry={entry} />{entry.mss2HeldRounded && <b className={styles.heldBalance}>✓ {entry.mss2HeldRounded} MSS2</b>}</div>
              <span className={styles.flightColumn} title="Saved finished flights, including crashes">{entry.runs.toLocaleString()}</span>
              <span className={styles.clears}><b>{entry.bestDistance.toLocaleString()}m</b><small>{entry.moonClears > 0 ? `${entry.moonClears} MOON ${entry.moonClears === 1 ? "CLEAR" : "CLEARS"}` : "MOON NOT YET REACHED"}</small></span>
              <span className={styles.score}><b>{entry.bestScore.toLocaleString()}</b><small>{entry.bestGrade} · {GRADE_LABELS[entry.bestGrade]}</small></span>
            </div>
          ))}
        </div>}
      </section>

      <div className={styles.achievementSection}>
        <div className={styles.achievementHeading}><span><small>YOUR TROPHY BAY</small><strong>Your achievements</strong><em>Complete daring flights to light up every badge.</em></span><b>{unlocked.length}/{MINT_FLYER_ACHIEVEMENTS.length} UNLOCKED</b></div>
        <button type="button" className={styles.achievementToggle} aria-expanded={showAchievements} aria-controls="mint-flyer-achievement-list" onClick={() => setShowAchievements((open) => !open)}>{showAchievements ? "Hide badges −" : "Explore badges +"}</button>
        <div id="mint-flyer-achievement-list" className={`${styles.achievementBody} ${showAchievements ? styles.achievementBodyOpen : ""}`}>
        <div className={styles.achievementProgress}><i style={{ width: `${achievementProgress}%` }} /><span>{achievementProgress}% COMPLETE</span></div>
        <div className={styles.achievementGrid}>{MINT_FLYER_ACHIEVEMENTS.map((item) => {
          const earned = unlocked.includes(item.id);
          return <article key={item.id} className={`${earned ? styles.earned : styles.locked} ${styles[`rarity${item.rarity}`]}`}><i>{earned ? item.icon : "?"}</i><span><strong>{item.name}</strong><small>{item.description}</small><em>{earned ? `UNLOCKED · ${item.rarity}` : `LOCKED · ${item.rarity}`}</em></span></article>;
        })}</div>
        </div>
      </div>

    </section>
  );
}
