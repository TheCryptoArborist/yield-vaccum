import { readFile } from "node:fs/promises";
import { getAddress, Interface, keccak256 } from "ethers";
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
const router = getAddress(argument("router") ?? "");
const artifact = await compileMss2EntryRouter();
const routerInterface = new Interface(artifact.abi);

const code = await rpc(network.rpcUrl, "eth_getCode", [router, "latest"]);
if (code === "0x") throw new Error(`No router bytecode exists at ${router} on ${network.name}.`);
if (keccak256(code) !== artifact.runtimeCodeHash) throw new Error("Deployed runtime bytecode did not match the reviewed router artifact.");

async function read(functionName) {
  const result = await rpc(network.rpcUrl, "eth_call", [{ to: router, data: routerInterface.encodeFunctionData(functionName) }, "latest"]);
  return routerInterface.decodeFunctionResult(functionName, result)[0];
}

const [token, deadAddress, reserve, deadBps, reserveBps, denominator] = await Promise.all([
  read("MSS2"),
  read("DEAD_ADDRESS"),
  read("COMMUNITY_AIRDROP_RESERVE"),
  read("DEAD_ADDRESS_BPS"),
  read("COMMUNITY_AIRDROP_RESERVE_BPS"),
  read("BPS_DENOMINATOR"),
]);

if (getAddress(token) !== getAddress(configuration.token)) throw new Error("Router MSS2 address mismatch.");
if (getAddress(deadAddress) !== getAddress(configuration.deadAddress)) throw new Error("Router dead address mismatch.");
if (getAddress(reserve) !== getAddress(configuration.communityAirdropReserve)) throw new Error("Router reserve address mismatch.");
if (Number(deadBps) !== configuration.deadAddressBps || Number(reserveBps) !== configuration.communityAirdropReserveBps || Number(denominator) !== 10_000) {
  throw new Error("Router allocation mismatch.");
}

console.log(JSON.stringify({
  status: "DEPLOYMENT_VERIFIED",
  network: networkId,
  networkName: network.name,
  chainId: network.chainId,
  router,
  runtimeCodeHash: artifact.runtimeCodeHash,
  token: getAddress(token),
  deadAddress: getAddress(deadAddress),
  communityAirdropReserve: getAddress(reserve),
  deadAddressBps: Number(deadBps),
  communityAirdropReserveBps: Number(reserveBps),
  explorerUrl: `${network.explorerUrl}/address/${router}`,
}, null, 2));
