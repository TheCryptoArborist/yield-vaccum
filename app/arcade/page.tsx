import type { Metadata } from "next";
import MintFlyer from "./mint-flyer";

export const metadata: Metadata = {
  title: "MSS2 Arcade: Mint Flyer | Yield Vacuum",
  description: "Preview Mint Flyer's planned pay-per-game MSS2 entry and the optional MSS2 Commitments demonstration. No real token payment is enabled.",
};

export default function ArcadePage() {
  return <MintFlyer />;
}
