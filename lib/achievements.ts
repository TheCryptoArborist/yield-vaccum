export const ACHIEVEMENTS = [
  { id: "route-master", icon: "🧭", name: "Route Master", description: "Clear Swap Route with zero mistakes.", rarity: "RARE" },
  { id: "perfect-balance", icon: "⚖", name: "Perfect Balance", description: "Clear LP Lab with zero mistakes.", rarity: "RARE" },
  { id: "diamond-lock", icon: "◆", name: "Diamond Lock", description: "Clear Lock Power with zero mistakes.", rarity: "RARE" },
  { id: "gauge-strategist", icon: "◉", name: "Gauge Strategist", description: "Clear Gauge Vote with zero reallocations.", rarity: "RARE" },
  { id: "volume-hunter", icon: "≈", name: "Volume Hunter", description: "Clear Fee Vacuum with every decision correct.", rarity: "RARE" },
  { id: "incentive-inspector", icon: "▣", name: "Incentive Inspector", description: "Clear Incentive Rush with zero misroutes.", rarity: "RARE" },
  { id: "epoch-expert", icon: "↻", name: "Epoch Expert", description: "Clear Epoch Flip with zero order errors.", rarity: "RARE" },
  { id: "topaz-scholar", icon: "✦", name: "Topaz Scholar", description: "Clear all seven educational missions.", rarity: "EPIC" },
  { id: "yield-champion", icon: "★", name: "Yield Champion", description: "Earn an S grade on all seven missions.", rarity: "LEGENDARY" },
  { id: "epoch-veteran", icon: "III", name: "Epoch Veteran", description: "Complete the campaign in three weekly epochs.", rarity: "LEGENDARY" },
] as const;

export type AchievementId = (typeof ACHIEVEMENTS)[number]["id"];

export const MISSION_ACHIEVEMENTS: AchievementId[] = [
  "route-master",
  "perfect-balance",
  "diamond-lock",
  "gauge-strategist",
  "volume-hunter",
  "incentive-inspector",
  "epoch-expert",
];

export function achievementById(id: string) {
  return ACHIEVEMENTS.find((achievement) => achievement.id === id);
}

export function missionGrade(score: number, mistakes: number) {
  if (mistakes === 0 && score >= 2500) return "S";
  if (mistakes <= 1 && score >= 1800) return "A";
  if (mistakes <= 3) return "B";
  return "C";
}
