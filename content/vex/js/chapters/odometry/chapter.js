import katex from 'katex';
import { runScript } from '../../core/sim.js';
import { combineReadings, selectInputs, stepOdometry, stepStraightLine } from '../../core/odometry.js';
import { setXray, setShading, placeRobot } from '../../scene/robot.js';
import { S_CURVE, START_POSE } from './script.js';
import * as draw from './beats.js';
import { createTryIt } from './tryit.js';

// Chapter 1: odometry. Beats are scroll-scrubbed over precomputed runs; the "try it" panel at the
// end runs live. Beat order (0-based) matches the .beat elements in index.html:
// 0 opening orbit, 1 field off, 2 close-up/x-ray, 3 flatten, 4 heading from wheels, 5 one tick,
// 6 robot→field frame, 7 stacking ticks, 8 arcs vs straight lines, 9 sideways offset only,
// 10 the catch (drift), 11 try it.

const BEATS = 12; // 11 story beats + the try-it panel
const ARC_EXAGGERATION = 40; // one 10 ms tick is too small to see, so the geometry beats scale it up

function formulas(root) {
  const render = (selector, tex) => {
    const el = root.querySelector(selector);
    if (el) katex.render(tex, el, { throwOnError: false, displayMode: true });
  };
  render('#f-heading', String.raw`\Delta\theta = \frac{\Delta L - \Delta R}{s_L + s_R}`);
  render('#f-chord', String.raw`\Delta\vec d_{\text{local}} = 2\sin\frac{\Delta\theta}{2}\begin{bmatrix}\dfrac{\Delta S}{\Delta\theta} + s_S \\[8pt] \dfrac{\Delta R}{\Delta\theta} + s_R\end{bmatrix}`);
  render('#f-rotate', String.raw`\Delta\vec d_{\text{field}} = R\!\left(\theta + \tfrac{\Delta\theta}{2}\right)\,\Delta\vec d_{\text{local}}`);
}

export default {
  id: 'odometry',
  beats: BEATS,
  wikiUrl: 'https://wiki.purduesigbots.com/software/odometry',
  _ctx: null,
  _clean: null,
  _noisy: null,
  _view: { beat: 0, local: 0 },

  setup(ctx) {
    this._ctx = ctx;
    this._clean = runScript(S_CURVE, { cfg: ctx.cfg, pose: START_POSE, env: { setup: 'threeWheel', noise: 0, slip: 0 } });
    this._noisy = runScript(S_CURVE, { cfg: ctx.cfg, pose: START_POSE, env: { setup: 'threeWheel', noise: 3, slip: 1 } });
    ctx.camera.setMode('orbit');
    ctx.camera.set({ topdown: 0, orbitAngle: 0.6 });
    ctx.camera.setFocus([0, 0]);
    formulas(ctx.ui);
    placeRobot(ctx.robot.root, START_POSE);
    this._tryit = createTryIt(ctx, ctx.ui.querySelector('#tryit-odometry'));
  },

  progress(p) {
    const beat = Math.min(BEATS - 1, Math.floor(p));
    const local = p - beat;
    this._view = { beat, local };
    const { camera, robot } = this._ctx;
    const frames = this._clean;
    const at = (t) => frames[Math.min(frames.length - 1, Math.max(0, Math.floor(t * (frames.length - 1))))];

    // Camera + model state per beat (instant, so scrolling backwards works).
    const topdownBeats = beat >= 3;
    camera.set({ topdown: topdownBeats ? 1 : 0, orbitAngle: 0.6 + (beat <= 1 ? local * 0.6 : 0.6) });
    camera.setMode(beat === 2 ? 'close' : 'orbit');
    setXray(robot.parts, beat === 2 ? local : 0);
    setShading(robot.root, topdownBeats ? 0 : 1);
    this._ctx.field.root.visible = beat !== 1;

    this._live = beat === BEATS - 1;
    this._tryit.setActive(this._live);
    if (this._live) { camera.set({ topdown: 1 }); camera.setFocus([0, 0]); return; }
    const frame =
      beat <= 1 ? at(local) // drive the S-curve during the opening shot
      : beat === 2 ? at(0)
      : beat === 7 ? at(local) // stacking ticks
      : beat >= 9 ? this._noisy[Math.floor(local * (this._noisy.length - 1))]
      : at(0.35); // frozen mid-curve for the geometry beats
    placeRobot(robot.root, frame.truth);
    camera.setFocus(beat === 2 ? [frame.truth.x, frame.truth.y] : [0, 0]);
    this._frame = frame;
  },

  frame() {
    if (this._live) this._tryit.tick();
  },

  overlay() {
    const { beat, local } = this._view;
    if (this._live) return this._tryit.overlay();
    const { cfg } = this._ctx;
    const f = this._frame;
    if (!f || beat < 3) return [];
    const frames = this._clean;
    const mid = Math.floor(frames.length * 0.35);
    const base = draw.robotDiagram(f.estimate, cfg, { dimensions: beat === 3 || beat === 4 });
    switch (beat) {
      case 3: return base;
      case 4: return [...base, ...draw.tickArc(frames[mid].debug, ARC_EXAGGERATION)];
      case 5: return [...base, ...draw.tickArc(frames[mid].debug, ARC_EXAGGERATION)];
      case 6: return [...base, ...draw.frameAxes(frames[mid].debug)];
      case 7: return [...draw.trails(frames.slice(0, Math.floor(local * frames.length))), ...base];
      case 8: return [...draw.trails(frames), ...base, ...this._straightVsArc(local)];
      case 9: return [...base, ...draw.robotDiagram(f.estimate, cfg, { rightForward: Math.sin(local * Math.PI * 2) * 5 })];
      default: return [...draw.trails(this._noisy.slice(0, Math.floor(local * this._noisy.length)), { truth: true }), ...base, ...draw.truthGhost(f.truth, cfg), ...draw.errorLink(f.truth, f.estimate)];
    }
  },

  // Re-integrates the recorded readings at a coarser period with both methods.
  _straightVsArc(local) {
    const period = 1 + Math.round(local * 9); // 10 ms → 100 ms
    const { cfg } = this._ctx;
    let arc = START_POSE; let straight = START_POSE;
    const arcPts = [[arc.x, arc.y]]; const straightPts = [[straight.x, straight.y]];
    for (let i = 0; i + period <= this._clean.length; i += period) {
      const input = selectInputs('threeWheel', combineReadings(this._clean.slice(i, i + period).map((fr) => fr.readings)), cfg);
      arc = stepOdometry(arc, input).pose; straight = stepStraightLine(straight, input);
      arcPts.push([arc.x, arc.y]); straightPts.push([straight.x, straight.y]);
    }
    return [
      { type: 'polyline', points: straightPts, color: 'error', width: 2 },
      { type: 'polyline', points: arcPts, color: 'construct', width: 2, dash: [6, 4] },
      { type: 'label', at: straightPts.at(-1), text: `straight lines @ ${period * 10} ms`, color: 'error' },
    ];
  },

  teardown() {
    const { robot, field } = this._ctx;
    setXray(robot.parts, 0); setShading(robot.root, 1); field.root.visible = true;
    this._tryit.destroy(); this._tryit = null;
    this._clean = null; this._noisy = null; this._frame = null;
  },
};
