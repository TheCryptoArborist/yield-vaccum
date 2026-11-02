import type { Metadata } from "next";
import Link from "next/link";
import styles from "../quests.module.css";
export const metadata: Metadata = { title: "My progress | MSS2 Quests Preview" };
export default function QuestProfilePage() {
  return <section className={styles.profile}><p className={styles.eyebrow}>YOUR QUEST JOURNEY</p><h1>Your progress belongs here.</h1><p>Wallet-backed progress is not enabled in this preview. No wallet is connected to Quests, and no points, completions, or rewards are being recorded here.</p><div className={styles.profilePlan}><h2>Planned for the verified release</h2><p>Completed tasks, campaign eligibility, non-transferable points, and confirmed payout records—all kept separate from arcade scores and reward reserves.</p></div><p className={styles.muted}>Connecting a wallet elsewhere on this site does not authenticate a Quests profile. The next stage must verify wallet ownership on the server before accepting campaign activity.</p><Link className={styles.button} href="/quests">Explore campaign previews →</Link></section>;
}
