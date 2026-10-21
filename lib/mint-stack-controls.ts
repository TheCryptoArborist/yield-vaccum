import type { StackAction } from './mint-stack';

export function stackKeyAction(code: string, key = ''): StackAction | 'pause' | undefined {
  const codes: Record<string, StackAction | 'pause'> = {
    ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right',
    ArrowDown: 'soft', KeyS: 'soft', ArrowUp: 'rotate', KeyW: 'rotate', KeyX: 'rotate',
    KeyZ: 'counter', Space: 'drop', KeyC: 'hold', ShiftLeft: 'hold', ShiftRight: 'hold',
    KeyP: 'pause', Escape: 'pause',
  };
  const fallback: Record<string, StackAction | 'pause'> = {
    a: 'left', d: 'right', s: 'soft', w: 'rotate', x: 'rotate', z: 'counter',
    ' ': 'drop', c: 'hold', Shift: 'hold', p: 'pause', Escape: 'pause',
  };
  return codes[code] ?? fallback[key.length === 1 ? key.toLowerCase() : key];
}

type Held = { action: 'left' | 'right' | 'soft'; order: number; next: number };
// Repeat belongs to the game, not the operating system. Both keyboard and
// on-screen buttons use the same delay and speed. The newest direction wins.
export class StackHeldControls {
  private held = new Map<string, Held>();
  private order = 0;
  press(source: string, action: StackAction, now: number): StackAction[] {
    if (this.held.has(source)) return [];
    if (action === 'left' || action === 'right' || action === 'soft') {
      this.held.set(source, { action, order: ++this.order, next: now + (action === 'soft' ? 75 : 175) });
    }
    return [action];
  }
  release(source: string, now: number) {
    if (!this.held.delete(source)) return;
    for (const value of this.held.values()) value.next = Math.min(value.next, now + 50);
  }
  clear() { this.held.clear(); }
  poll(now: number): StackAction[] {
    const values = [...this.held.values()];
    const horizontal = values.filter(v => v.action !== 'soft').sort((a,b) => b.order - a.order)[0];
    const soft = values.filter(v => v.action === 'soft').sort((a,b) => b.order - a.order)[0];
    const result: StackAction[] = [];
    for (const held of [horizontal, soft]) {
      if (held && now >= held.next) { result.push(held.action); held.next = now + 50; }
    }
    return result;
  }
}

export type StackGesture = {
  id: number; startX: number; startY: number; x: number; y: number;
  cell: number; startedAt: number; dragged: boolean;
};
export function beginStackGesture(id: number, x: number, y: number, width: number, now: number): StackGesture {
  return { id, startX:x, startY:y, x, y, cell:Math.max(12,width/10), startedAt:now, dragged:false };
}
export function moveStackGesture(g: StackGesture, id: number, x: number, y: number): StackAction[] {
  if (g.id !== id) return [];
  if (Math.hypot(x-g.startX,y-g.startY) >= 8) g.dragged = true;
  const actions: StackAction[] = [];
  const dx = Math.trunc((x-g.x)/g.cell), dy = Math.max(0,Math.floor((y-g.y)/g.cell));
  // Bound bursts to the same per-tick action budget used by replay validation.
  const horizontal = Math.min(Math.abs(dx),5), vertical = Math.min(dy,5);
  for(let i=0;i<horizontal;i++) actions.push(dx<0?'left':'right');
  for(let i=0;i<vertical;i++) actions.push('soft');
  g.x += Math.sign(dx)*horizontal*g.cell; g.y += vertical*g.cell;
  return actions;
}
export function endStackGesture(g: StackGesture, id: number, x: number, y: number, now: number): StackAction[] {
  if(g.id !== id) return [];
  // Check the final position too: a browser may coalesce the last move event.
  const distance=Math.hypot(x-g.startX,y-g.startY);
  return !g.dragged && distance<8 && now-g.startedAt<=350 ? ['rotate'] : [];
}
