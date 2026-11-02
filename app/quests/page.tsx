import CampaignBrowser from "./campaign-browser";
import styles from "./quests.module.css";
export default function QuestsPage() {
  return <>
    <section className={styles.hero}>
      <p className={styles.eyebrow}>MSS2 COMMUNITY QUEST HUB</p>
      <h1>MORE THAN A GAME.<br/><span>YOUR NEXT QUEST.</span></h1>
      <p>Learn the essentials. Explore the ecosystem. Make a useful contribution.</p>
      <div className={styles.heroMeta}><span>Browse without a wallet</span><span>Robinhood Chain + Arc</span><span>Preview only</span></div>
    </section>
    <CampaignBrowser />
    <section className={styles.explainer} aria-labelledby="how-quests-work">
      <h2 id="how-quests-work">The experience we are building</h2>
      <div className={styles.steps}>
        <article><b>01</b><h3>Choose a campaign</h3><p>Review its chain, requirements, closing time, and exact reward rules before joining.</p></article>
        <article><b>02</b><h3>Complete useful tasks</h3><p>Learn, explore, and contribute. Qualifying activity will require verification, not just a click.</p></article>
        <article><b>03</b><h3>Track verified progress</h3><p>Future funded campaigns will show eligibility and payout records separately from arcade rankings.</p></article>
      </div>
    </section>
  </>;
}
