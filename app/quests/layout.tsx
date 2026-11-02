import type { Metadata } from 'next';
import Link from 'next/link';
import { QuestSiteNav } from './quest-links';
import styles from './quests.module.css';
export const metadata: Metadata = {
  title: 'MSS2 Quests | Yield Vaccum',
  description: 'Explore MSS2 community quests and administrator-operated points-only pilot campaigns. No token rewards or payouts are enabled.',
  robots: { index: false, follow: true },
  openGraph: { title: 'MSS2 Quests | Yield Vaccum', description: 'Learn, contribute, and track verified participation when pilot campaigns open. Points only; no token rewards.' },
};
export default function QuestLayout({ children }: { children: React.ReactNode }) {
  return <div className={styles.page}><a className={styles.skip} href='#quest-content'>Skip to quest content</a><div className={styles.shell}>
    <header className={styles.header}><Link className={styles.brand} href='/'>YIELD VACCUM<span>THE CRYPTO ARBORIST PRESENTS</span></Link><QuestSiteNav current='quests'/><Link className={styles.profileLink} href='/quests/profile'>My progress →</Link></header>
    <aside className={styles.notice} aria-label='Staged release notice'><strong>STAGED RELEASE · POINTS ONLY</strong><span>Participation opens only when an administrator publishes an enabled pilot campaign. No token rewards or payouts.</span></aside>
    <main id='quest-content'>{children}</main>
    <footer className={styles.footer}>An independent community utility. Not affiliated with Galxe. Concept previews confer no points or eligibility. Published pilot campaigns award only non-transferable participation points, never a promise of future token rewards.</footer>
  </div></div>;
}
