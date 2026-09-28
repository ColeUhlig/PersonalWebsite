// The wave-peak mask: one grey byte per texel of the 256-stud tile, the summed HEIGHT of the
// listed cascades above the mean surface, clamped at zero, normalised by a running maximum and
// bent by gamma. Painted into the emissive mask; the per-patch emissive strength (ScatterLobe)
// supplies the view-and-sun half.
//
// Rare's own sentence names the choppiness, not the height: "the wave peak mask is generated
// from the FFT choppiness vertex offsets; where the choppiness offset is greater, this
// corresponds to wave peaks". That was taken literally, shipped, and then MEASURED against our
// fields on 2026-09-20 (Edit, time 12): the choppiness magnitude |D| = |(dispX, dispZ)| is
// uncorrelated with the height (corr -0.01 on cascade 1), and its brightest tenth of texels sits
// at a mean height of 0.26 studs on waves reaching 12.9, half of them below sea level. For a
// Gerstner or FFT wave the horizontal offset is 90 degrees out of phase with the height, so |D|
// peaks on the FLANKS and is zero at the crests and the troughs: the mask lit the sides of every
// wave and no strength could make the tops glow. The height above the mean surface is what
// their last clause is about anyway, since that is where light travels the shortest distance
// through the water. The other candidate for "peaks" is the Jacobian compression, M4's foam
// input; untested here.
//
// Storage: `out` is a Uint8Array of RGBA bytes, FOUR per texel (texel (i, j) at
// (j * texels + i) * 4: grey, grey, grey, 255). The magnitudes between the passes are a
// Float32Array, one float per texel (the Luau's f32 buffer at byte offset index * 4).
// Twin of roblox-ocean/src/shared/Ocean/PeakMask.luau.
import * as Cascade from './cascade.js';
import * as FoamField from './foamField.js';
import { check, clamp } from './luau.js';

export const DECAY = 0.98; // the running maximum's hysteresis per fill

// The magnitudes between the two passes of `fill`. Module-level, so it is one array per module
// instance, grown on first use, never per texel.
/** @type {Float32Array | null} */
let scratch = null;

// The sampler's out, reused: fill calls it for every cascade at every texel.
const SAMPLE = new Float64Array(3);

export function nextMax(previous, found, decay) {
	return Math.max(found, previous * decay);
}

// Returns the largest magnitude seen; dMax <= 0 normalises by that maximum (first fill). That
// maximum is the sea's tallest crest and ignores the foam: with a foam field a covered texel is
// held down in the BYTE alone, because foam is painted over the crest it came from and that crest
// must not glow through it, while the scale the rest of the map divides by has to stay still.
// Holding it down before the maximum too (as this did until 2026-09-21) tied the scale to the
// foam: every cap that covered the tallest crest brightened the whole map and every one that
// dissolved dimmed it again, so the glow pumped at the foam's own rate (Cole, Play: the sea was
// "super flickery").
// `cascades` are Luau cascade numbers, read at fields[c - 1].
/**
 * @param {Uint8Array} out texels * texels * 4 bytes
 * @param {number} texels
 * @param {number} tile
 * @param {Array<import('./cascade.js').Fields>} fields
 * @param {ReadonlyArray<number>} cascades
 * @param {number} dMax
 * @param {number} gamma
 * @param {import('./foamField.js').Field} [foam]
 * @returns {number}
 */
export function fill(out, texels, tile, fields, cascades, dMax, gamma, foam) {
	// `foam ~= nil` in the Luau: undefined or null both mean no foam field.
	const hasFoam = foam != null;
	if (hasFoam) {
		// Once, here: the field's `at` does not wrap, so a field of another size would read the
		// wrong texel across the whole map or run off the end halfway through it.
		check(foam.texels === texels, "the foam field is not the mask's size");
	}
	const step = tile / texels;
	const count = texels * texels;
	// Two passes: the scale is not known until every texel has been sampled, and `out` holds
	// bytes, so the magnitudes wait in the scratch array as floats. It grows on demand and is
	// kept, so a steady texel count allocates on the first fill only.
	const held = scratch;
	const magnitudes = held !== null && held.length >= count ? held : new Float32Array(count);
	scratch = magnitudes;
	const sample = Cascade.sampleHeight;
	const heights = SAMPLE;
	const cascadeCount = cascades.length;
	let found = 0;
	for (let j = 0; j <= texels - 1; j++) {
		const z = (j + 0.5) * step;
		for (let i = 0; i <= texels - 1; i++) {
			const x = (i + 0.5) * step;
			let h = 0;
			for (let index = 0; index < cascadeCount; index++) {
				// The height is all that is kept; the two displacements beside it are dropped.
				h += sample(fields[cascades[index] - 1], x, z, heights)[0];
			}
			// Everything at or below the mean surface is black: a trough has no thin water for the
			// light to come through, and a signed value would light the deepest ones brightest.
			let magnitude = Math.max(h, 0);
			// The maximum first, from the bare height: the suppression below says what this texel
			// is worth under its foam, not what the map is measured against.
			if (magnitude > found) {
				found = magnitude;
			}
			if (hasFoam) {
				magnitude *= 1 - FoamField.at(foam, i, j);
			}
			magnitudes[j * texels + i] = magnitude;
		}
	}
	const scale = dMax > 0 ? dMax : found;
	const inverse = scale > 0 ? 1 / scale : 0;
	for (let index = 0; index <= count - 1; index++) {
		const value = clamp(magnitudes[index] * inverse, 0, 1) ** gamma;
		// Unclamped, as in the Luau: value is in [0, 1] for any positive gamma.
		const byte = Math.floor(value * 255 + 0.5);
		const offset = index * 4;
		out[offset] = byte;
		out[offset + 1] = byte;
		out[offset + 2] = byte;
		out[offset + 3] = 255;
	}
	return found;
}
