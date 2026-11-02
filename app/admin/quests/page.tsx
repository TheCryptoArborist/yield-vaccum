import type { Metadata } from 'next';
import Link from 'next/link';
import QuestPilotPanel from '../../quests/pilot-panel';
import styles from '../../quests/pilot.module.css';
export const metadata: Metadata = { title: 'MSS2 Quest Administration | Yield Vaccum', robots: { index: false, follow: false } };
export default function QuestAdminPage() {
  return <main className={styles.adminPage}>
    <Link href='/quests'>← Return to MSS2 Quests</Link>
    <header style={{ marginTop: 24 }}>
      <h1 style={{ fontSize: 'clamp(26px, 4vw, 42px)', lineHeight: 1.2 }}>MSS2 Quest Administration</h1>
      <p>Manage points-only campaigns. No token transfers or payouts.</p>
    </header>
    <QuestPilotPanel adminMode/>
  </main>;
}
