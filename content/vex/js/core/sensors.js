// What the robot's sensors report for one tick of true motion.
// Tracking wheels are unpowered, so they only see real ground motion. Drive encoders count motor
// rotation, so wheel slip fools them. `noise` scales every error source (0 = perfect sensors).

const TRACKING_NOISE = 0.01; // standard deviation, as a fraction of the distance travelled
const TRACKING_FLOOR = 0.001; // in per tick
const IMU_NOISE = 0.0004; // rad per tick
const IMU_BIAS = 0.00002; // rad per tick of steady drift
const SCALE_BIAS = 0.004; // every wheel measured the same amount too big/small (fraction, per unit of noise)
const WHEEL_MISMATCH = 0.0004; // left vs right wheel disagreement (fraction, per unit of noise)

/**
 * Distance an omni wheel mounted at robot-frame point (x, y) measures along its rolling axis.
 * A rigid body turning clockwise at rate ω moves the point (x, y) at
 * (v_lateral + ω·y, v_forward − ω·x), so a forward-rolling wheel's reading never depends on y:
 * only its sideways offset matters.
 */
export function wheelTravel(motion, mount) {
  return mount.axis === 'forward'
    ? motion.forward - mount.x * motion.dTheta
    : motion.lateral + mount.y * motion.dTheta;
}

export function readSensors(motion, cfg, rng, noise = 0) {
  const { sL, sR, sS } = cfg.tracking;
  const jitter = (distance) =>
    noise === 0 ? 0 : noise * rng.normal() * (TRACKING_NOISE * Math.abs(distance) + TRACKING_FLOOR);
  const withJitter = (distance) => distance + jitter(distance);

  // A wheel measured slightly wrong reads a little long or short on every tick: the dominant
  // real-world drift. The small left/right mismatch is what skews a wheel-derived heading.
  const scaleL = 1 + noise * (SCALE_BIAS + WHEEL_MISMATCH);
  const scaleR = 1 + noise * (SCALE_BIAS - WHEEL_MISMATCH);
  const dL = wheelTravel(motion, { axis: 'forward', x: -sL, y: 0 }) * scaleL;
  const dR = wheelTravel(motion, { axis: 'forward', x: sR, y: 0 }) * scaleR;
  const dS = wheelTravel(motion, { axis: 'lateral', x: 0, y: -sS });
  const imuError = noise === 0 ? 0 : noise * (IMU_BIAS + IMU_NOISE * rng.normal());

  return {
    dL: withJitter(dL),
    dR: withJitter(dR),
    dS: withJitter(dS),
    driveL: withJitter(motion.motorL * scaleL),
    driveR: withJitter(motion.motorR * scaleR),
    imuDTheta: motion.dTheta + imuError,
  };
}
