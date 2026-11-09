/** Local-only additive reader access: archived evidence and fail-closed review.
 * The accepted base store/schema remain unchanged. No settlement credit mutation,
 * unfreeze, dispatcher, signing, production DB URL or browser API is added.
 */
import assert from 'node:assert/strict';
import pg from 'pg';
import {openResearchStore} from './store.mjs';
const hash=x=>{assert(typeof x==='string'&&/^0x[0-9a-f]{64}$/.test(x),'Invalid award ID');return x;};
export async function openReaderResearchStore(connectionString){
 const base=await openResearchStore(connectionString); // Performs loopback/name/override guards first.
 const u=new URL(connectionString);
 const pool=new pg.Pool({host:'127.0.0.1',port:Number(u.port||5432),database:'mss2_draw_research',
  user:decodeURIComponent(u.username),password:decodeURIComponent(u.password),ssl:false,max:8,
  connectionTimeoutMillis:5000,application_name:'daily-draw-reader-research'});
 base.settlements=async id=>(await pool.query('SELECT s.* FROM draw_research.settlements s JOIN draw_research.attempts t ON t.id=s.attempt_id WHERE t.award_id=$1',[hash(id)])).rows;
 base.requireReview=async(id,attemptId,reason)=>{
  hash(id);assert(typeof reason==='string'&&reason.length>0&&reason.length<=500,'Review reason required');
  const c=await pool.connect();
  try{
   await c.query('BEGIN');await c.query("SET LOCAL lock_timeout='5s'");await c.query("SET LOCAL statement_timeout='10s'");
   let a=(await c.query('SELECT * FROM draw_research.awards WHERE id=$1',[id])).rows[0];assert(a,'Unknown award');
   // Match the base store's lock order: sender lane -> award -> attempt.
   await c.query('INSERT INTO draw_research.sender_lanes(chain_id,sender) VALUES($1,$2) ON CONFLICT DO NOTHING',[a.chain_id,a.sender]);
   const lane=(await c.query('SELECT * FROM draw_research.sender_lanes WHERE chain_id=$1 AND sender=$2 FOR UPDATE',[a.chain_id,a.sender])).rows[0];
   a=(await c.query('SELECT * FROM draw_research.awards WHERE id=$1 FOR UPDATE',[id])).rows[0];
   const t=(await c.query('SELECT * FROM draw_research.attempts WHERE id=$1 AND award_id=$2 FOR UPDATE',[attemptId,id])).rows[0];assert(t,'Unknown attempt');
   if(!(lane.frozen&&a.phase==='ReviewRequired')){
    await c.query('UPDATE draw_research.sender_lanes SET frozen=true,reason=$3 WHERE chain_id=$1 AND sender=$2',[a.chain_id,a.sender,reason]);
    await c.query("UPDATE draw_research.awards SET phase='ReviewRequired',revision=revision+1 WHERE id=$1",[id]);
    await c.query("UPDATE draw_research.attempts SET phase='ReviewRequired' WHERE id=$1",[t.id]);
    await c.query('INSERT INTO draw_research.audit(award_id,kind,details) VALUES($1,$2,$3)',[id,'ReadOnlyWorkerReview',{attempt:t.id,reason}]);
   }
   await c.query('COMMIT');return {status:'ReviewRequired',reason:lane.frozen?lane.reason:reason};
  }catch(e){await c.query('ROLLBACK').catch(()=>{});throw e;}finally{c.release();}
 };
 const close=base.close.bind(base);base.close=async()=>{try{await close();}finally{await pool.end();}};
 return base;
}
