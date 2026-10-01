// The sun as the story's sliders move it (A3; not a twin): azimuth and elevation in degrees,
// azimuth measured from +x towards +z, and the unit vector towards the sun the renderer and the
// glow use.
import { mod } from '../core/luau.js';
import { SUN_DIRECTION } from '../render/lighting.js';

const RADIANS = Math.PI / 180;

export function sunAngles(direction) {
	const [x, y, z] = direction;
	const length = Math.hypot(x, y, z);
	if (!(Number.isFinite(length) && length > 0)) {
		throw new RangeError(`the sun needs a non-zero direction, got ${JSON.stringify(direction)}`);
	}
	// mod gives 360 itself for a hair below 0 (-5.7e-16 + 360 rounds to 360); keep to [0, 360).
	const azimuth = mod(Math.atan2(z, x) / RADIANS, 360);
	return {
		azimuth: azimuth === 360 ? 0 : azimuth,
		elevation: Math.asin(y / length) / RADIANS,
	};
}

export function sunDirection({ azimuth, elevation }) {
	if (!Number.isFinite(azimuth) || !Number.isFinite(elevation) || Math.abs(elevation) > 90) {
		throw new RangeError(`the sun needs a finite azimuth and an elevation in -90..90, got ${azimuth}, ${elevation}`);
	}
	const a = azimuth * RADIANS;
	const e = elevation * RADIANS;
	return [Math.cos(e) * Math.cos(a), Math.sin(e), Math.cos(e) * Math.sin(a)];
}

// The Studio place's sun (render/lighting.js), as the angles the recipes blend.
export const PLACE_SUN = Object.freeze(sunAngles(SUN_DIRECTION));
