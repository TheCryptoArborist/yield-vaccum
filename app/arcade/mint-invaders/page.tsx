import type { Metadata } from "next";
import MintInvaders from "./mint-invaders";
export const metadata: Metadata = { title: "Mint Invaders · Gameplay Preview | Yield Vaccum", description: "A retro MSS2 space shooter. Defend the mint, survive enemy waves, and defeat the mothership." };
export default function Page() { return <MintInvaders />; }
