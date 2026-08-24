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

export const MISSION_GRADE_TARGETS = [
  { s: 10_000, a: 7_500 },
  { s: 8_500, a: 6_500 },
  { s: 3_600, a: 3_200 },
  { s: 2_600, a: 2_450 },
  { s: 3_200, a: 3_000 },
  { s: 3_500, a: 3_250 },
  { s: 4_200, a: 3_900 },
] as const;

export type MissionGrade = "S" | "A" | "B" | "C";

export function missionGrade(score: number, mistakes: number, missionIndex = 0): MissionGrade {
  const target = MISSION_GRADE_TARGETS[Math.max(0, Math.min(MISSION_GRADE_TARGETS.length - 1, missionIndex))];
  if (mistakes === 0 && score >= target.s) return "S";
  if (mistakes <= 1 && score >= target.a) return "A";
  if (mistakes <= 3) return "B";
  return "C";
}

export function nextGradeRequirement(score: number, mistakes: number, missionIndex: number) {
  const grade = missionGrade(score, mistakes, missionIndex);
  const target = MISSION_GRADE_TARGETS[Math.max(0, Math.min(MISSION_GRADE_TARGETS.length - 1, missionIndex))];
  if (grade === "S") return { grade, next: null, scoreNeeded: 0, mistakesAllowed: 0, message: "Top grade secured. Replay to raise your personal best and leaderboard position." };
  if (grade === "A") {
    const scoreNeeded = Math.max(0, target.s - score);
    const scoreText = scoreNeeded ? `${scoreNeeded.toLocaleString()} more points` : "enough points";
    return { grade, next: "S" as const, scoreNeeded, mistakesAllowed: 0, message: `Reach ${scoreText} and finish with zero mistakes to earn Grade S.` };
  }
  if (grade === "B") {
    const scoreNeeded = Math.max(0, target.a - score);
    const scoreText = scoreNeeded ? `${scoreNeeded.toLocaleString()} more points` : "the required score";
    return { grade, next: "A" as const, scoreNeeded, mistakesAllowed: 1, message: `Reach ${scoreText} and finish with no more than one mistake to earn Grade A.` };
  }
  return { grade, next: "B" as const, scoreNeeded: 0, mistakesAllowed: 3, message: "Finish the mission with no more than three mistakes to earn Grade B." };
}
