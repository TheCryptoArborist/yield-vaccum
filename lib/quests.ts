/** Preview catalog only. Never use this data as a reward or eligibility ledger. */
export type QuestNetwork = "robinhood" | "arc";
export type QuestTask = Readonly<{
  id: string;
  title: string;
  description: string;
  verification: string;
  href?: string;
  action?: string;
}>;
export type CampaignPreview = Readonly<{
  slug: string;
  title: string;
  category: "Learn" | "Play";
  description: string;
  networks: readonly QuestNetwork[];
  status: "preview";
  rewardStatus: "not-funded";
  rewardAmount: null;
  startsAt: null;
  endsAt: null;
  tasks: readonly QuestTask[];
}>;
export const QUEST_NETWORK_LABELS: Record<QuestNetwork, string> = {
  robinhood: "Robinhood Chain",
  arc: "Arc",
};
export const QUEST_PREVIEWS: readonly CampaignPreview[] = [
  {
    slug: "mss2-first-steps",
    title: "Your first steps in MSS2",
    category: "Learn",
    description: "Get to know the protocol, explore a community utility, and share something useful.",
    networks: ["robinhood", "arc"],
    status: "preview",
    rewardStatus: "not-funded",
    rewardAmount: null,
    startsAt: null,
    endsAt: null,
    tasks: [
      { id: "learn", title: "Learn the essentials", description: "Read the official MSS2 documentation before using the protocol.", verification: "A server-checked knowledge quiz is planned. Opening the documentation is not proof of completion.", href: "https://www.mintstakeshare.com/docs", action: "Read the documentation" },
      { id: "explore", title: "Explore the community arcade", description: "See the available games and review their participation rules. Playing is not required in this preview.", verification: "A qualifying activity must be checked against a trusted game record. A page visit will not count.", href: "/arcade/lobby", action: "Explore the arcade" },
      { id: "contribute", title: "Share useful feedback", description: "The proposed campaign will invite a helpful tip, walkthrough, or piece of feedback.", verification: "Submissions will need moderator approval against published criteria. Submissions are not open yet." },
    ],
  },
  {
    slug: "arcade-explorer",
    title: "Explore the MSS2 Arcade",
    category: "Play",
    description: "Discover the games, understand the rules, and see how verified participation could become a quest.",
    networks: ["robinhood", "arc"],
    status: "preview",
    rewardStatus: "not-funded",
    rewardAmount: null,
    startsAt: null,
    endsAt: null,
    tasks: [
      { id: "rules", title: "Know the arcade rules", description: "Review game entry, competition, and reward information before choosing a game.", verification: "A server-checked knowledge task is planned. Existing arcade rules are unchanged.", href: "/arcade/lobby", action: "Read the arcade rules" },
      { id: "discover", title: "Discover a game", description: "Choose a game to explore. This preview does not require a paid run or award credit for one.", verification: "Any future qualifying run must match the authenticated wallet, campaign dates, and trusted result record.", href: "/arcade/lobby", action: "Browse the games" },
      { id: "feedback", title: "Help improve the experience", description: "The proposed final task is a useful suggestion for the arcade or a clear explanation for another player.", verification: "A moderator will assess submissions when the campaign opens. No submission is being collected now." },
    ],
  },
];
export type QuestFilter = Readonly<{
  query?: string;
  network?: "all" | QuestNetwork;
  view?: "all" | "live" | "preview";
}>;
export function filterQuestPreviews(filter: QuestFilter = {}): readonly CampaignPreview[] {
  if (filter.view === "live") return [];
  const query = (filter.query ?? "").trim().toLowerCase();
  return QUEST_PREVIEWS.filter((campaign) =>
    (!filter.network || filter.network === "all" || campaign.networks.includes(filter.network)) &&
    (!query || `${campaign.title} ${campaign.description} ${campaign.category}`.toLowerCase().includes(query))
  );
}
export function getQuestPreview(slug: string): CampaignPreview | undefined {
  return QUEST_PREVIEWS.find((campaign) => campaign.slug === slug);
}
