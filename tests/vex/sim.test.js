import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ROBOT } from '../../content/vex/js/core/robot-config.js';
import { createSim, stepSim, runScript, planSteps, MAX_STEPS_PER_FRAME } from '../../content/vex/js/core/sim.js';
import { createRng } from '../../content/vex/js/core/random.js';
import { appendBounded } from '../../content/vex/js/core/trail.js';

test('runScript records one frame per tick with truth, estimate and debug', () => {
  const frames = runScript([{ duration: 0.5, left: 1, right: 1 }], { cfg: ROBOT });
  assert.equal(frames.length, 50);
  const f = frames.at(-1);
  assert.ok(Math.abs(f.t - 0.5) < 1e-9);
  assert.ok(f.truth.y > 0 && f.estimate.y > 0);
  assert.ok('localChord' in f.debug);
});

test('runScript is deterministic for a seed, even with noise', () => {
  const opts = { cfg: ROBOT, env: { setup: 'threeWheel', noise: 2, slip: 1 }, seed: 9 };
  const a = runScript([{ duration: 1, left: 1, right: 0.7 }], opts);
  const b = runScript([{ duration: 1, left: 1, right: 0.7 }], opts);
  assert.deepEqual(a.at(-1), b.at(-1));
});

test('noise makes the estimate drift from the truth; zero noise does not', () => {
  const script = [{ duration: 3, left: 1, right: 0.6 }, { duration: 3, left: 0.6, right: 1 }];
  const noisy = runScript(script, { cfg: ROBOT, env: { setup: 'threeWheel', noise: 3, slip: 1 } }).at(-1);
  const clean = runScript(script, { cfg: ROBOT }).at(-1);
  const err = (f) => Math.hypot(f.estimate.x - f.truth.x, f.estimate.y - f.truth.y);
  assert.ok(err(noisy) > 1, `drift ${err(noisy)}`);
  assert.ok(err(clean) < 1e-6);
});

test('stepSim does not mutate its input', () => {
  const sim = createSim();
  const frozen = JSON.stringify(sim);
  stepSim(sim, { left: 1, right: 1 }, {}, ROBOT, createRng(1));
  assert.equal(JSON.stringify(sim), frozen);
});

test('planSteps splits elapsed time into whole ticks and keeps the remainder', () => {
  const a = planSteps(0, 0.025);
  assert.equal(a.steps, 2); assert.ok(Math.abs(a.accumulator - 0.005) < 1e-9);
  const b = planSteps(0.005, 0.005);
  assert.equal(b.steps, 1); assert.ok(b.accumulator < 1e-9);
});

test('planSteps caps catch-up after a stall and drops the backlog', () => {
  assert.deepEqual(planSteps(0, 5), { steps: MAX_STEPS_PER_FRAME, accumulator: 0 });
  assert.deepEqual(planSteps(0, -1), { steps: 0, accumulator: 0 });
});

test('appendBounded keeps at most max items and returns a new array', () => {
  const a = [1, 2, 3];
  const b = appendBounded(a, 4, 3);
  assert.deepEqual(b, [2, 3, 4]);
  assert.deepEqual(a, [1, 2, 3]);
  assert.deepEqual(appendBounded([], 1, 3), [1]);
});
