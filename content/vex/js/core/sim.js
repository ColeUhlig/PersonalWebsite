import { initialDrive, stepDrive } from './drivetrain.js';
import { createRng } from './random.js';
import { readSensors } from './sensors.js';
import { selectInputs, stepOdometry } from './odometry.js';

// Ties the true robot, its sensors and odometry together on a fixed 10 ms tick (the period of a
// typical PROS odometry task). Controllers only ever see `estimate`, like on a real robot.

export const TICK = 0.01;
export const MAX_STEPS_PER_FRAME = 10;
export const DEFAULT_ENV = Object.freeze({ setup: 'threeWheel', noise: 0, slip: 0 });

export const createSim = (pose = { x: 0, y: 0, theta: 0 }) => ({ t: 0, drive: initialDrive(pose), estimate: pose });

export function stepSim(sim, command, env, cfg, rng) {
  const { setup, noise, slip } = { ...DEFAULT_ENV, ...env };
  const { state: drive, motion } = stepDrive(sim.drive, command, TICK, cfg, slip);
  const readings = readSensors(motion, cfg, rng, noise);
  const odom = stepOdometry(sim.estimate, selectInputs(setup, readings, cfg));
  return { sim: { t: sim.t + TICK, drive, estimate: odom.pose }, motion, readings, debug: odom.debug };
}

/**
 * Plays a script of { duration, left, right } segments and records every tick as
 * { t, truth, estimate, motion, readings, debug }.
 */
export function runScript(script, { cfg, pose, env = DEFAULT_ENV, seed = 1 }) {
  const rng = createRng(seed);
  const frames = [];
  let sim = createSim(pose);
  for (const segment of script) {
    const ticks = Math.round(segment.duration / TICK);
    for (let i = 0; i < ticks; i += 1) {
      const step = stepSim(sim, segment, env, cfg, rng);
      sim = step.sim;
      frames.push({
        t: sim.t,
        truth: sim.drive.pose,
        estimate: sim.estimate,
        motion: step.motion,
        readings: step.readings,
        debug: step.debug,
      });
    }
  }
  return frames;
}

/**
 * Splits elapsed real time into whole sim ticks. After a stall (a background tab, a slow frame)
 * it runs at most MAX_STEPS_PER_FRAME ticks and drops the rest instead of trying to catch up.
 */
export function planSteps(accumulator, elapsed) {
  const total = accumulator + Math.max(0, elapsed);
  const steps = Math.floor(total / TICK + 1e-9);
  if (steps > MAX_STEPS_PER_FRAME) return { steps: MAX_STEPS_PER_FRAME, accumulator: 0 };
  return { steps, accumulator: Math.max(0, total - steps * TICK) };
}
