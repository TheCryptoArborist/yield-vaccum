import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getQuestPreview, QUEST_PREVIEWS, QUEST_NETWORK_LABELS } from "../../../lib/quests";
import styles from "../quests.module.css";
type Props = { params: Promise<{ slug: string }> };
export function generateStaticParams() { return QUEST_PREVIEWS.map(({ slug }) => ({ slug })); }
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const campaign = getQuestPreview((await params).slug);
  return { title: campaign ? `${campaign.title} | MSS2 Quests Preview` : "Campaign not found | MSS2 Quests" };
}
export default async function CampaignPage({ params }: Props) {
  const campaign = getQuestPreview((await params).slug);
  if (!campaign) notFound();
  return <>
    <Link className={styles.back} href="/quests">← All campaigns</Link>
    <section className={styles.detailHero}><span className={styles.pill}>CAMPAIGN PREVIEW</span><h1>{campaign.title}</h1><p>{campaign.description}</p><div className={styles.chips}>{campaign.networks.map((chain) => <span key={chain}>{QUEST_NETWORK_LABELS[chain]} · planned</span>)}</div></section>
    <div className={styles.detailGrid}>
      <section aria-labelledby="task-heading"><h2 id="task-heading">Proposed tasks</h2><p className={styles.muted}>These are examples, not an open campaign. Exploring the links does not record completion or qualify you for a reward.</p><ol className={styles.tasks}>{campaign.tasks.map((task, index) => <li key={task.id}><span className={styles.taskNumber} aria-hidden="true">{String(index + 1).padStart(2, "0")}</span><div><span className={styles.taskStatus}>NOT OPEN</span><h3>{task.title}</h3><p>{task.description}</p><details><summary>How verification is planned</summary><p>{task.verification}</p></details>{task.href && task.action && (task.href.startsWith("/") ? <Link className={styles.textLink} href={task.href}>{task.action} →</Link> : <a className={styles.textLink} href={task.href} target="_blank" rel="noopener noreferrer">{task.action} ↗<span className={styles.srOnly}> (opens in a new tab)</span></a>)}</div></li>)}</ol></section>
      <aside className={styles.rewardPanel} aria-labelledby="reward-heading"><p className={styles.eyebrow}>CAMPAIGN STATUS</p><h2 id="reward-heading">Preview. Not funded.</h2><p>No MSS2, points, or badges can be earned from this preview.</p><dl><div><dt>Participation</dt><dd>Not open</dd></div><div><dt>Reward budget</dt><dd>Not funded</dd></div><div><dt>Start / deadline</dt><dd>Not scheduled</dd></div><div><dt>Payout method</dt><dd>Not configured</dd></div></dl><h3>Before a campaign goes live</h3><p>Its rules must identify the supported chain, trusted verification method, funding evidence, participation limit, deadline, and payout process.</p><p>Any permanent-stake reward must be clearly disclosed before entry. It is not a withdrawable token payment.</p><Link className={styles.button} href="/quests">Explore other previews →</Link></aside>
    </div>
  </>;
}
