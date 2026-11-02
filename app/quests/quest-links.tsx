import Link from "next/link";
import styles from "./quests.module.css";

export function QuestSiteNav({ current }: { current: "home" | "arcade" | "quests" }) {
  return (
    <nav className={styles.nav} aria-label="Site sections">
      {([["home", "/", "Home"], ["arcade", "/arcade/lobby", "Arcade"], ["quests", "/quests", "Quests"]] as const).map(([section, href, label]) => (
        <Link key={section} href={href} aria-current={current === section ? "location" : undefined}>{label}</Link>
      ))}
    </nav>
  );
}
export function QuestHomeCard() {
  return (
    <Link href="/quests" className="splashGameChoice splashQuestChoice">
      <span className="splashChoiceBrand"><span className={styles.homeMark} aria-hidden="true">✓</span><small>COMMUNITY QUEST HUB</small></span>
      <strong>MSS2 QUESTS</strong>
      <span className="splashChoiceDescription">Complete challenges. Explore the ecosystem. Earn rewards.</span>
      <b>PREVIEW · NO REWARDS YET</b>
      <span className="splashChoiceNetworks">Browse the upcoming experience</span>
      <em>EXPLORE QUESTS →</em>
    </Link>
  );
}
export function QuestArcadeBanner() {
  return (
    <aside className={styles.banner} aria-label="Discover MSS2 Quests">
      <div><small>MORE WAYS TO PARTICIPATE</small><h2>Discover MSS2 Quests.</h2><p>Preview community challenges. Quest rewards are not live, and arcade rewards stay separate.</p></div>
      <Link className={styles.button} href="/quests">Explore Quests →</Link>
    </aside>
  );
}
