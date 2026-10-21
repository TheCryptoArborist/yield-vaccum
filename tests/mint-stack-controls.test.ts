import assert from 'node:assert/strict';
import test from 'node:test';
import { beginStackGesture, endStackGesture, moveStackGesture, stackKeyAction, StackHeldControls } from '../lib/mint-stack-controls';

test('keyboard maps arrows, WASD, rotations, hold and pause without taking typing keys',()=>{
  for(const code of ['ArrowLeft','KeyA'])assert.equal(stackKeyAction(code),'left');
  for(const code of ['ArrowRight','KeyD'])assert.equal(stackKeyAction(code),'right');
  for(const code of ['ArrowUp','KeyW','KeyX'])assert.equal(stackKeyAction(code),'rotate');
  for(const code of ['ArrowDown','KeyS'])assert.equal(stackKeyAction(code),'soft');
  assert.equal(stackKeyAction('KeyZ'),'counter');assert.equal(stackKeyAction('Space'),'drop');
  for(const code of ['KeyC','ShiftLeft','ShiftRight'])assert.equal(stackKeyAction(code),'hold');
  for(const code of ['KeyP','Escape'])assert.equal(stackKeyAction(code),'pause');
  assert.equal(stackKeyAction('KeyQ'),undefined);assert.equal(stackKeyAction('','A'),'left');
});
test('held controls use a short initial delay, fixed repeat speed and stop on release or clear',()=>{
  const held=new StackHeldControls();
  assert.deepEqual(held.press('key:A','left',0),['left']);
  assert.deepEqual(held.press('key:A','left',50),[]);
  assert.deepEqual(held.poll(174),[]);assert.deepEqual(held.poll(175),['left']);
  assert.deepEqual(held.poll(224),[]);assert.deepEqual(held.poll(225),['left']);
  held.release('key:A',230);assert.deepEqual(held.poll(999),[]);
  held.press('pointer:1','soft',1000);assert.deepEqual(held.poll(1074),[]);assert.deepEqual(held.poll(1075),['soft']);
  held.clear();assert.deepEqual(held.poll(5000),[]);
});
test('the newest direction wins; releasing it resumes the older key without double-speed aliases',()=>{
  const held=new StackHeldControls();held.press('A','left',0);held.press('ArrowLeft','left',10);
  assert.deepEqual(held.poll(200),['left']);
  held.press('D','right',210);assert.deepEqual(held.poll(400),['right']);
  held.release('D',410);assert.deepEqual(held.poll(460),['left']);
  held.release('ArrowLeft',470);assert.deepEqual(held.poll(520),['left']);
  held.release('A',530);assert.deepEqual(held.poll(1000),[]);
});
test('a short tap rotates once and tolerates slight finger jitter',()=>{
  const g=beginStackGesture(1,100,100,300,0);
  assert.deepEqual(moveStackGesture(g,1,103,102),[]);
  assert.deepEqual(endStackGesture(g,1,103,102,150),['rotate']);
  assert.deepEqual(endStackGesture(g,2,103,102,150),[]);
  assert.deepEqual(endStackGesture(g,1,100,100,600),[]);
});
test('sideways and downward drags move in cell increments and never turn into rotations',()=>{
  const g=beginStackGesture(1,100,100,300,0);
  assert.deepEqual(moveStackGesture(g,1,162,100),['right','right']);
  assert.deepEqual(moveStackGesture(g,1,132,131),['soft']);
  assert.deepEqual(moveStackGesture(g,1,100,161),['left','left','soft']);
  assert.deepEqual(endStackGesture(g,1,100,100,250),[]);
});
test('upward gestures, coalesced drags and secondary pointers cannot accidentally rotate or hard-drop',()=>{
  const g=beginStackGesture(1,100,100,300,0);
  assert.deepEqual(moveStackGesture(g,2,10,300),[]);assert.equal(g.dragged,false);
  assert.deepEqual(moveStackGesture(g,1,100,60),[]);
  assert.deepEqual(endStackGesture(g,1,100,100,100),[]);
  assert.deepEqual(endStackGesture(beginStackGesture(1,100,100,300,0),1,150,100,100),[]);
  const burst=moveStackGesture(beginStackGesture(1,0,0,300,0),1,1000,1000);
  assert.equal(burst.length,10);assert.ok(!burst.includes('drop'));assert.ok(!burst.includes('rotate'));
});
