import { readStackProfile } from '../../../db/mint-stack-profile';
import { stackDatabase } from '../../../db/mint-stack';
import { requirePaymentForScore } from '../../../db/arcade-payments';
import { recordArcadeResult } from '../../../db/arcade-lobby';
import { deploymentContext } from '../../../lib/deployment-context';
import { replayStack, type StackEvent } from '../../../lib/mint-stack';
export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'no-store' };
export async function GET(request?: Request) {
  try {
    const db=stackDatabase(), context=deploymentContext();
    const entries=await db.sql`WITH best AS (SELECT DISTINCT ON(wallet_address) nickname,score,lines,level,network,created_at,wallet_address FROM mint_stack_runs WHERE context=${context} ORDER BY wallet_address,score DESC,lines DESC,created_at) SELECT nickname,score,lines,level,network,RANK() OVER(ORDER BY score DESC,lines DESC)::int AS rank FROM best ORDER BY score DESC,lines DESC,created_at LIMIT 50`;
    const stats=await db.sql`SELECT COUNT(*)::int AS games,COUNT(DISTINCT wallet_address)::int AS pilots,COALESCE(MAX(score),0)::int AS record FROM mint_stack_runs WHERE context=${context}`;
    const key=request?new URL(request.url).searchParams.get('playerKey'):null;
    const profile=key&&/^[a-zA-Z0-9-]{16,80}$/.test(key)?await readStackProfile(db,context,key):null;
    return Response.json({entries,stats:stats[0],profile},{headers});
  } catch { return Response.json({error:'Mint Stack rankings are temporarily unavailable.'},{status:503,headers}); }
}
export async function POST(request: Request) {
  try {
    const text=await request.text();if(text.length>500000)throw new Error('Replay too large.');
    const p=JSON.parse(text) as {playerKey:string;runId:string;paymentId:string;nickname:string;events:StackEvent[];ticks:number};
    if(![p.playerKey,p.runId,p.paymentId].every(v=>typeof v==='string'&&/^[a-zA-Z0-9-]{16,80}$/.test(v)))return Response.json({error:'A verified paid Mint Stack entry is required.'},{status:403,headers});
    const nickname=String(p.nickname??'').replace(/[^a-zA-Z0-9 _.-]/g,'').trim().slice(0,22);
    if(nickname.length<2)throw new Error('Choose a nickname with at least two characters.');
    const entry=await requirePaymentForScore({...p,game:'mint-stack'});
    const g=replayStack(p.paymentId,p.events,p.ticks);
    const availableTicks=Math.ceil((Date.now()-Date.parse(entry.verifiedAt??''))/50)+100;
    if(!Number.isFinite(availableTicks)||p.ticks>availableTicks)throw new Error('The replay exceeds the elapsed time since payment.');
    const db=stackDatabase(),context=deploymentContext();
    const before=await readStackProfile(db,context,p.playerKey,entry.walletAddress);
    const inserted=await db.sql`INSERT INTO mint_stack_runs(context,run_id,payment_id,player_key,wallet_address,nickname,network,score,lines,level,pieces,fours,ticks) VALUES(${context},${p.runId},${p.paymentId},${p.playerKey},${entry.walletAddress},${nickname},${entry.network},${g.score},${g.lines},${g.level},${g.pieces},${g.fours},${g.ticks}) ON CONFLICT DO NOTHING RETURNING run_id`;
    const rows=await db.sql`SELECT * FROM mint_stack_runs WHERE context=${context} AND run_id=${p.runId} AND player_key=${p.playerKey} AND payment_id=${p.paymentId}`;
    if(!rows[0])throw new Error('This payment has already been used for a different run.');
    const row=rows[0],createdAt=row.created_at instanceof Date?row.created_at.toISOString():new Date(String(row.created_at)).toISOString();
    await recordArcadeResult({game:'mint-stack',runId:p.runId,playerKey:p.playerKey,walletAddress:entry.walletAddress,nickname:String(row.nickname),score:Number(row.score),tieBreak:Number(row.lines),network:entry.network,createdAt});
    const profile=await readStackProfile(db,context,p.playerKey,entry.walletAddress);
    return Response.json({saved:true,score:Number(row.score),lines:Number(row.lines),profile,newlyUnlocked:inserted.length?profile.unlocked.filter(id=>!before.unlocked.includes(id)):[]},{headers});
  } catch(e) { return Response.json({error:e instanceof Error?e.message:'The result could not be saved. Retry with the same entry.'},{status:400,headers}); }
}
