import CampaignBrowser from './campaign-browser';
import QuestPilotPanel from './pilot-panel';
import styles from './quests.module.css';
export default function QuestsPage() {
  return <><section className={styles.hero}><p className={styles.eyebrow}>MSS2 COMMUNITY QUEST HUB</p><h1>MORE THAN A GAME.<br/><span>YOUR NEXT QUEST.</span></h1><p>Learn the essentials. Explore the ecosystem. Make a useful contribution.</p><div className={styles.heroMeta}><span>Browse without a wallet</span><span>Robinhood Chain + Arc</span><span>Points-only pilot</span></div></section>
    <QuestPilotPanel/>
    <section aria-labelledby='quest-concepts'><h2 id='quest-concepts'>Concept previews · not open for participation</h2><CampaignBrowser/></section>
    <section className={styles.explainer} aria-labelledby='how-quests-work'><h2 id='how-quests-work'>How pilot participation works</h2><div className={styles.steps}><article><b>01</b><h3>Choose a published campaign</h3><p>Review its network, requirements, dates, and points-only rules before joining.</p></article><article><b>02</b><h3>Verify your wallet</h3><p>Sign a readable sign-in message. Complete the server-checked quiz and submit a useful contribution for review.</p></article><article><b>03</b><h3>Track approved progress</h3><p>Task decisions and participation points stay separate from arcade rankings. No tokens are distributed.</p></article></div></section></>;
}
