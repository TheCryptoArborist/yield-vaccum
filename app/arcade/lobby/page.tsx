import type { Metadata } from 'next';
import Lobby from './lobby';
export const metadata:Metadata={title:'MSS2 Arcade Lobby | Yield Vaccum',description:'One arcade. Two worlds of competition. Play Mint Flyer and Mint Invaders, climb the weekly championship, and contribute with MSS2.'};
export default function Page(){return <Lobby/>;}
