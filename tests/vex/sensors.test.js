import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ROBOT } from '../../content/vex/js/core/robot-config.js';
import { readSensors, wheelTravel } from '../../content/vex/js/core/sensors.js';
import { createRng } from '../../content/vex/js/core/random.js';

const near = (a, b, tol = 1e-9) => assert.ok(Math.abs(a - b) < tol, `${a} !≈ ${b}`);
const motion = { forward: 0.5, lateral: 0.02, dTheta: 0.03, motorL: 0.6, motorR: 0.4 };

test('a forward-rolling wheel only feels its sideways offset', () => {
  const a = wheelTravel(motion, { axis: 'forward', x: 4, y: 0 });
  const b = wheelTravel(motion, { axis: 'forward', x: 4, y: 7 });
  near(a, b);
  near(a, motion.forward - 4 * motion.dTheta);
});

test('with zero noise the readings are exact and deterministic', () => {
  const r = readSensors(motion, ROBOT, createRng(1), 0);
  near(r.dL, motion.forward + ROBOT.tracking.sL * motion.dTheta);
  near(r.dR, motion.forward - ROBOT.tracking.sR * motion.dTheta);
  near(r.dS, motion.lateral - ROBOT.tracking.sS * motion.dTheta);
  near(r.imuDTheta, motion.dTheta);
  near(r.driveL, motion.motorL);
});

test('wheel-derived heading equals the true turn with zero noise', () => {
  const r = readSensors(motion, ROBOT, createRng(1), 0);
  near((r.dL - r.dR) / (ROBOT.tracking.sL + ROBOT.tracking.sR), motion.dTheta);
});

test('noise is reproducible for the same seed and differs between seeds', () => {
  const a = readSensors(motion, ROBOT, createRng(5), 1);
  const b = readSensors(motion, ROBOT, createRng(5), 1);
  const c = readSensors(motion, ROBOT, createRng(6), 1);
  assert.deepEqual(a, b);
  assert.notDeepEqual(a, c);
  assert.notEqual(a.dL, motion.forward + ROBOT.tracking.sL * motion.dTheta);
});
