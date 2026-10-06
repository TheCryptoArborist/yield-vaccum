import type { Metadata } from "next";
import artifact from "../../../deployment/mss2-entry-router/Mss2EntryRouter.artifact.json";
import DeployConsole from "./deploy-console";

export const metadata: Metadata = {
  title: "MSS2 Router Deployment Review | Yield Vacuum",
  robots: { index: false, follow: false },
};

export default function Mss2RouterDeployPage() {
  const previewEnabled = process.env.CONTEXT === "deploy-preview"
    || process.env.NEXT_PUBLIC_ENABLE_MSS2_DEPLOY_CONSOLE === "true";

  return <DeployConsole
    previewEnabled={previewEnabled}
    artifact={{
      bytecode: artifact.bytecode,
      compilerVersion: artifact.compilerVersion,
      sourceSha256: artifact.sourceSha256,
      creationCodeHash: artifact.creationCodeHash,
      runtimeCodeHash: artifact.runtimeCodeHash,
    }}
  />;
}
