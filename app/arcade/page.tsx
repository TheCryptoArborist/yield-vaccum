import type { Metadata } from "next";
import MintFlyer from "./mint-flyer";

export const metadata: Metadata = {
  title: "MSS2 Arcade: Mint Flyer | Yield Vacuum",
  description: "Play the Mint Flyer demo inside the optional MSS2 Arcade. Free restarts and clearly labeled demo-credit continues; no token payment is enabled.",
};

export default function ArcadePage() {
  return <MintFlyer />;
}
