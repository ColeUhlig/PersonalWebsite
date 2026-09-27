import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ROBOT } from '../../content/vex/js/core/robot-config.js';
import { runScript } from '../../content/vex/js/core/sim.js';
import { pointOnCircle } from '../../content/vex/js/core/geometry.js';
import { robotDiagram, truthGhost, trails, tickArc, frameAxes, errorLink } from '../../content/vex/js/chapters/odometry/beats.js';

const pose = { x: 10, y: -20, theta: 0.4 };
const types = (prims) => prims.map((p) => p.type);

test('robotDiagram draws the chassis, three wheels and the centre, plus dimensions on request', () => {
  const plain = robotDiagram(pose, ROBOT);
  assert.deepEqual(types(plain), ['polygon', 'ray', 'ray', 'ray', 'dot']);
  const dims = robotDiagram(pose, ROBOT, { dimensions: true });
  assert.equal(dims.filter((p) => p.type === 'dimension').length, 3);
  assert.ok(dims.some((p) => p.text === `s_L = ${ROBOT.tracking.sL}"`));
});

test('truthGhost is a dashed polygon in the truth colour', () => {
  const [g] = truthGhost(pose, ROBOT);
  assert.equal(g.type, 'polygon'); assert.equal(g.color, 'truth'); assert.deepEqual(g.dash, [4, 4]);
});

test('trails follow the requested poses', () => {
  const frames = [{ truth: { x: 0, y: 0 }, estimate: { x: 1, y: 1 } }, { truth: { x: 2, y: 0 }, estimate: { x: 3, y: 1 } }];
  const both = trails(frames, { truth: true, estimate: true });
  assert.equal(both.length, 2);
  assert.deepEqual(both[1].points, [[1, 1], [3, 1]]);
  assert.equal(trails(frames).length, 1);
});

test('tickArc draws nothing for a straight tick and a full construction for a turning one', () => {
  assert.deepEqual(tickArc({ center: null }), []);
  const frames = runScript([{ duration: 1, left: 1, right: 0.5 }], { cfg: ROBOT });
  const prims = tickArc(frames.at(-1).debug, 40);
  assert.ok(types(prims).includes('arc'));
  const chord = prims.find((p) => p.type === 'ray' && p.arrow);
  assert.ok(chord, 'chord arrow present');
  const start = frames.at(-1).debug.start;
  assert.deepEqual(chord.from, [start.x, start.y]);
});

test('tickArc: the exaggerated chord ends exactly where the exaggerated arc ends', () => {
  const frames = runScript([{ duration: 1, left: 1, right: 0.5 }], { cfg: ROBOT });
  const prims = tickArc(frames.at(-1).debug, 40);
  const arc = prims.find((p) => p.type === 'arc');
  const chord = prims.find((p) => p.type === 'ray' && p.arrow);
  const [ex, ey] = pointOnCircle(arc.center, arc.radius, arc.to);
  assert.ok(Math.hypot(chord.to[0] - ex, chord.to[1] - ey) < 1e-6, `chord ends ${Math.hypot(chord.to[0] - ex, chord.to[1] - ey)}" off the arc`);
});

test('frameAxes labels the rotation angle in degrees', () => {
  const frames = runScript([{ duration: 1, left: 1, right: 0.5 }], { cfg: ROBOT });
  const prims = frameAxes(frames.at(-1).debug);
  const label = prims.find((p) => p.type === 'label' && p.text.startsWith('θ + Δθ/2'));
  assert.ok(label);
  assert.match(label.text, /°$/);
});

test('errorLink reports the distance between truth and estimate', () => {
  const [ray, label] = errorLink({ x: 0, y: 0 }, { x: 3, y: 4 });
  assert.equal(ray.type, 'ray'); assert.equal(ray.color, 'error');
  assert.equal(label.text, '5.0" off');
});
