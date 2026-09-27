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

export function createTryIt(ctx, panel) {
  const noiseInput = panel.querySelector('#odom-noise');
  const setupInput = panel.querySelector('#odom-setup');
  const readout = panel.querySelector('#odom-readout');
  const input = createDriveInput(ctx.stage);
  const rng = createRng(7);
  let sim = createSim(START);
  let frames = [];
  let lastDebug = null;

  const reset = () => { sim = createSim(START); frames = []; lastDebug = null; };
  setupInput.addEventListener('change', reset);

  function tick() {
    const env = { setup: setupInput.value, noise: Number(noiseInput.value), slip: Number(noiseInput.value) > 0 ? 1 : 0 };
    const step = stepSim(sim, input.read(), env, ctx.cfg, rng);
    sim = step.sim;
    lastDebug = step.debug;
    frames = appendBounded(frames, { truth: sim.drive.pose, estimate: sim.estimate }, TRAIL_TICKS);
    placeRobot(ctx.robot.root, sim.drive.pose);
    spinWheels(ctx.robot.parts, ctx.cfg, step.motion, step.readings);
    const e = sim.estimate;
    readout.textContent = `x ${e.x.toFixed(1)}  y ${e.y.toFixed(1)}  θ ${degrees(wrapAngle(e.theta)).toFixed(1)}°`;
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
    destroy: () => { input.destroy(); setupInput.removeEventListener('change', reset); },
  };
}
