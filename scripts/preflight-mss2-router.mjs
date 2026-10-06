import { readFile } from "node:fs/promises";
import { getAddress, Interface } from "ethers";
import { compileMss2EntryRouter } from "./mss2-router-compiler.mjs";

const configuration = JSON.parse(await readFile(new URL("../deployment/mss2-entry-router/networks.json", import.meta.url), "utf8"));

function argument(name) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function rpc(url, method, params) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  if (!response.ok) throw new Error(`${method} returned HTTP ${response.status}`);
  const payload = await response.json();
  if (payload.error) throw new Error(`${method} failed: ${payload.error.message ?? "unknown RPC error"}`);
  return payload.result;
}

const networkId = argument("network");
const network = configuration.networks[networkId];
if (!network) throw new Error("Use --network robinhood or --network arc.");

const deployerValue = argument("deployer");
const deployer = deployerValue ? getAddress(deployerValue) : undefined;
const artifact = await compileMss2EntryRouter();
const tokenInterface = new Interface([
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
]);

const [chainHex, tokenCode, decimalsResult, blockHex] = await Promise.all([
  rpc(network.rpcUrl, "eth_chainId", []),
  rpc(network.rpcUrl, "eth_getCode", [configuration.token, "latest"]),
  rpc(network.rpcUrl, "eth_call", [{ to: configuration.token, data: tokenInterface.encodeFunctionData("decimals") }, "latest"]),
  rpc(network.rpcUrl, "eth_blockNumber", []),
]);

if (Number(BigInt(chainHex)) !== network.chainId) throw new Error(`RPC chain ID ${Number(BigInt(chainHex))} did not match ${network.chainId}.`);
if (!/^0x[0-9a-f]+$/i.test(tokenCode) || tokenCode === "0x") throw new Error("MSS2 bytecode was not found at the configured token address.");
const [decimals] = tokenInterface.decodeFunctionResult("decimals", decimalsResult);
if (Number(decimals) !== configuration.tokenDecimals) throw new Error(`MSS2 decimals ${decimals} did not match ${configuration.tokenDecimals}.`);

let symbol = "UNAVAILABLE";
try {
  const symbolResult = await rpc(network.rpcUrl, "eth_call", [{ to: configuration.token, data: tokenInterface.encodeFunctionData("symbol") }, "latest"]);
  [symbol] = tokenInterface.decodeFunctionResult("symbol", symbolResult);
} catch {
  // Symbol is informative. Token address, code and decimals are the deployment gates.
}
if (symbol !== "UNAVAILABLE" && symbol.toUpperCase() !== configuration.tokenSymbol) throw new Error(`Token symbol ${symbol} did not match ${configuration.tokenSymbol}.`);

let deployerBalanceWei;
let estimatedGas;
if (deployer) {
  [deployerBalanceWei, estimatedGas] = await Promise.all([
    rpc(network.rpcUrl, "eth_getBalance", [deployer, "latest"]),
    rpc(network.rpcUrl, "eth_estimateGas", [{ from: deployer, data: artifact.bytecode, value: "0x0" }]),
  ]);
  if (BigInt(deployerBalanceWei) === 0n) throw new Error(`The deployer has no native gas balance on ${network.name}.`);
}

console.log(JSON.stringify({
  status: "READY_FOR_WALLET_SIGNATURE",
  signedOrBroadcast: false,
  network: networkId,
  networkName: network.name,
  chainId: network.chainId,
  checkedBlock: Number(BigInt(blockHex)),
  token: getAddress(configuration.token),
  tokenSymbol: symbol,
  tokenDecimals: Number(decimals),
  deadAddress: getAddress(configuration.deadAddress),
  communityAirdropReserve: getAddress(configuration.communityAirdropReserve),
  split: { deadAddressBps: configuration.deadAddressBps, communityAirdropReserveBps: configuration.communityAirdropReserveBps },
  deployer: deployer ?? null,
  deployerBalanceWei: deployerBalanceWei ? BigInt(deployerBalanceWei).toString() : null,
  estimatedGas: estimatedGas ? BigInt(estimatedGas).toString() : null,
  deploymentTransaction: { to: null, value: "0x0", data: artifact.bytecode },
  compilerVersion: artifact.compilerVersion,
  optimizer: artifact.optimizer,
  sourceSha256: artifact.sourceSha256,
  creationCodeHash: artifact.creationCodeHash,
  expectedRuntimeCodeHash: artifact.runtimeCodeHash,
}, null, 2));
