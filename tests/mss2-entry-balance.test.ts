import assert from "node:assert/strict";
import test from "node:test";
import { parseUnits } from "ethers";
import { assessMss2EntryBalance } from "../lib/mss2-entry-balance";

test("an empty MSS2 wallet reports the entire entry shortfall", () => {
  const check = assessMss2EntryBalance("0", parseUnits("150", 18).toString(), "Arc");
  assert.equal(check.sufficient, false);
  assert.equal(check.balanceDisplay, "0");
  assert.equal(check.shortfallDisplay, "150");
  assert.equal(check.network, "Arc");
});

test("exactly the quoted raw token amount permits entry", () => {
  const amount = parseUnits("146.713616000000000001", 18).toString();
  assert.equal(assessMss2EntryBalance(amount, amount, "Robinhood Chain").sufficient, true);
  assert.equal(assessMss2EntryBalance(amount, amount, "Robinhood Chain").shortfallRaw, "0");
});

test("being one raw unit short is blocked even when rounded balances look equal", () => {
  const required = parseUnits("146.713616", 18);
  const check = assessMss2EntryBalance((required - BigInt(1)).toString(), required.toString(), "Arc");
  assert.equal(check.sufficient, false);
  assert.equal(check.shortfallRaw, "1");
  assert.equal(check.shortfallDisplay, "0.000001");
});

test("shortfalls round up and large balances retain exact comparison precision", () => {
  const check = assessMss2EntryBalance(parseUnits("20", 18).toString(), parseUnits("146.713616123", 18).toString(), "Arc");
  assert.equal(check.shortfallDisplay, "126.713617");
  assert.equal(assessMss2EntryBalance(parseUnits("9007199254740993", 18).toString(), parseUnits("146", 18).toString(), "Arc").sufficient, true);
});
