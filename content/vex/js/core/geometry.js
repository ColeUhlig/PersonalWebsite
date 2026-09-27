// 2D helpers for field coordinates.
// Field frame: x to the right, y away from the driver (up in the top-down view), inches, origin at center.
// Headings are compass-style like the VEX IMU and LemLib: 0 = facing +y, clockwise positive, radians.
// Robot (local) frame: x to the robot's right, y straight ahead.

export const ARC_EPSILON = 1e-9;

export const add = (a, b) => [a[0] + b[0], a[1] + b[1]];
export const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
export const scale = (a, k) => [a[0] * k, a[1] * k];
export const length = (a) => Math.hypot(a[0], a[1]);
export const lerp = (a, b, t) => a + (b - a) * t;
export const lerpVec = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t)];
export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
export const degrees = (radians) => (radians * 180) / Math.PI;

// Wraps an angle into (-π, π].
export function wrapAngle(angle) {
  const wrapped = angle - 2 * Math.PI * Math.floor((angle + Math.PI) / (2 * Math.PI));
  return wrapped === -Math.PI ? Math.PI : wrapped;
}

// Unit vector pointing along a compass heading.
export const headingVector = (theta) => [Math.sin(theta), Math.cos(theta)];

// Rotates a robot-frame vector into the field frame for a robot facing `theta`.
export function localToGlobal([lx, ly], theta) {
  const c = Math.cos(theta);
  const s = Math.sin(theta);
  return [lx * c + ly * s, -lx * s + ly * c];
}

export function globalToLocal([gx, gy], theta) {
  const c = Math.cos(theta);
  const s = Math.sin(theta);
  return [gx * c - gy * s, gx * s + gy * c];
}

export const pointOnCircle = (center, radius, compassAngle) =>
  add(center, scale(headingVector(compassAngle), radius));

// Compass angle of the direction from `from` to `to`.
export const angleTo = (from, to) => Math.atan2(to[0] - from[0], to[1] - from[1]);

/**
 * Straight-line displacement (chord) of a point that travelled `travel` = [sideways, forward]
 * inches along an arc while turning dTheta radians. This is the 2·sin(Δθ/2)/Δθ factor from the
 * 5225A tracking paper; with no turn the arc is a straight line.
 */
export function arcChord(travel, dTheta) {
  if (Math.abs(dTheta) < ARC_EPSILON) return [travel[0], travel[1]];
  return scale(travel, (2 * Math.sin(dTheta / 2)) / dTheta);
}
