import assert from "node:assert/strict";
import test from "node:test";
import { AbiCoder } from "ethers";
import {
  ENTRY_PAID_TOPIC,
  MSS2_TOKEN,
  TRANSFER_TOPIC,
  addressTopic,
  encodeRouterEntry,
  paymentIdBytes32,
  paymentNetworkConfig,
  paymentReadiness,
  splitEntryAmount,
} from "../lib/mss2-payment";
import { validatePaymentEvidence, type PaymentEvidenceReceipt } from "../lib/mss2-payment-verifier";
import { MSS2_COMMUNITY_AIRDROP_RESERVE, MSS2_DEAD_ADDRESS } from "../lib/mss2-payment-shared";

const paymentId = "12345678-1234-4abc-8def-1234567890ab";
const wallet = "0x1111111111111111111111111111111111111111";
const router = "0x2222222222222222222222222222222222222222";
const amountRaw = "181818200000000000000";
process.env.MSS2_ENTRY_ROUTER_ROBINHOOD = router;

function evidenceQuote(paymentReference = paymentId) {
  return {
    paymentId: paymentReference,
    network: "robinhood" as const,
    chainId: 4663,
    tokenAddress: MSS2_TOKEN,
    walletAddress: wallet,
    routerAddress: router,
    amountRaw,
    deadAddress: MSS2_DEAD_ADDRESS,
    communityAirdropReserve: MSS2_COMMUNITY_AIRDROP_RESERVE,
  };
}

function transferLog(to: string, amount: string) {
  return {
    address: MSS2_TOKEN,
    topics: [TRANSFER_TOPIC, addressTopic(wallet), addressTopic(to)],
    data: AbiCoder.defaultAbiCoder().encode(["uint256"], [BigInt(amount)]),
  };
}

function validReceipt(): PaymentEvidenceReceipt {
  const split = splitEntryAmount(amountRaw);
  return {
    status: "0x1",
    blockNumber: "0x63",
    transactionHash: `0x${"ab".repeat(32)}`,
    logs: [
      transferLog(MSS2_DEAD_ADDRESS, split.deadAddressAmount),
      transferLog(MSS2_COMMUNITY_AIRDROP_RESERVE, split.communityReserveAmount),
      {
        address: router,
        topics: [ENTRY_PAID_TOPIC, paymentIdBytes32(paymentId), addressTopic(wallet), addressTopic(MSS2_TOKEN)],
        data: AbiCoder.defaultAbiCoder().encode(
          ["uint256", "uint256", "uint256"],
          [BigInt(split.totalAmount), BigInt(split.deadAddressAmount), BigInt(split.communityReserveAmount)],
        ),
      },
    ],
  };
}

test("live payments remain source-code locked on both networks", () => {
  assert.equal(paymentReadiness("robinhood").enabled, false);
  assert.equal(paymentReadiness("arc").enabled, false);
});

test("network configuration keeps Robinhood and Arc independent", () => {
  assert.equal(paymentNetworkConfig("robinhood").chainId, 4663);
  assert.equal(paymentNetworkConfig("robinhood").confirmations, 2);
  assert.equal(paymentNetworkConfig("arc").chainId, 5042);
  assert.equal(paymentNetworkConfig("arc").confirmations, 1);
});

test("20/80 split preserves every raw token unit", () => {
  assert.deepEqual(splitEntryAmount("101"), {
    totalAmount: "101",
    deadAddressAmount: "20",
    communityReserveAmount: "81",
  });
  const split = splitEntryAmount(amountRaw);
  assert.equal(BigInt(split.deadAddressAmount) + BigInt(split.communityReserveAmount), BigInt(amountRaw));
});

test("router calldata binds the server payment ID and exact quote amount", () => {
  const calldata = encodeRouterEntry(paymentId, amountRaw);
  assert.match(calldata, /^0x[0-9a-f]+$/i);
  assert.equal(calldata.slice(0, 10), "0x8eadb9b3");
  assert.ok(calldata.toLowerCase().includes(paymentIdBytes32(paymentId).slice(2)));
});

test("verifier accepts exact router call, event, transfers, and confirmations", () => {
  const txHash = `0x${"ab".repeat(32)}`;
  const result = validatePaymentEvidence(
    evidenceQuote(),
    { hash: txHash, from: wallet, to: router, input: encodeRouterEntry(paymentId, amountRaw) },
    validReceipt(),
    "0x64",
  );
  assert.deepEqual(result, { blockNumber: 99, confirmations: 2, confirmed: true });
});

test("verifier rejects a receipt without the exact 80% reserve transfer", () => {
  const receipt = validReceipt();
  receipt.logs = receipt.logs?.filter((log) => log.topics?.[2]?.toLowerCase() !== addressTopic(MSS2_COMMUNITY_AIRDROP_RESERVE));
  assert.throws(() => validatePaymentEvidence(
    evidenceQuote(),
    { from: wallet, to: router, input: encodeRouterEntry(paymentId, amountRaw) },
    receipt,
    "0x64",
  ), /exact 80% MSS2 transfer/);
});

test("verifier rejects replay evidence for a different payment ID", () => {
  assert.throws(() => validatePaymentEvidence(
    evidenceQuote("aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee"),
    { from: wallet, to: router, input: encodeRouterEntry(paymentId, amountRaw) },
    validReceipt(),
    "0x64",
  ), /payment ID or MSS2 amount/);
});
