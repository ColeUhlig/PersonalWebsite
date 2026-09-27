import { createRng } from '../../core/random.js';
import { createSim, stepSim } from '../../core/sim.js';
import { appendBounded } from '../../core/trail.js';
import { degrees, wrapAngle } from '../../core/geometry.js';
import { createDriveInput } from '../../input/drive-input.js';
import { placeRobot, spinWheels } from '../../scene/robot.js';
import * as draw from './beats.js';

// The live "drive it yourself" panel at the end of chapter 1.

const TRAIL_TICKS = 1500; // 15 s of history
const START = Object.freeze({ x: 0, y: -40, theta: 0 });
const FIELD_HALF = 72; // the robot starts over when its centre crosses the field wall

export function createTryIt(ctx, panel) {
  const noiseInput = panel.querySelector('#odom-noise');
  const setupInput = panel.querySelector('#odom-setup');
  const resetButton = panel.querySelector('#odom-reset');
  const readout = panel.querySelector('#odom-readout');
  const input = createDriveInput(ctx.stage);
  const rng = createRng(7);
  let sim = createSim(START);
  let frames = [];
  let lastDebug = null;

  const fmt = (v) => (Math.abs(v) < 0.05 ? 0 : v).toFixed(1); // never print "-0.0"
  const showReadout = (e) => {
    readout.textContent = `x ${fmt(e.x)}  y ${fmt(e.y)}  θ ${fmt(degrees(wrapAngle(e.theta)))}°`;
  };
  const reset = () => {
    sim = createSim(START); frames = []; lastDebug = null;
    placeRobot(ctx.robot.root, START);
    showReadout(START);
  };
  setupInput.addEventListener('change', reset);
  resetButton.addEventListener('click', reset);
  showReadout(START);

  function tick() {
    const env = { setup: setupInput.value, noise: Number(noiseInput.value), slip: Number(noiseInput.value) > 0 ? 1 : 0 };
    const step = stepSim(sim, input.read(), env, ctx.cfg, rng);
    const { pose } = step.sim.drive;
    if (Math.abs(pose.x) > FIELD_HALF || Math.abs(pose.y) > FIELD_HALF) { reset(); return; }
    sim = step.sim;
    lastDebug = step.debug;
    frames = appendBounded(frames, { truth: sim.drive.pose, estimate: sim.estimate }, TRAIL_TICKS);
    placeRobot(ctx.robot.root, sim.drive.pose);
    spinWheels(ctx.robot.parts, ctx.cfg, step.motion, step.readings);
    showReadout(sim.estimate);
  }

  function overlay() {
    const f = frames.at(-1);
    if (!f) return [];
    return [
      ...draw.trails(frames, { truth: true }),
      ...draw.truthGhost(f.truth, ctx.cfg),
      ...draw.robotDiagram(f.estimate, ctx.cfg),
      ...(lastDebug ? draw.tickArc(lastDebug, 25) : []),
      ...(Number(noiseInput.value) > 0 ? draw.errorLink(f.truth, f.estimate) : []),
    ];
  }

  return {
    tick,
    overlay,
    reset,
    setActive: (on) => input.setEnabled(on),
    destroy: () => {
      input.destroy();
      setupInput.removeEventListener('change', reset);
      resetButton.removeEventListener('click', reset);
    },
  };
}
