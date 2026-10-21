'use client';
import {useEffect,useState} from 'react';
import Link from 'next/link';
import WalletConnect,{type WalletConnection} from '../../wallet-connect';
import {arcadeWeekWindow} from '../../../lib/arcade-championship';
import {rewardsCsv,type AdminRewards,type RewardNetwork} from '../../../lib/arcade-admin-rewards';
import styles from './rewards-panel.module.css';
type Challenge={nonce:string;message:string;wallet:string;network:string;expiresAt:string};
export default function RewardsPanel(){
 const [wallet,setWallet]=useState<WalletConnection|null>(null),[authenticated,setAuthenticated]=useState(false),[challenge,setChallenge]=useState<Challenge|null>(null);
 const [data,setData]=useState<AdminRewards|null>(null),[week,setWeek]=useState(''),[message,setMessage]=useState(''),[busy,setBusy]=useState(false),[refresh,setRefresh]=useState(0);
 const [selected,setSelected]=useState<Record<string,RewardNetwork>>({}),[copied,setCopied]=useState('');
 const currentWeek=arcadeWeekWindow().start.toISOString().slice(0,10),shownWeek=week||currentWeek;
 useEffect(()=>{const controller=new AbortController();void fetch('/api/admin/arcade-session',{cache:'no-store',signal:controller.signal}).then(r=>r.json()).then(value=>{if(!controller.signal.aborted)setAuthenticated(value.authenticated===true);}).catch(()=>{if(!controller.signal.aborted)setMessage('Admin sign-in is temporarily unavailable.');});return()=>controller.abort();},[]);
 useEffect(()=>{
  if(authenticated||!wallet)return;
  const controller=new AbortController(),network=wallet.chainId.toLowerCase()==='0x13b2'?'arc':wallet.chainId.toLowerCase()==='0x1237'?'robinhood':null;
  if(!network)return;
  void fetch('/api/admin/arcade-session',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'challenge',wallet:wallet.account,network}),signal:controller.signal}).then(async r=>{const value=await r.json();if(!r.ok)throw new Error(value.error);if(!controller.signal.aborted){setChallenge(value);setMessage('Ready. Sign the administrator message to open private records.');}}).catch(e=>{if(!controller.signal.aborted)setMessage(e.message);});
  return()=>controller.abort();
 },[wallet,authenticated,refresh]);
 useEffect(()=>{
  if(!authenticated)return;
  const controller=new AbortController();let timer:ReturnType<typeof setTimeout>;
  const load=async()=>{
   try{const response=await fetch(`/api/admin/arcade-rewards?week=${shownWeek}`,{cache:'no-store',signal:AbortSignal.any([controller.signal,AbortSignal.timeout(20000)])});const value=await response.json();if(response.status===401){if(!controller.signal.aborted){setData(null);setAuthenticated(false);}throw new Error('Your admin session expired. Sign in again.');}if(!response.ok)throw new Error(value.error);if(!controller.signal.aborted){setData(value);setMessage('');}}
   catch(e){if(!controller.signal.aborted)setMessage(e instanceof Error?e.message:'Reward records unavailable.');}
   if(!controller.signal.aborted)timer=setTimeout(()=>void load(),60000);
  };void load();return()=>{controller.abort();clearTimeout(timer);};
 },[authenticated,shownWeek,refresh]);
 const signIn=async()=>{
  if(!wallet||!challenge||busy)return;
  const network=wallet.chainId.toLowerCase()==='0x13b2'?'arc':wallet.chainId.toLowerCase()==='0x1237'?'robinhood':null;
  if(wallet.account.toLowerCase()!==challenge.wallet||network!==challenge.network||Date.parse(challenge.expiresAt)<=Date.now()){setMessage('Refresh sign-in for the current wallet and network.');return;}
  setBusy(true);
  try{const signature=await wallet.signMessage(challenge.message);const r=await fetch('/api/admin/arcade-session',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'verify',nonce:challenge.nonce,signature})});const value=await r.json();if(!r.ok||!value.authenticated)throw new Error(value.error);setAuthenticated(true);setChallenge(null);setMessage('');}catch(e){setMessage(e instanceof Error?e.message:'Sign-in failed.');}finally{setBusy(false);}
 };
 const signOut=async()=>{setBusy(true);try{const r=await fetch('/api/admin/arcade-session',{method:'DELETE'});if(!r.ok)throw new Error('Sign-out failed. Please retry.');setData(null);setSelected({});setAuthenticated(false);setChallenge(null);}catch(e){setMessage(e instanceof Error?e.message:'Sign-out failed.');}finally{setBusy(false);}};
 const exportCsv=async()=>{
  setBusy(true);
  try{const r=await fetch(`/api/admin/arcade-rewards?week=${shownWeek}`,{cache:'no-store'});const value=await r.json();if(!r.ok){if(r.status===401){setData(null);setAuthenticated(false);}throw new Error(value.error);}const url=URL.createObjectURL(new Blob([rewardsCsv(value,selected)],{type:'text/csv;charset=utf-8'})),a=document.createElement('a');a.href=url;a.download=`mss2-weekly-rewards-${shownWeek}.csv`;a.click();URL.revokeObjectURL(url);setMessage('CSV exported with verified wallets and network review notes.');}catch(e){setMessage(e instanceof Error?e.message:'Export failed.');}finally{setBusy(false);}
 };
 const copy=async(address:string)=>{try{await navigator.clipboard.writeText(address);setCopied(address);}catch{setMessage('Select the full wallet address to copy it.');}};
 const shift=(days:number)=>{setData(null);setSelected({});setWeek(new Date(Date.parse(`${shownWeek}T00:00:00Z`)+days*86400000).toISOString().slice(0,10));};
 return <main className={styles.page}><header><Link href='/arcade/lobby'>← ARCADE LOBBY</Link><small>PRIVATE · ADMINISTRATOR ONLY</small></header><h1>Weekly rewards</h1><p>Review the top three places by paid games saved. Copy verified paying wallets or export a CSV for your MSS2 airdrop.</p>
 {!authenticated?<section className={styles.login}><h2>Sign in with your administrator wallet</h2><p>Connect the approved wallet on Arc or Robinhood Chain. Verification signs a message only.</p><WalletConnect theme='mss' onConnectionChange={setWallet}/><div className={styles.actions}><button disabled={!challenge||!wallet||busy||wallet.account.toLowerCase()!==challenge.wallet} onClick={()=>void signIn()}>{busy?'VERIFYING…':'VERIFY ADMIN WALLET'}</button><button disabled={busy} onClick={()=>setRefresh(value=>value+1)}>REFRESH SIGN-IN</button></div></section>:<><nav className={styles.actions}><button onClick={()=>shift(-7)}>← PREVIOUS WEEK</button><strong>Week of {shownWeek} · UTC</strong><button disabled={shownWeek>=currentWeek} onClick={()=>shift(7)}>NEXT WEEK →</button><button disabled={busy||!data} onClick={()=>void exportCsv()}>EXPORT CSV</button><button disabled={busy} onClick={()=>void signOut()}>SIGN OUT</button></nav>
 {data&&<section className={styles.summary}><b>{data.closed?'COMPLETED WEEK':'WEEK IN PROGRESS'}</b><span>{data.pilots} ranked players · {data.rows.length} recipients in the top three places</span>{data.tieReview&&<p className={styles.review}>There are tied players at the top-three cutoff. Review the tie before deciding recipients.</p>}{data.historyAudit?.pilots.some(pilot=>pilot.unverified>0)&&<p className={styles.review}>Some saved flights have no matching verified payment. Review the history check below before distributing rewards.</p>}<p>These are cumulative game counts, not payout amounts. Confirm the reward amounts and network before submitting an airdrop on MSS2.</p></section>}
 {!data?<p>Loading private reward records…</p>:data.rows.length?data.rows.map(row=><article key={row.id} className={styles.recipient}><div className={styles.rowHeading}><h2>#{row.rank} · {row.nickname}</h2><b>{row.games} GAMES PLAYED</b></div><p>Mint Flyer: {row.flyerGames} · Mint Invaders: {row.invadersGames} · Mint Stack: {row.stackGames??0}</p><label>VERIFIED PAYING WALLET</label><div className={styles.address}><code>{row.wallet}</code><button onClick={()=>void copy(row.wallet)}>{copied===row.wallet?'COPIED ✓':'COPY WALLET'}</button></div><p>Recorded game networks: {row.networks.map(network=>network==='arc'?'Arc':'Robinhood Chain').join(' + ')||'Not recorded'}{row.unknownNetwork?' · Network data is missing from some earlier game records.':''}</p><label htmlFor={`network-${row.id}`}>PAYOUT NETWORK FOR CSV</label><select id={`network-${row.id}`} value={selected[row.id]??(row.networks.length===1&&!row.unknownNetwork?row.networks[0]:'')} onChange={event=>setSelected(previous=>({...previous,[row.id]:event.target.value as RewardNetwork}))}><option value=''>Confirm with recipient</option>{(['arc','robinhood'] as const).map(network=><option key={network} value={network}>{network==='arc'?'Arc':'Robinhood Chain'}</option>)}</select>{selected[row.id]&&<p>Payout network confirmed for this CSV export.</p>}{row.networks.length>1&&<p className={styles.review}>This wallet played on both networks. Confirm the recipient’s reward network.</p>}</article>):<section className={styles.recipient}>No paid saved games in this weekly period.</section>}
 {data?.historyAudit&&<details className={styles.history}><summary>Mint Flyer history check · all time</summary><p>Weekly rewards count saved games with verified payments. Lifetime game totals can also include earlier practice flights.</p><div className={styles.historyScroll}><table><thead><tr><th>Pilot</th><th>Saved flights</th><th>Verified paid</th><th>Practice</th><th>Needs review</th></tr></thead><tbody>{data.historyAudit.pilots.map(pilot=><tr key={pilot.nickname}><th>{pilot.nickname}</th><td>{pilot.saved}</td><td>{pilot.verifiedPaid}</td><td>{pilot.practice}</td><td>{pilot.unverified}</td></tr>)}</tbody></table></div></details>}
 <footer><a href='https://www.mintstakeshare.com/arc' target='_blank' rel='noreferrer'>Open MSS2 on Arc ↗</a><a href='https://www.mintstakeshare.com/' target='_blank' rel='noreferrer'>Open MSS2 ↗</a><p>Admin access expires after 30 minutes. This panel does not send tokens or execute airdrops.</p></footer></>}
 <p role='status' className={styles.status}>{message}</p></main>;
}
