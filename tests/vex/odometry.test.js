import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ROBOT } from '../../content/vex/js/core/robot-config.js';
import { stepOdometry, selectInputs, combineReadings } from '../../content/vex/js/core/odometry.js';

const near = (a, b, tol = 1e-9) => assert.ok(Math.abs(a - b) < tol, `${a} !≈ ${b}`);
const origin = { x: 0, y: 0, theta: 0 };

test('straight tick moves forward by ΔR with no turn (Δθ = 0 guard)', () => {
  const { pose, debug } = stepOdometry(origin, { dR: 0.5, dS: 0, dTheta: 0, sR: 4.5, sS: 3.5 });
  near(pose.x, 0); near(pose.y, 0.5); near(pose.theta, 0);
  assert.equal(debug.center, null);
  assert.equal(debug.radius, Infinity);
});

test('matches LemLib formula for a known tick', () => {
  // dR = 0.5, Δθ = 0.05, sR = 4.5, sS = 3.5, dS = 0.02, θ = 0.3
  const input = { dR: 0.5, dS: 0.02, dTheta: 0.05, sR: 4.5, sS: 3.5 };
  const { pose, debug } = stepOdometry({ x: 1, y: 2, theta: 0.3 }, input);
  const k = 2 * Math.sin(0.025);
  const localX = k * (0.02 / 0.05 + 3.5);
  const localY = k * (0.5 / 0.05 + 4.5);
  near(debug.localChord[0], localX); near(debug.localChord[1], localY);
  const rot = 0.3 + 0.025;
  near(pose.x, 1 + localX * Math.cos(rot) + localY * Math.sin(rot));
  near(pose.y, 2 - localX * Math.sin(rot) + localY * Math.cos(rot));
  near(pose.theta, 0.35);
  near(debug.radius, 0.5 / 0.05 + 4.5);
});

test('arc integration over 1000 ticks lands on the analytic circle', () => {
  // Constant inputs: Δθ = 0.002 rad/tick and the tracking centre moving 0.3"/tick straight ahead.
  // The right wheel (sR outboard) rolls a little less than the centre on a clockwise turn, and the
  // strafe wheel (sS behind the centre) is dragged sideways by −sS·Δθ even though the centre isn't.
  let pose = origin;
  const dTheta = 0.002; const sR = 4.5; const sS = 3.5;
  const centreTravel = 0.3; const dR = centreTravel - sR * dTheta; const dS = -sS * dTheta;
  for (let i = 0; i < 1000; i += 1) pose = stepOdometry(pose, { dR, dS, dTheta, sR, sS }).pose;
  const R = centreTravel / dTheta; // 150"
  // circle centre is R to the right of the start (clockwise turn from heading 0)
  near(Math.hypot(pose.x - R, pose.y), R, 0.01);
  near(pose.theta, 2, 1e-9);
});

test('selectInputs picks readings per setup', () => {
  const readings = { dL: 1.1, dR: 0.9, dS: 0.1, driveL: 1.2, driveR: 0.8, imuDTheta: 0.02 };
  const three = selectInputs('threeWheel', readings, ROBOT);
  near(three.dTheta, (1.1 - 0.9) / (ROBOT.tracking.sL + ROBOT.tracking.sR));
  const imu = selectInputs('twoWheelImu', readings, ROBOT);
  near(imu.dTheta, 0.02); near(imu.dR, 0.9);
  const drive = selectInputs('driveImu', readings, ROBOT);
  near(drive.dR, 0.8); near(drive.dS, 0); near(drive.sR, ROBOT.trackWidth / 2);
});

test('selectInputs rejects unknown setups', () => {
  assert.throws(() => selectInputs('nope', {}, ROBOT), /Unknown odometry setup/);
});

test('combineReadings sums every field', () => {
  const sum = combineReadings([{ dL: 1, dR: 2, dS: 3, driveL: 4, driveR: 5, imuDTheta: 6 }, { dL: 1, dR: 1, dS: 1, driveL: 1, driveR: 1, imuDTheta: 1 }]);
  assert.deepEqual(sum, { dL: 2, dR: 3, dS: 4, driveL: 5, driveR: 6, imuDTheta: 7 });
});
