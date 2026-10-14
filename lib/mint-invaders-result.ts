export type InvadersResult = { score: number; wave: number; kills: number; bossKills: number; pickups: number; seconds: number };
export function validateInvadersResult(value: InvadersResult) {
  const ranges: [keyof InvadersResult, number, number][] = [["score",0,100_000_000],["wave",1,500],["kills",0,22_500],["bossKills",0,125],["pickups",0,22_625],["seconds",1,36_000]];
  if (ranges.some(([key,min,max]) => !Number.isSafeInteger(value[key]) || value[key] < min || value[key] > max)) throw new Error("Invalid Invaders result.");
  const completed = value.wave - 1;
  const completedBosses = Math.floor(completed / 4);
  const completedNormal = completed - completedBosses;
  const normalMax = 45 * (completedNormal + (value.wave % 4 ? 1 : 0));
  if (value.kills < 45 * completedNormal || value.kills > normalMax || value.bossKills < completedBosses || value.bossKills > Math.floor(value.wave / 4) || value.pickups > value.kills + value.bossKills) throw new Error("Inconsistent Invaders wave results.");
  const expected = value.kills * 100 + value.bossKills * 1500 + completed * (completed + 1) / 2 * 150 + value.pickups * 50;
  if (value.score !== expected) throw new Error("Inconsistent Invaders score.");
}
