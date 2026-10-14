'use client';
import { useEffect,useState } from 'react';
import Link from 'next/link';
import WalletConnect from '../../wallet-connect';
import Badge from '../mint-invaders/invaders-badge';
import type { ArcadeStanding } from '../../../lib/arcade-championship';
import { ensureMintFlyerPlayerKey } from '../../../lib/arcade-player';
import styles from './lobby.module.css';
import { formatEntryTotal, formatCombinedEntryUsdValue, formatEntryUsdValue } from '../../../lib/mss2-entry-totals-display';
type Board={standings:ArcadeStanding[];profile:ArcadeStanding|null;pilots:number;runs:number;weekStart:string|null};
type Impact={status:string;deadAmountRaw:string|null;communityAmountRaw:string|null};
type ImpactPrice={chainId:string;priceUsd:string;validUntil:string};
const networks=['robinhood','arc'] as const;
export default function Lobby(){
 const [period,setPeriod]=useState('week'),[board,setBoard]=useState<Board|null>(null),[error,setError]=useState(''),[refresh,setRefresh]=useState(0);
 const [impact,setImpact]=useState<Record<string,Impact|null>>({}),[name,setName]=useState('');
 const [prices,setPrices]=useState<Record<string,ImpactPrice|null>>({}),[priceClock,setPriceClock]=useState(0);
 useEffect(()=>{const controller=new AbortController();const params=new URLSearchParams({period});
  try {params.append('playerKey',ensureMintFlyerPlayerKey());const key=localStorage.getItem('mint-invaders-player-v1');if(key)params.append('playerKey',key);}catch{/* Public lobby remains usable. */}
  void fetch(`/api/arcade-lobby?${params}`,{cache:'no-store',signal:controller.signal}).then(async r=>{const data=await r.json();if(!r.ok)throw new Error(data.error);if(!controller.signal.aborted){setBoard(data);setError('');if(data.profile){setName(data.profile.nickname);try{localStorage.setItem('mss2-arcade-nickname',data.profile.nickname);}catch{}}}}).catch(e=>{if(!controller.signal.aborted)setError(e.message);});
  return()=>controller.abort();
 },[period,refresh]);
 useEffect(()=>{
  const controller=new AbortController();let timer:ReturnType<typeof setTimeout>;
  const load=async()=>{
   let syncing=false;
   await Promise.all(networks.map(async chain=>{
    try{
     const response=await fetch(`/api/arcade-entry-totals?chain=${chain}`,{cache:'no-store',signal:AbortSignal.any([controller.signal,AbortSignal.timeout(15000)])});
     const data=await response.json() as Impact;
     if(!response.ok||!['ready','syncing','unavailable'].includes(data.status))throw new Error('Totals unavailable');
     if(data.status==='syncing')syncing=true;
     if(!controller.signal.aborted)setImpact(previous=>({...previous,[chain]:data}));
    }catch{if(!controller.signal.aborted)setImpact(previous=>({...previous,[chain]:{status:'unavailable',deadAmountRaw:null,communityAmountRaw:null}}));}
   }));
   if(!controller.signal.aborted)timer=setTimeout(()=>void load(),syncing?5000:60000);
  };
  void load();return()=>{controller.abort();clearTimeout(timer);};
 },[refresh]);
 useEffect(()=>{
  const controller=new AbortController();let timer:ReturnType<typeof setTimeout>;
  const clock=setInterval(()=>setPriceClock(Date.now()),1000);
  const load=async()=>{
   await Promise.all(networks.map(async chain=>{
    try{
     const response=await fetch(`/api/mss2-price?chain=${chain}`,{cache:'no-store',signal:AbortSignal.any([controller.signal,AbortSignal.timeout(15000)])});
     const quote=await response.json() as ImpactPrice;
     if(!response.ok||quote.chainId!==chain||formatEntryUsdValue('0',quote.priceUsd??'')===null||!Number.isFinite(Date.parse(quote.validUntil))||Date.parse(quote.validUntil)<=Date.now())throw new Error('Price unavailable');
     if(!controller.signal.aborted){setPrices(previous=>({...previous,[chain]:quote}));setPriceClock(Date.now());}
    }catch{if(!controller.signal.aborted)setPrices(previous=>({...previous,[chain]:null}));}
   }));
   if(!controller.signal.aborted)timer=setTimeout(()=>void load(),30000);
  };
  void load();return()=>{controller.abort();clearTimeout(timer);clearInterval(clock);};
 },[refresh]);
 const usdTotal=(key:'deadAmountRaw'|'communityAmountRaw')=>{
  const values=[];
  for(const chain of networks){
   const raw=impact[chain]?.[key],price=prices[chain];
   if(impact[chain]?.status!=='ready'||raw==null||!price||Date.parse(price.validUntil)<=priceClock)return null;
   values.push({raw,priceUsd:price.priceUsd});
  }
  return formatCombinedEntryUsdValue(values);
 };
 const total=(key:'deadAmountRaw'|'communityAmountRaw')=>{
  if(['robinhood','arc'].some(chain=>impact[chain]?.status==='unavailable'))return 'Temporarily unavailable · refresh';
  const values=['robinhood','arc'].map(chain=>impact[chain]?.[key]);
  if(values.some(value=>value===null||value===undefined))return 'Syncing chain totals…';
  return formatEntryTotal(values.reduce<bigint>((sum,value)=>sum+BigInt(value!),BigInt(0)).toString())+' MSS2';
 };
 return <main className={styles.page}><div className={styles.shell}>
 <header className={styles.header}><Link href='/'>← YIELD VACCUM</Link><span>MSS2 COMMUNITY ARCADE</span><a href='#championship'>RANKINGS ↓</a></header>
 <section className={styles.hero}><div><small>THE NEXT HIGH SCORE IS YOURS.</small><h1>ENTER THE<br/><span>MINT ARCADE.</span></h1><p>One pilot. Every game. A new race to the top each week.</p><div className={styles.tags}><b>ROBINHOOD CHAIN + ARC</b><b>$1 MSS2 PER PAID GAME</b></div></div><div className={styles.heroArt} aria-hidden='true'><Badge icon='fleet'/><span>INSERT MSS2 · MAKE YOUR MARK</span></div></section>
 <section className={styles.profile}><div><small>YOUR PILOT</small><h2>{board?.profile?name:'YOUR ARCADE JOURNEY STARTS HERE'}</h2><p>{board?.profile?`${board.profile.points.toLocaleString()} championship points · ${board.profile.runs} saved games · Rank ${board.profile.rank}`:'Save a paid run to establish your pilot. New results across games join through your verified paying wallet.'}</p><small>Use the same wallet in every game. Different wallets remain separate pilots.</small></div><div className={styles.wallet}><WalletConnect theme='mss'/></div></section>
 <section className={styles.games} aria-label='Choose an arcade game'>
 <article className={styles.cabinet}><div className={styles.gameArt}><Badge icon='wings'/><small>COLLECT · COMBO · CLIMB</small></div><div className={styles.gameCopy}><small>MSS2 FLIGHT ARCADE</small><h2>MINT FLYER</h2><p>Collect coins, dodge hazards, and chase the Moon through three stages.</p><div className={styles.personal}>{period==='week'?'YOUR WEEKLY BEST':'YOUR ALL-TIME BEST'} <b>{board?.profile?.flyer?.toLocaleString()??'NO RUN YET'}</b></div><Link href='/arcade'>PLAY MINT FLYER →</Link></div></article>
 <article className={`${styles.cabinet} ${styles.invaders}`}><div className={styles.gameArt}><Badge icon='boss'/><small>DEFEND · SURVIVE · ADVANCE</small></div><div className={styles.gameCopy}><small>MSS2 RETRO SHOOTER</small><h2>MINT INVADERS</h2><p>Hold the line behind destructible bunkers. Beat the fleet. Face the mothership.</p><div className={styles.personal}>{period==='week'?'YOUR WEEKLY BEST':'YOUR ALL-TIME BEST'} <b>{board?.profile?.invaders?.toLocaleString()??'NO RUN YET'}</b></div><Link href='/arcade/mint-invaders'>PLAY MINT INVADERS →</Link></div></article>
 </section>
 <section id='championship' className={styles.board}><header><div><small>THE WHOLE ARCADE. ONE RACE.</small><h2>ARCADE <span>CHAMPIONSHIP</span></h2></div><button onClick={()=>setRefresh(value=>value+1)}>↻ REFRESH</button></header>
 <div className={styles.boardTools}><nav aria-label='Ranking period'>{[['week','THIS WEEK'],['all','ALL TIME']].map(([value,label])=><button key={value} aria-pressed={period===value} onClick={()=>setPeriod(value)}>{label}</button>)}</nav><span>{board?.pilots??'—'} PILOTS · {board?.runs??'—'} SAVED GAMES</span></div>
 <p className={styles.rules}>Your best score in each game earns 100–1,000 points based on its rank. Playing both games builds your combined standing. Extra attempts only count when you improve. Tied scores earn equal points.</p>
 {period==='week'&&<small>WEEKLY RACE · MONDAY 00:00 UTC TO MONDAY 00:00 UTC</small>}
 {error?<p role='status'>{error}</p>:!board?<p role='status'>Loading arcade standings…</p>:board.standings.length?<div className={styles.table}><div className={styles.tableHead}><span>PILOT</span><span>FLYER BEST</span><span>INVADERS BEST</span><span>POINTS</span></div>{board.standings.map(row=><article key={row.id}><div><b>{String(row.rank).padStart(2,'0')}</b><strong>{row.nickname}</strong></div><span>{row.flyer?.toLocaleString()??'—'}</span><span>{row.invaders?.toLocaleString()??'—'}</span><strong>{row.points.toLocaleString()}</strong></article>)}</div>:<div className={styles.empty}><Badge icon='crown'/><h3>CLAIM THE FIRST SPOT.</h3><p>Finish a paid game and save your score. Your pilot joins the race automatically.</p></div>}
 <p className={styles.note}>Rank points change as the field grows. Game leaderboards keep their original records. New shared arcade runs join this championship.</p>
 </section>
 <section className={styles.impact}><div><small>EVERY PAID GAME CONTRIBUTES</small><h2>PLAY TOGETHER.<br/><span>BUILD TOGETHER.</span></h2><p>The same 20/80 entry split powers every MSS2 game. These on-chain totals include both networks and all arcade entries.</p><p>Dollar estimates use each network’s current MSS2 price and refresh every 30 seconds.</p></div><div className={styles.impactNumbers}><article><small>20% · SENT TO THE DEAD ADDRESS</small><strong>{usdTotal('deadAmountRaw')??'—'}</strong><span className={styles.usdLabel}>ESTIMATED CURRENT USD VALUE</span><span className={styles.tokenTotal}>{total('deadAmountRaw')}</span></article><article><small>80% · SENT TO COMMUNITY RESERVE</small><strong>{usdTotal('communityAmountRaw')??'—'}</strong><span className={styles.usdLabel}>ESTIMATED CURRENT USD VALUE</span><span className={styles.tokenTotal}>{total('communityAmountRaw')}</span></article>{usdTotal('deadAmountRaw')===null&&<small role='status'>USD estimates will appear when fresh prices and confirmed totals are available for both networks.</small>}<small>Cumulative amounts sent, valued at current prices; this is not the current reserve balance or rewards distributed.</small></div></section>
 <footer>THE CRYPTO ARBORIST · MSS2 ARCADE · MORE CABINETS COMING SOON</footer>
 </div></main>;
}
