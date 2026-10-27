'use client';
import { useEffect,useState } from 'react';
import type { WeeklyEntryTotals } from '../../../lib/mss2-weekly-entry-totals';
import { formatEntryTotal,formatCombinedEntryUsdValue } from '../../../lib/mss2-entry-totals-display';
import styles from './weekly-rewards.module.css';
const networks=['robinhood','arc'] as const;
type Price={priceUsd:string;validUntil:string};
export default function WeeklyRewards({week,refresh,prices,clock}:{week:string;refresh:number;prices:Record<string,Price|null>;clock:number}){
 const [totals,setTotals]=useState<Record<string,WeeklyEntryTotals|null>>({});
 useEffect(()=>{
  const controller=new AbortController();let timer:ReturnType<typeof setTimeout>;
  const load=async()=>{
   let delay=60000;
   await Promise.all(networks.map(async chain=>{
    try{
     const r=await fetch(`/api/arcade-weekly-totals?chain=${chain}&week=${week}`,{cache:'no-store',signal:AbortSignal.any([controller.signal,AbortSignal.timeout(45000)])});
     const data=await r.json() as WeeklyEntryTotals;
     if(!r.ok||data.weekStart!==`${week}T00:00:00.000Z`||data.network!==chain||!['ready','syncing'].includes(data.status))throw new Error('Weekly totals unavailable');
     if(data.status==='ready'&&(!/^\d+$/.test(data.communityAmountRaw??'')||!Number.isSafeInteger(data.entries)||(data.entries??-1)<0))throw new Error('Invalid weekly total');
     if(data.status==='syncing')delay=Math.min(delay,4000);
     if(!controller.signal.aborted)setTotals(previous=>({...previous,[chain]:data}));
    }catch{delay=Math.min(delay,15000);if(!controller.signal.aborted)setTotals(previous=>({...previous,[chain]:null}));}
   }));
   if(!controller.signal.aborted)timer=setTimeout(()=>void load(),delay);
  };
  void load();return()=>{controller.abort();clearTimeout(timer);};
 },[week,refresh]);
 const ready=networks.every(chain=>totals[chain]?.status==='ready');
 const raw=ready?networks.reduce((sum,chain)=>sum+BigInt(totals[chain]!.communityAmountRaw!),BigInt(0)).toString():null;
 const usd=ready&&networks.every(chain=>prices[chain]&&Date.parse(prices[chain]!.validUntil)>clock)?formatCombinedEntryUsdValue(networks.map(chain=>({raw:totals[chain]!.communityAmountRaw!,priceUsd:prices[chain]!.priceUsd}))):null;
 const failed=networks.some(chain=>Object.hasOwn(totals,chain)&&totals[chain]===null);
 const label=(chain:typeof networks[number])=>totals[chain]?.status==='ready'?`${formatEntryTotal(totals[chain]!.communityAmountRaw!)} MSS2`:totals[chain]===null?'Temporarily unavailable':'Syncing confirmed payments…';
 const end=new Date(Date.parse(`${week}T00:00:00Z`)+6*86400000).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric',timeZone:'UTC'});
 const beginning=new Date(`${week}T00:00:00Z`).toLocaleDateString('en-US',{month:'short',day:'numeric',timeZone:'UTC'});
 return <section className={styles.panel} aria-label='Weekly community rewards funding'>
  <div className={styles.heading}><div><small>COMMUNITY REWARDS RESERVE</small><h3>FUNDED THIS WEEK</h3><p>{beginning} – {end} · UTC</p></div><div className={styles.total}><strong>{raw!==null?formatEntryTotal(raw):'—'} <span>MSS2</span></strong><span>{usd?`${usd} estimated current value`:ready?'Current dollar estimate unavailable':'Waiting for both networks'}</span></div></div>
  <div className={styles.chains}>{networks.map(chain=><article key={chain}><div><b>{chain==='arc'?'ARC':'ROBINHOOD CHAIN'}</b>{totals[chain]?.status==='ready'&&<span>{totals[chain]!.entries} paid {totals[chain]!.entries===1?'entry':'entries'}</span>}</div><strong>{label(chain)}</strong>{totals[chain]?.explorerUrl&&<a href={`${totals[chain]!.explorerUrl.replace(/\/$/,'')}/address/0xE8b63245DdDAB73C7A276818942341D8Cfb7D7A7`} target='_blank' rel='noopener noreferrer'>VIEW RESERVE ↗</a>}</article>)}</div>
  {!ready&&<p role='status'>{failed?'One network is temporarily unavailable. The combined total will appear after both networks verify. Retrying automatically.':'Checking confirmed payments for this week. Totals appear after the complete weekly range is verified.'}</p>}
  <p>80% of each paid arcade entry goes to this reserve. This shows confirmed MSS2 received from game entries during the selected week, including entries without a saved score. It is not the wallet balance or an individual payout. Transfers and donations outside the entry router are excluded.</p>
  <small>Payments use their on-chain week. Leaderboard participation uses the week a score was first saved. Current prices refresh separately; payouts are reviewed and distributed by the admin.</small>
 </section>;
}
