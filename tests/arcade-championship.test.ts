import test from 'node:test';
import assert from 'node:assert/strict';
import { championship, gamesPlayedStandings, arcadeWeekWindow } from '../lib/arcade-championship';
const pilot=(id:string,flyer:number|null,invaders:number|null,runs=1)=>({id,nickname:id,flyer,invaders,runs});
test('championship ranks each game separately instead of summing incompatible scores',()=>{
 const rows=championship([pilot('both',100,100),pilot('flyer',100000,null),pilot('invaders',null,10000)]);
 assert.equal(rows.find(row=>row.id==='both')?.points,200);
 assert.equal(rows.find(row=>row.id==='flyer')?.points,1000);
 assert.equal(rows.find(row=>row.id==='invaders')?.points,1000);
 assert.equal(rows[0].rank,1);assert.equal(rows[1].rank,1);
});

test('participation ranks total games independently of scores and preserves ties',()=>{
 const rows=gamesPlayedStandings([pilot('high-score',99999,99999,1),pilot('many-a',1,null,4),pilot('many-b',null,1,4)]);
 assert.deepEqual(rows.map(row=>[row.id,row.runs,row.rank]),[['many-a',4,1],['many-b',4,1],['high-score',1,3]]);
 assert.deepEqual(gamesPlayedStandings([]),[]);
});
test('weekly archives use strict Monday UTC boundaries, including year rollover',()=>{
 const now=new Date('2026-10-14T16:00:00Z');
 assert.equal(arcadeWeekWindow(undefined,now).start.toISOString(),'2026-10-12T00:00:00.000Z');
 assert.equal(arcadeWeekWindow('2025-12-29',now).end.toISOString(),'2026-01-05T00:00:00.000Z');
 for(const date of ['2026-10-13','2026-10-19','2026-02-30','bad','2026-1-01'])assert.throws(()=>arcadeWeekWindow(date,now));
});
test('equal best scores earn equal points and extra saved runs do not buy rank',()=>{
 const rows=championship([pilot('one',100,null),pilot('many',100,null,200),pilot('third',50,null)]);
 assert.equal(rows[0].points,rows[1].points);assert.equal(rows[0].rank,rows[1].rank);
 assert.equal(rows[2].points,100);
});
test('a pilot completing both games can lead the shared competition',()=>{
 const rows=championship([pilot('both',200,200),pilot('single',100,null)]);
 assert.equal(rows[0].id,'both');assert.equal(rows[0].points,2000);
 assert.deepEqual(championship([]),[]);
});
