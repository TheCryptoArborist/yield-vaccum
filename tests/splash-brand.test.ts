import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

test("splash uses intentional YIELD VACCUM branding to match yieldvaccum.xyz", () => {
  const page = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.match(page, /<h1 className="splashTitle"><span>YIELD<\/span><strong>VACCUM<\/strong><\/h1>/);
  assert.match(page, /<strong>YIELD VACCUM<\/strong>/);
  assert.match(page, /<em>PLAY YIELD VACCUM →<\/em>/);
  for (const path of ["app/page.tsx", "app/layout.tsx", "app/manifest.ts", "app/wallet-connect.tsx", "app/arcade/mint-flyer.tsx", "app/arcade/page.tsx", "app/arcade/mss2-commitments.tsx"]) {
    const source = readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
    assert.doesNotMatch(source, /Yield Vacuum|YIELD VACUUM/, `${path} must preserve the intended branding`);
  }
});
