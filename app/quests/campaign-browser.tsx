"use client";
import { useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { filterQuestPreviews, QUEST_NETWORK_LABELS, type QuestFilter, type QuestNetwork } from "../../lib/quests";
import styles from "./quests.module.css";

const subscribeReady = () => () => {};
const clientReady = () => true;
const serverReady = () => false;

export default function CampaignBrowser() {
  // Server-render the cards, but do not accept filter input before handlers exist.
  const interactive = useSyncExternalStore(subscribeReady, clientReady, serverReady);
  const [query, setQuery] = useState("");
  const [network, setNetwork] = useState<"all" | QuestNetwork>("all");
  const [view, setView] = useState<NonNullable<QuestFilter["view"]>>("all");
  const campaigns = filterQuestPreviews({ query, network, view });
  const reset = () => { setQuery(""); setNetwork("all"); setView("all"); };
  return (
    <section className={styles.directory} aria-labelledby="campaign-heading" aria-busy={!interactive}>
      <div className={styles.sectionHeading}><div><p className={styles.eyebrow}>FIND YOUR NEXT CHALLENGE</p><h2 id="campaign-heading">Explore campaigns</h2></div><span>Concept previews · not open</span></div>
      <div className={styles.filters}>
        <label>Search campaigns<input type="search" disabled={!interactive} maxLength={120} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search by title or topic" /></label>
        <label>Network<select disabled={!interactive} value={network} onChange={(event) => setNetwork(event.target.value as "all" | QuestNetwork)}><option value="all">All networks</option><option value="robinhood">Robinhood Chain</option><option value="arc">Arc</option></select></label>
      </div>
      <div className={styles.views} role="group" aria-label="Campaign status">
        {([["all", "All campaigns"], ["live", "Live"], ["preview", "Previews"]] as const).map(([value, label]) => <button key={value} type="button" disabled={!interactive} aria-pressed={view === value} onClick={() => setView(value)}>{label}</button>)}
      </div>
      <p className={styles.resultCount} role="status" aria-live="polite">{campaigns.length} preview campaign{campaigns.length === 1 ? "" : "s"} shown</p>
      {campaigns.length ? <div className={styles.grid}>{campaigns.map((campaign) => <article className={styles.card} key={campaign.slug}>
        <div className={styles.cardTop}><span className={styles.pill}>PREVIEW</span><span>{campaign.category.toUpperCase()}</span></div>
        <div className={styles.cardMark} aria-hidden="true">{campaign.category === "Learn" ? "01" : "02"}<span>QUEST SERIES</span></div>
        <h3>{campaign.title}</h3><p>{campaign.description}</p>
        <div className={styles.chips}>{campaign.networks.map((chain) => <span key={chain}>{QUEST_NETWORK_LABELS[chain]}</span>)}</div>
        <dl className={styles.cardFacts}><div><dt>Tasks</dt><dd>{campaign.tasks.length} proposed</dd></div><div><dt>Rewards</dt><dd>Not funded</dd></div><div><dt>Launch</dt><dd>Not scheduled</dd></div></dl>
        <Link className={styles.button} href={`/quests/${campaign.slug}`}>Preview campaign <span aria-hidden="true">→</span></Link>
      </article>)}</div> : <div className={styles.empty}><h3>{view === "live" ? "The first live campaign is still ahead." : "No campaigns match these filters."}</h3><p>{view === "live" ? "These concept campaigns are not open. Published points-only pilots, when available, are listed in the participation panel above." : "Try another search or show all campaign previews."}</p><button className={styles.button} type="button" onClick={reset}>Show campaign previews →</button></div>}
    </section>
  );
}
