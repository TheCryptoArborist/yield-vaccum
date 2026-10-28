'use client';
import {useEffect,useState} from 'react';
import type {AdminRewards,RewardNetwork} from '../../../lib/arcade-admin-rewards';
import {calculateRewardPayouts,eligibleRewardRecipients,exactRewardAmount,parseRewardAmount,payoutFingerprint,rewardPayoutCsv} from '../../../lib/arcade-reward-payouts';
import {formatEntryTotal} from '../../../lib/mss2-entry-totals-display';
import type {WeeklyEntryTotals} from '../../../lib/mss2-weekly-entry-totals';
import styles from './rewards-panel.module.css';
const chains=['robinhood','arc'] as const;
export default function PayoutCalculator({data,selected,onSessionExpired}:{data:AdminRewards;selected:Record<string,RewardNetwork>;onSessionExpired:()=>void}){
 const [funding,setFunding]=useState<Record<string,WeeklyEntryTotals|null>>({}),[budget,setBudget]=useState(''),[source,setSource]=useState('custom budget'),[reviewed,setReviewed]=useState(''),[message,setMessage]=useState(''),[busy,setBusy]=useState(false);
 useEffect(()=>{
  const controller=new AbortController();let timer:ReturnType<typeof setTimeout>;
  const load=async()=>{
   let delay=60000;
   await Promise.all(chains.map(async chain=>{
    try{
     const response=await fetch(`/api/arcade-weekly-totals?chain=${chain}&week=${data.weekStart.slice(0,10)}`,{cache:'no-store',signal:AbortSignal.any([controller.signal,AbortSignal.timeout(45000)])});const value=await response.json() as WeeklyEntryTotals;
     if(!response.ok||value.network!==chain||value.weekStart!==data.weekStart||value.weekEnd!==data.weekEnd||!['ready','syncing'].includes(value.status)||(value.status==='ready'&&!/^\d+$/.test(value.communityAmountRaw??'')))throw new Error('Funding unavailable');
     if(value.status==='syncing')delay=Math.min(delay,4000);
     if(!controller.signal.aborted)setFunding(previous=>({...previous,[chain]:value}));
    }catch{delay=Math.min(delay,15000);if(!controller.signal.aborted)setFunding(previous=>({...previous,[chain]:null}));}
   }));
   if(!controller.signal.aborted)timer=setTimeout(()=>void load(),delay);
  };void load();return()=>{controller.abort();clearTimeout(timer);};
 },[data.weekStart,data.weekEnd]);
 const fundingReady=chains.every(chain=>funding[chain]?.status==='ready');
 const pool=fundingReady?chains.reduce((sum,chain)=>sum+BigInt(funding[chain]!.communityAmountRaw!),BigInt(0)):null;
 let rows:ReturnType<typeof calculateRewardPayouts>=[],error='';
 if(budget)try{rows=calculateRewardPayouts(data,budget,selected);}catch(e){error=e instanceof Error?e.message:'Check the budget.';}
 const signature=JSON.stringify([payoutFingerprint(data),budget,source,selected,pool?.toString()]);
 const networksConfirmed=rows.length>0&&rows.every(row=>row.payoutNetwork);
 const verifiedBudgetMatches=source!=='verified weekly funding'||(pool!==null&&budget!==''&&parseRewardAmount(budget)===pool);
 const ready=data.closed&&networksConfirmed&&!error&&verifiedBudgetMatches;
 const planned=(chain:RewardNetwork)=>rows.filter(row=>row.payoutNetwork===chain).reduce((sum,row)=>sum+BigInt(row.amountRaw),BigInt(0));
 const download=async()=>{
  if(!ready||reviewed!==signature||busy)return;setBusy(true);setMessage('');
  try{
   const response=await fetch(`/api/admin/arcade-rewards?week=${data.weekStart.slice(0,10)}`,{cache:'no-store',signal:AbortSignal.timeout(25000)});const latest=await response.json() as AdminRewards&{error?:string};
   if(response.status===401){onSessionExpired();throw new Error('Your admin session expired. Sign in again.');}
   if(!response.ok)throw new Error(latest.error??'Could not refresh recipient records.');
   if(payoutFingerprint(latest)!==payoutFingerprint(data))throw new Error('Recipient records changed. Reload this week and review the updated plan.');
   const csv=rewardPayoutCsv(latest,budget,selected,source),url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));
   const a=document.createElement('a');a.href=url;a.download=`mss2-payout-plan-${data.weekStart.slice(0,10)}.csv`;a.click();URL.revokeObjectURL(url);setMessage('Payout plan exported. No tokens have been sent.');
  }catch(e){setReviewed('');setMessage(e instanceof Error?e.message:'Export failed.');}finally{setBusy(false);}
 };
 return <section className={styles.calculator} aria-label='Weekly reward payout calculator'><div className={styles.rowHeading}><div><small>PARTICIPATION REWARDS</small><h2>Review the payout plan</h2></div><b>{eligibleRewardRecipients(data.rows).reduce((sum,row)=>sum+row.games,0)} ELIGIBLE GAMES</b></div>
 <p>Top three eligible players, including everyone tied at third. Shares follow games played. Crypto Arborist is excluded.</p>
 <div className={styles.fundingGrid}>{chains.map(chain=><article key={chain}><small>{chain==='arc'?'ARC':'ROBINHOOD CHAIN'} · WEEKLY FUNDING</small><strong>{funding[chain]?.status==='ready'?`${formatEntryTotal(funding[chain]!.communityAmountRaw!)} MSS2`:funding[chain]===null?'Temporarily unavailable':'Syncing payments…'}</strong><span>Planned payouts: {formatEntryTotal(planned(chain).toString())} MSS2</span></article>)}</div>
 <p>Combined weekly funding: <b>{pool!==null?`${formatEntryTotal(pool.toString())} MSS2`:'Waiting for both networks'}</b>. Funding received is separate from the sending wallet’s current balance.</p>
 <label htmlFor='reward-budget'>TOTAL MSS2 TO DISTRIBUTE</label><div className={styles.budgetInput}><input id='reward-budget' inputMode='decimal' autoComplete='off' value={budget} onChange={e=>{setBudget(e.target.value);setSource('custom budget');}} placeholder='Enter the weekly reward budget'/><button disabled={pool===null||pool===BigInt(0)} onClick={()=>{setBudget(exactRewardAmount(pool!));setSource('verified weekly funding');}}>USE WEEKLY FUNDING</button></div>
 <p className={styles.budgetNote}>Use the confirmed weekly contributions, or enter a custom budget if you are including carryover. Budget source: {source}.</p>
 {error&&<p role='alert' className={styles.review}>{error}</p>}
 {rows.length>0&&<><div className={styles.payoutTable}><table><thead><tr><th>Player</th><th>Games</th><th>Share</th><th>MSS2 reward</th><th>Payout network</th></tr></thead><tbody>{rows.map(row=><tr key={row.id}><th>#{row.rank} {row.nickname}</th><td>{row.games}</td><td>{row.sharePercent}</td><td title={row.amount}>{formatEntryTotal(row.amountRaw)}</td><td>{row.payoutNetwork==='arc'?'Arc':row.payoutNetwork==='robinhood'?'Robinhood Chain':'Confirm below'}</td></tr>)}</tbody><tfoot><tr><th colSpan={3}>Total to distribute</th><td title={exactRewardAmount(rows.reduce((sum,row)=>sum+BigInt(row.amountRaw),BigInt(0)))}>{formatEntryTotal(rows.reduce((sum,row)=>sum+BigInt(row.amountRaw),BigInt(0)).toString())}</td><td/></tr></tfoot></table></div><p className={styles.budgetNote}>Amounts shown are rounded to six decimals. The CSV keeps full precision and the payouts equal the budget exactly.</p>
 {!networksConfirmed&&<p className={styles.review}>Confirm each recipient’s payout network in their wallet card below.</p>}
 {source==='verified weekly funding'&&!verifiedBudgetMatches&&<p className={styles.review}>Funding changed or is unavailable. Reload the weekly funding amount before reviewing the plan.</p>}
 <p>Check that your sending wallet has enough MSS2 on each chosen network. Funds collected on one chain do not move to the other automatically.</p>
 <label className={styles.reviewCheck}><input type='checkbox' checked={reviewed===signature} disabled={!ready||busy} onChange={e=>setReviewed(e.target.checked?signature:'')}/>I reviewed the week, recipients, budget, payout networks, and available sending-wallet balances.</label>
 <button disabled={!ready||reviewed!==signature||busy} onClick={()=>void download()}>{busy?'CHECKING RECORDS…':'EXPORT PAYOUT PLAN CSV'}</button></>}
 {!data.closed&&<p className={styles.review}>This week is still in progress. Amounts are estimates; payout export opens after Monday 00:00 UTC.</p>}
 <p role='status'>{message}</p></section>;
}
