import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

test("homepage immediately explains the paid MSS2 entry allocation", () => {
  const page = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.match(page, /FIRST FLIGHT FREE · THEN \$1 WORTH OF MSS2<\/b>\s*<span className="splashEntryPurpose">/);
  assert.match(page, /<strong>20%<\/strong> to the dead address/);
  assert.match(page, /<strong>80%<\/strong> to community rewards reserve/);
});
