'use client';
import { useEffect,useState } from 'react';
import Link from 'next/link';
import WalletConnect from '../../wallet-connect';
import Badge from '../mint-invaders/invaders-badge';
import type { ArcadeStanding } from '../../../lib/arcade-championship';
import { ensureMintFlyerPlayerKey } from '../../../lib/arcade-player';
import styles from './lobby.module.css';
type Board={standings:ArcadeStanding[];profile:ArcadeStanding|null;pilots:number;runs:number;weekStart:string|null};
type Impact={status:string;deadAmountRaw:string|null;communityAmountRaw:string|null};
export default function Lobby(){
 const [period,setPeriod]=useState('week'),[board,setBoard]=useState<Board|null>(null),[error,setError]=useState(''),[refresh,setRefresh]=useState(0);
 const [impact,setImpact]=useState<Record<string,Impact|null>>({}),[name,setName]=useState('');
 useEffect(()=>{const controller=new AbortController();const params=new URLSearchParams({period});
  try {params.append('playerKey',ensureMintFlyerPlayerKey());const key=localStorage.getItem('mint-invaders-player-v1');if(key)params.append('playerKey',key);}catch{/* Public lobby remains usable. */}
  void fetch(`/api/arcade-lobby?${params}`,{cache:'no-store',signal:controller.signal}).then(async r=>{const data=await r.json();if(!r.ok)throw new Error(data.error);if(!controller.signal.aborted){setBoard(data);setError('');if(data.profile){setName(data.profile.nickname);try{localStorage.setItem('mss2-arcade-nickname',data.profile.nickname);}catch{}}}}).catch(e=>{if(!controller.signal.aborted)setError(e.message);});
  return()=>controller.abort();
 },[period,refresh]);
 useEffect(()=>{const controller=new AbortController();for(const chain of ['robinhood','arc'])void fetch(`/api/arcade-entry-totals?chain=${chain}`,{signal:controller.signal}).then(r=>r.json()).then(data=>{if(!controller.signal.aborted)setImpact(previous=>({...previous,[chain]:data}));}).catch(()=>{if(!controller.signal.aborted)setImpact(previous=>({...previous,[chain]:null}));});return()=>controller.abort();},[refresh]);
 const amount=(raw:string|null|undefined)=>raw?Number(BigInt(raw))/1e18:null;
 const total=(key:'deadAmountRaw'|'communityAmountRaw')=>{const values=['robinhood','arc'].map(chain=>amount(impact[chain]?.[key]));return values.every(value=>value!==null)?values.reduce<number>((sum,value)=>sum+value!,0).toLocaleString(undefined,{maximumFractionDigits:4})+' MSS2':'Syncing chain totals…';};
 return <main className={styles.page}><div className={styles.shell}>
 <header className={styles.header}><Link href='/'>← YIELD VACCUM</Link><span>MSS2 COMMUNITY ARCADE</span><a href='#championship'>RANKINGS ↓</a></header>
 <section className={styles.hero}><div><small>THE NEXT HIGH SCORE IS YOURS.</small><h1>ENTER THE<br/><span>MINT ARCADE.</span></h1><p>One pilot. Every game. A new race to the top each week.</p><div className={styles.tags}><b>ROBINHOOD CHAIN + ARC</b><b>$1 MSS2 PER PAID GAME</b></div></div><div className={styles.heroArt} aria-hidden='true'><Badge icon='fleet'/><span>INSERT MSS2 · MAKE YOUR MARK</span></div></section>
 <section className={styles.profile}><div><small>YOUR PILOT</small><h2>{board?.profile?name:'YOUR ARCADE JOURNEY STARTS HERE'}</h2><p>{board?.profile?`${board.profile.points.toLocaleString()} championship points · ${board.profile.runs} saved games · Rank ${board.profile.rank}`:'Save a paid run to establish your pilot. New results across games join through your verified paying wallet.'}</p><small>Use the same wallet in every game. Different wallets remain separate pilots.</small></div><div className={styles.wallet}><WalletConnect theme='mss'/></div></section>
 <section className={styles.games} aria-label='Choose an arcade game'>
 <article className={styles.cabinet}><div className={styles.gameArt}><Badge icon='wings'/><small>COLLECT · COMBO · CLIMB</small></div><div className={styles.gameCopy}><small>MSS2 FLIGHT ARCADE</small><h2>MINT FLYER</h2><p>Collect coins, dodge hazards, and chase the Moon through three stages.</p><div className={styles.personal}>YOUR BEST <b>{board?.profile?.flyer?.toLocaleString()??'NO RUN YET'}</b></div><Link href='/arcade'>PLAY MINT FLYER →</Link></div></article>
 <article className={`${styles.cabinet} ${styles.invaders}`}><div className={styles.gameArt}><Badge icon='boss'/><small>DEFEND · SURVIVE · ADVANCE</small></div><div className={styles.gameCopy}><small>MSS2 RETRO SHOOTER</small><h2>MINT INVADERS</h2><p>Hold the line behind destructible bunkers. Beat the fleet. Face the mothership.</p><div className={styles.personal}>YOUR BEST <b>{board?.profile?.invaders?.toLocaleString()??'NO RUN YET'}</b></div><Link href='/arcade/mint-invaders'>PLAY MINT INVADERS →</Link></div></article>
 </section>
 <section id='championship' className={styles.board}><header><div><small>THE WHOLE ARCADE. ONE RACE.</small><h2>ARCADE <span>CHAMPIONSHIP</span></h2></div><button onClick={()=>setRefresh(value=>value+1)}>↻ REFRESH</button></header>
 <div className={styles.boardTools}><nav aria-label='Ranking period'>{[['week','THIS WEEK'],['all','ALL TIME']].map(([value,label])=><button key={value} aria-pressed={period===value} onClick={()=>setPeriod(value)}>{label}</button>)}</nav><span>{board?.pilots??'—'} PILOTS · {board?.runs??'—'} SAVED GAMES</span></div>
 <p className={styles.rules}>Your best score in each game earns 100–1,000 points based on its rank. Playing both games builds your combined standing. Extra attempts only count when you improve. Tied scores earn equal points.</p>
 {period==='week'&&<small>WEEKLY RACE · MONDAY 00:00 UTC TO MONDAY 00:00 UTC</small>}
 {error?<p role='status'>{error}</p>:!board?<p role='status'>Loading arcade standings…</p>:board.standings.length?<div className={styles.table}><div className={styles.tableHead}><span>PILOT</span><span>FLYER BEST</span><span>INVADERS BEST</span><span>POINTS</span></div>{board.standings.map(row=><article key={row.id}><div><b>{String(row.rank).padStart(2,'0')}</b><strong>{row.nickname}</strong></div><span>{row.flyer?.toLocaleString()??'—'}</span><span>{row.invaders?.toLocaleString()??'—'}</span><strong>{row.points.toLocaleString()}</strong></article>)}</div>:<div className={styles.empty}><Badge icon='crown'/><h3>CLAIM THE FIRST SPOT.</h3><p>Finish a paid game and save your score. Your pilot joins the race automatically.</p></div>}
 <p className={styles.note}>Rank points change as the field grows. Individual game leaderboards keep their original records. Earlier Flyer scores stay on its leaderboard; new saved runs join the championship. Scores are checked for consistency; championship points do not promise rewards.</p>
 </section>
 <section className={styles.impact}><div><small>EVERY PAID GAME CONTRIBUTES</small><h2>PLAY TOGETHER.<br/><span>BUILD TOGETHER.</span></h2><p>The same 20/80 entry split powers every MSS2 game. These on-chain totals include both networks and all arcade entries.</p></div><div className={styles.impactNumbers}><article><small>20% · SENT TO THE DEAD ADDRESS</small><strong>{total('deadAmountRaw')}</strong></article><article><small>80% · SENT TO COMMUNITY RESERVE</small><strong>{total('communityAmountRaw')}</strong></article><small>Cumulative contributions, rather than current reserve balance. No automatic reward payouts.</small></div></section>
 <footer>THE CRYPTO ARBORIST · MSS2 ARCADE · MORE CABINETS COMING SOON</footer>
 </div></main>;
}
