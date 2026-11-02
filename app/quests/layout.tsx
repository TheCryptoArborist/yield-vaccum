import type { Metadata } from "next";
import Link from "next/link";
import { QuestSiteNav } from "./quest-links";
import styles from "./quests.module.css";

export const metadata: Metadata = {
  title: "MSS2 Quests | Yield Vaccum",
  description: "Preview the MSS2 community quest hub on Yield Vaccum. Campaign participation and rewards are not live yet.",
  robots: { index: false, follow: true },
  openGraph: { title: "MSS2 Quests | Yield Vaccum", description: "Explore the upcoming community quest hub. Preview only; no funded rewards are available." },
};
export default function QuestLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={styles.page}>
      <a className={styles.skip} href="#quest-content">Skip to quest content</a>
      <div className={styles.shell}>
        <header className={styles.header}>
          <Link className={styles.brand} href="/">YIELD VACCUM<span>THE CRYPTO ARBORIST PRESENTS</span></Link>
          <QuestSiteNav current="quests" />
          <Link className={styles.profileLink} href="/quests/profile">My progress →</Link>
        </header>
        <aside className={styles.notice} aria-label="Preview release notice"><strong>PREVIEW RELEASE</strong><span>Browse the experience. Wallet sign-in, verified progress, points, and reward payouts are not enabled.</span></aside>
        <main id="quest-content">{children}</main>
        <footer className={styles.footer}>An independent community utility. Not affiliated with Galxe. Preview activity earns no tokens, points, or eligibility for future rewards.</footer>
      </div>
    </div>
  );
}
