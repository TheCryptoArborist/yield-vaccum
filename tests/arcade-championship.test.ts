import test from 'node:test';
import assert from 'node:assert/strict';
import { championship } from '../lib/arcade-championship';
const pilot=(id:string,flyer:number|null,invaders:number|null,runs=1)=>({id,nickname:id,flyer,invaders,runs});
test('championship ranks each game separately instead of summing incompatible scores',()=>{
 const rows=championship([pilot('both',100,100),pilot('flyer',100000,null),pilot('invaders',null,10000)]);
 assert.equal(rows.find(row=>row.id==='both')?.points,200);
 assert.equal(rows.find(row=>row.id==='flyer')?.points,1000);
 assert.equal(rows.find(row=>row.id==='invaders')?.points,1000);
 assert.equal(rows[0].rank,1);assert.equal(rows[1].rank,1);
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
