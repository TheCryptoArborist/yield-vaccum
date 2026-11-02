import Link from "next/link";
import styles from "./quests.module.css";
export default function QuestNotFound() { return <section className={styles.empty}><h1>Campaign not found.</h1><p>This campaign is unavailable or the link is incorrect.</p><Link className={styles.button} href="/quests">Back to Quests →</Link></section>; }
