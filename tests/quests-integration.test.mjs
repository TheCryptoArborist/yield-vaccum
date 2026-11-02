import assert from "node:assert/strict";
import test from "node:test";
import { integrateHome, integrateLobby, integrateLayout } from "../scripts/integrate-mss2-quests.mjs";
const home = `import WalletConnect from "./wallet-connect";
const marker = "UNCHANGED GAME LOGIC";
<p>TWO WORLDS. CHOOSE YOUR GAME.</p>
<div aria-label="Choose a Yield Vaccum game">
<div className="splashActions">
<button onClick={() => prepareBriefing()}>PLAY YIELD VACCUM</button>
<a href="/arcade/lobby"><em>ENTER THE ARCADE →</em>
              </a>
</div>
<a className="arcadeNavButton" href="/arcade/lobby"><span>MSS2 ARCADE</span><strong>OPEN ARCADE LOBBY</strong><i aria-hidden="true">→</i></a>`;
const lobby = `import WeeklyRewards from './weekly-rewards';
<section className={styles.hero}>KEEP HERO</section>
<section className={styles.games}>KEEP EVERY GAME AND NEW CABINET</section>
<section id='championship'>KEEP RANKINGS AND RESERVE</section>`;
const layout = `import "./polish.css";
const title = "Yield Vaccum | Topaz & MSS2 Arcade";
const og = "Two worlds. Choose your game. Free Topaz educational missions or $1 MSS2 Mint Flyer flights on Robinhood Chain and Arc.";`;
test("home adds the third destination without replacing the game launch or arcade", () => {
  const output = integrateHome(home);
  for (const value of ["UNCHANGED GAME LOGIC", "prepareBriefing()", "<QuestHomeCard />", 'current="home"', "PLAY. LEARN. TAKE ON QUESTS.", 'href="/arcade/lobby"']) assert.ok(output.includes(value));
  assert.ok(output.indexOf("<QuestHomeCard />") > output.indexOf("ENTER THE ARCADE"));
});
test("home integration is idempotent", () => { const once = integrateHome(home); assert.equal(integrateHome(once), once); });
test("missing home anchor fails rather than guessing", () => { assert.throws(() => integrateHome(home.replace("TWO WORLDS.", "OTHER."))); });
test("duplicate home anchor fails rather than patching twice", () => { assert.throws(() => integrateHome(home + '<div className="splashActions">')); });
test("arcade retains games, next cabinet, rankings and reserve", () => {
  const output = integrateLobby(lobby);
  for (const value of ["KEEP HERO", "KEEP EVERY GAME AND NEW CABINET", "KEEP RANKINGS AND RESERVE", "<QuestArcadeBanner />"]) assert.ok(output.includes(value));
  assert.ok(output.indexOf("<QuestArcadeBanner />") < output.indexOf("<section id='championship'"));
});
test("arcade integration is idempotent", () => { const once = integrateLobby(lobby); assert.equal(integrateLobby(once), once); });
test("layout loads additive styles and updates social wording", () => { const result = integrateLayout(layout); assert.ok(result.includes('import "./quests-entry.css"')); assert.ok(!result.includes("Two worlds.")); assert.equal(integrateLayout(result), result); });
test("partially installed home fails closed", () => { assert.throws(() => integrateHome("<QuestHomeCard />")); });

test("quest navigation uses Next Link instead of a plain internal anchor", () => {
  const output = integrateHome(home);
  assert.ok(output.includes('import Link from "next/link";'));
  assert.ok(output.includes('<Link className="arcadeNavButton" href="/quests">'));
  assert.ok(!output.includes('<a className="arcadeNavButton" href="/quests">'));
});
test("an existing preview integration is upgraded to Next Link once", () => {
  const correct = integrateHome(home);
  const legacy = correct.replace('import Link from "next/link";\n', '').replace('<Link className="arcadeNavButton" href="/quests">', '<a className="arcadeNavButton" href="/quests">').replace('</i></Link>', '</i></a>');
  assert.equal(integrateHome(legacy), correct);
});
