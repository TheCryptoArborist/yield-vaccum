export type Direction = "left" | "right" | "up" | "down";
export type MergeState = { board: number[]; score: number; moves: number; seed: number };

function random(seed: number): [number, number] {
  const next = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  return [next / 4294967296, next];
}

export function spawn(state: MergeState): MergeState {
  const empty = state.board.flatMap((value, i) => value === 0 ? [i] : []);
  if (!empty.length) return state;
  const [position, seed] = random(state.seed);
  const [value, nextSeed] = random(seed);
  const board = [...state.board];
  board[empty[Math.floor(position * empty.length)]] = value < .9 ? 2 : 4;
  return { ...state, board, seed: nextSeed };
}

export function newGame(seed: number): MergeState {
  return spawn(spawn({ board: Array(16).fill(0), score: 0, moves: 0, seed: seed >>> 0 }));
}

export function move(state: MergeState, direction: Direction): { state: MergeState; merged: number[]; changed: boolean } {
  const board = [...state.board];
  let points = 0;
  const merged: number[] = [];
  for (let line = 0; line < 4; line++) {
    const indices = Array.from({ length: 4 }, (_, i) => direction === "left" ? line * 4 + i : direction === "right" ? line * 4 + 3 - i : direction === "up" ? i * 4 + line : (3 - i) * 4 + line);
    const values = indices.map(i => state.board[i]).filter(Boolean);
    const output: number[] = [];
    for (let i = 0; i < values.length; i++) {
      if (values[i] === values[i + 1]) {
        const value = values[i] * 2;
        merged.push(indices[output.length]);
        points += value;
        output.push(value);
        i++;
      } else output.push(values[i]);
    }
    indices.forEach((index, i) => { board[index] = output[i] ?? 0; });
  }
  const changed = board.some((value, i) => value !== state.board[i]);
  return { state: changed ? spawn({ ...state, board, score: state.score + points, moves: state.moves + 1 }) : state, merged, changed };
}

export function isOver(board: number[]): boolean {
  return !board.includes(0) && board.every((value, i) =>
    (i % 4 === 3 || value !== board[i + 1]) && (i >= 12 || value !== board[i + 4]));
}

export function validState(value: unknown): value is MergeState {
  if (!value || typeof value !== "object") return false;
  const s = value as MergeState;
  return Array.isArray(s.board) && s.board.length === 16 && s.board.every(n => Number.isSafeInteger(n) && (n === 0 || (n >= 2 && Number.isInteger(Math.log2(n))))) && Number.isSafeInteger(s.score) && s.score >= 0 && Number.isSafeInteger(s.moves) && s.moves >= 0 && Number.isInteger(s.seed) && s.seed >= 0 && s.seed <= 4294967295;
}
