import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import solc from "solc";

const sourcePath = new URL("../contracts/Mss2EntryRouter.sol", import.meta.url);
const source = await readFile(sourcePath, "utf8");
const input = {
  language: "Solidity",
  sources: { "Mss2EntryRouter.sol": { content: source } },
  settings: {
    optimizer: { enabled: true, runs: 200 },
    outputSelection: { "*": { "*": ["abi", "evm.bytecode.object", "evm.deployedBytecode.object"] } },
  },
};
const output = JSON.parse(solc.compile(JSON.stringify(input)));
const errors = (output.errors ?? []).filter((entry) => entry.severity === "error");
if (errors.length) throw new Error(errors.map((entry) => entry.formattedMessage).join("\n"));

const artifact = output.contracts?.["Mss2EntryRouter.sol"]?.Mss2EntryRouter;
assert.ok(artifact, "Mss2EntryRouter artifact was not generated");
assert.ok(artifact.evm.bytecode.object.length > 0, "creation bytecode was empty");
assert.ok(artifact.evm.deployedBytecode.object.length > 0, "runtime bytecode was empty");
assert.ok(artifact.abi.some((item) => item.type === "function" && item.name === "enter"), "enter() missing from ABI");
assert.ok(artifact.abi.some((item) => item.type === "event" && item.name === "EntryPaid"), "EntryPaid event missing from ABI");
assert.equal(artifact.abi.some((item) => item.type === "function" && /owner|withdraw|rescue|upgrade/i.test(item.name)), false, "privileged or custody ABI detected");

console.log(`Mss2EntryRouter compiled with solc ${solc.version()}.`);
console.log(`Runtime bytecode: ${artifact.evm.deployedBytecode.object.length / 2} bytes.`);
