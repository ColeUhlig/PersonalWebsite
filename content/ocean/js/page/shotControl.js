// The story's camera between shots (piece C; spec 2: "Scrolling blends between shots. Between steps
// the visitor can drag to orbit; the next step's shot takes over again"). Browser-free. The shot is
// applied every frame until the visitor orbits; the camera is then theirs until the step being read
// changes, and eases back to the new shot over RETURN_SECONDS from wherever they left it. A cut
// (the opening boundary, a jump of more than a step) goes straight to the shot, and so does
// everything under reduced motion (returnSeconds 0) or while the play clock is stopped (ease: false):
// the ease reads the clock, so with no clock it would never arrive.
export const RETURN_SECONDS = 1.2;
// The finale's drift: once round the target every 240 s. render/cameraRig.js applyShot resolves its
// drift through resolveShot, so this is the one place the rate lives.
export const DRIFT_PERIOD_SECONDS = 240;

const smoothstep = (x) => x * x * (3 - 2 * x);
const lerp3 = (a, b, w) => a.map((value, i) => value + (b[i] - value) * w);

export function resolveShot(shot, seconds) {
	const [tx, ty, tz] = shot.target;
	let [px, py, pz] = shot.position;
	if (shot.move === 'drift') {
		const angle = (seconds * 2 * Math.PI) / DRIFT_PERIOD_SECONDS;
		const dx = px - tx;
		const dz = pz - tz;
		px = tx + dx * Math.cos(angle) - dz * Math.sin(angle);
		pz = tz + dx * Math.sin(angle) + dz * Math.cos(angle);
	}
	return { position: [px, py, pz], target: [tx, ty, tz] };
}

export function createShotControl({ returnSeconds = RETURN_SECONDS } = {}) {
	let mode = 'shot';
	let anchor = null;
	let from = null;
	let elapsed = 0;
	return Object.freeze({
		orbited(key) {
			mode = 'free';
			anchor = key;
			from = null;
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
				if (!easing) {
					mode = 'shot';
					return target;
				}
				mode = 'returning';
				from = pose;
				elapsed = 0;
			}
			if (mode === 'returning') {
				elapsed += Math.max(0, dt);
				if (!easing || elapsed >= returnSeconds) {
					mode = 'shot';
					return target;
				}
				const w = smoothstep(elapsed / returnSeconds);
				return { position: lerp3(from.position, target.position, w), target: lerp3(from.target, target.target, w) };
			}
			return target;
		},
	});
}
