// How far the visitor may orbit the camera in the story (piece C; browser-free). A3 placed every
// shot so the frame never shows the world's edge, and kept the two high shots (`tiling` and `layers`)
// looking steeply down so their frames stay on moving water, short of the flat horizon plane
// (stages/recipes.js, "the two high shots"). Free orbit must not undo that. So:
//   * the reach (the camera's distance from what it looks at) is capped a little past the farthest
//     shot, the layers step's, about 398 studs out. With zoom off in the story the visitor cannot change the
//     distance anyway; the cap is the backstop;
//   * the tilt (the polar angle, 0 looking straight down) is limited per shot. A camera no higher
//     than HORIZON_HEIGHT above the ground may tilt freely: the page's own low shots look at the
//     horizon from there. Higher up, the top of the frame may reach no further out than the moving
//     water, measured the way tests/ocean/stages/shots.test.js does;
//   * the camera never sinks below CAMERA_FLOOR, or below its shot's own height when the shot
//     stands lower: the finished sea's crests reach 10 to 13 studs, and a camera dragged down to
//     the water would sit inside them.
// The range always holds the shot's own tilt, so applying a shot (OrbitControls clamps to the
// range) never moves it.
import * as SurfaceSampler from '../core/surfaceSampler.js';

// Studs from the target. The farthest shot, the layers step's, is about 398 studs out.
export const STORY_MAX_DISTANCE = 450;
// Studs above the ground. The highest a page shot sees the horizon from is A2's high view and
// the FFT step's shot, 110 studs up.
export const HORIZON_HEIGHT = 120;
// Studs above the ground: the deck shot's height, the view matched against Studio, which clears
// the finished sea's crests.
export const CAMERA_FLOOR = 14;
// render/cameraRig.js's limit: just short of level, so the camera never looks along the water.
export const MAX_POLAR = Math.PI * 0.495;

const BISECTIONS = 48;

// The camera's distance from its target, its tilt (radians from straight down) and its height.
export function polarOf(pose) {
	const dx = pose.position[0] - pose.target[0];
	const dy = pose.position[1] - pose.target[1];
	const dz = pose.position[2] - pose.target[2];
	return { distance: Math.hypot(dx, dy, dz), polar: Math.atan2(Math.hypot(dx, dz), dy), height: pose.position[1] };
}

// Where the last ring starts to flatten into the horizon plane: past it the sea stops moving.
export function movingReach(rings) {
	const context = SurfaceSampler.ringContext(rings[rings.length - 1], null);
	return context.fadeEdge - context.fadeWidth;
}

// How far out from the target, on the ground (y = 0), the frame's top corners land for a camera
// `distance` from a target at height `targetY` and tilted `polar`, with a vertical field of view
// `fovDegrees` and an `aspect`. Euclidean, so it holds at any heading. Infinity once the top of the
// frame reaches the horizon.
export function frameReach({ distance, polar, targetY, aspect, fovDegrees }) {
	return reachAt(distance, polar, targetY, aspect, Math.tan((fovDegrees / 2) * (Math.PI / 180)));
}

function reachAt(distance, polar, targetY, aspect, tanHalf) {
	const height = targetY + distance * Math.cos(polar);
	const down = Math.cos(polar) - tanHalf * Math.sin(polar);
	if (!(down > 0)) {
		return Infinity;
	}
	if (!(height > 0)) {
		return 0;
	}
	const t = height / down;
	const forward = (Math.sin(polar) + tanHalf * Math.cos(polar)) * t - distance * Math.sin(polar);
	return Math.hypot(forward, aspect * tanHalf * t);
}

// The steepest-side cap: the largest tilt whose frame reaches no further than `reach`.
function steepCap(distance, targetY, aspect, tanHalf, reach, maxPolar) {
	if (reachAt(distance, 0, targetY, aspect, tanHalf) > reach) {
		return 0;
	}
	if (reachAt(distance, maxPolar, targetY, aspect, tanHalf) <= reach) {
		return maxPolar;
	}
	let lo = 0;
	let hi = maxPolar;
	for (let i = 0; i < BISECTIONS; i++) {
		const mid = (lo + hi) / 2;
		if (reachAt(distance, mid, targetY, aspect, tanHalf) <= reach) {
			lo = mid;
		} else {
			hi = mid;
		}
	}
	return lo;
}

/**
 * The tilt range the visitor may orbit through from `pose`, in radians. Written into `out` and
 * returned: the story works the range out on every frame a shot moves, so it passes a scratch
 * object (and a reused options object).
 * @param {{ position: number[], target: number[] }} pose the shot the camera stands at
 * @param {{ aspect: number, fovDegrees: number, reach: number, horizonHeight?: number, maxPolar?: number }} options
 * @param {{ min: number, max: number }} [out] where the range is written
 * @returns {{ min: number, max: number }}
 */
export function polarRange(pose, options, out = { min: 0, max: 0 }) {
	const dx = pose.position[0] - pose.target[0];
	const dy = pose.position[1] - pose.target[1];
	const dz = pose.position[2] - pose.target[2];
	const distance = Math.hypot(dx, dy, dz);
	const polar = Math.atan2(Math.hypot(dx, dz), dy);
	const targetY = pose.target[1];
	tiltBand(distance, polar, targetY, options, out);
	// The most tilt that keeps the camera at or above the floor.
	const floor = Math.min(CAMERA_FLOOR, pose.position[1]);
	const floorMax = Math.acos(Math.min(Math.max((floor - targetY) / distance, -1), 1));
	out.max = Math.max(Math.min(out.max, floorMax), polar);
	return out;
}

// The band the shot's tilt may move in, written into `out`.
function tiltBand(distance, polar, targetY, { aspect, fovDegrees, reach, horizonHeight = HORIZON_HEIGHT, maxPolar = MAX_POLAR }, out) {
	const steepMax = steepCap(distance, targetY, aspect, Math.tan((fovDegrees / 2) * (Math.PI / 180)), reach, maxPolar);
	// The least tilt that keeps the camera within horizonHeight of the ground.
	const lowMin = Math.acos(Math.min(Math.max((horizonHeight - targetY) / distance, -1), 1));
	// Two allowed bands with a gap between them (steepMax < lowMin): stay in the one the shot is in
	// (or nearer to).
	const steep = steepMax < lowMin && (polar <= steepMax || (polar < lowMin && polar - steepMax < lowMin - polar));
	if (steepMax >= lowMin) {
		out.min = 0;
		out.max = Math.max(maxPolar, polar);
	} else if (steep) {
		out.min = 0;
		out.max = Math.max(steepMax, polar);
	} else {
		out.min = Math.min(lowMin, polar);
		out.max = Math.max(maxPolar, polar);
	}
}
