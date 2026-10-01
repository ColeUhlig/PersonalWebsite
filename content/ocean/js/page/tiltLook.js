// Tilting a phone to look around the ocean (piece C Task 9b; browser-free). On a touch-first screen
// the story turns orbit off so a swipe scrolls the page; the phone's own tilt gives the look-around
// back. This is the maths: the phone's orientation (DeviceOrientationEvent alpha, beta and gamma,
// degrees) is built into a rotation (a quaternion, in the W3C order R = Rz(alpha) Rx(beta) Ry(gamma),
// device to earth), taken relative to the baseline's, and read about the screen's own axes for the
// screen's rotation (0, 90, 180, 270). That holds at any grip, landscape and near upright included:
// no gimbal flip, no gain that fades with the lean. The turn becomes a small yaw and pitch round the
// current shot's target, past a dead band, clamped to TILT_LIMITS, smoothed on the play clock, and
// eased back to the shot when the story moves to another step. ui/tilt.js feeds it events;
// ui/storyStage.js applies the offset to the shot's pose before the orbit limits, so the tilt range,
// the camera floor and the reach still hold.
//
// The joystick convention (Cole judges it on a device): the phone steers the camera. Tipping the top
// edge away lifts the camera, so it looks further down; bringing it towards you lowers it towards the
// horizon. Turning the right edge away (a twist about the screen's up axis) swings the view right.
// Only those two turns count, each read about its own screen axis: a roll about the screen's normal
// (a steering wheel) does nothing, so a turn on the spot swings the view the same way at any grip
// (the share of it about the screen's up axis; held flat, a turn on the spot is a pure roll and does
// nothing). yaw is radians counter-clockwise seen from above (about +y), pitch is radians the camera
// rises (its tilt from straight down shrinks).

export const TILT_LIMITS = Object.freeze({ yawDeg: 12, pitchDeg: 8 });
// The smoothing's time constant and the ease back on a step change, both in play-clock seconds.
export const SMOOTHING_SECONDS = 0.25;
export const RETURN_SECONDS = 1.2;
// A frame's seconds are capped here, so a stall does not land the camera in one jump.
export const MAX_STEP_SECONDS = 0.25;
// A turn smaller than this about either screen axis is no turn: sensor noise on a phone held still
// never moves the camera, so the story's zero-offset skip still fires. Larger turns lose this much.
// Each axis is banded on its own, and each reads a single device axis, so noise on other axes never
// adds into it.
export const DEAD_BAND_DEG = 0.1;
// Closer than this (radians) the smoothing lands on its target, so a still phone is exactly still
// and an offset that has gone back to zero costs the story nothing.
const SNAP = 1e-6;
// The camera never tips over the top of its target.
const POLAR_EPSILON = 1e-4;

const DEG = Math.PI / 180;
const YAW_MAX = TILT_LIMITS.yawDeg * DEG;
const PITCH_MAX = TILT_LIMITS.pitchDeg * DEG;
const DEAD_BAND = DEAD_BAND_DEG * DEG;

const clamp = (x, lo, hi) => Math.min(Math.max(x, lo), hi);
const smoothstep = (x) => x * x * (3 - 2 * x);
const banded = (x) => (x > DEAD_BAND ? x - DEAD_BAND : x < -DEAD_BAND ? x + DEAD_BAND : 0);
const finite = (...values) => values.every((v) => typeof v === 'number' && Number.isFinite(v));

export const isZeroOffset = (offset) => offset.yaw === 0 && offset.pitch === 0;

// The screen's rotation as 0, 90, 180 or 270 (window.orientation's -90 is 270); NaN if unknown.
export function quarterTurn(angle) {
	if (!finite(angle)) {
		return Number.NaN;
	}
	return (((Math.round(angle / 90) * 90) % 360) + 360) % 360;
}

// The screen's quarter turns' cosines and sines, exact, so each screen axis is one device axis.
const QUARTER_COS = Object.freeze({ 0: 1, 90: 0, 180: -1, 270: 0 });
const QUARTER_SIN = Object.freeze({ 0: 0, 90: 1, 180: 0, 270: -1 });

// Quaternions as [w, x, y, z]. Kept arrays, so a frame allocates nothing.
const baseQ = [1, 0, 0, 0];
const nowQ = [1, 0, 0, 0];
const turnQ = [1, 0, 0, 0];

// The phone's rotation (device to earth) for a reading, in the W3C order Rz(alpha) Rx(beta)
// Ry(gamma), written into out. A missing alpha (a browser with no compass) counts as 0.
function rotationOf(reading, out) {
	const a = (finite(reading.alpha) ? reading.alpha : 0) * DEG * 0.5;
	const b = reading.beta * DEG * 0.5;
	const g = reading.gamma * DEG * 0.5;
	const ca = Math.cos(a);
	const sa = Math.sin(a);
	const cb = Math.cos(b);
	const sb = Math.sin(b);
	const cg = Math.cos(g);
	const sg = Math.sin(g);
	// (ca, 0, 0, sa) (cb, sb, 0, 0) (cg, 0, sg, 0), multiplied out.
	out[0] = ca * cb * cg - sa * sb * sg;
	out[1] = ca * sb * cg - sa * cb * sg;
	out[2] = ca * cb * sg + sa * sb * cg;
	out[3] = ca * sb * sg + sa * cb * cg;
	return out;
}

