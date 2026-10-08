import assert from "node:assert/strict";
import test from "node:test";
import { publicRewardWallet, resolveRewardWallet } from "../lib/mint-flyer-rewards";

const payer = "0x1111111111111111111111111111111111111111";
const other = "0x2222222222222222222222222222222222222222";
const verifiedAt = "2026-10-08T01:22:29.000Z";

test("paid reward address comes from the verified payer and chain, never a posted replacement", () => {
  const result = resolveRewardWallet({ mode: "paid", network: "arc", walletAddress: payer, verifiedAt }, true, other, verifiedAt);
  assert.equal(result.rewardWallet, payer);
  assert.equal(result.rewardNetwork, "arc");
});

test("a free flight cannot publish an unverified reward address", () => {
  assert.throws(() => resolveRewardWallet({ mode: "demo", network: "robinhood" }, true, other), /Verify wallet ownership/);
  assert.equal(resolveRewardWallet({ mode: "demo", network: "robinhood" }, true, other, verifiedAt).rewardWallet, other);
});

test("an opted-out player never exposes a previously linked reward address", () => {
  const published = resolveRewardWallet({ mode: "paid", network: "arc", walletAddress: payer, verifiedAt }, true);
  assert.equal(publicRewardWallet({ ...published, displayRewardWallet: false }).rewardWallet, null);
  assert.equal(resolveRewardWallet({ mode: "paid", network: "arc", walletAddress: payer, verifiedAt }, false).rewardWallet, null);
});

test("legacy or incomplete verification metadata cannot label an address as verified", () => {
  assert.equal(publicRewardWallet({ displayRewardWallet: true, rewardWallet: payer, rewardNetwork: "arc" }).rewardWallet, null);
  assert.equal(publicRewardWallet({ displayRewardWallet: true, rewardWallet: "invalid", rewardNetwork: "arc", rewardWalletVerifiedAt: verifiedAt }).rewardWallet, null);
});
