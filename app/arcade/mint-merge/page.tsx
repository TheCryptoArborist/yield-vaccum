import type { Metadata } from "next";
import MintMerge from "./mint-merge";

export const metadata: Metadata = {
  title: "Mint Merge — Gameplay Preview | Yield Vaccum",
  description: "A development preview of the MSS2 merge puzzle. No wallet, payment, token prizes, or leaderboard submission.",
  robots: { index: false, follow: false },
};

export default function Page() { return <MintMerge />; }
