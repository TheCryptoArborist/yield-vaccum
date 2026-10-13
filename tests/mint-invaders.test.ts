import assert from "node:assert/strict";
import test from "node:test";
import { createInvadersGame, tickInvaders } from "../lib/mint-invaders";
const idle = { move: 0, fire: false };
test("one cleared wave advances once, with a mothership on wave four", () => {
  const g = createInvadersGame(1);
  for (let wave = 1; wave <= 3; wave++) {
    assert.equal(g.wave, wave); g.enemies = [];
    tickInvaders(g, .04, idle);
    const score = g.score;
    for (let frame = 0; frame < 52; frame++) tickInvaders(g, .04, idle);
    assert.equal(g.wave, wave + 1); assert.equal(g.score, score);
  }
  assert.equal(g.enemies.length, 1); assert.equal(g.enemies[0].boss, true); assert.ok(g.enemies[0].hp > 1);
});
test("shield absorbs one hit and invulnerability prevents instant repeated damage", () => {
  const g = createInvadersGame(1); g.time = 2; g.shield = true;
  const hit = () => g.shots.push({ x: g.x, y: 580, vx: 0, vy: 0, enemy: true });
  hit(); hit(); tickInvaders(g, .01, idle);
  assert.equal(g.shield, false); assert.equal(g.lives, 3);
  g.time += 2; hit(); tickInvaders(g, .01, idle); assert.equal(g.lives, 2);
});
test("last ship ends the run and completed runs cannot continue scoring", () => {
  const g = createInvadersGame(1); g.time = 2; g.lives = 1;
  g.shots.push({ x: g.x, y: 580, vx: 0, vy: 0, enemy: true });
  tickInvaders(g, .01, idle); assert.equal(g.phase, "over");
  const score = g.score, time = g.time; tickInvaders(g, .04, { move: 1, fire: true });
  assert.equal(g.score, score); assert.equal(g.time, time);
});
test("double shot expires, firing has a cooldown, and movement stays inside the screen", () => {
  const g = createInvadersGame(1); g.doubleUntil = 8;
  tickInvaders(g, .01, { move: 0, fire: true, targetX: -100 });
  assert.equal(g.x, 22); assert.equal(g.shots.filter(b => !b.enemy).length, 2);
  tickInvaders(g, .01, { move: 0, fire: true, targetX: 1000 });
  assert.equal(g.x, 538); assert.equal(g.shots.filter(b => !b.enemy).length, 2);
  g.shots = []; g.time = 9; tickInvaders(g, .01, { move: 0, fire: true });
  assert.equal(g.shots.filter(b => !b.enemy).length, 1);
});

test("bunkers stop incoming shots and both sides carve lasting holes", () => {
  const g = createInvadersGame(1);
  const before = g.bunkers[0].cells.filter(Boolean).length;
  g.shots = [{ x: 84, y: 460, vx: 0, vy: 1400, enemy: true }];
  tickInvaders(g, .04, idle);
  assert.equal(g.shots.length, 0);
  const afterEnemy = g.bunkers[0].cells.filter(Boolean).length;
  assert.ok(afterEnemy < before);
  g.shots = [{ x: 64, y: 520, vx: 0, vy: -430, enemy: false }];
  tickInvaders(g, .04, idle); tickInvaders(g, .04, idle);
  assert.equal(g.shots.length, 0);
  assert.ok(g.bunkers[0].cells.filter(Boolean).length < afterEnemy);
  const damage = [...g.bunkers[0].cells]; g.enemies = []; tickInvaders(g, .01, idle);
  for (let i = 0; i < 52; i++) tickInvaders(g, .04, idle);
  assert.deepEqual(g.bunkers[0].cells, damage);
});

test("aliens march in timed steps, descend at edges, and accelerate as survivors shrink", () => {
  const g = createInvadersGame(1); const x = g.enemies[0].x;
  g.marchAt = .2;
  for (let i = 0; i < 4; i++) tickInvaders(g, .04, idle);
  assert.equal(g.enemies[0].x, x);
  tickInvaders(g, .04, idle); tickInvaders(g, .04, idle);
  assert.equal(g.enemies[0].x, x + 12); assert.equal(g.marchStep, 1);
  const fullDelay = g.marchAt - g.time;
  g.enemies = [{ ...g.enemies[0], x: 532 }]; const y = g.enemies[0].y; g.marchAt = g.time;
  tickInvaders(g, .01, idle);
  assert.equal(g.direction, -1); assert.equal(g.enemies[0].y, y + 20);
  assert.ok(g.marchAt - g.time < fullDelay);
});

test("normal aliens fire only from the bottom of their column", () => {
  const g = createInvadersGame(3); g.enemyAt = 0;
  tickInvaders(g, .01, idle);
  const shot = g.shots.find(b => b.enemy)!;
  const bottom = g.enemies.filter(e => e.x === shot.x).sort((a, b) => b.y - a.y)[0];
  assert.ok(bottom); assert.ok(Math.abs(shot.y - bottom.y - 18) < 3);
});

test("a defeated mothership's pickup survives the next wave transition", () => {
  const g = createInvadersGame(1); g.wave = 4;
  g.enemies = [{ x: 280, y: 88, hp: 1, boss: true, kind: 3 }];
  g.shots = [{ x: 280, y: 92.3, vx: 0, vy: -430, enemy: false }];
  tickInvaders(g, .01, idle);
  assert.equal(g.drops.length, 1);
  for (let i = 0; i < 52; i++) tickInvaders(g, .04, idle);
  assert.equal(g.wave, 5); assert.equal(g.drops.length, 1);
  assert.ok(g.drops[0].y > 280 && g.drops[0].y < 580);
});

test("held fire launches another shot before the previous projectile leaves the screen", () => {
  const g = createInvadersGame(1);
  for (let i = 0; i < 8; i++) tickInvaders(g, .04, { move: 0, fire: true });
  assert.equal(g.shots.filter(b => !b.enemy).length, 2);
  const count = g.shots.length;
  tickInvaders(g, .001, { move: 0, fire: true });
  assert.equal(g.shots.length, count);
});
