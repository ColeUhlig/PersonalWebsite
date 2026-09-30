// Where a stage shot puts the camera (A3; not a twin): the shot's own position, or for the finale's
// `drift` that position turned about the shot's target, once every DRIFT_PERIOD seconds, at the
// shot's own height. Browser-free, so the clearance check (tests/ocean/stages/clearance.test.js)
// walks the same circle the page's camera does (render/cameraRig.js applyShot).
export const DRIFT_PERIOD = 240;
const RADIANS_PER_SECOND = (2 * Math.PI) / DRIFT_PERIOD;

/**
 * @param {{ position: number[], target: number[], move: 'still' | 'drift' }} shot
 * @param {number} seconds how long the drift has run (ignored for a still shot)
 * @param {number[]} [out] written and returned, so a caller can keep one array across frames
 */
export function shotPosition(shot, seconds, out = [0, 0, 0]) {
	const position = shot.position;
	const target = shot.target;
	out[0] = position[0];
	out[1] = position[1];
	out[2] = position[2];
	if (shot.move === 'drift') {
		const angle = seconds * RADIANS_PER_SECOND;
		const dx = position[0] - target[0];
		const dz = position[2] - target[2];
		out[0] = target[0] + dx * Math.cos(angle) - dz * Math.sin(angle);
		out[2] = target[2] + dx * Math.sin(angle) + dz * Math.cos(angle);
	}
	return out;
}
