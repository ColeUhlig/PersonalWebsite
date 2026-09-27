import { ARC_EPSILON, add, arcChord, localToGlobal } from './geometry.js';

// Tracking-wheel odometry, 5225A (E-Bots PiLons) arc method: the same steps as LemLib's
// TrackingWheelOdometry::update. Notation follows the Purdue SIGBots wiki.

export const SETUPS = Object.freeze([
  Object.freeze({ id: 'threeWheel', label: '3 tracking wheels' }),
  Object.freeze({ id: 'twoWheelImu', label: '2 tracking wheels + IMU' }),
  Object.freeze({ id: 'driveImu', label: 'Drive motor encoders + IMU' }),
]);

/** Picks the readings and offsets a sensor setup uses: { dR, dS, dTheta, sR, sS }. */
export function selectInputs(setupId, readings, cfg) {
  const { sL, sR, sS } = cfg.tracking;
  switch (setupId) {
    case 'threeWheel':
      return { dR: readings.dR, dS: readings.dS, dTheta: (readings.dL - readings.dR) / (sL + sR), sR, sS };
    case 'twoWheelImu':
      return { dR: readings.dR, dS: readings.dS, dTheta: readings.imuDTheta, sR, sS };
    case 'driveImu':
      return { dR: readings.driveR, dS: 0, dTheta: readings.imuDTheta, sR: cfg.trackWidth / 2, sS: 0 };
    default:
      throw new Error(`Unknown odometry setup: ${setupId}`);
  }
}

/**
 * One odometry update. Returns the new pose plus every intermediate value so the page can draw
 * them: the local chord, the rotation applied, the turning radius and the arc's center.
 */
export function stepOdometry(pose, input) {
  const { dR, dS, dTheta, sR, sS } = input;
  const travel = [dS + sS * dTheta, dR + sR * dTheta]; // the tracking center's arc length, per axis
  const localChord = arcChord(travel, dTheta);
  const rotation = pose.theta + dTheta / 2;
  const globalDelta = localToGlobal(localChord, rotation);
  const turning = Math.abs(dTheta) >= ARC_EPSILON;
  const radius = turning ? dR / dTheta + sR : Infinity;
  // Instant center of rotation, in the robot frame: (forward travel / Δθ, −sideways travel / Δθ).
  const center = turning
    ? add([pose.x, pose.y], localToGlobal([travel[1] / dTheta, -travel[0] / dTheta], pose.theta))
    : null;

  return {
    pose: { x: pose.x + globalDelta[0], y: pose.y + globalDelta[1], theta: pose.theta + dTheta },
    debug: { start: pose, dTheta, radius, travel, localChord, rotation, globalDelta, center },
  };
}

/** The naive alternative: treat the tick as a straight step in the starting heading. */
export function stepStraightLine(pose, input) {
  const { dR, dS, dTheta, sR, sS } = input;
  const [dx, dy] = localToGlobal([dS + sS * dTheta, dR + sR * dTheta], pose.theta);
  return { x: pose.x + dx, y: pose.y + dy, theta: pose.theta + dTheta };
}

/** Adds up several ticks of readings, as if odometry ran less often. */
export function combineReadings(list) {
  return list.reduce(
    (sum, r) => Object.fromEntries(Object.keys(sum).map((key) => [key, sum[key] + r[key]])),
    { dL: 0, dR: 0, dS: 0, driveL: 0, driveR: 0, imuDTheta: 0 },
  );
}
