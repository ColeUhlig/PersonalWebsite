// The view-and-sun half of Rare's scattering blend: crests between the camera and the sun
// glow. Evaluated once per patch (a broad lobe) and applied through that patch's emissive
// strength; the wave-shape half is the peak mask. These are the view and face terms of the M2
// CrestGlow, retired, without its height term: the mask carries the shape now.
// L = unit vector toward the sun, V = unit vector from the patch centre toward the camera.
// The patch centre is taken on the MEAN surface, y = 0, never on the displaced water: that is
// why `centreX`/`centreZ` carry no height of their own and `cameraY` is the camera's world
// height rather than a difference. A broad lobe over a 32 to 256 stud patch cannot tell the
// few studs of wave height apart anyway, and reading one would cost a sample per patch.
// Twin of roblox-ocean/src/shared/Ocean/ScatterLobe.luau.

/**
 * @typedef {object} Params
 * @property {number} strength
 * @property {number} viewPower
 * @property {number} facePower
 */

/** @type {Readonly<Params>} */
export const DEFAULTS = Object.freeze({
	strength: 2,
	viewPower: 3,
	facePower: 2,
});

/**
 * @param {Params} params
 * @returns {number}
 */
export function strength(centreX, centreZ, cameraX, cameraY, cameraZ, sunX, sunY, sunZ, params) {
	let vx = cameraX - centreX;
	let vy = cameraY;
	let vz = cameraZ - centreZ;
	const length = Math.sqrt(vx * vx + vy * vy + vz * vz);
	if (length === 0 || params.strength === 0) {
		return 0;
	}
	vx = vx / length;
	vy = vy / length;
	vz = vz / length;
	const towardSun = -(sunX * vx + sunY * vy + sunZ * vz);
	if (towardSun <= 0) {
		return 0;
	}
	const viewTerm = Math.min(towardSun, 1) ** params.viewPower;
	// The face term on the mean surface (normal up): low suns glow more.
	const faceTerm = Math.max(0, 0.5 - 0.5 * sunY) ** params.facePower;
	return params.strength * viewTerm * faceTerm;
}
