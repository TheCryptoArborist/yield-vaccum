import type { Metadata } from "next";
import MintFlyer from "./mint-flyer";

export const metadata: Metadata = {
  title: "MSS2 Arcade: Mint Flyer | Yield Vacuum",
  description: "Play Mint Flyer with a verified Robinhood MSS2 entry when live payments are enabled. The optional MSS2 Commitments section remains a demonstration.",
};

export default function ArcadePage() {
  return <MintFlyer />;
}
