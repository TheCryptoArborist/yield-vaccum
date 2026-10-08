import type { Metadata } from "next";
import MintFlyer from "./mint-flyer";

export const metadata: Metadata = {
  title: "MSS2 Arcade: Mint Flyer | Yield Vaccum",
  description: "Fly to the Moon, build combos, and compete on the Mint Flyer leaderboard. Each flight requires a verified $1 MSS2 entry on Robinhood Chain or Arc when paid entry is available.",
};

export default function ArcadePage() {
  return <MintFlyer />;
}
