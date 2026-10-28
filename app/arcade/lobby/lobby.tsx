'use client';
import { useEffect,useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import flyerStyles from '../mint-flyer.module.css';
import WalletConnect from '../../wallet-connect';
import Badge from '../mint-invaders/invaders-badge';
import { arcadeWeekWindow, type ArcadeStanding } from '../../../lib/arcade-championship';
import { ensureMintFlyerPlayerKey } from '../../../lib/arcade-player';
import styles from './lobby.module.css';
import WeeklyRewards from './weekly-rewards';
import { formatEntryTotal, formatCombinedEntryUsdValue, formatEntryUsdValue } from '../../../lib/mss2-entry-totals-display';
type Board={standings:ArcadeStanding[];profile:ArcadeStanding|null;pilots:number;runs:number;weekStart:string|null;weekEnd:string|null;ranking:string;page:number;totalPages:number;queryKey:string};
type Impact={status:string;deadAmountRaw:string|null;communityAmountRaw:string|null};
type ImpactPrice={chainId:string;priceUsd:string;validUntil:string};
const networks=['robinhood','arc'] as const;
export default function Lobby(){
 const [period,setPeriod]=useState('week'),[boardData,setBoard]=useState<Board|null>(null),[error,setError]=useState(''),[refresh,setRefresh]=useState(0);
 const [ranking,setRanking]=useState('games'),[week,setWeek]=useState(''),[page,setPage]=useState(1);
 const queryKey=`${period}:${ranking}:${week}:${page}`;
 const board=boardData?.queryKey===queryKey?boardData:null;
 const currentWeek=arcadeWeekWindow().start.toISOString().slice(0,10);
 const shownWeek=week||currentWeek;
 const shiftWeek=(days:number)=>{setPage(1);setWeek(new Date(Date.parse(`${shownWeek}T00:00:00Z`)+days*86400000).toISOString().slice(0,10));};
 const weekLabel=board?.weekStart&&board.weekEnd?`${new Date(board.weekStart).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric',timeZone:'UTC'})} – ${new Date(Date.parse(board.weekEnd)-86400000).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric',timeZone:'UTC'})}`:'Loading week…';
 const [impact,setImpact]=useState<Record<string,Impact|null>>({}),[name,setName]=useState('');
 const [prices,setPrices]=useState<Record<string,ImpactPrice|null>>({}),[priceClock,setPriceClock]=useState(0);
 useEffect(()=>{const controller=new AbortController();const params=new URLSearchParams({period,ranking,page:String(page)});if(period==='week'&&week)params.set('week',week);
  try {params.append('playerKey',ensureMintFlyerPlayerKey());const key=localStorage.getItem('mint-invaders-player-v1');if(key)params.append('playerKey',key);const stackKey=localStorage.getItem('mint-stack-player-v1');if(stackKey)params.append('playerKey',stackKey);}catch{/* Public lobby remains usable. */}
  void fetch(`/api/arcade-lobby?${params}`,{cache:'no-store',signal:controller.signal}).then(async r=>{const data=await r.json();if(!r.ok)throw new Error(data.error);if(!controller.signal.aborted){setBoard({...data,queryKey});setError('');if(data.profile){setName(data.profile.nickname);try{localStorage.setItem('mss2-arcade-nickname',data.profile.nickname);}catch{}}}}).catch(e=>{if(!controller.signal.aborted)setError(e.message);});
  return()=>controller.abort();
 },[period,ranking,week,page,queryKey,refresh]);
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
 <section className={styles.profile}><div><small>YOUR PILOT</small><h2>{board?.profile?name:'YOUR ARCADE JOURNEY STARTS HERE'}</h2><p>{board?.profile?`${board.profile.runs.toLocaleString()} games played ${period==='week'?'in this weekly period':'all time'} · Rank ${board.profile.rank} · ${board.profile.points.toLocaleString()} score points`:'Save a paid run to establish your pilot. New results across games join through your verified paying wallet.'}</p><small>Use the same wallet in every game. Different wallets remain separate pilots.</small></div><div className={styles.wallet}><WalletConnect theme='mss'/></div></section>
 <section className={styles.games} aria-label='Choose an arcade game'>
 <article className={styles.cabinet}><div className={`${styles.gameArt} ${styles.flyerArt}`}><div className={styles.flyerScene} role='img' aria-label='Mint Flyer’s cyan and purple spacecraft collecting MSS2 coins'><span className={`${flyerStyles.flyer} ${styles.lobbyFlyer}`}><Image className={flyerStyles.flyerLogo} src='/mss2-flyer-emblem.png' alt='' width={256} height={256}/><i/><b/></span>{['mintOne','mintTwo','mintThree'].map(position=><span key={position} className={`${flyerStyles.mint} ${styles.lobbyMint} ${styles[position]}`}><Image className={flyerStyles.mintLogo} src='/mss2-flyer-emblem.png' alt='' width={64} height={64}/><i/></span>)}</div><small>COLLECT · COMBO · CLIMB</small></div><div className={styles.gameCopy}><small>MSS2 FLIGHT ARCADE</small><h2>MINT FLYER</h2><p>Collect coins, dodge hazards, and chase the Moon through three stages.</p><div className={styles.personal}>{period==='week'?'YOUR WEEKLY BEST':'YOUR ALL-TIME BEST'} <b>{board?.profile?.flyer?.toLocaleString()??'NO RUN YET'}</b></div><Link href='/arcade'>PLAY MINT FLYER →</Link></div></article>
 <article className={`${styles.cabinet} ${styles.invaders}`}><div className={styles.gameArt}><Badge icon='boss'/><small>DEFEND · SURVIVE · ADVANCE</small></div><div className={styles.gameCopy}><small>MSS2 RETRO SHOOTER</small><h2>MINT INVADERS</h2><p>Hold the line behind destructible bunkers. Beat the fleet. Face the mothership.</p><div className={styles.personal}>{period==='week'?'YOUR WEEKLY BEST':'YOUR ALL-TIME BEST'} <b>{board?.profile?.invaders?.toLocaleString()??'NO RUN YET'}</b></div><Link href='/arcade/mint-invaders'>PLAY MINT INVADERS →</Link></div></article>
 <article className={`${styles.cabinet} ${styles.stackCabinet}`}><div className={styles.gameArt}><div className={styles.stackArt} aria-hidden='true'>{[0,0,0,1,1,0,0,2,2,1,3,3,3,2,1,4,4,3,2,1,4,5,5,5,5].map((cell,index)=><i key={index} data-color={cell}/>)}</div><small>STACK · CLEAR · CLIMB</small></div><div className={styles.gameCopy}><small>MSS2 FALLING-BLOCK PUZZLE</small><h2>MINT STACK</h2><p>Find the perfect fit. Clear rows, pick up speed, and keep the skyline low.</p><div className={styles.personal}>{period==='week'?'YOUR WEEKLY BEST':'YOUR ALL-TIME BEST'} <b>{board?.profile?.stack?.toLocaleString()??'NO RUN YET'}</b></div><Link href='/arcade/mint-stack'>PLAY MINT STACK →</Link></div></article>
 {[4].map(number=><article key={number} className={`${styles.cabinet} ${styles.comingSoon}`} aria-label={`Cabinet ${number}: more games coming soon`}><div className={styles.gameArt}><svg className={styles.emptyCabinet} viewBox='0 0 120 140' aria-hidden='true'><path d='M25 7h70l8 23-7 54 12 16v32H12v-32l12-16-7-54Z' fill='#0a1527' stroke='currentColor' strokeWidth='2'/><path d='M27 16h66v14H27Z' fill='currentColor' opacity='.13'/><path d='M29 39h62v43H29Z' fill='#030914' stroke='currentColor' strokeWidth='2'/><path d='M35 46h50M35 53h50M35 60h50M35 67h50M35 74h50' stroke='currentColor' opacity='.08'/><path d='M24 88h72l9 13H15Z' fill='currentColor' opacity='.1'/><path d='M36 88v-9' stroke='currentColor' strokeWidth='2'/><circle cx='36' cy='77' r='4' fill='currentColor'/><circle cx='74' cy='93' r='3' fill='currentColor'/><circle cx='85' cy='93' r='3' fill='currentColor' opacity='.5'/><rect x='46' y='108' width='28' height='15' rx='2' stroke='currentColor' fill='none'/><path d='M58 112v7' stroke='currentColor'/></svg><small>THE ARCADE IS GROWING</small></div><div className={styles.gameCopy}><small>CABINET {String(number).padStart(2,'0')} · NEXT UP</small><h2>COMING SOON</h2><p>More games. More challenges. More ways to play with MSS2.</p><div className={styles.personal}><span>NEW GAME SLOT</span><b>STAY TUNED</b></div><span className={styles.comingSoonStatus}>AWAITING THE NEXT GAME</span></div></article>)}
 </section>
 <section id='championship' className={styles.board}><header><div><small>THE WHOLE ARCADE. ONE RACE.</small><h2>{ranking==='games'?<>{period==='week'?'WEEKLY':'ARCADE'} <span>PLAY LEADERBOARD</span></>:<>ARCADE <span>CHAMPIONSHIP</span></>}</h2></div><button onClick={()=>setRefresh(value=>value+1)}>↻ REFRESH</button></header>
 <div className={styles.boardTools}><nav aria-label='Ranking period'>{[['week','THIS WEEK'],['all','ALL TIME']].map(([value,label])=><button key={value} aria-pressed={period===value} onClick={()=>{setPage(1);setPeriod(value);if(value==='week')setWeek('');}}>{label}</button>)}</nav><span>{board?.pilots??'—'} PILOTS · {board?.runs??'—'} GAMES PLAYED</span></div>
 <nav className={styles.rankingModes} aria-label='Ranking method'>{[['games','GAMES PLAYED'],['points','SCORE POINTS']].map(([value,label])=><button key={value} aria-pressed={ranking===value} onClick={()=>{setPage(1);setRanking(value);}}>{label}</button>)}</nav>
 <p className={styles.rules}>{ranking==='games'?'Weekly rewards reference: players rank by total verified paid games with saved results across the arcade. Every game counts once; equal totals share a rank. High scores do not break participation ties.':'Your best score in each game earns 100–1,000 championship points based on its rank. Extra attempts improve this ranking only when you improve your best score.'}</p>
 {period==='week'&&<div className={styles.weekNavigation}><button onClick={()=>shiftWeek(-7)}>← PREVIOUS WEEK</button><span>{weekLabel}</span><button disabled={shownWeek>=currentWeek} onClick={()=>shiftWeek(7)}>NEXT WEEK →</button>{week&&week!==currentWeek&&<button onClick={()=>{setPage(1);setWeek('');}}>THIS WEEK</button>}</div>}
 {period==='week'&&<WeeklyRewards key={shownWeek} week={shownWeek} refresh={refresh} prices={prices} clock={priceClock}/>}
 {period==='week'&&<small>WEEKLY RACE · MONDAY 00:00 UTC TO MONDAY 00:00 UTC</small>}
 {error?<p role='status'>{error}</p>:!board?<p role='status'>Loading arcade standings…</p>:board.standings.length?<div className={styles.table}><div className={styles.tableHead}><span>PILOT</span><span>FLYER BEST</span><span>INVADERS BEST</span><span>STACK BEST</span><span>GAMES PLAYED</span><span>POINTS</span></div>{board.standings.map(row=><article key={row.id}><div><b>{String(row.rank).padStart(2,'0')}</b><strong>{row.nickname}</strong></div><span>{row.flyer?.toLocaleString()??'—'}</span><span>{row.invaders?.toLocaleString()??'—'}</span><span>{row.stack?.toLocaleString()??'—'}</span><span className={styles.gamesPlayed}>{row.runs.toLocaleString()}</span><strong>{row.points.toLocaleString()}</strong></article>)}</div>:<div className={styles.empty}><Badge icon='crown'/><h3>CLAIM THE FIRST SPOT.</h3><p>Finish a paid game and save your score. Your pilot joins the race automatically.</p></div>}
 {board&&board.totalPages>1&&<nav className={styles.weekNavigation} aria-label='Leaderboard pages'><button disabled={board.page===1} onClick={()=>setPage(board.page-1)}>← PREVIOUS PAGE</button><span>Page {board.page} of {board.totalPages}</span><button disabled={board.page===board.totalPages} onClick={()=>setPage(board.page+1)}>NEXT PAGE →</button></nav>}
 <p className={styles.countRules}>Games played counts verified paid games with saved results across Mint Flyer, Mint Invaders, and Mint Stack. Every saved game counts once, including games that do not improve your best score. Free flights and duplicate saves do not count. Weeks run Monday 00:00 UTC through the following Monday 00:00 UTC. A game belongs to the week its result was first saved. Use Previous Week to review a completed week.</p>
 <p className={styles.note}>Weekly participation rewards go to the top three eligible players, including everyone tied at third. The selected weekly budget is split in proportion to their saved paid games. Crypto Arborist is excluded from rewards. Amounts and payout networks are reviewed by the admin before distribution.</p>
 </section>
 <section className={styles.impact}><div><small>EVERY PAID GAME CONTRIBUTES</small><h2>PLAY TOGETHER.<br/><span>BUILD TOGETHER.</span></h2><p>The same 20/80 entry split powers every MSS2 game. These on-chain totals include both networks and all arcade entries.</p><p>Dollar estimates use each network’s current MSS2 price and refresh every 30 seconds.</p></div><div className={styles.impactNumbers}><article><small>20% · SENT TO THE DEAD ADDRESS</small><strong>{usdTotal('deadAmountRaw')??'—'}</strong><span className={styles.usdLabel}>ESTIMATED CURRENT USD VALUE</span><span className={styles.tokenTotal}>{total('deadAmountRaw')}</span></article><article><small>80% · SENT TO COMMUNITY RESERVE</small><strong>{usdTotal('communityAmountRaw')??'—'}</strong><span className={styles.usdLabel}>ESTIMATED CURRENT USD VALUE</span><span className={styles.tokenTotal}>{total('communityAmountRaw')}</span></article>{usdTotal('deadAmountRaw')===null&&<small role='status'>USD estimates will appear when fresh prices and confirmed totals are available for both networks.</small>}<small>Cumulative amounts sent, valued at current prices; this is not the current reserve balance or rewards distributed.</small></div></section>
 <footer>THE CRYPTO ARBORIST · MSS2 ARCADE · MORE CABINETS COMING SOON</footer>
 </div></main>;
}
