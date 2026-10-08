import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

test("splash uses intentional YIELD VACCUM branding to match yieldvaccum.xyz", () => {
  const page = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.match(page, /<h1 className="splashTitle"><span>YIELD<\/span><strong>VACCUM<\/strong><\/h1>/);
});
