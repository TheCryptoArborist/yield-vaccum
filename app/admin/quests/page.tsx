import type { Metadata } from 'next';
import Link from 'next/link';
import QuestPilotPanel from '../../quests/pilot-panel';
import styles from '../../quests/pilot.module.css';
export const metadata: Metadata = { title: 'MSS2 Quest Administration | Yield Vaccum', robots: { index: false, follow: false } };
export default function QuestAdminPage() {
  return <main className={styles.adminPage}><Link href='/quests'>← Return to MSS2 Quests</Link><QuestPilotPanel adminMode/></main>;
}
