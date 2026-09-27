import { arcChord, clamp, localToGlobal } from './geometry.js';

// The "true" robot: a tank drive whose wheel speeds lag behind the command like real motors,
// with optional wheel slip under hard acceleration and sideways skid in fast turns.

const SLIP_LOSS = 0.25; // share of wheel speed lost at full acceleration when slip = 1
const SKID = 0.02; // sideways slide, in/s per (in/s × rad/s), when slip = 1

export const initialDrive = (pose = { x: 0, y: 0, theta: 0 }) => ({ pose, vl: 0, vr: 0 });

function followCommand(speed, command, dt, cfg) {
  const target = clamp(command, -1, 1) * cfg.maxSpeed;
  return speed + (target - speed) * (1 - Math.exp(-dt / cfg.motorTimeConstant));
}

function groundSpeed(speed, previous, dt, cfg, slip) {
  const maxAccel = cfg.maxSpeed / cfg.motorTimeConstant;
  const accel = Math.min(1, Math.abs(speed - previous) / dt / maxAccel);
  return speed * (1 - SLIP_LOSS * slip * accel);
}

/**
 * Advances the true robot one tick.
 * command: { left, right } in [-1, 1].
 * Returns the new state plus `motion`: how far the robot's center moved along its own axes
 * (`forward`, `lateral`, inches), its heading change `dTheta` (clockwise +), and how far each
 * drive wheel's surface turned (`motorL`, `motorR`), which is what the drive encoders count.
 */
export function stepDrive(state, command, dt, cfg, slip = 0) {
  const vl = followCommand(state.vl, command.left, dt, cfg);
  const vr = followCommand(state.vr, command.right, dt, cfg);
  const groundL = groundSpeed(vl, state.vl, dt, cfg, slip);
  const groundR = groundSpeed(vr, state.vr, dt, cfg, slip);
  const vForward = (groundL + groundR) / 2;
  const omega = (groundL - groundR) / cfg.trackWidth;
  const vLateral = -SKID * slip * vForward * omega;

  const motion = {
    forward: vForward * dt,
    lateral: vLateral * dt,
    dTheta: omega * dt,
    motorL: vl * dt,
    motorR: vr * dt,
  };
  const { pose } = state;
  const chord = arcChord([motion.lateral, motion.forward], motion.dTheta);
  const [dx, dy] = localToGlobal(chord, pose.theta + motion.dTheta / 2);
  return {
    state: { pose: { x: pose.x + dx, y: pose.y + dy, theta: pose.theta + motion.dTheta }, vl, vr },
    motion,
  };
}
