import { degrees, pointOnCircle, angleTo, headingVector, add, scale, sub, arcChord, localToGlobal } from '../../core/geometry.js';
import { chassisCorners, trackingWheelPoints } from '../../core/robot-geometry.js';

// Overlay primitives for the odometry chapter's top-down beats. Pure: frames in, drawing out.

const trailPoints = (frames, key) => frames.map((f) => [f[key].x, f[key].y]);

export function robotDiagram(pose, cfg, opts = {}) {
  const wheels = trackingWheelPoints(pose, cfg, opts.rightForward ?? 0);
  const { sL, sR, sS } = cfg.tracking;
  const wheelLine = (center, along, len = cfg.tracking.diameter) => ({
    type: 'ray', from: add(center, scale(along, -len / 2)), to: add(center, scale(along, len / 2)), color: 'estimate', width: 3,
  });
  const fwd = headingVector(pose.theta);
  const right = headingVector(pose.theta + Math.PI / 2);
  const prims = [
    { type: 'polygon', points: chassisCorners(pose, cfg), color: 'estimate', width: 1.5 },
    wheelLine(wheels.left, fwd), wheelLine(wheels.right, fwd), wheelLine(wheels.strafe, right),
    { type: 'dot', at: wheels.center, color: 'estimate', radius: 3 },
  ];
  if (opts.dimensions) {
    prims.push(
      { type: 'dimension', from: wheels.center, to: wheels.left, text: `s_L = ${sL}"`, color: 'muted', labelAt: 'end', offset: [-64, 0] },
      { type: 'dimension', from: wheels.center, to: wheels.right, text: `s_R = ${sR}"`, color: 'muted', labelAt: 'end', offset: [12, 0] },
      { type: 'dimension', from: wheels.center, to: wheels.strafe, text: `s_S = ${sS}"`, color: 'muted', labelAt: 'end', offset: [-30, 18] },
    );
  }
  return prims;
}

export function truthGhost(pose, cfg) {
  return [{ type: 'polygon', points: chassisCorners(pose, cfg), color: 'truth', width: 1.5, dash: [4, 4] }];
}

export function trails(frames, { truth = false, estimate = true } = {}) {
  const out = [];
  if (truth) out.push({ type: 'polyline', points: trailPoints(frames, 'truth'), color: 'truth', width: 2, dash: [3, 5] });
  if (estimate) out.push({ type: 'polyline', points: trailPoints(frames, 'estimate'), color: 'estimate', width: 2 });
  return out;
}

/**
 * One tick's arc: the instant center, radius, the arc itself, and the chord across it.
 * `exaggerate` stretches the tick `k` times along the same circle (k·travel, k·Δθ) so a 10 ms
 * step is big enough to see; the chord is recomputed for the stretched arc so it still joins its ends.
 */
export function tickArc(debug, exaggerate = 1) {
  if (!debug.center) return [];
  const { start, center, dTheta, radius, travel } = debug;
  const k = exaggerate;
  const from = [start.x, start.y];
  const end = add(from, localToGlobal(arcChord(scale(travel, k), dTheta * k), start.theta + (dTheta * k) / 2));
  const a0 = angleTo(center, from);
  const a1 = a0 + dTheta * k;
  const r = Math.abs(radius);
  return [
    { type: 'ray', from: center, to: from, color: 'construct', width: 1, dash: [4, 4] },
    { type: 'ray', from: center, to: pointOnCircle(center, r, a1), color: 'construct', width: 1, dash: [4, 4] },
    { type: 'dot', at: center, color: 'construct', radius: 4 },
    { type: 'label', at: center, text: 'center', color: 'construct' },
    { type: 'arc', center, radius: r, from: a0, to: a1, color: 'construct', width: 3 },
    { type: 'ray', from, to: end, color: 'target', width: 2.5, arrow: true },
    { type: 'label', at: end, text: 'chord', color: 'target' },
    { type: 'label', at: center, text: `r = ${radius.toFixed(1)}"`, color: 'construct', offset: [8, 12] },
  ];
}

/** Local and global axes at the robot, plus the chord rotated by θ + Δθ/2. */
export function frameAxes(debug, len = 12) {
  const { start, localChord, rotation } = debug;
  const o = [start.x, start.y];
  const local = (v) => add(o, scale(headingVector(start.theta + Math.atan2(v[0], v[1])), len));
  return [
    { type: 'ray', from: o, to: add(o, [len, 0]), color: 'muted', width: 1, arrow: true },
    { type: 'ray', from: o, to: add(o, [0, len]), color: 'muted', width: 1, arrow: true },
    { type: 'label', at: add(o, [len, 0]), text: 'field x', color: 'muted' },
    { type: 'label', at: add(o, [0, len]), text: 'field y', color: 'muted' },
    { type: 'ray', from: o, to: local([1, 0]), color: 'estimate', width: 1, arrow: true },
    { type: 'ray', from: o, to: local([0, 1]), color: 'estimate', width: 1, arrow: true },
    { type: 'label', at: local([0, 1]), text: 'robot fwd', color: 'estimate' },
    { type: 'arc', center: o, radius: len * 0.6, from: 0, to: rotation, color: 'construct', width: 2 },
    { type: 'label', at: pointOnCircle(o, len * 0.7, rotation / 2), text: `θ + Δθ/2 = ${degrees(rotation).toFixed(1)}°`, color: 'construct' },
  ];
}

export function errorLink(truth, estimate) {
  const a = [truth.x, truth.y]; const b = [estimate.x, estimate.y];
  const d = Math.hypot(...sub(a, b));
  return [
    { type: 'ray', from: a, to: b, color: 'error', width: 2 },
    { type: 'label', at: b, text: `${d.toFixed(1)}" off`, color: 'error', offset: [14, 22] },
  ];
}
