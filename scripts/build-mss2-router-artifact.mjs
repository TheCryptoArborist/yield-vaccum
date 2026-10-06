import { mkdir, writeFile } from "node:fs/promises";
import { compileMss2EntryRouter } from "./mss2-router-compiler.mjs";

const outputUrl = new URL("../deployment/mss2-entry-router/Mss2EntryRouter.artifact.json", import.meta.url);
const artifact = await compileMss2EntryRouter();
await mkdir(new URL("../deployment/mss2-entry-router/", import.meta.url), { recursive: true });
await writeFile(outputUrl, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
console.log(`Wrote deterministic deployment artifact to ${outputUrl.pathname}.`);
console.log(`Creation code hash: ${artifact.creationCodeHash}`);
console.log(`Runtime code hash: ${artifact.runtimeCodeHash}`);
