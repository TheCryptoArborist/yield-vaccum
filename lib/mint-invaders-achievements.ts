export type InvadersProgress = { runs: number; wave: number; score: number; kills: number; bossKills: number; pickups: number; networks: number };
export const INVADERS_ACHIEVEMENTS = [
  { id:"first-contact", name:"First Contact", description:"Finish and save your first paid game.", metric:"runs", target:1, unit:"games", icon:"target", tone:"mint" },
  { id:"hold-the-line", name:"Hold the Line", description:"Clear the first wave and reach Wave 2.", metric:"wave", target:2, unit:"wave", icon:"shield", tone:"mint" },
  { id:"fleet-breaker", name:"Fleet Breaker", description:"Reach the first mothership at Wave 4.", metric:"wave", target:4, unit:"wave", icon:"fleet", tone:"purple" },
  { id:"mothership-down", name:"Mothership Down", description:"Destroy your first mothership.", metric:"bossKills", target:1, unit:"bosses", icon:"boss", tone:"purple" },
  { id:"deep-space", name:"Deep Space", description:"Survive to Wave 9.", metric:"wave", target:9, unit:"wave", icon:"orbit", tone:"gold" },
  { id:"centurion", name:"Centurion", description:"Destroy 100 aliens across saved games.", metric:"kills", target:100, unit:"aliens", icon:"crosshair", tone:"mint" },
  { id:"power-collector", name:"Power Collector", description:"Collect 5 power-ups across saved games.", metric:"pickups", target:5, unit:"pickups", icon:"bolt", tone:"purple" },
  { id:"ten-k-club", name:"10K Club", description:"Score 10,000 points in one game.", metric:"score", target:10000, unit:"points", icon:"star", tone:"mint" },
  { id:"sector-ace", name:"Sector Ace", description:"Score 25,000 points in one game.", metric:"score", target:25000, unit:"points", icon:"wings", tone:"purple" },
  { id:"galactic-legend", name:"Galactic Legend", description:"Score 50,000 points in one game.", metric:"score", target:50000, unit:"points", icon:"crown", tone:"gold" },
  { id:"arcade-veteran", name:"Arcade Veteran", description:"Save 10 paid games.", metric:"runs", target:10, unit:"games", icon:"medal", tone:"gold" },
  { id:"two-fronts", name:"Two Fronts", description:"Save a paid game on both Robinhood Chain and Arc.", metric:"networks", target:2, unit:"networks", icon:"link", tone:"purple" },
] as const;
export type InvadersAchievementId = typeof INVADERS_ACHIEVEMENTS[number]["id"];
export const emptyInvadersProgress: InvadersProgress = {runs:0,wave:0,score:0,kills:0,bossKills:0,pickups:0,networks:0};
export function invadersAchievements(progress: InvadersProgress): InvadersAchievementId[] {
  return INVADERS_ACHIEVEMENTS.filter(achievement=>progress[achievement.metric]>=achievement.target).map(achievement=>achievement.id);
}
