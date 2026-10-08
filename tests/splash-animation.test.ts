import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

test("both logo stages own the original synchronized energy effect", () => {
  const page = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
  const css = readFileSync(new URL("../app/splash.css", import.meta.url), "utf8");
  assert.match(page, /className="splashLogoStage">\s*<div className="splashAtmosphere"/);
  assert.match(page, /className="splashLogoStage splashMintStage">\s*<div className="splashAtmosphere"/);
  assert.equal((page.match(/className="splashAtmosphere"/g) ?? []).length, 2);
  assert.ok(!css.includes(".splashScreen::before"));
  assert.ok(!css.includes(".splashScreen::after"));
  assert.match(css, /animation: splashSpin 18s linear infinite/);
  assert.match(css, /animation: energyWave 2\.6s 0\.8s ease-out infinite/);
  assert.match(css, /top: 50%;\s*width: 100%/);
  assert.match(css, /\.splashMintStage \{ --splash-energy: 0, 235, 242; \}/);
  assert.match(css, /prefers-reduced-motion: reduce[\s\S]*\.splashLogoStage::before, \.splashLogoStage::after/);
});
