// The colour map: Rare's deep water colour, tinted toward the sub-surface colour by height
// (a mild version of the height ramp the vertex colours used to paint, so the form reads when the
// sun is behind you). The view-dependent half of Rare's blend is the emissive glow, not this map.
//
// Two pieces, and no foam in either: `lut` is the deep-to-subsurface table the tint indexes, and
// `base` paints the water colour through it, three bytes a texel. That base is what the colour
// worker's bands start from; the foam goes over it, at the colour map's own finer texels, in
// FoamPaint.band.
//
// Storage: the LUT and `out` are Uint8Arrays of RGB bytes, THREE per entry or texel (index =
// entry * 3 + channel, texel (i, j) at (j * texels + i) * 3), no alpha, as the Luau writes them.
// Twin of roblox-ocean/src/shared/Ocean/WaterColour.luau.
import * as Cascade from './cascade.js';
import { clamp, lerpColor3 } from './luau.js';

// The sampler's out, reused: base calls it for every cascade at every texel.
const SAMPLE = new Float64Array(3);

function byte(value) {
	return clamp(Math.floor(value * 255 + 0.5), 0, 255);
}

// 256 RGB triples from deep (0) to subsurface (255). `deep` and `subsurface` are color3 records.
/** @returns {Uint8Array} */
export function lut(deep, subsurface) {
	const out = new Uint8Array(256 * 3);
	for (let k = 0; k <= 255; k++) {
		const colour = lerpColor3(deep, subsurface, k / 255);
		out[k * 3] = byte(colour.r);
		out[k * 3 + 1] = byte(colour.g);
		out[k * 3 + 2] = byte(colour.b);
	}
	return out;
}

// The water colour on its own: three bytes a texel, no alpha and no foam. It is the base
// FoamPaint.band upsamples to the colour map's own texels, and the foam is not painted here
// because at these texels it could only be the blanket the finer map exists to break up.
// `cascades` are Luau cascade numbers, read at fields[c - 1].
/**
 * @param {Uint8Array} out texels * texels * 3 bytes
 * @param {number} texels
 * @param {number} tile
 * @param {Array<import('./cascade.js').Fields>} fields
 * @param {ReadonlyArray<number>} cascades
 * @param {number} peak
 * @param {number} tint
 * @param {Uint8Array} lut 256 * 3 bytes, from `lut`
 */
export function base(out, texels, tile, fields, cascades, peak, tint, lut) {
	const step = tile / texels;
	const inversePeak = peak > 0 ? 1 / peak : 0;
	const sample = Cascade.sampleHeight;
	const scratch = SAMPLE;
	const count = cascades.length;
	// The ramp is written out rather than shared with a helper: it runs at every texel of the map,
	// and a call per texel is work the painter has no frame for.
	for (let j = 0; j <= texels - 1; j++) {
		const z = (j + 0.5) * step;
		for (let i = 0; i <= texels - 1; i++) {
			const x = (i + 0.5) * step;
			let height = 0;
			for (let index = 0; index < count; index++) {
				height += sample(fields[cascades[index] - 1], x, z, scratch)[0];
			}
			const t = clamp((height * inversePeak + 1) * 0.5, 0, 1);
			// Unclamped, as in the Luau: a tint above 1 indexes past the LUT, which errors in Luau
			// and reads undefined (written as 0) here.
			const entry = Math.floor(tint * t * 255 + 0.5) * 3;
			const offset = (j * texels + i) * 3;
			out[offset] = lut[entry];
			out[offset + 1] = lut[entry + 1];
			out[offset + 2] = lut[entry + 2];
		}
	}
}
