import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ROBOT } from '../../content/vex/js/core/robot-config.js';
import { chassisCorners, trackingWheelPoints } from '../../content/vex/js/core/robot-geometry.js';

const near = (a, b, tol = 1e-9) => assert.ok(Math.abs(a - b) < tol, `${a} !≈ ${b}`);

test('chassis corners are centred on the pose and rotate with heading', () => {
  const corners = chassisCorners({ x: 10, y: 20, theta: Math.PI / 2 }, ROBOT);
  assert.equal(corners.length, 4);
  const cx = corners.reduce((s, c) => s + c[0], 0) / 4;
  const cy = corners.reduce((s, c) => s + c[1], 0) / 4;
  near(cx, 10); near(cy, 20);
  // facing +x: the front-left corner (-w, +l) lands at (x + l, y + w)
  near(corners[0][0], 10 + ROBOT.chassis.length / 2); near(corners[0][1], 20 + ROBOT.chassis.width / 2);
});

test('tracking wheel points sit at their offsets', () => {
  const p = trackingWheelPoints({ x: 0, y: 0, theta: 0 }, ROBOT);
  near(p.left[0], -ROBOT.tracking.sL); near(p.right[0], ROBOT.tracking.sR); near(p.strafe[1], -ROBOT.tracking.sS);
  const slid = trackingWheelPoints({ x: 0, y: 0, theta: 0 }, ROBOT, 3);
  near(slid.right[1], 3);
});
