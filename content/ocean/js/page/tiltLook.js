// Tilting a phone to look around the ocean (piece C Task 9b; browser-free). On a touch-first screen
// the story turns orbit off so a swipe scrolls the page; the phone's own tilt gives the look-around
// back. This is the maths: the phone's orientation (DeviceOrientationEvent beta and gamma, degrees)
// as a change from a baseline, mapped through the screen's rotation, becomes a small yaw and pitch
// round the current shot's target, clamped to TILT_LIMITS, smoothed on the play clock, and eased
// back to the shot when the story moves to another step. ui/tilt.js feeds it events;
// ui/storyStage.js applies the offset to the shot's pose before the orbit limits, so the tilt range,
// the camera floor and the reach still hold.
//
// The window convention: the phone is a window onto the sea. Tilting its right edge away turns the
// view right; standing it up looks further towards the horizon (the camera drops), laying it back
// looks down (the camera rises). yaw is radians counter-clockwise seen from above (about +y), pitch
// is radians the camera rises (its tilt from straight down shrinks).

export const TILT_LIMITS = Object.freeze({ yawDeg: 12, pitchDeg: 8 });
// The smoothing's time constant and the ease back on a step change, both in play-clock seconds.
export const SMOOTHING_SECONDS = 0.25;
export const RETURN_SECONDS = 1.2;
// A frame's seconds are capped here, so a stall does not land the camera in one jump.
export const MAX_STEP_SECONDS = 0.25;
// Closer than this (radians) the smoothing lands on its target, so a still phone is exactly still
// and an offset that has gone back to zero costs the story nothing.
const SNAP = 1e-6;
// The camera never tips over the top of its target.
const POLAR_EPSILON = 1e-4;

const DEG = Math.PI / 180;
const YAW_MAX = TILT_LIMITS.yawDeg * DEG;
const PITCH_MAX = TILT_LIMITS.pitchDeg * DEG;

const clamp = (x, lo, hi) => Math.min(Math.max(x, lo), hi);
const smoothstep = (x) => x * x * (3 - 2 * x);
// The change from a to b in degrees, wrapped into (-180, 180].
const change = (a, b) => {
	const d = (b - a) % 360;
	return d > 180 ? d - 360 : d <= -180 ? d + 360 : d;
};
const finite = (...values) => values.every((v) => typeof v === 'number' && Number.isFinite(v));

export const isZeroOffset = (offset) => offset.yaw === 0 && offset.pitch === 0;

// The screen's rotation as 0, 90, 180 or 270 (window.orientation's -90 is 270); NaN if unknown.
export function quarterTurn(angle) {
	if (!finite(angle)) {
		return Number.NaN;
	}
	return (((Math.round(angle / 90) * 90) % 360) + 360) % 360;
}

/**
 * The offset the phone asks for: its change from `baseline`, mapped through the screen's rotation
 * so landscape turns the view the way portrait does, each axis clamped to TILT_LIMITS.
 * @param {{ beta: number, gamma: number }} reading the phone now, degrees
 * @param {{ beta: number, gamma: number }} baseline the phone when tilt started or the step changed
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
	const beta = change(baseline.beta, reading.beta);
	const gamma = change(baseline.gamma, reading.gamma);
	// The turn about the screen's vertical axis and about its horizontal one: in portrait those are
	// the device's y (gamma) and x (beta) axes; a quarter turn of the screen swaps them.
	let across = gamma;
	let along = beta;
	if (angle === 90) {
		across = beta;
		along = -gamma;
	} else if (angle === 180) {
		across = -gamma;
		along = -beta;
	} else if (angle === 270) {
		across = -beta;
		along = gamma;
	}
	out.yaw = clamp(-across * DEG, -YAW_MAX, YAW_MAX);
	out.pitch = clamp(-along * DEG, -PITCH_MAX, PITCH_MAX);
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
 */
export function createTiltFollower() {
	const reading = { beta: Number.NaN, gamma: Number.NaN };
	const baseline = { beta: Number.NaN, gamma: Number.NaN };
	const target = { yaw: 0, pitch: 0 };
	const current = { yaw: 0, pitch: 0 };
	const from = { yaw: 0, pitch: 0 };
	let angle = 0;
	let baseAngle = Number.NaN;
	let returning = false;
	let elapsed = 0;
	let lastKey = null;

	function rebase() {
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
		sense(beta, gamma, screenAngle) {
			const turn = quarterTurn(screenAngle);
			if (!finite(beta, gamma, turn)) {
				return;
			}
			reading.beta = beta;
			reading.gamma = gamma;
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
		frame(key, seconds) {
			if (lastKey !== null && key !== lastKey) {
				returning = true;
				elapsed = 0;
				from.yaw = current.yaw;
				from.pitch = current.pitch;
			}
			lastKey = key;
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
			if (dt > 0) {
				orientationToOffset(reading, baseline, baseAngle, target);
				smoothOffset(current, target, dt, current);
			}
			return current;
		},
		offset: () => ({ yaw: current.yaw, pitch: current.pitch }),
	});
}
