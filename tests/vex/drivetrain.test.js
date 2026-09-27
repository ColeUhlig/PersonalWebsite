import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ROBOT } from '../../content/vex/js/core/robot-config.js';
import { initialDrive, stepDrive } from '../../content/vex/js/core/drivetrain.js';

const near = (a, b, tol = 1e-9) => assert.ok(Math.abs(a - b) < tol, `${a} !≈ ${b}`);
const run = (command, seconds, slip = 0) => {
  let state = initialDrive();
  let motion;
  for (let i = 0; i < Math.round(seconds / 0.01); i += 1) ({ state, motion } = stepDrive(state, command, 0.01, ROBOT, slip));
  return { state, motion };
};

test('full power forward approaches max speed and drives along +y', () => {
  const { state } = run({ left: 1, right: 1 }, 2);
  near(state.vl, ROBOT.maxSpeed, 1e-3);
  near(state.pose.x, 0); near(state.pose.theta, 0);
  assert.ok(state.pose.y > 100 && state.pose.y < 2 * ROBOT.maxSpeed);
});

test('does not mutate the input state', () => {
  const state = initialDrive();
  const frozen = JSON.stringify(state);
  stepDrive(state, { left: 1, right: 0.5 }, 0.01, ROBOT);
  assert.equal(JSON.stringify(state), frozen);
});

test('left faster than right turns clockwise (heading increases) and curves to +x', () => {
  const { state } = run({ left: 1, right: 0.5 }, 1);
  assert.ok(state.pose.theta > 0);
  assert.ok(state.pose.x > 0);
});

test('a steady arc has radius (vl+vr)/2 ÷ ((vl−vr)/trackWidth)', () => {
  const frames = [];
  let state = initialDrive();
  for (let i = 0; i < 400; i += 1) { ({ state } = stepDrive(state, { left: 1, right: 0.5 }, 0.01, ROBOT)); if (i >= 200) frames.push(state.pose); }
  const R = ((60 + 30) / 2) / ((60 - 30) / ROBOT.trackWidth);
  const p0 = frames[0];
  const center = [p0.x + R * Math.cos(p0.theta), p0.y - R * Math.sin(p0.theta)];
  for (const p of frames) near(Math.hypot(p.x - center[0], p.y - center[1]), R, 0.01);
});

test('commands are clamped to [-1, 1]', () => {
  const { state } = run({ left: 5, right: 5 }, 1);
  assert.ok(state.vl <= ROBOT.maxSpeed + 1e-9);
});

test('slip reduces ground travel during acceleration but not motor travel', () => {
  const noSlip = run({ left: 1, right: 1 }, 0.3, 0);
  const slip = run({ left: 1, right: 1 }, 0.3, 1);
  assert.ok(slip.state.pose.y < noSlip.state.pose.y);
  near(slip.motion.motorL, noSlip.motion.motorL);
});