// The turn from p to q in p's own axes (conj(p) q), written into out.
function turnBetween(p, q, out) {
	const pw = p[0];
	const px = -p[1];
	const py = -p[2];
	const pz = -p[3];
	const qw = q[0];
	const qx = q[1];
	const qy = q[2];
	const qz = q[3];
	out[0] = pw * qw - px * qx - py * qy - pz * qz;
	out[1] = pw * qx + px * qw + py * qz - pz * qy;
	out[2] = pw * qy - px * qz + py * qw + pz * qx;
	out[3] = pw * qz + px * qy - py * qx + pz * qw;
	return out;
}

/**
 * The offset the phone asks for: its turn since `baseline`, read about the screen's axes for its
 * rotation, past the dead band, each axis clamped to TILT_LIMITS (the joystick convention above).
 * @param {{ alpha?: number, beta: number, gamma: number }} reading the phone now, degrees
 * @param {{ alpha?: number, beta: number, gamma: number }} baseline the phone when tilt started, the
 *   screen turned, or a step change's ease back ended
 * @param {number} screenAngle the screen's rotation, degrees (0, 90, 180, 270)
 * @returns {{ yaw: number, pitch: number }} radians (written into `out` when given)
 */
export function orientationToOffset(reading, baseline, screenAngle, out = { yaw: 0, pitch: 0 }) {
	const angle = quarterTurn(screenAngle);
	if (!finite(reading.beta, reading.gamma, baseline.beta, baseline.gamma, angle)) {
		out.yaw = 0;
		out.pitch = 0;
		return out;
	}
	const q = turnBetween(rotationOf(baseline, baseQ), rotationOf(reading, nowQ), turnQ);
	// The turn as a rotation vector (axis times angle, radians) in the device's axes; the short way.
	const sign = q[0] < 0 ? -1 : 1;
	const half = Math.hypot(q[1], q[2], q[3]);
	const scale = half < 1e-12 ? 2 * sign : (2 * Math.atan2(half, sign * q[0]) * sign) / half;
	const x = q[1] * scale;
	const y = q[2] * scale;
	// About the screen's axes: its right and up are the device's x and y turned by the screen angle
	// (at 90 the device is turned anticlockwise, so screen right is the device's -y, up its +x). The
	// turn about the screen's normal (a roll) is not read.
	const c = QUARTER_COS[angle];
	const s = QUARTER_SIN[angle];
	const aboutRight = x * c - y * s;
	const aboutUp = x * s + y * c;
	// Positive about the right axis brings the top edge towards the visitor (the camera drops);
	// positive about the up axis takes the right edge away (the view swings right: yaw negative).
	out.yaw = clamp(banded(-aboutUp), -YAW_MAX, YAW_MAX);
	out.pitch = clamp(banded(-aboutRight), -PITCH_MAX, PITCH_MAX);
	return out;
}

/**
 * An exponential approach from `current` to `target` over `seconds` of the play clock (capped at
 * MAX_STEP_SECONDS), with time constant SMOOTHING_SECONDS: the same clock time gives the same
 * offset at any frame rate.
 */
export function smoothOffset(current, target, seconds, out = { yaw: 0, pitch: 0 }) {
	const dt = clamp(Number.isFinite(seconds) ? seconds : 0, 0, MAX_STEP_SECONDS);
	const k = 1 - Math.exp(-dt / SMOOTHING_SECONDS);
	out.yaw = approach(current.yaw, target.yaw, k);
	out.pitch = approach(current.pitch, target.pitch, k);
	return out;
}

function approach(from, to, k) {
	const next = from + (to - from) * k;
	return Math.abs(to - next) < SNAP ? to : next;
}

// Writes the camera at `radius`, `polar` (from straight down) and `azimuth` (from +z towards +x)
// round `target` into out.
function placeAround(target, radius, polar, azimuth, out) {
	const across = radius * Math.sin(polar);
	out.position[0] = target[0] + across * Math.sin(azimuth);
	out.position[1] = target[1] + radius * Math.cos(polar);
	out.position[2] = target[2] + across * Math.cos(azimuth);
	out.target[0] = target[0];
	out.target[1] = target[1];
	out.target[2] = target[2];
	return out;
}

function copyPose(pose, out) {
	for (let i = 0; i < 3; i++) {
		out.position[i] = pose.position[i];
		out.target[i] = pose.target[i];
	}
	return out;
}

const newPose = () => ({ position: [0, 0, 0], target: [0, 0, 0] });

/**
 * The pose turned by `offset`: the camera swings round the target, yaw about the vertical axis and
 * pitch about the horizontal one across the view; its distance to the target is unchanged. Writes
 * into `out` (new arrays when it is not given; `out` may not be `pose`).
 */
