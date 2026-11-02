/** One-time, idempotent integration of the additive Quests components. No game logic changes. */
import { readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

function replaceOnce(source, before, after, label) {
  const count = source.split(before).length - 1;
  if (count !== 1) throw new Error(`${label}: expected one integration anchor, found ${count}. No files were written.`);
  return source.replace(before, after);
}
export function integrateHome(source) {
  if (source.includes("<QuestHomeCard />")) {
    if (!source.includes("PLAY. LEARN. TAKE ON QUESTS.") || !source.includes('from "./quests/quest-links"')) throw new Error("Homepage is partially integrated; review it manually.");
    return source;
  }
  let result = replaceOnce(source, 'import WalletConnect from "./wallet-connect";', 'import WalletConnect from "./wallet-connect";\nimport { QuestHomeCard, QuestSiteNav } from "./quests/quest-links";', "Home import");
  result = replaceOnce(result, "TWO WORLDS. CHOOSE YOUR GAME.", "PLAY. LEARN. TAKE ON QUESTS.", "Home heading");
  result = replaceOnce(result, '<div className="splashActions">', '<div className="splashSectionNav"><QuestSiteNav current="home" /></div>\n            <div className="splashActions">', "Home navigation");
  result = replaceOnce(result, '<em>ENTER THE ARCADE →</em>\n              </a>', '<em>ENTER THE ARCADE →</em>\n              </a>\n              <QuestHomeCard />', "Third homepage card");
  result = replaceOnce(result, 'aria-label="Choose a Yield Vaccum game"', 'aria-label="Choose a Yield Vaccum experience"', "Home accessibility label");
  result = replaceOnce(result, '<a className="arcadeNavButton" href="/arcade/lobby"><span>MSS2 ARCADE</span><strong>OPEN ARCADE LOBBY</strong><i aria-hidden="true">→</i></a>', '<a className="arcadeNavButton" href="/arcade/lobby"><span>MSS2 ARCADE</span><strong>OPEN ARCADE LOBBY</strong><i aria-hidden="true">→</i></a>\n          <a className="arcadeNavButton" href="/quests"><span>MSS2 QUESTS</span><strong>EXPLORE QUESTS</strong><i aria-hidden="true">→</i></a>', "Game navigation");
  return result;
}
export function integrateLobby(source) {
  if (source.includes("<QuestArcadeBanner />")) {
    if (!source.includes('current="arcade"') || !source.includes("../../quests/quest-links")) throw new Error("Arcade is partially integrated; review it manually.");
    return source;
  }
  let result = replaceOnce(source, "import WeeklyRewards from './weekly-rewards';", "import WeeklyRewards from './weekly-rewards';\nimport { QuestArcadeBanner, QuestSiteNav } from '../../quests/quest-links';", "Arcade import");
  result = replaceOnce(result, "<section className={styles.hero}>", '<QuestSiteNav current="arcade" />\n <section className={styles.hero}>', "Arcade navigation");
  result = replaceOnce(result, "<section id='championship'", "<QuestArcadeBanner />\n <section id='championship'", "Arcade quest banner");
  return result;
}
export function integrateLayout(source) {
  if (source.includes('import "./quests-entry.css";')) return source;
  let result = replaceOnce(source, 'import "./polish.css";', 'import "./polish.css";\nimport "./quests-entry.css";', "Quests entry styles");
  result = result.replaceAll("Yield Vaccum | Topaz & MSS2 Arcade", "Yield Vaccum | Learn, Arcade & MSS2 Quests");
  result = replaceOnce(result, "Two worlds. Choose your game. Free Topaz educational missions or $1 MSS2 Mint Flyer flights on Robinhood Chain and Arc.", "Play. Learn. Take on quests. Explore Topaz educational missions, the MSS2 Arcade, and the MSS2 Quests preview.", "Site social description");
  return result;
}
export async function integrate(root = process.cwd()) {
  const changes = [
    ["app/page.tsx", integrateHome],
    ["app/arcade/lobby/lobby.tsx", integrateLobby],
    ["app/layout.tsx", integrateLayout],
  ];
  // Compute every result before writing any file. An unknown source shape fails closed.
  const edits = await Promise.all(changes.map(async ([path, transform]) => {
    const source = await readFile(`${root}/${path}`, "utf8");
    return { path, source, result: transform(source) };
  }));
  for (const { path, source, result } of edits) {
    if (source !== result) await writeFile(`${root}/${path}`, result, "utf8");
    console.log(`${source === result ? "Already integrated" : "Updated"}: ${path}`);
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  integrate().catch((error) => { console.error(error.message); process.exitCode = 1; });
}
