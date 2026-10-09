import assert from "node:assert/strict";
import test from "node:test";
import { isOver, move, newGame, validState, type MergeState } from "../lib/mint-merge";

const state = (board: number[]): MergeState => ({board,score:0,moves:0,seed:42});
test("new boards are deterministic with exactly two starting tiles", () => {
  assert.deepEqual(newGame(9), newGame(9));
  assert.equal(newGame(9).board.filter(Boolean).length,2);
});
test("tiles merge once per move and award resulting values", () => {
  const result = move(state([2,2,2,2,...Array(12).fill(0)]),"left");
  assert.deepEqual(result.state.board.slice(0,2),[4,4]);
  assert.equal(result.state.score,8);
  assert.equal(result.state.moves,1);
  assert.deepEqual(result.merged,[0,1]);
});
test("newly merged tiles cannot immediately merge again", () => {
  const result=move(state([2,2,4,0,...Array(12).fill(0)]),"left");
  assert.deepEqual(result.state.board.slice(0,2),[4,4]);
  assert.equal(result.state.score,4);
});
test("right up and down use correct traversal", () => {
  assert.equal(move(state([2,2,0,0,...Array(12).fill(0)]),"right").state.board[3],4);
  const column=[2,0,0,0,2,...Array(11).fill(0)];
  assert.equal(move(state(column),"up").state.board[0],4);
  assert.equal(move(state(column),"down").state.board[12],4);
});
test("invalid moves never consume RNG, turns, or add tiles", () => {
  const s=state([2,0,0,0,...Array(12).fill(0)]);
  const result=move(s,"left");
  assert.equal(result.changed,false);
  assert.equal(result.state,s);
});
test("game over requires full board with no adjacent matches", () => {
  const full=[2,4,2,4,4,2,4,2,2,4,2,4,4,2,4,2];
  assert.equal(isOver(full),true);
  assert.equal(isOver([...full.slice(0,15),0]),false);
  full[0]=4;
  assert.equal(isOver(full),false);
});
test("saved state validation rejects malformed tiles and scores", () => {
  assert.equal(validState(newGame(42)),true);
  assert.equal(validState({...newGame(42),score:-1}),false);
  assert.equal(validState({...newGame(42),board:Array(16).fill(3)}),false);
  assert.equal(validState({...newGame(42),board:[2]}),false);
});
test("replaying a move after undo produces the identical next tile", () => {
  const s=newGame(88);
  assert.deepEqual(move(s,"down"),move(s,"down"));
});
