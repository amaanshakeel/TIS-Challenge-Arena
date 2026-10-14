import test from 'node:test';
import assert from 'node:assert/strict';
import {buildMaze,inspectMaze,remainingSeconds} from '../js/arena-model.js';

test('maze has reachable opposite exits, branching dead ends and alternative routes',()=>{
  for(const seed of [1,42,2026]){
    const grid=buildMaze(seed),data=inspectMaze(grid);
    assert.ok(data.reachable);assert.ok(data.deadEnds>0);assert.ok(data.cycles>0);
    assert.equal(grid[0][1],'.');assert.equal(grid.at(-1).at(-2),'.');
    assert.ok(data.shortestPath.length>20);
    assert.ok(data.alternativePath.length>data.shortestPath.length,'a longer entrance-to-exit route must exist');
  }
});
test('maze validation rejects disconnected or nonrectangular layouts',()=>{
  assert.throws(()=>inspectMaze(['#.#','###','#.#']));
  assert.throws(()=>inspectMaze(['#.#','..','#.#']));
});
test('countdown uses monotonic elapsed time and cannot become negative',()=>{
  assert.equal(remainingSeconds(3000,1000,1500),3);
  assert.equal(remainingSeconds(3000,1000,5000),0);
});
