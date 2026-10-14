"use client";
import { useEffect, useState } from "react";
import type { PaidArcadeAuthorization } from "../shared/paid-arcade-entry";
import type { InvadersResult } from "../../../lib/mint-invaders-result";
import styles from "./mint-invaders.module.css";
type Row = { nickname: string; score: number; wave: number; network: string };
export default function InvadersLeaderboard({ result, entry }: { result: InvadersResult | null; entry: PaidArcadeAuthorization | null }) {
  const [rows,setRows] = useState<Row[]>([]), [nickname,setNickname] = useState(""), [message,setMessage] = useState(""), [busy,setBusy] = useState(false), [saved,setSaved] = useState(""), [refresh,setRefresh] = useState(0);
  const [loaded,setLoaded] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/mint-invaders-leaderboard", { cache:"no-store", signal:controller.signal }).then(async response => { const data=await response.json(); if(!response.ok) throw new Error(data.error); if(!controller.signal.aborted){setRows(data.entries);setLoaded(true);setMessage("");} }).catch(() => {if(!controller.signal.aborted)setMessage("Leaderboard unavailable. Retry shortly.");});
    return()=>controller.abort();
  },[refresh]);
  const save = async () => {
    if(!result || !entry || busy) return;
    setBusy(true);
    try {
      const response=await fetch("/api/mint-invaders-leaderboard",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({...result,...entry,nickname}),signal:AbortSignal.timeout(20000)});
      const data=await response.json();if(!response.ok || !data.saved)throw new Error(data.error || "Result not saved.");
      setSaved(entry.runId);setMessage("Your paid score was saved.");setRefresh(value=>value+1);
    }catch(e){setMessage(e instanceof Error?e.message:"Result unavailable.");}finally{setBusy(false);}
  };
  return <section className={styles.leaderboard} id="mint-invaders-leaderboard"><small>PUBLIC · VERIFIED PAID ENTRIES</small><h2>MINT INVADERS LEADERBOARD</h2>
    {result && entry && saved!==entry.runId && <form onSubmit={event=>{event.preventDefault();void save();}}><label htmlFor="invaders-nickname">Name on the leaderboard</label><input id="invaders-nickname" value={nickname} maxLength={22} minLength={2} required onChange={event=>setNickname(event.target.value)} /><button disabled={busy}>{busy?"SAVING…":"SAVE MY SCORE"}</button><p>{result.score.toLocaleString()} points · Wave {result.wave}. Wallet addresses are not displayed publicly.</p></form>}
    <p role="status">{message || (!loaded?"Loading leaderboard…":!rows.length?"No ranked games yet. Finish a paid game to set the first score.":"Best score per player. View without connecting a wallet.")}</p>
    {rows.length>0 && <div className={styles.tableScroll}><table><thead><tr><th>Rank</th><th>Player</th><th>Score</th><th>Wave</th><th>Network</th></tr></thead><tbody>{rows.map((row,index)=><tr key={`${index}-${row.nickname}`}><td>{index+1}</td><td>{row.nickname}</td><td>{row.score.toLocaleString()}</td><td>{row.wave}</td><td>{row.network==="arc"?"Arc":"Robinhood"}</td></tr>)}</tbody></table></div>}
    <button onClick={()=>setRefresh(value=>value+1)}>REFRESH LEADERBOARD</button>
  </section>;
}
