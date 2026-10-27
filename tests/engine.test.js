import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeConfig, uniformBound, solveScenario, replayTrace} from '../engine.js';

const examples = [
  [{N:12,m:3,times:[3,3,3],KM:1,Q0:1},30,3],
  [{N:12,m:3,times:[3,3,3],KM:2,Q0:2},19,5],
  [{N:12,m:3,times:[3,3,3],KM:2,Q0:1},19,6],
  [{N:9,m:4,times:[4,4,4,4],KM:2,Q0:2},17,6],
  [{N:60,m:10,times:Array(10).fill(6),KM:2,Q0:2},70,8],
  [{N:12,m:3,times:[3,3,3],KM:1,Q0:1,receiving:'turnover'},19,6]
];
for(const [input,expected,portals] of examples){
  test(`published uniform benchmark ${JSON.stringify(input)}`,()=>{
    const cfg=normalizeConfig(input),result=solveScenario(cfg);
    assert.equal(result.best.trace.clearance,expected);
    assert.equal(result.status,'proven');
    assert.ok(result.best.layout.portals<=portals);
    assert.deepEqual(result.best.trace.served.reduce((x,y)=>x+y,0),cfg.N);
    assert.equal(replayTrace(cfg,result.best.layout,result.best.trace.events).clearance,expected);
  });
}
test('mixed service durations return replay-verifiable schedules',()=>{
  for(const input of [
    {N:12,m:3,times:[1,3,5],KM:2,Q0:3},
    {N:18,m:4,times:[2,5,8,3],KM:1,Q0:1},
    {N:36,m:5,times:[3,5,4,3,6],KM:2,Q0:2},
    {N:4,m:3,times:[1,2,1],KM:1,Q0:2,receiving:'turnover'}
  ]){
    const cfg=normalizeConfig(input),res=solveScenario(cfg);
    assert.equal(res.status,'feasible');
    assert.ok(res.best.trace.clearance>=Math.min(...cfg.times)+5);
    const replay=replayTrace(cfg,res.best.layout,res.best.trace.events);
    assert.equal(replay.clearance,res.best.trace.clearance);
  }
});
test('input normalization and theoretical formula',()=>{
  const c=normalizeConfig({N:12,m:3,times:[3,3,3],KM:2,Q0:2});
  assert.equal(uniformBound(c).clearance,19);
  assert.equal(normalizeConfig({N:0,m:30,times:[-4]}).N,1);
  assert.equal(normalizeConfig({N:0,m:30}).m,12);
});
