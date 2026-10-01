// The story's camera between shots (piece C; spec 2: "Scrolling blends between shots. Between steps
// the visitor can drag to orbit; the next step's shot takes over again"). Browser-free. The shot is
// applied every frame until the visitor orbits; the camera is then theirs until the step being read
// changes, and eases back to the new shot from wherever they left it. The same ease takes over when
// the shot itself would jump under the camera (the finale's drift letting go as the visitor scrolls
// back up out of it: returnToShot). The ease orbits round the target (spherical), rather than
// cutting a straight line through the middle, and takes RETURN_SECONDS, or longer for a long way
// round (at most MAX_RETURN_SECONDS), so no frame's step is large. A cut (the opening boundary, a
// jump of more than a step) goes straight to the shot, and so does everything under reduced motion
// (returnSeconds 0) or while the play clock is stopped (ease: false): the ease reads the clock, so
// with no clock it would never arrive.
import { DRIFT_PERIOD, shotPosition } from '../stages/drift.js';

export const RETURN_SECONDS = 1.2;
// A return longer than RETURN_SECONDS at this speed, in studs a second along the way round, takes
// longer, up to MAX_RETURN_SECONDS.
export const RETURN_STUDS_PER_SECOND = 150;
export const MAX_RETURN_SECONDS = 3;
// The finale's drift: once round the target every 240 s. The drift itself is A3's stages/drift.js
// (the one the camera rig and the clearance check use); resolveShot hands it on.
export const DRIFT_PERIOD_SECONDS = DRIFT_PERIOD;

const smoothstep = (x) => x * x * (3 - 2 * x);
const lerp = (a, b, w) => a + (b - a) * w;
const lerp3 = (a, b, w) => [lerp(a[0], b[0], w), lerp(a[1], b[1], w), lerp(a[2], b[2], w)];
// The shortest turn from angle a to angle b, in (-PI, PI].
const turn = (a, b) => {
	const d = (b - a) % (2 * Math.PI);
	return d > Math.PI ? d - 2 * Math.PI : d <= -Math.PI ? d + 2 * Math.PI : d;
};

export function resolveShot(shot, seconds) {
	return { position: shotPosition(shot, seconds), target: [shot.target[0], shot.target[1], shot.target[2]] };
}

// A pose as its target and the camera's place round it: distance, tilt from straight up the y axis
// (polar) and heading (azimuth, from +z towards +x).
function spherical(pose) {
	const dx = pose.position[0] - pose.target[0];
	const dy = pose.position[1] - pose.target[1];
	const dz = pose.position[2] - pose.target[2];
	return { radius: Math.hypot(dx, dy, dz), polar: Math.atan2(Math.hypot(dx, dz), dy), azimuth: Math.atan2(dx, dz) };
}

// Weight w of the way from `from` to `to`: the target moves straight, the camera round it.
function orbitBetween(from, to, w) {
	const a = spherical(from);
	const b = spherical(to);
	const target = lerp3(from.target, to.target, w);
	const radius = lerp(a.radius, b.radius, w);
	const polar = lerp(a.polar, b.polar, w);
	const azimuth = a.azimuth + turn(a.azimuth, b.azimuth) * w;
	const across = radius * Math.sin(polar);
	return {
		position: [target[0] + across * Math.sin(azimuth), target[1] + radius * Math.cos(polar), target[2] + across * Math.cos(azimuth)],
		target,
	};
}

// About how far the orbit from `from` to `to` travels, in studs.
function orbitLength(from, to) {
	const a = spherical(from);
	const b = spherical(to);
	const radius = (a.radius + b.radius) / 2;
	const across = radius * Math.sin((a.polar + b.polar) / 2);
	const moved = Math.hypot(to.target[0] - from.target[0], to.target[1] - from.target[1], to.target[2] - from.target[2]);
	return moved + Math.hypot(b.radius - a.radius, radius * (b.polar - a.polar), across * turn(a.azimuth, b.azimuth));
}

export function createShotControl({ returnSeconds = RETURN_SECONDS } = {}) {
	let mode = 'shot';
	let anchor = null;
	let from = null;
	let elapsed = 0;
	let duration = returnSeconds;
	return Object.freeze({
		orbited(key) {
			mode = 'free';
			anchor = key;
			from = null;
		},
		// The shot is about to jump under the camera (the finale's drift letting go): ease to it
		// from wherever the camera is at the next frame. A visitor holding the camera keeps it.
		returnToShot() {
			if (mode !== 'free') {
				mode = 'returning';
				from = null;
				elapsed = 0;
			}
		},
		mode: () => mode,
		// Once a frame. key: the step being read (0 for the opening); pose: where the camera is now;
		// target: the pose the shot asks for; dt: the play clock's seconds since the last frame.
		// Returns the pose to apply, or null to leave the camera to the visitor.
		frame(key, pose, target, dt, { cut = false, ease = true } = {}) {
			if (cut) {
				mode = 'shot';
				return target;
			}
			const easing = ease && returnSeconds > 0;
			if (mode === 'free') {
				if (key === anchor) {
					return null;
				}
				mode = 'returning';
				from = null;
				elapsed = 0;
			}
			if (mode !== 'returning') {
				return target;
			}
			if (!easing) {
				mode = 'shot';
				return target;
			}
			if (from === null) {
				from = pose;
				duration = Math.min(MAX_RETURN_SECONDS, Math.max(returnSeconds, orbitLength(from, target) / RETURN_STUDS_PER_SECOND));
				return orbitBetween(from, target, 0);
			}
			elapsed += Math.max(0, dt);
			if (elapsed >= duration) {
				mode = 'shot';
				return target;
			}
			return orbitBetween(from, target, smoothstep(elapsed / duration));
		},
	});
}
