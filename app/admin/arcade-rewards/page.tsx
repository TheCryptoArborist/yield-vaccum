import type {Metadata} from 'next';
import RewardsPanel from './rewards-panel';
export const metadata:Metadata={title:'Private Arcade Rewards | Yield Vaccum',robots:{index:false,follow:false}};
export default function Page(){return <RewardsPanel/>;}
