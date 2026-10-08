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
import { paymentReceiptKey, validatePaymentEvidence, type PaymentEvidenceReceipt } from "../lib/mss2-payment-verifier";
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

test("production permits public entries only through the verified routers", () => {
  process.env.CONTEXT = "production";
  process.env.MSS2_CANARY_WALLET = wallet;
  for (const network of ["robinhood", "arc"] as const) {
    const readiness = paymentReadiness(network, wallet);
    assert.equal(readiness.enabled, true);
    assert.equal(readiness.releaseMode, "production");
    assert.equal(readiness.routerAddress, deploymentRecords[network].router);
    assert.equal(paymentReadiness(network, MSS2_COMMUNITY_AIRDROP_RESERVE).enabled, false);
  }
  delete process.env.CONTEXT;
  delete process.env.MSS2_CANARY_WALLET;
});

test("compiled production context enables public entry when runtime CONTEXT is absent", () => {
  delete process.env.CONTEXT;
  process.env.NEXT_PUBLIC_NETLIFY_CONTEXT = "production";
  assert.equal(paymentReadiness("arc", wallet).enabled, true);
  assert.equal(paymentReadiness("robinhood", wallet).enabled, true);
  process.env.CONTEXT = "local";
  assert.equal(paymentReadiness("arc", wallet).enabled, false);
  delete process.env.CONTEXT;
  delete process.env.NEXT_PUBLIC_NETLIFY_CONTEXT;
});

