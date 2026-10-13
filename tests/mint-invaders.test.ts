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
