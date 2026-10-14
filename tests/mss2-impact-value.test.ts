import assert from "node:assert/strict";
import test from "node:test";
import { formatEntryUsdValue, formatCombinedEntryUsdValue } from "../lib/mss2-entry-totals-display";

test("impact USD estimates multiply exact token amounts before rounding cents", () => {
  assert.equal(formatEntryUsdValue("170062345588189475183", "0.01"), "$1.70");
  assert.equal(formatEntryUsdValue("1000000000000000000", "1.005"), "$1.01");
  assert.equal(formatEntryUsdValue("999999999999999999999999999999999999", "0.000000000000000001"), "$1.00");
});
test("small nonzero values and zero funding remain distinct", () => {
  assert.equal(formatEntryUsdValue("1", "1"), "<$0.01");
  assert.equal(formatEntryUsdValue("0", "0.01"), "$0.00");
});
test("invalid or missing prices never produce misleading dollar totals", () => {
  for (const price of ["", "0", "-1", "NaN", "Infinity", "1oops"]) assert.equal(formatEntryUsdValue("1000000000000000000", price), null);
  assert.equal(formatEntryUsdValue("bad", "1"), null);
});

test("combined impact uses each network's price and rounds only the final sum", () => {
  assert.equal(formatCombinedEntryUsdValue([{ raw: "1000000000000000000", priceUsd: "2" }, { raw: "1000000000000000000", priceUsd: "3" }]), "$5.00");
  assert.equal(formatCombinedEntryUsdValue([{ raw: "1000000000000000000", priceUsd: "0.004" }, { raw: "1000000000000000000", priceUsd: "0.004" }]), "<$0.01");
  assert.equal(formatCombinedEntryUsdValue([{ raw: "1000000000000000000", priceUsd: "0.006" }, { raw: "1000000000000000000", priceUsd: "0.006" }]), "$0.01");
  assert.equal(formatCombinedEntryUsdValue([{ raw: "0", priceUsd: "2" }, { raw: "0", priceUsd: "3" }]), "$0.00");
  assert.equal(formatCombinedEntryUsdValue([{ raw: "1", priceUsd: "2" }, { raw: "1", priceUsd: "" }]), null);
  assert.equal(formatCombinedEntryUsdValue([]), null);
});