test("deploy-preview canary requires the explicitly allowlisted non-reserve wallet", () => {
  process.env.CONTEXT = "deploy-preview";
  delete process.env.MSS2_CANARY_WALLET;
  const canaryWallet = "0x90f9c1c0c675A0ce9D539c540DB7F4A1f7e583AE";
  assert.equal(paymentReadiness("robinhood", canaryWallet).enabled, true);
  assert.equal(paymentReadiness("arc", canaryWallet).enabled, true);
  assert.equal(paymentReadiness("arc", "0x3333333333333333333333333333333333333333").enabled, false);
  assert.equal(paymentReadiness("arc", MSS2_COMMUNITY_AIRDROP_RESERVE).enabled, false);
  assert.equal(paymentReadiness("arc").releaseMode, "canary");
  delete process.env.CONTEXT;
  delete process.env.MSS2_CANARY_WALLET;
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
    deploymentTransactionHash: "0x7c314bb85387590ebb68749c22d95ee8b8548b8cc6c5dcff1a74a324cd6cd78e",
    runtimeCodeHash: "0x4eb7734e73e5a95727f926429704bb7baf16eaf9334ce8141ab6b5cb25a55b0a",
  });
  assert.deepEqual(deploymentRecords.arc, {
    status: "verified",
    chainId: ARC_CHAIN_ID,
    router: "0x3eF32427eB1eA6cE7572358e22C800CeC740292A",
    deploymentTransactionHash: "0x7129b63c697f27e4998b39266a99f0feedb08425aec39220082c74bb7d4613c3",
    runtimeCodeHash: "0x4eb7734e73e5a95727f926429704bb7baf16eaf9334ce8141ab6b5cb25a55b0a",
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

test("both networks accept smart-wallet receipt evidence, not the bundler as payer", () => {
  process.env.MSS2_ENTRY_ROUTER_ARC = router;
  for (const network of ["robinhood", "arc"] as const) {
    const quote = { ...evidenceQuote(), network, chainId: network === "arc" ? 5042 : 4663 };
    const bundle = { hash: validReceipt().transactionHash, from: "0x3333333333333333333333333333333333333333", to: "0x0000000071727De22E5E9d8BAf0edAc6f37da032", input: "0x1234" };
    const evidence = validatePaymentEvidence(quote, bundle, validReceipt(), "0x64", { payerCode: "0x60016000" });
    assert.equal(evidence.confirmed, true);
    assert.throws(() => validatePaymentEvidence(quote, bundle, validReceipt(), "0x64"), /no on-chain smart-wallet code/);
    assert.throws(() => validatePaymentEvidence(quote, bundle, validReceipt(), "0x64", { payerCode: "0x" }), /no on-chain smart-wallet code/);
  }
});

test("smart-wallet acceptance still requires the exact payer, payment ID, token, amount and split", () => {
  const bundle = { from: router, to: router, input: "0x1234" };
  const code = { payerCode: "0x6001" };
  for (const change of [
    { walletAddress: "0x3333333333333333333333333333333333333333" },
    { paymentId: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee" },
    { amountRaw: "999" },
    { tokenAddress: wallet },
    { deadAddress: wallet },
    { communityAirdropReserve: wallet },
    { chainId: 5042 },
  ]) assert.throws(() => validatePaymentEvidence({ ...evidenceQuote(), ...change }, bundle, validReceipt(), "0x64", code));
  for (let index = 0; index < 3; index += 1) {
    const receipt = validReceipt();
    receipt.logs = receipt.logs?.filter((_, i) => i !== index);
    assert.throws(() => validatePaymentEvidence(evidenceQuote(), bundle, receipt, "0x64", code));
  }
  assert.throws(() => validatePaymentEvidence(evidenceQuote(), bundle, { ...validReceipt(), status: "0x0" }, "0x64", code), /failed/);
  assert.equal(validatePaymentEvidence(evidenceQuote(), bundle, validReceipt(), "0x63", code).confirmed, false);
});

test("a direct EOA payment cannot bypass calldata verification by posting smart-wallet code", () => {
  assert.throws(() => validatePaymentEvidence(evidenceQuote(), { from: wallet, to: router, input: "0x1234" }, validReceipt(), "0x64", { payerCode: "0x6001" }), /payment ID or MSS2 amount/);
});

test("bundled entries use independent payment and network keys without permitting replay", () => {
  const hash = validReceipt().transactionHash!;
  const secondId = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
  assert.notEqual(paymentReceiptKey("robinhood", hash, paymentId), paymentReceiptKey("robinhood", hash, secondId));
  assert.notEqual(paymentReceiptKey("robinhood", hash, paymentId), paymentReceiptKey("arc", hash, paymentId));
  assert.equal(paymentReceiptKey("robinhood", hash, paymentId), paymentReceiptKey("robinhood", hash.toUpperCase(), paymentId));
  const receipt = validReceipt();
  const firstEvent = receipt.logs![2];
  receipt.logs!.push({ ...firstEvent, topics: [ENTRY_PAID_TOPIC, paymentIdBytes32(secondId), addressTopic(wallet), addressTopic(MSS2_TOKEN)] });
  const bundle = { from: router, to: router, input: "0x" };
  for (const id of [paymentId, secondId]) assert.equal(validatePaymentEvidence(evidenceQuote(id), bundle, receipt, "0x64", { payerCode: "0x6001" }).confirmed, true);
  assert.throws(() => validatePaymentEvidence(evidenceQuote("cccccccc-bbbb-4ccc-8ddd-eeeeeeeeeeee"), bundle, receipt, "0x64", { payerCode: "0x6001" }), /matching entry-router event/);
});

test("smart-wallet code is read server-side at the mined block, never accepted from the client", () => {
  const source = readFileSync(new URL("../db/arcade-payments.ts", import.meta.url), "utf8");
  assert.match(source, /rpcCall<string>\(quote.network, "eth_getCode", \[quote.walletAddress, receipt.blockNumber\]\)/);
  assert.match(source, /receipt.transactionHash\?\.toLowerCase\(\) !== input.txHash.toLowerCase\(\)/);
  const route = readFileSync(new URL("../app/api/arcade-payment/route.ts", import.meta.url), "utf8");
  assert.doesNotMatch(route, /payload\.(payerCode|smartWallet|userOperationSuccess)/);
});
