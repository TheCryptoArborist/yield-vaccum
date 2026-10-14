export const INVADERS_WIDTH = 560;
export const INVADERS_HEIGHT = 640;
export type Invader = { x: number; y: number; hp: number; boss: boolean; kind: number };
export type Shot = { x: number; y: number; vx: number; vy: number; enemy: boolean };
export type Bunker = { x: number; y: number; cells: boolean[] };
export function createBunkers(): Bunker[] {
  return [84, 214, 344, 474].map(center => ({ x: center - 32, y: 474, cells: Array.from({ length: 160 }, (_, index) => { const row = Math.floor(index / 16), col = index % 16; return !(row === 0 && (col < 3 || col > 12) || row === 1 && (col < 1 || col > 14) || row >= 6 && col >= 5 && col <= 10); }) }));
}
export type Drop = { x: number; y: number; type: "shield" | "double" };
export type InvadersGame = {
  phase: "playing" | "over"; reason: string; time: number; wave: number; score: number; lives: number;
  x: number; enemies: Invader[]; shots: Shot[]; drops: Drop[]; direction: number;
  shootAt: number; enemyAt: number; invincibleUntil: number; doubleUntil: number;
  kills: number; bossKills: number; pickups: number; shield: boolean; nextWaveAt: number; seed: number; bunkers: Bunker[]; marchAt: number; marchStep: number; formationSize: number;
};
function random(g: InvadersGame) { g.seed = (Math.imul(g.seed, 1664525) + 1013904223) >>> 0; return g.seed / 4294967296; }
function spawn(g: InvadersGame) {
  g.shots = []; g.direction = 1;
  if (g.wave % 4 === 0) g.enemies = [{ x: 280, y: 92, hp: 20 + g.wave * 3, boss: true, kind: 3 }];
  else {
    g.enemies = [];
    for (let row = 0; row < 5; row++) for (let col = 0; col < 9; col++) g.enemies.push({ x: 72 + col * 52, y: 80 + row * 38, hp: 1, boss: false, kind: row === 0 ? 0 : row < 3 ? 1 : 2 });
  }
  g.enemyAt = g.time + 1.5; g.nextWaveAt = 0; g.formationSize = g.enemies.length; g.marchAt = g.time + .7; g.marchStep = 0;
}
export function createInvadersGame(seed = Date.now()): InvadersGame {
  const g: InvadersGame = { phase: "playing", reason: "", time: 0, wave: 1, score: 0, lives: 3, x: 280, enemies: [], shots: [], drops: [], direction: 1, shootAt: 0, enemyAt: 1.5, invincibleUntil: 1.5, doubleUntil: 0, kills: 0, bossKills: 0, pickups: 0, shield: false, nextWaveAt: 0, seed: seed >>> 0, bunkers: createBunkers(), marchAt: .7, marchStep: 0, formationSize: 45 };
  spawn(g); return g;
}
export function tickInvaders(g: InvadersGame, seconds: number, input: { move: number; targetX?: number; fire: boolean }) {
  if (g.phase !== "playing") return;
  const dt = Math.max(0, Math.min(seconds, .04)); g.time += dt;
  g.x = Math.max(22, Math.min(538, input.targetX === undefined ? g.x + input.move * 260 * dt : input.targetX));
  if (g.nextWaveAt) {
    if (g.time >= g.nextWaveAt) { g.wave++; spawn(g); }
  } else {
    const boss = g.enemies[0]?.boss;
    if (boss) { g.enemies[0].x = 280 + Math.sin(g.time * .9) * 190; g.enemies[0].y = 88 + Math.sin(g.time * 1.3) * 18; }
    else {
      if (g.time >= g.marchAt && g.enemies.length) {
        const stride = 12;
        const edge = g.enemies.some(e => e.x + g.direction * stride < 26 || e.x + g.direction * stride > 534);
        if (edge) { g.direction *= -1; g.enemies.forEach(e => e.y += 20); }
        else g.enemies.forEach(e => e.x += g.direction * stride);
        g.marchStep++;
        const survivors = g.enemies.length / g.formationSize;
        g.marchAt = g.time + Math.max(.065, (.09 + .62 * survivors) / (1 + (g.wave - 1) * .12));
      }
      // A descending formation grinds away any shelter it overlaps.
      for (const bunker of g.bunkers) for (let i = 0; i < bunker.cells.length; i++) {
        if (bunker.cells[i] && g.enemies.some(e => Math.abs(e.x - (bunker.x + i % 16 * 4 + 2)) < 18 && Math.abs(e.y - (bunker.y + Math.floor(i / 16) * 4 + 2)) < 16)) bunker.cells[i] = false;
      }
      if (g.enemies.some(e => e.y >= 530)) { g.phase = "over"; g.reason = "The invaders reached your defense line."; return; }
    }
    if (g.time >= g.enemyAt && g.enemies.length) {
      const shooters = boss ? g.enemies : g.enemies.filter(e => !g.enemies.some(other => other.x === e.x && other.y > e.y));
      const e = shooters[Math.floor(random(g) * shooters.length)];
      const spread = boss ? [-95, 0, 95] : [0];
      spread.forEach(vx => g.shots.push({ x: e.x, y: e.y + (boss ? 26 : 18), vx, vy: 140 + Math.min(g.wave, 20) * 9, enemy: true }));
      g.enemyAt = g.time + Math.max(.3, (boss ? .65 : 1.25) - g.wave * .045);
    }
  }
  // `fire` is a single press consumed by the controller, never a held-button state.
  if (input.fire && g.time >= g.shootAt && !g.nextWaveAt) {
    (g.doubleUntil > g.time ? [-9, 9] : [0]).forEach(offset => g.shots.push({ x: g.x + offset, y: 562, vx: 0, vy: -430, enemy: false }));
    g.shootAt = g.time + .16;
  }
  for (const b of g.shots) {
    const oldX = b.x, oldY = b.y;
    b.x += b.vx * dt; b.y += b.vy * dt;
    let blocked = false;
    const samples = Math.max(1, Math.ceil(Math.abs(b.y - oldY) / 2));
    for (let sample = 0; sample <= samples && !blocked; sample++) {
      const x = oldX + (b.x - oldX) * sample / samples, y = oldY + (b.y - oldY) * sample / samples;
      for (const bunker of g.bunkers) {
        const col = Math.floor((x - bunker.x) / 4), row = Math.floor((y - bunker.y) / 4);
        if (col < 0 || col >= 16 || row < 0 || row >= 10 || !bunker.cells[row * 16 + col]) continue;
        for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
          const cx = col + dx, cy = row + dy;
          if (dx * dx + dy * dy <= 5 && cx >= 0 && cx < 16 && cy >= 0 && cy < 10) bunker.cells[cy * 16 + cx] = false;
        }
        blocked = true; break;
      }
    }
    if (blocked) { b.y = -100; continue; }
    if (!b.enemy) {
      const e = g.enemies.find(e => Math.abs(e.x - b.x) < (e.boss ? 48 : 19) && Math.abs(e.y - b.y) < (e.boss ? 24 : 17));
      if (e) {
        b.y = -100; e.hp--;
        if (e.hp === 0) {
          g.score += e.boss ? 1500 : 100;
          if (e.boss) g.bossKills++; else g.kills++;
          if (e.boss || random(g) < .12) g.drops.push({ x: e.x, y: e.y, type: random(g) < .5 ? "shield" : "double" });
          g.enemies = g.enemies.filter(other => other !== e);
        }
      }
    } else if (g.time >= g.invincibleUntil && Math.abs(b.x - g.x) < 19 && Math.abs(b.y - 580) < 17) {
      b.y = 800;
      if (g.shield) g.shield = false; else g.lives--;
      g.invincibleUntil = g.time + 1.6;
      if (!g.lives) { g.phase = "over"; g.reason = "Your last ship was destroyed."; }
    }
  }
  g.shots = g.shots.filter(b => b.y > -20 && b.y < 665 && b.x > -30 && b.x < 590);
  for (const d of g.drops) {
    d.y += 105 * dt;
    if (Math.abs(d.y - 580) < 24 && Math.abs(d.x - g.x) < 28) {
      if (d.type === "shield") g.shield = true; else g.doubleUntil = g.time + 8;
      g.score += 50; g.pickups++; d.y = 800;
    }
  }
  g.drops = g.drops.filter(d => d.y < 660);
  if (!g.enemies.length && !g.nextWaveAt && g.phase === "playing") { g.score += g.wave * 150; g.shots = []; g.nextWaveAt = g.time + 2; }
}
