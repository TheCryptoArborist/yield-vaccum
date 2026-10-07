import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { AbiCoder } from "ethers";
import {
  ENTRY_PAID_TOPIC,
  ARC_CHAIN_HEX,
  ARC_CHAIN_ID,
  ARC_EXPLORER_URL,
  ARC_RPC_URL,
  MSS2_TOKEN,
  MSS2_DECIMALS,
  ROBINHOOD_CHAIN_HEX,
  ROBINHOOD_CHAIN_ID,
  ROBINHOOD_EXPLORER_URL,
  ROBINHOOD_RPC_URL,
  TRANSFER_TOPIC,
  addressTopic,
  encodeRouterEntry,
  paymentIdBytes32,
  paymentNetworkConfig,
  paymentReadiness,
  splitEntryAmount,
} from "../lib/mss2-payment";
import { validatePaymentEvidence, type PaymentEvidenceReceipt } from "../lib/mss2-payment-verifier";
import {
  MSS2_COMMUNITY_AIRDROP_RESERVE,
  MSS2_DEAD_ADDRESS,
  MSS2_ENTRY_AIRDROP_RESERVE_BPS,
  MSS2_ENTRY_DEAD_ADDRESS_BPS,
} from "../lib/mss2-payment-shared";

const deploymentConfiguration = JSON.parse(
  readFileSync(new URL("../deployment/mss2-entry-router/networks.json", import.meta.url), "utf8"),
);
const deploymentRecords = JSON.parse(
  readFileSync(new URL("../deployment/mss2-entry-router/deployments.json", import.meta.url), "utf8"),
);

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

test("deployment configuration cannot drift from application constants", () => {
  assert.equal(deploymentConfiguration.token, MSS2_TOKEN);
  assert.equal(deploymentConfiguration.tokenDecimals, MSS2_DECIMALS);
  assert.equal(deploymentConfiguration.deadAddress, MSS2_DEAD_ADDRESS);
  assert.equal(deploymentConfiguration.communityAirdropReserve, MSS2_COMMUNITY_AIRDROP_RESERVE);
  assert.equal(deploymentConfiguration.deadAddressBps, MSS2_ENTRY_DEAD_ADDRESS_BPS);
  assert.equal(deploymentConfiguration.communityAirdropReserveBps, MSS2_ENTRY_AIRDROP_RESERVE_BPS);
  assert.deepEqual(deploymentConfiguration.networks.robinhood, {
    name: "Robinhood Chain",
    chainId: ROBINHOOD_CHAIN_ID,
    chainHex: ROBINHOOD_CHAIN_HEX,
    rpcUrl: ROBINHOOD_RPC_URL,
    explorerUrl: ROBINHOOD_EXPLORER_URL,
    confirmations: 2,
  });
  assert.deepEqual(deploymentConfiguration.networks.arc, {
    name: "Arc",
    chainId: ARC_CHAIN_ID,
    chainHex: ARC_CHAIN_HEX,
    rpcUrl: ARC_RPC_URL,
    explorerUrl: ARC_EXPLORER_URL,
    confirmations: 1,
  });
});

test("Robinhood deployment evidence is recorded before Arc release", () => {
  assert.deepEqual(deploymentRecords.robinhood, {
    status: "verified",
    chainId: ROBINHOOD_CHAIN_ID,
    router: "0x3eF32427eB1eA6cE7572358e22C800CeC740292A",
    runtimeCodeHash: "0x4eb7734e73e5a95727f926429704bb7baf16eaf9334ce8141ab6b5cb25a55b0a",
  });
  assert.deepEqual(deploymentRecords.arc, {
    status: "pending",
    chainId: ARC_CHAIN_ID,
    router: null,
    runtimeCodeHash: null,
  });
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
