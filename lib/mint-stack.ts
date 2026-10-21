// Original falling-block engine. Every paid result is replayed by the server.
export const STACK_WIDTH = 10, STACK_HEIGHT = 20, STACK_TICK_MS = 50;
export const STACK_COLORS = ['#00000000', '#51e5fa', '#a68aff', '#ffc86a', '#71f3ae', '#ff7caa', '#648fff', '#ff995c'];
export const SHAPES = [
  [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]],
  [[0,1,0],[1,1,1],[0,0,0]], [[1,1],[1,1]],
  [[0,1,1],[1,1,0],[0,0,0]], [[1,1,0],[0,1,1],[0,0,0]],
  [[1,0,0],[1,1,1],[0,0,0]], [[0,0,1],[1,1,1],[0,0,0]],
];
export type StackAction = 'left'|'right'|'rotate'|'counter'|'soft'|'drop'|'hold';
export type StackEvent = { t: number; a: StackAction };
export type StackGame = {
  board: number[][]; piece: number; matrix: number[][]; x: number; y: number;
  queue: number[]; held: number|null; canHold: boolean; rng: number;
  score: number; lines: number; level: number; pieces: number; fours: number;
  ticks: number; gravity: number; lock: number; resets: number; over: boolean;
  lastClear: number; clearAt: number; clearRows: number[]; clearPoints: number;
};
function random(g: StackGame) { let n = g.rng; n ^= n << 13; n ^= n >>> 17; n ^= n << 5; g.rng = n >>> 0; return g.rng / 4294967296; }
function refill(g: StackGame) {
  if (g.queue.length >= 7) return;
  const bag = [0,1,2,3,4,5,6];
  for (let i=6;i>0;i--) { const j=Math.floor(random(g)*(i+1)); [bag[i],bag[j]]=[bag[j],bag[i]]; }
  g.queue.push(...bag);
}
export function collides(g: StackGame, x=g.x, y=g.y, matrix=g.matrix) {
  return matrix.some((row,dy)=>row.some((cell,dx)=>cell && (x+dx<0 || x+dx>=10 || y+dy>=20 || (y+dy>=0 && g.board[y+dy][x+dx]!==0))));
}
function spawn(g: StackGame, piece?: number) {
  refill(g); g.piece=piece ?? g.queue.shift()!; refill(g);
  g.matrix=SHAPES[g.piece].map(row=>[...row]); g.x=Math.floor((10-g.matrix.length)/2); g.y=-1;
  g.gravity=0;g.lock=0;g.resets=0;
  if (collides(g)) g.over=true;
}
export function createStackGame(seed: string): StackGame {
  let rng=2166136261;for(const c of seed) rng=Math.imul(rng^c.charCodeAt(0),16777619);
  const g:StackGame={board:Array.from({length:20},()=>Array(10).fill(0)),piece:0,matrix:[],x:3,y:0,queue:[],held:null,canHold:true,rng:(rng>>>0)||1,score:0,lines:0,level:1,pieces:0,fours:0,ticks:0,gravity:0,lock:0,resets:0,over:false,lastClear:0,clearAt:-100,clearRows:[],clearPoints:0};
  spawn(g);return g;
}
export function ghostY(g: StackGame) { let y=g.y;while(!collides(g,g.x,y+1))y++;return y; }
function settle(g: StackGame) {
  let above=false;
  g.matrix.forEach((row,dy)=>row.forEach((cell,dx)=>{if(cell){if(g.y+dy<0)above=true;else g.board[g.y+dy][g.x+dx]=g.piece+1;}}));
  if(above){g.over=true;return;}
  const clearRows=g.board.flatMap((row,index)=>row.every(cell=>cell!==0)?[index]:[]);
  const remaining=g.board.filter(row=>row.some(cell=>cell===0)),cleared=clearRows.length;
  g.lastClear=cleared;g.clearAt=g.ticks;
  if(cleared){g.clearRows=clearRows;g.clearPoints=[0,100,300,500,800][cleared]*g.level;g.board=[...Array.from({length:cleared},()=>Array(10).fill(0)),...remaining];g.score+=g.clearPoints;g.lines+=cleared;if(cleared===4)g.fours++;g.level=1+Math.floor(g.lines/10);}
  g.pieces++;g.canHold=true;spawn(g);
}
function act(g: StackGame, action: StackAction) {
  if(g.over)return;
  if(action==='drop'){const target=ghostY(g);g.score+=(target-g.y)*2;g.y=target;settle(g);return;}
  if(action==='hold') { if(!g.canHold)return;const previous=g.held;g.held=g.piece;spawn(g,previous??undefined);g.canHold=false;return; }
  if(action==='soft') { if(!collides(g,g.x,g.y+1)){g.y++;g.score++;g.gravity=0;}return; }
  let moved=false;
  if(action==='left'||action==='right'){const x=g.x+(action==='left'?-1:1);if(!collides(g,x)){g.x=x;moved=true;}}
  else {
    const m=action==='counter'?g.matrix[0].map((_,x)=>g.matrix.map(row=>row[g.matrix.length-1-x])):g.matrix[0].map((_,x)=>g.matrix.map(row=>row[x]).reverse());
    for(const [dx,dy] of [[0,0],[-1,0],[1,0],[-2,0],[2,0],[0,-1],[-1,-1],[1,-1]])if(!collides(g,g.x+dx,g.y+dy,m)){g.x+=dx;g.y+=dy;g.matrix=m;moved=true;break;}
  }
  if(moved&&g.resets<15){g.lock=0;g.resets++;}
}
export function stepStack(g: StackGame, actions: StackAction[]=[]) {
  if(g.over)return;
  g.ticks++;
  for(const action of actions)act(g,action);
  if(g.over)return;
  if(g.ticks>=144000){g.over=true;return;}
  g.gravity+=50;
  const interval=Math.max(70,800*Math.pow(.8,g.level-1));
  if(g.gravity>=interval){g.gravity=0;if(!collides(g,g.x,g.y+1))g.y++;}
  if(collides(g,g.x,g.y+1)){g.lock+=50;if(g.lock>=500)settle(g);}else g.lock=0;
}
export function replayStack(seed: string, events: StackEvent[], ticks: number, requireOver = true) {
  const actions:StackAction[]=['left','right','rotate','counter','soft','drop','hold'];
  if(!Number.isInteger(ticks)||ticks<(requireOver?1:0)||ticks>144000||!Array.isArray(events)||events.length>12000)throw new Error('Invalid replay length.');
  let previous=-1;
  for(const event of events){if(!Number.isInteger(event.t)||event.t<previous||event.t<0||event.t>=ticks||!actions.includes(event.a))throw new Error('Invalid replay action.');previous=event.t;}
  const g=createStackGame(seed);let cursor=0;
  for(let t=0;t<ticks;t++){if(g.over)throw new Error('Replay continues after game over.');const batch:StackAction[]=[];while(events[cursor]?.t===t)batch.push(events[cursor++].a);if(batch.length>10)throw new Error('Too many actions in one tick.');stepStack(g,batch);}
  if(requireOver&&!g.over)throw new Error('Finish the game before saving.');
  return g;
}