export function applyOffset(pose, offset, out = newPose()) {
	if (isZeroOffset(offset)) {
		return copyPose(pose, out);
	}
	const dx = pose.position[0] - pose.target[0];
	const dy = pose.position[1] - pose.target[1];
	const dz = pose.position[2] - pose.target[2];
	const radius = Math.hypot(dx, dy, dz);
	const polar = clamp(Math.atan2(Math.hypot(dx, dz), dy) - offset.pitch, POLAR_EPSILON, Math.PI - POLAR_EPSILON);
	return placeAround(pose.target, radius, polar, Math.atan2(dx, dz) + offset.yaw, out);
}

/**
 * The pose with its tilt (radians from straight down, as OrbitControls measures it) held inside
 * [min, max], keeping its heading and distance. Writes into `out` (which may be `pose`).
 */
export function clampPolar(pose, min, max, out = newPose()) {
	const dx = pose.position[0] - pose.target[0];
	const dy = pose.position[1] - pose.target[1];
	const dz = pose.position[2] - pose.target[2];
	const polar = Math.atan2(Math.hypot(dx, dz), dy);
	if (polar >= min && polar <= max) {
		return pose === out ? out : copyPose(pose, out);
	}
	return placeAround(pose.target, Math.hypot(dx, dy, dz), clamp(polar, min, max), Math.atan2(dx, dz), out);
}

/**
 * The tilt's state across frames: the latest reading (sense, from the events), the baseline, the
 * smoothed offset and the ease back. frame(key, seconds) runs once a frame with the step being read
 * and the play clock's seconds since the last frame, and returns the offset to apply (the same
 * object every frame, so nothing is allocated). The baseline is the first reading, and is taken
 * again when the screen turns, on reset(), and at the end of the ease back after a step change.
 * While the clock is stopped (a paused sea) the offset holds, and a step change cuts it to zero.
 * C2 (Task 0 fix round 1): frame(key, seconds, held) also takes whether the flat graph holds the
 * camera. A change of `held` eases the offset back like a step change does; while held the offset
 * then stays at zero whatever the phone does, and once released it follows again from a fresh
 * baseline, so neither edge cuts the camera.
 */
export function createTiltFollower() {
	const reading = { alpha: 0, beta: Number.NaN, gamma: Number.NaN };
	const baseline = { alpha: 0, beta: Number.NaN, gamma: Number.NaN };
	const target = { yaw: 0, pitch: 0 };
	const current = { yaw: 0, pitch: 0 };
	const from = { yaw: 0, pitch: 0 };
	let angle = 0;
	let baseAngle = Number.NaN;
	let returning = false;
	let elapsed = 0;
	let lastKey = null;
	let lastHeld = false;

	function rebase() {
		baseline.alpha = reading.alpha;
		baseline.beta = reading.beta;
		baseline.gamma = reading.gamma;
		baseAngle = angle;
	}

	function settle() {
		current.yaw = 0;
		current.pitch = 0;
		returning = false;
		rebase();
	}

	return Object.freeze({
		// A reading ({ alpha, beta, gamma }, degrees: a DeviceOrientationEvent will do) and the
		// screen's rotation. One without a finite beta and gamma is ignored.
		sense(next, screenAngle) {
			const turn = quarterTurn(screenAngle);
			if (!finite(next.beta, next.gamma, turn)) {
				return;
			}
			reading.alpha = finite(next.alpha) ? next.alpha : 0;
			reading.beta = next.beta;
			reading.gamma = next.gamma;
			angle = turn;
			if (!returning && (!finite(baseline.beta, baseline.gamma) || baseAngle !== angle)) {
				rebase();
			}
		},
		// Back to the shot, waiting for a reading to take as the baseline.
		reset() {
			current.yaw = 0;
			current.pitch = 0;
			returning = false;
			reading.beta = Number.NaN;
			reading.gamma = Number.NaN;
			rebase();
		},
		frame(key, seconds, held = false) {
			if ((lastKey !== null && key !== lastKey) || held !== lastHeld) {
				returning = true;
				elapsed = 0;
				from.yaw = current.yaw;
				from.pitch = current.pitch;
			}
			lastKey = key;
			lastHeld = held;
			const dt = clamp(Number.isFinite(seconds) ? seconds : 0, 0, MAX_STEP_SECONDS);
			if (returning) {
				elapsed = dt > 0 ? elapsed + dt : RETURN_SECONDS;
				if (elapsed >= RETURN_SECONDS) {
					settle();
				} else {
					const left = 1 - smoothstep(elapsed / RETURN_SECONDS);
					current.yaw = from.yaw * left;
					current.pitch = from.pitch * left;
				}
				return current;
			}
			if (held) {
				return current;
			}
			if (dt > 0) {
				orientationToOffset(reading, baseline, baseAngle, target);
				smoothOffset(current, target, dt, current);
			}
			return current;
		},
		offset: () => ({ yaw: current.yaw, pitch: current.pitch }),
	});
}
