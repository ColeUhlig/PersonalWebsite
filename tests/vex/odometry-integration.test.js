import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ROBOT } from '../../content/vex/js/core/robot-config.js';
import { stepOdometry, stepStraightLine, selectInputs, combineReadings, SETUPS } from '../../content/vex/js/core/odometry.js';
import { runScript } from '../../content/vex/js/core/sim.js';

const near = (a, b, tol = 1e-9) => assert.ok(Math.abs(a - b) < tol, `${a} !≈ ${b}`);
const origin = { x: 0, y: 0, theta: 0 };

test('a full spin in place returns to the same point', () => {
  const frames = runScript([{ duration: 2, left: 1, right: -1 }], { cfg: ROBOT });
  const last = frames.at(-1).estimate;
  near(last.x, 0, 1e-6); near(last.y, 0, 1e-6);
  assert.ok(Math.abs(last.theta) > Math.PI);
});

for (const { id } of SETUPS) {
  test(`${id}: with perfect sensors the estimate equals the truth on an S-curve`, () => {
    const frames = runScript([{ duration: 3, left: 1, right: 0.6 }, { duration: 2, left: 0.5, right: 1 }], { cfg: ROBOT, env: { setup: id, noise: 0, slip: 0 } });
    const { truth, estimate } = frames.at(-1);
    near(estimate.x, truth.x, 1e-6); near(estimate.y, truth.y, 1e-6); near(estimate.theta, truth.theta, 1e-9);
  });
}

test('straight-line integration is worse than arcs and gets worse with a longer period', () => {
  const frames = runScript([{ duration: 3, left: 1, right: 0.4 }], { cfg: ROBOT });
  const errorFor = (period) => {
    let arc = origin; let straight = origin; let truth;
    for (let i = 0; i + period <= frames.length; i += period) {
      const input = selectInputs('threeWheel', combineReadings(frames.slice(i, i + period).map((f) => f.readings)), ROBOT);
      arc = stepOdometry(arc, input).pose; straight = stepStraightLine(straight, input); truth = frames[i + period - 1].truth;
    }
    return { arc: Math.hypot(arc.x - truth.x, arc.y - truth.y), straight: Math.hypot(straight.x - truth.x, straight.y - truth.y) };
  };
  const e1 = errorFor(1); const e10 = errorFor(10);
  assert.ok(e1.arc < 1e-6 && e10.arc < 1e-6);
  assert.ok(e10.straight > e1.straight * 5);
});
