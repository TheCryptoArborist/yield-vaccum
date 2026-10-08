import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import solc from "solc";
import { keccak256 } from "ethers";

export const ROUTER_SOURCE_NAME = "Mss2EntryRouter.sol";
export const ROUTER_CONTRACT_NAME = "Mss2EntryRouter";
export const ROUTER_SOURCE_PATH = new URL(`../contracts/${ROUTER_SOURCE_NAME}`, import.meta.url);

export async function compileMss2EntryRouter() {
  assert.match(solc.version(), /^0\.8\.30\+commit\./, "Solidity compiler must be the reviewed 0.8.30 release");
  const source = await readFile(ROUTER_SOURCE_PATH, "utf8");
  const input = {
    language: "Solidity",
    sources: { [ROUTER_SOURCE_NAME]: { content: source } },
    settings: {
      optimizer: { enabled: true, runs: 200 },
      outputSelection: { "*": { "*": ["abi", "evm.bytecode.object", "evm.deployedBytecode.object"] } },
    },
  };
  const output = JSON.parse(solc.compile(JSON.stringify(input)));
  const errors = (output.errors ?? []).filter((entry) => entry.severity === "error");
  if (errors.length) throw new Error(errors.map((entry) => entry.formattedMessage).join("\n"));

  const artifact = output.contracts?.[ROUTER_SOURCE_NAME]?.[ROUTER_CONTRACT_NAME];
  assert.ok(artifact, `${ROUTER_CONTRACT_NAME} artifact was not generated`);
  assert.ok(artifact.evm.bytecode.object.length > 0, "creation bytecode was empty");
  assert.ok(artifact.evm.deployedBytecode.object.length > 0, "runtime bytecode was empty");
  assert.ok(artifact.abi.some((item) => item.type === "function" && item.name === "enter"), "enter() missing from ABI");
  assert.ok(artifact.abi.some((item) => item.type === "event" && item.name === "EntryPaid"), "EntryPaid event missing from ABI");
  assert.equal(
    artifact.abi.some((item) => item.type === "function" && /owner|withdraw|rescue|upgrade/i.test(item.name)),
    false,
    "privileged or custody ABI detected",
  );

  const bytecode = `0x${artifact.evm.bytecode.object}`;
  const deployedBytecode = `0x${artifact.evm.deployedBytecode.object}`;
  return {
    contractName: ROUTER_CONTRACT_NAME,
    sourceName: ROUTER_SOURCE_NAME,
    compilerVersion: solc.version(),
    optimizer: input.settings.optimizer,
    sourceSha256: createHash("sha256").update(source).digest("hex"),
    creationCodeHash: keccak256(bytecode),
    runtimeCodeHash: keccak256(deployedBytecode),
    abi: artifact.abi,
    bytecode,
    deployedBytecode,
    standardJsonInput: input,
  };
}
