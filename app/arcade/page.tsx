import type { Metadata } from "next";
import MintFlyer from "./mint-flyer";

export const metadata: Metadata = {
  title: "MSS2 Arcade: Mint Flyer | Yield Vacuum",
  description: "Play Mint Flyer and preview the optional MSS2 Commitments demonstration. Free restarts remain available and no token payment is enabled.",
};

export default function ArcadePage() {
  return <MintFlyer />;
}
