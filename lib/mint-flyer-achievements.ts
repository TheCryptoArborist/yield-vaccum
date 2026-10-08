export const MINT_FLYER_ACHIEVEMENTS = [
  { id: "first-flight", icon: "🚀", name: "First Flight", description: "Save your first finished flight.", rarity: "COMMON" },
  { id: "moon-reached", icon: "🌕", name: "Moon Reached", description: "Complete all three stages and reach the Moon.", rarity: "RARE" },
  { id: "clean-orbit", icon: "◇", name: "Clean Orbit", description: "Reach the Moon without hitting a corrupted block.", rarity: "EPIC" },
  { id: "last-life-landing", icon: "◆", name: "Last-Life Landing", description: "Reach the Moon with exactly one life remaining.", rarity: "RARE" },
  { id: "combo-pilot", icon: "×10", name: "Combo Pilot", description: "Build a 10-credit combo in one flight.", rarity: "RARE" },
  { id: "combo-commander", icon: "×20", name: "Combo Commander", description: "Build a 20-credit combo in one flight.", rarity: "EPIC" },
  { id: "mint-magnet", icon: "🧲", name: "Mint Magnet", description: "Collect 50 Mint Credits across recorded flights.", rarity: "RARE" },
  { id: "grade-a-pilot", icon: "🌟", name: "Grade A Pilot", description: "Finish a flight with Grade A or better.", rarity: "EPIC" },
  { id: "s-class-flyer", icon: "🏆", name: "S-Class Flyer", description: "Finish a flight with Grade S.", rarity: "LEGENDARY" },
  { id: "moon-regular", icon: "III", name: "Moon Regular", description: "Reach the Moon three times.", rarity: "EPIC" },
  { id: "lunar-legend", icon: "X", name: "Lunar Legend", description: "Reach the Moon ten times.", rarity: "LEGENDARY" },
] as const;

export type MintFlyerAchievementId = (typeof MINT_FLYER_ACHIEVEMENTS)[number]["id"];

export function mintFlyerGrade(score: number) {
  if (score >= 62_000) return "S" as const;
  if (score >= 50_000) return "A" as const;
  if (score >= 40_000) return "B" as const;
  return "C" as const;
}
