'use client';
import Link from 'next/link';
import Image from 'next/image';
import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import PaidArcadeEntry, { type PaidArcadeAuthorization } from '../shared/paid-arcade-entry';
import { createStackGame, ghostY, replayStack, SHAPES, STACK_COLORS, stepStack, type StackAction, type StackEvent, type StackGame } from '../../../lib/mint-stack';
import { StackHeldControls, stackKeyAction, beginStackGesture, moveStackGesture, endStackGesture, type StackGesture } from '../../../lib/mint-stack-controls';
import Mss2EntryTotals from '../mss2-entry-totals';
import styles from './mint-stack.module.css';
import StackAchievements from './stack-achievements';
import type { StackProfile } from '../../../lib/mint-stack-achievements';
type Row={nickname:string;rank:number;score:number;lines:number;level:number;network:string};
type ClearEffect={id:number;rows:number[];points:number};
type Session={entry:PaidArcadeAuthorization;events:StackEvent[];ticks:number;started:boolean};
const sessionKey='mint-stack-session-v1';
const validEntry=(entry:PaidArcadeAuthorization)=>entry&&[entry.paymentId,entry.runId,entry.playerKey].every(value=>typeof value==='string'&&/^[a-zA-Z0-9-]{16,80}$/.test(value))&&['arc','robinhood'].includes(entry.network);
function Piece({piece}:{piece:number|null}) {
  return <div className={styles.preview} aria-hidden='true'>{Array.from({length:16},(_,index)=>{
    const cell=piece!==null&&SHAPES[piece][Math.floor(index/4)]?.[index%4];
    return <i key={index} style={{background:cell?STACK_COLORS[piece!+1]:undefined}}/>;
  })}</div>;
}
export default function MintStack(){
  const engine=useRef<StackGame|null>(null), events=useRef<StackEvent[]>([]), queued=useRef<StackAction[]>([]);
  const authorization=useRef<PaidArcadeAuthorization|null>(null), paused=useRef(false), started=useRef(false);
  const [clearEffect,setClearEffect]=useState<ClearEffect|null>(null),clearId=useRef(0);
  const [game,setGame]=useState<StackGame|null>(null),[entry,setEntry]=useState<PaidArcadeAuthorization|null>(null),[isPaused,setPaused]=useState(false);
  const [rows,setRows]=useState<Row[]>([]),[stats,setStats]=useState<{games:number;pilots:number;record:number}|null>(null),[loaded,setLoaded]=useState(false);
  const [nickname,setNickname]=useState(''),[message,setMessage]=useState(''),[saving,setSaving]=useState(false),[saved,setSaved]=useState(false),[refresh,setRefresh]=useState(0);
  const [profile,setProfile]=useState<StackProfile|null>(null),[newlyUnlocked,setNewlyUnlocked]=useState<string[]>([]);
  const [sound,setSound]=useState(true),soundOn=useRef(true),audio=useRef<AudioContext|null>(null);
  const board=useRef<HTMLDivElement>(null),held=useRef(new StackHeldControls());
  const gesture=useRef<StackGesture|null>(null),buttonPointer=useRef<number|null>(null);
  const pauseToggle=useRef<()=>void>(()=>{});
  const paint=()=>{if(engine.current)setGame({...engine.current,board:engine.current.board.map(row=>[...row])});};
  const persist=()=>{if(authorization.current)try{localStorage.setItem(sessionKey,JSON.stringify({entry:authorization.current,events:events.current,ticks:engine.current?.ticks??0,started:started.current}));}catch{/* The current session remains available. */}};
  const beep=(frequency:number,duration=.07)=>{
    if(!soundOn.current||audio.current?.state!=='running')return;
    const a=audio.current,o=a.createOscillator(),gain=a.createGain();o.type='triangle';o.frequency.value=frequency;
    gain.gain.setValueAtTime(.065,a.currentTime);gain.gain.exponentialRampToValueAtTime(.001,a.currentTime+duration);o.connect(gain);gain.connect(a.destination);o.start();o.stop(a.currentTime+duration);
  };
  const enableAudio=()=>{try{audio.current??=new AudioContext();void audio.current.resume().catch(()=>{});}catch{/* Sound is optional. */}};
  const command=useCallback((a:StackAction)=>{if(!engine.current||engine.current.over||paused.current||queued.current.length>=10||events.current.length+queued.current.length>=12000)return;queued.current.push(a);},[]);
  const resetControls=useCallback(()=>{held.current.clear();gesture.current=null;buttonPointer.current=null;queued.current=[];},[]);
  const pause=()=>{if(!engine.current||engine.current.over)return;paused.current=!paused.current;setPaused(paused.current);resetControls();persist();if(!paused.current){enableAudio();board.current?.focus({preventScroll:true});}};
  const start=()=>{
    if(!authorization.current||started.current)return;
    setClearEffect(null);started.current=true;engine.current=createStackGame(authorization.current.paymentId);events.current=[];resetControls();paused.current=false;setPaused(false);setSaved(false);setMessage('');enableAudio();paint();persist();board.current?.focus({preventScroll:true});
  };
  const authorized=(value:PaidArcadeAuthorization)=>{if(!validEntry(value))return;authorization.current=value;started.current=false;events.current=[];engine.current=null;setGame(null);setEntry(value);persist();};
  useEffect(()=>{pauseToggle.current=pause;});
  useEffect(()=>{
    if(!clearEffect)return;
    const timer=setTimeout(()=>setClearEffect(null),700);return()=>clearTimeout(timer);
  },[clearEffect]);
  useEffect(()=>{
    const restore=setTimeout(()=>{
      try{
        setNickname(localStorage.getItem('mss2-arcade-nickname')??'');
        const session=JSON.parse(localStorage.getItem(sessionKey)??'null') as Session|null;
        if(session&&validEntry(session.entry)){
          const g=session.started?replayStack(session.entry.paymentId,session.events,session.ticks,false):null;
          authorization.current=session.entry;setEntry(session.entry);started.current=session.started;events.current=session.events;engine.current=g;
          if(g){paused.current=!g.over;setPaused(!g.over);paint();}
        }
      }catch{setMessage('The saved session could not be restored. Keep your payment reference for support.');}
    },0);
    const timer=setInterval(()=>{
      const g=engine.current;if(!g||g.over||paused.current)return;
      for(const action of held.current.poll(performance.now()))command(action);
      const batch=queued.current.splice(0,10);for(const a of batch)events.current.push({t:g.ticks,a});
      const oldLines=g.lines,oldPieces=g.pieces;stepStack(g,batch);
      if(g.lines>oldLines){
        setClearEffect({id:++clearId.current,rows:[...g.clearRows],points:g.clearPoints});
        beep(g.clearRows.length===4?880:660,.2);
      }else if(g.pieces>oldPieces)beep(180);else if(batch.includes('rotate'))beep(420,.035);
      if(g.over)resetControls();
      paint();if(g.ticks%20===0||g.over)persist();
    },50);
    const key=(event:KeyboardEvent)=>{
      if(!(event.target instanceof Element)||event.target.closest('input,textarea,select,[contenteditable]:not([contenteditable="false"])')||!engine.current||engine.current.over)return;
      const action=stackKeyAction(event.code,event.key);if(!action)return;
      if(action==='pause'){event.preventDefault();if(!event.repeat)pauseToggle.current();return;}
      if(event.target.closest('button,a')||paused.current)return;
      event.preventDefault();if(event.repeat)return;
      for(const a of held.current.press(`key:${event.code||event.key}`,action,performance.now()))command(a);
    };
    const keyUp=(event:KeyboardEvent)=>held.current.release(`key:${event.code||event.key}`,performance.now());
    const blur=()=>{if(engine.current&&!engine.current.over){paused.current=true;setPaused(true);resetControls();persist();}};
    const hidden=()=>{if(document.hidden)blur();};
    window.addEventListener('keydown',key);window.addEventListener('keyup',keyUp);window.addEventListener('blur',blur);document.addEventListener('visibilitychange',hidden);
    return()=>{clearTimeout(restore);clearInterval(timer);resetControls();persist();window.removeEventListener('keydown',key);window.removeEventListener('keyup',keyUp);window.removeEventListener('blur',blur);document.removeEventListener('visibilitychange',hidden);void audio.current?.close();};
    // These callbacks read session refs; the engine loop stays mounted once.
  },[command,resetControls]);
  useEffect(()=>{
    const controller=new AbortController();
    let playerKey=entry?.playerKey;
    try{playerKey??=localStorage.getItem('mint-stack-player-v1')??undefined;}catch{/* Public rankings remain available when storage is blocked. */}
    void fetch('/api/mint-stack-leaderboard'+(playerKey?'?playerKey='+encodeURIComponent(playerKey):''),{cache:'no-store',signal:controller.signal}).then(async r=>{const d=await r.json();if(!r.ok)throw new Error(d.error);if(!controller.signal.aborted){setRows(d.entries);setStats(d.stats);setProfile(d.profile??null);setLoaded(true);}}).catch(()=>{if(!controller.signal.aborted)setMessage('Rankings are temporarily unavailable. You can retry saving or refresh the board.');});
    return()=>controller.abort();
  },[refresh,entry?.playerKey]);
  const save=async()=>{
    if(!entry||!game?.over||saving)return;setSaving(true);
    try{const response=await fetch('/api/mint-stack-leaderboard',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...entry,nickname,events:events.current,ticks:game.ticks}),signal:AbortSignal.timeout(30000)});const data=await response.json();if(!response.ok||!data.saved)throw new Error(data.error??'Save failed.');setProfile(data.profile??null);setNewlyUnlocked(data.newlyUnlocked??[]);setSaved(true);setMessage('Score saved. This game counts toward your weekly arcade participation.');setRefresh(v=>v+1);try{localStorage.setItem('mss2-arcade-nickname',nickname);localStorage.removeItem(sessionKey);}catch{}}catch(e){setMessage(e instanceof Error?e.message:'Save failed. Retry with the same entry.');}finally{setSaving(false);}
  };
  const nextGame=()=>{if(!saved&&!window.confirm('Your score has not been saved. Start a new paid entry anyway?'))return;authorization.current=null;started.current=false;engine.current=null;events.current=[];queued.current=[];setEntry(null);setGame(null);setSaved(false);try{localStorage.removeItem(sessionKey);}catch{}};
  const cells=game?.board.map(row=>[...row])??Array.from({length:20},()=>Array(10).fill(0));
  const ghosts=new Set<number>();
  if(game&&!game.over){const y=ghostY(game);game.matrix.forEach((row,dy)=>row.forEach((cell,dx)=>{if(cell&&y+dy>=0)ghosts.add((y+dy)*10+game.x+dx);if(cell&&game.y+dy>=0)cells[game.y+dy][game.x+dx]=game.piece+1;}));}
  return <main className={styles.page}><div className={styles.shell}>
    <header className={styles.nav}><Link href='/arcade/lobby'>← ARCADE LOBBY</Link><span>MSS2 ARCADE / CABINET 03</span><Image src='/mss2-flyer-emblem.png' alt='MSS2' width={38} height={38}/></header>
    <section className={styles.hero}><div><small>FIND YOUR FLOW. CLEAR YOUR NEXT LINE.</small><h1>MINT <span>STACK</span></h1><p>A little planning. A quick rotation. One perfect fit.</p></div><nav className={styles.heroLinks} aria-label='Mint Stack sections'><a href='#mint-stack-game'>PLAYFIELD ↓</a><a href='#stack-board'>RANKINGS ↓</a><a href='#stack-achievements'>BADGES ↓</a></nav></section>
    <div className={styles.utility}><b>$1 WORTH OF MSS2 / GAME</b><span><strong>20%</strong> to the dead address</span><span><strong>80%</strong> to community rewards reserve</span></div>
    <div className={styles.workspace}>
    <section className={styles.entryDock} aria-label='Your Mint Stack entry'>
      <header className={styles.panelHeading}><small>{entry?'YOU’RE IN':'YOUR NEXT RUN'}</small><h2>{entry?'ENTRY VERIFIED':'CONNECT & PLAY'}</h2><p>{entry?`${entry.network==='arc'?'Arc':'Robinhood Chain'} · ${game?.over?'Run complete':game?'Game in progress':'Ready when you are'}`:'MetaMask, Rabby, or Topaz ID. Choose your network below.'}</p></header>
      {!entry?<PaidArcadeEntry game='mint-stack' compact className={styles.compactEntry} onAuthorized={authorized}/>:<div className={styles.verifiedEntry}><span aria-hidden='true'>✓</span><p>{game?.over?'Save your score below to join the weekly standings.':game?'Every cleared line brings your next high score closer.':'Your entry is confirmed. Press START PAID GAME on the playfield.'}</p></div>}
    </section>
    <section id='mint-stack-game' className={styles.cabinet} aria-label='Mint Stack game'>
      <div className={styles.marquee}><span><i/> MINT STACK</span><div><button aria-pressed={sound} onClick={()=>{soundOn.current=!sound;setSound(!sound);enableAudio();}}>SOUND {sound?'ON':'OFF'}</button><button onClick={pause} disabled={!game||game.over}>{isPaused?'RESUME':'PAUSE'}</button></div></div>
      <div className={styles.hud}><div><small>SCORE</small><strong>{(game?.score??0).toLocaleString()}</strong></div><div><small>LINES</small><strong>{game?.lines??0}</strong></div><div><small>LEVEL</small><strong>{String(game?.level??1).padStart(2,'0')}</strong></div><div><small>RECORD</small><strong>{stats?.record.toLocaleString()??'—'}</strong></div></div>
      <div className={styles.levelProgress}><span>NEXT LEVEL</span><div role="progressbar" aria-label="Lines toward the next level" aria-valuemin={0} aria-valuemax={10} aria-valuenow={(game?.lines??0)%10}><i style={{width:`${(game?.lines??0)%10*10}%`}}/></div><b>{10-(game?.lines??0)%10} lines</b></div>
      <div className={styles.playArea}>
        <div className={styles.boardWrap}>
          <div className={`${styles.board} ${game&&!game.over&&!isPaused?styles.interactive:''}`} ref={board} tabIndex={0} role='application' aria-describedby='stack-control-guide' aria-label={`Mint Stack playfield. ${game?.score??0} points, ${game?.lines??0} lines.`}
            onPointerDown={e=>{
              if(!engine.current||engine.current.over||paused.current||gesture.current||buttonPointer.current!==null||!e.isPrimary||e.button!==0||(e.target as Element).closest('button,a'))return;
              e.preventDefault();e.currentTarget.focus({preventScroll:true});e.currentTarget.setPointerCapture(e.pointerId);
              gesture.current=beginStackGesture(e.pointerId,e.clientX,e.clientY,e.currentTarget.clientWidth,performance.now());
            }}
            onPointerMove={e=>{const g=gesture.current;if(!g||g.id!==e.pointerId)return;e.preventDefault();for(const a of moveStackGesture(g,e.pointerId,e.clientX,e.clientY))command(a);}}
            onPointerUp={e=>{
              const g=gesture.current;if(!g||g.id!==e.pointerId)return;
              gesture.current=null;for(const a of endStackGesture(g,e.pointerId,e.clientX,e.clientY,performance.now()))command(a);
              if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId);
            }}
            onPointerCancel={e=>{if(gesture.current?.id===e.pointerId)gesture.current=null;}}
            onLostPointerCapture={e=>{if(gesture.current?.id===e.pointerId)gesture.current=null;}}
          >
            {cells.flat().map((cell,index)=><i key={index} className={`${styles.cell} ${cell?styles.filled:''} ${!cell&&ghosts.has(index)?styles.ghost:''}`} style={cell?{background:STACK_COLORS[cell],color:STACK_COLORS[cell]}:undefined}/>)}
            {clearEffect&&<div key={clearEffect.id} className={`${styles.clearEffect} ${clearEffect.rows.length===4?styles.fourClear:''}`} aria-hidden='true' data-line-clear={clearEffect.rows.length}>
              {clearEffect.rows.map(row=><div key={row} className={styles.clearRow} style={{top:`${row*5}%`}}>
                <span className={styles.clearBeam}/>
                {Array.from({length:10},(_,i)=><i key={i} className={styles.clearParticle} style={{left:`${5+i*10}%`,'--dx':`${(i-4.5)*12}px`,'--dy':`${-24-(i%3)*14}px`,'--delay':`${i%3*15}ms`} as CSSProperties}/>)}
              </div>)}
              <div className={styles.clearBadge} style={{top:`${Math.min(84,Math.max(12,clearEffect.rows[0]*5-8))}%`}}>
                <b>{['','LINE CLEAR','DOUBLE CLEAR','TRIPLE CLEAR','FOUR-LINE CLEAR'][clearEffect.rows.length]}</b><span>+{clearEffect.points.toLocaleString()} POINTS</span>
              </div>
            </div>}
            {(!game||isPaused||game.over)&&<div className={styles.overlay}><small>{game?.over?'RUN COMPLETE':isPaused?'TAKE A BREATHER':'YOUR NEXT HIGH SCORE STARTS HERE'}</small><h2>{game?.over?'STACK FULL':isPaused?'PAUSED':'MAKE IT FIT.'}</h2><p>{game?.over?`${game.score.toLocaleString()} points · ${game.lines} lines · Level ${game.level}`:isPaused?'Your game is waiting right here.':'Stack the blocks. Clear complete rows. Stay below the skyline.'}</p>{!game?<button disabled={!entry} onClick={start}>{entry?'START PAID GAME':'CONNECT & PLAY'}</button>:isPaused?<button onClick={pause}>RESUME GAME</button>:<a href='#stack-board'>SAVE YOUR SCORE ↓</a>}</div>}
          </div>
        </div>
        <aside className={styles.side}><div><small>HOLD · C</small><Piece piece={game?.held??null}/></div><div><small>NEXT UP</small>{[0,1,2].map(index=><Piece key={index} piece={game?.queue[index]??index}/>)}</div><div className={styles.tip}><b>QUICK CONTROLS</b><span className={styles.desktopTip}>Tap: rotate<br/>Drag: move<br/>↓ / S: lower<br/>SPACE: drop<br/>C: hold<br/>P / ESC: pause</span><span className={styles.touchTip}>Tap ↷<br/>Drag ↔<br/>Down ↓</span></div></aside>
      </div>
      <div className={styles.controls} aria-label='On-screen game controls'>{([['left','←','Move left'],['right','→','Move right'],['counter','↶','Rotate left'],['rotate','↷','Rotate right'],['soft','↓','Soft drop'],['hold','HOLD','Hold piece'],['drop','DROP ↓','Hard drop']] as const).map(([action,label,description])=><button key={action} disabled={!game||game.over||isPaused} aria-label={description}
        onPointerDown={e=>{
          if(buttonPointer.current!==null||gesture.current||!e.isPrimary||e.button!==0)return;
          e.preventDefault();e.currentTarget.setPointerCapture(e.pointerId);buttonPointer.current=e.pointerId;
          for(const a of held.current.press(`pointer:${e.pointerId}`,action,performance.now()))command(a);
          board.current?.focus({preventScroll:true});
        }}
        onPointerUp={e=>{held.current.release(`pointer:${e.pointerId}`,performance.now());if(buttonPointer.current===e.pointerId)buttonPointer.current=null;}}
        onPointerCancel={e=>{held.current.release(`pointer:${e.pointerId}`,performance.now());if(buttonPointer.current===e.pointerId)buttonPointer.current=null;}}
        onLostPointerCapture={e=>{held.current.release(`pointer:${e.pointerId}`,performance.now());if(buttonPointer.current===e.pointerId)buttonPointer.current=null;}}
        onClick={e=>{if(e.detail===0)command(action);}}
      >{label}</button>)}</div>
      <div className={styles.controlGuide} id='stack-control-guide'>
        <p><b>TOUCH / MOUSE</b><span>Tap or click to rotate · Drag sideways to move · Drag down to lower · Use DROP for an instant landing</span></p>
        <p><b>KEYBOARD</b><span>← → / A D move · ↑ / W / X rotate · Z reverse · ↓ / S lower · SPACE drop · C / SHIFT hold · P / ESC pause</span></p>
      </div>
    </section>
    <section className={styles.rankings} id='stack-board'><header><div><small>THE NEXT HIGH SCORE IS YOURS.</small><h2>STACK <span>RANKINGS</span></h2><p>Best run per pilot. Every saved paid game counts toward weekly participation.</p></div><button onClick={()=>setRefresh(v=>v+1)}>↻ REFRESH</button></header>
      <div className={styles.boardStats}><div><small>PILOTS</small><strong>{stats?.pilots.toLocaleString()??'—'}</strong></div><div><small>GAMES SAVED</small><strong>{stats?.games.toLocaleString()??'—'}</strong></div><div><small>RECORD</small><strong>{stats?.record.toLocaleString()??'—'}</strong></div></div>
      {game?.over&&entry&&<div className={styles.result}><div><small>YOUR RUN</small><strong>{game.score.toLocaleString()} POINTS</strong><span>{game.lines} lines · {game.fours} four-line clears</span></div>{!saved?<form onSubmit={e=>{e.preventDefault();void save();}}><label htmlFor='stack-nickname'>PILOT NAME</label><div><input id='stack-nickname' value={nickname} onChange={e=>setNickname(e.target.value)} minLength={2} maxLength={22} required placeholder='Your arcade name'/><button disabled={saving}>{saving?'SAVING…':'SAVE SCORE'}</button></div></form>:<b>✓ SCORE SAVED</b>}<button onClick={nextGame} disabled={saving}>NEW PAID GAME</button></div>}
      <p role='status' className={styles.status}>{message||(!loaded?'Loading rankings…':'')}</p>
      {loaded&&!rows.length&&<div className={styles.emptyBoard}><div className={styles.blockMark} aria-hidden='true'><i/><i/><i/><i/></div><b>YOUR NAME GOES HERE.</b><p>Finish a paid run and save your score to claim a place on the board.</p></div>}
      {rows.length>0&&<div className={styles.table} role='region' aria-label='Mint Stack high scores' tabIndex={0}><div><span>RANK / PILOT</span><span>LINES</span><span>SCORE</span></div>{rows.map((row,index)=><article key={index}><div><b>{String(row.rank).padStart(2,'0')}</b><span><strong>{row.nickname}</strong><small>{row.network==='arc'?'ARC':'ROBINHOOD CHAIN'} · LEVEL {row.level}</small></span></div><span>{row.lines}</span><strong>{row.score.toLocaleString()}</strong></article>)}</div>}
    </section>
    </div>
    <StackAchievements profile={profile} newlyUnlocked={newlyUnlocked}/>
    <details className={styles.rules}><summary>HOW TO PLAY + SCORING</summary><p>Fill a complete horizontal row to clear it. Clear 1 / 2 / 3 / 4 rows together for 100 / 300 / 500 / 800 points × your current level. Soft drops add 1 point per cell; hard drops add 2. Every 10 cleared rows increases your level and the falling speed. Hold one piece for later; hold becomes available again after the next piece locks. The outlined ghost shows where your piece will land.</p><p>The run ends when blocks reach the top. Each new game requires a new verified $1 MSS2 payment. Network gas is separate. Scores are replayed on the server before saving. Use the same paying wallet across games to join your weekly participation totals.</p></details>
    <div className={styles.impactDock}><Mss2EntryTotals network={entry?.network??'robinhood'} paymentId={entry?.paymentId??''}/></div>
    <footer>THE CRYPTO ARBORIST · MSS2 COMMUNITY ARCADE · <Link href='/arcade/lobby'>BACK TO THE LOBBY</Link></footer>
  </div></main>;
}
