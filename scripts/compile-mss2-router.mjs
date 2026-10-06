import { compileMss2EntryRouter } from "./mss2-router-compiler.mjs";

const artifact = await compileMss2EntryRouter();
console.log(`Mss2EntryRouter compiled with solc ${artifact.compilerVersion}.`);
console.log(`Runtime bytecode: ${(artifact.deployedBytecode.length - 2) / 2} bytes.`);
console.log(`Runtime code hash: ${artifact.runtimeCodeHash}.`);
