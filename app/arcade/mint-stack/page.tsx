import type { Metadata } from 'next';
import MintStack from './mint-stack';
export const metadata: Metadata = { title: 'Mint Stack · MSS2 Arcade | Yield Vaccum', description: 'Stack blocks, clear lines, and climb the MSS2 arcade leaderboard. $1 worth of MSS2 per game: 20% to the dead address and 80% to community rewards reserve.' };
export default function Page() { return <MintStack/>; }
