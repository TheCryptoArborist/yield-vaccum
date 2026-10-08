import assert from "node:assert/strict";
import test from "node:test";
import { mintFlyerEntryAction } from "../lib/mint-flyer-entry";

const paidEntry = {
  supportedNetwork: true, readinessKnown: true, readinessFailed: false, playerReady: true,
  live: true, walletConnected: true, hasQuote: true, quoteExpired: false,
  balanceSufficient: true, paymentSubmitted: false,
};

test("a free flight starts without a market quote or wallet", () => {
  assert.equal(mintFlyerEntryAction({ ...paidEntry, live: false, walletConnected: false, hasQuote: false }), "start-free");
});

test("paid entry requires a valid quote and a sufficient verified balance", () => {
  assert.equal(mintFlyerEntryAction({ ...paidEntry, hasQuote: false }), "prepare-quote");
  assert.equal(mintFlyerEntryAction({ ...paidEntry, quoteExpired: true }), "prepare-quote");
  assert.equal(mintFlyerEntryAction({ ...paidEntry, balanceSufficient: undefined }), "refresh-balance");
  assert.equal(mintFlyerEntryAction({ ...paidEntry, balanceSufficient: false }), "refresh-balance");
  assert.equal(mintFlyerEntryAction(paidEntry), "pay");
});

test("a pending payment is verified without another payment or balance requirement", () => {
  assert.equal(mintFlyerEntryAction({ ...paidEntry, paymentSubmitted: true, quoteExpired: true, balanceSufficient: false }), "verify-payment");
});

test("unknown readiness, missing profile, and unsupported networks cannot start a flight", () => {
  assert.equal(mintFlyerEntryAction({ ...paidEntry, readinessKnown: false }), "wait");
  assert.equal(mintFlyerEntryAction({ ...paidEntry, readinessKnown: false, readinessFailed: true }), "retry-readiness");
  assert.equal(mintFlyerEntryAction({ ...paidEntry, playerReady: false }), "wait");
  assert.equal(mintFlyerEntryAction({ ...paidEntry, walletConnected: false }), "wait");
  assert.equal(mintFlyerEntryAction({ ...paidEntry, supportedNetwork: false }), "select-network");
});
