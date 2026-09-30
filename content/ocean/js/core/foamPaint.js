// One band of the 512-texel colour map: the water colour upsampled from 128 (the height tint is
// smooth and 2-stud work either way) with the foam laid over it at the map's own half-stud texels.
// The veil is the foam field or fields sampled here, each on its own tiling, and a lace texture
// erodes that veil so thin coverage breaks into filaments instead of fading as one soft blob. The
// map is painted in bands, one per frame, because a whole 512 fill is sixteen times the old one.
//
// Storage, which the Luau keeps in buffers with BYTES = 4 meaning two different things:
// - the lace, the foam fields and `coverageOut` are Float32Arrays, one float per texel (index =
//   texel);
// - `out` is a Uint8Array of RGBA bytes, four per texel (index = texel * 4 + channel);
// - `base` is a Uint8Array of RGB bytes, THREE per texel (index = texel * 3 + channel), as the Luau
//   reads it and its spec builds it.
// Twin of roblox-ocean/src/shared/Ocean/FoamPaint.luau.
import { bit32, clamp, idiv, mod } from './luau.js';

/**
 * @typedef {object} Params
 * @property {number} threshold the summed foam the veil starts fading in at
 * @property {number} feather and the width it reaches full density over; 0 is a hard edge
 * @property {number} laceSoft the lace band a filament's own edge feathers over; 0 paints the veil whole
 * @property {number} opacity what the fullest foam takes of the water under it
 * @property {number} r the foam colour, bytes
 * @property {number} g
 * @property {number} b
 */

const BYTES = 4; // floats are one element each; RGBA bytes are four
const BASE_BYTES = 3; // RGB bytes per base texel
const TWO_32 = 4294967296;
// What a feather of 0 means: one fade expression covers both, and at this slope any sum above the
// threshold reaches full density while the threshold itself stays at nothing. A branch per texel
// would say the same thing a quarter of a million times a band.
const HARD_EDGE = 1e30;

// The four corners and weights of a bilinear sample at (u, v) on a `texels` grid, wrapping.
// Written into the module scratch CORNERS as texel indices (not byte offsets) a, b, c, d and the
// four weights wa, wb, wc, wd (the Luau returns these eight). The wrap is on the floored integer
// cell, so it cannot round up to `texels` and needs no fold-back guard.
const CORNERS = new Float64Array(8);

function corners(u, v, texels) {
	const column = Math.floor(u);
	const row = Math.floor(v);
	const fu = u - column;
	const fv = v - row;
	// Floored modulo: u and v are -0.5 of a texel at the map's first row and column.
	const column0 = mod(column, texels);
	const row0 = mod(row, texels);
	const column1 = mod(column + 1, texels);
	const row1 = mod(row + 1, texels);
	CORNERS[0] = row0 * texels + column0;
	CORNERS[1] = row0 * texels + column1;
	CORNERS[2] = row1 * texels + column0;
	CORNERS[3] = row1 * texels + column1;
	CORNERS[4] = (1 - fu) * (1 - fv);
	CORNERS[5] = fu * (1 - fv);
	CORNERS[6] = (1 - fu) * fv;
	CORNERS[7] = fu * fv;
}

// A lattice point's own number, 0 .. 1, from a deterministic integer hash: the texture has to come
// out the same in every worker and on every run, which rules out a shared random state, and the sin
// trick is a different number on every platform. Every product here stays under 2^53 so the
// doubles hold it exactly, which is what caps the mixing multiplier at 2^21: a 32-bit value times
// anything larger loses its low bits, and the low bits are the whole point of a hash. The Luau `%`
// is `mod` (floored, so a negative lattice coordinate still lands in 0 .. 2^32) and the shifts and
// xors are the unsigned bit32 helpers; JavaScript's own `^` and `>>` would go signed.
function hash(ix, iy, seed) {
	let h = mod(ix * 374761393 + iy * 668265263 + seed * 1274126177, TWO_32);
	h = bit32.bxor(h, bit32.rshift(h, 13));
	h = mod(h * 1274127, TWO_32);
	h = bit32.bxor(h, bit32.rshift(h, 16));
	return h / TWO_32;
}

// Value noise at (u, v) in lattice cells: the four corners' numbers mixed on a smoothstep of the
// fraction, wrapping at `cells` so the texture tiles.
function value(u, v, cells, seed) {
	const column = Math.floor(u);
	const row = Math.floor(v);
	const fu = u - column;
	const fv = v - row;
	const su = fu * fu * (3 - 2 * fu);
	const sv = fv * fv * (3 - 2 * fv);
	const column0 = mod(column, cells);
	const row0 = mod(row, cells);
	const column1 = mod(column + 1, cells);
	const row1 = mod(row + 1, cells);
	const h00 = hash(column0, row0, seed);
	const h10 = hash(column1, row0, seed);
	const h01 = hash(column0, row1, seed);
	const h11 = hash(column1, row1, seed);
	const top = h00 + (h10 - h00) * su;
	const bottom = h01 + (h11 - h01) * su;
	return top + (bottom - top) * sv;
}

// The texture the veil is eroded through: `texels` square of float32 in 0 .. 1, `octaves` lattices
// of value noise, the first `cells` across the tile and each next one twice as fine, each weighted
// `falloff^o` and the sum divided by the weights'. The ridge fold `1 - abs(2 * n - 1)` is what
// turns a cloud into filaments: the noise's mid grey becomes the bright line and both of its tails
// become dark, so what the erosion leaves behind at thin coverage is thread, not fog. Built once
// per worker, which is why this reads plainly and the band fill below does not.
/** @returns {Float32Array} */
export function lace(texels, cells, seed, octaves, falloff) {
	// The finest lattice has to divide the texels or its last cell is cut short and the texture
	// stops tiling, which shows up as a seam down the middle of the sea.
	if (mod(texels, cells * 2 ** (octaves - 1)) !== 0) {
		throw new Error("the lace's finest lattice does not divide its texels");
	}
	const out = new Float32Array(texels * texels);
	let weights = 0;
	for (let octave = 0; octave <= octaves - 1; octave++) {
		weights += falloff ** octave;
	}
	const inverse = 1 / weights;
	for (let j = 0; j <= texels - 1; j++) {
		const rowBase = j * texels;
		for (let i = 0; i <= texels - 1; i++) {
			let sum = 0;
			let lattice = cells;
			let weight = 1;
			for (let octave = 0; octave <= octaves - 1; octave++) {
				const scale = lattice / texels;
				const noise = value(i * scale, j * scale, lattice, seed + octave);
				sum += (1 - Math.abs(2 * noise - 1)) * weight;
				lattice *= 2;
				weight *= falloff;
			}
			out[rowBase + i] = sum * inverse;
		}
	}
	return out;
}

/**
 * Paints the colour map's rows `rowStart .. rowStart + rowCount - 1` (0-based) into `out`, which
 * holds just those rows. `coverageOut`, when given, takes one float per BASE texel at the map's
 * absolute rows.
 * @param {Uint8Array} out
 * @param {number} colourTexels
 * @param {number} rowStart
 * @param {number} rowCount
 * @param {Uint8Array} base RGB, three bytes per texel
 * @param {number} baseTexels
 * @param {Array<import('./foamField.js').Field>} fields
 * @param {number} tile
 * @param {Params} params
 * @param {Float32Array | null} [lace]
 * @param {Float32Array | null} [coverageOut]
 */
export function band(out, colourTexels, rowStart, rowCount, base, baseTexels, fields, tile, params, lace, coverageOut) {
	// Once a band and never per texel.
	if (mod(colourTexels, baseTexels) !== 0) {
		throw new Error("the colour map's texels are not a whole multiple of the base map's");
	}
	// Not in the Luau, whose buffer writes error past the end: a typed array drops them, so a short
	// buffer would paint part of the band and say nothing.
	const outBytes = rowCount * colourTexels * BYTES;
	if (out.byteLength < outBytes) {
		throw new Error(`the band buffer holds ${out.byteLength} bytes, needs ${outBytes} (RGBA for ${rowCount} rows)`);
	}
	const baseBytes = baseTexels * baseTexels * BASE_BYTES;
	if (base.byteLength < baseBytes) {
		throw new Error(`the base holds ${base.byteLength} bytes, needs ${baseBytes} (RGB per base texel)`);
	}
	if (coverageOut != null && coverageOut.byteLength !== baseTexels * baseTexels * BYTES) {
		throw new Error('the coverage buffer is not one f32 per base texel');
	}
	const ratio = baseTexels / colourTexels;
	const studs = tile / colourTexels; // one colour texel, and the step between two world positions
	const threshold = params.threshold;
	const feather = params.feather;
	const slope = feather > 0 ? 1 / feather : HARD_EDGE;
	const foamR = params.r;
	const foamG = params.g;
	const foamB = params.b;
	// Erosion is how a foam texture gets lacy edges for free. Rather than fading the whole veil down
	// as its density drops, the density becomes a water line that the lace's ridges stand out of: at
	// thin coverage a handful of bright filaments are left, at full coverage the line is at nothing
	// and the foam is solid. Rare blend their foam buffer with artist-painted textures to the same
	// end; this is the cheap form, one texture and one subtraction. laceSoft is the band a
	// filament's own edge feathers over, and 0 is the switch: no erosion, the veil painted as it is.
	// A lace of null is the same switch from the other side, for a caller that has no texture yet.
	const laceSoft = params.laceSoft;
	const opacity = params.opacity;
	const texture = laceSoft > 0 ? lace : null;
	const laceTexels = colourTexels;
	if (texture != null && texture.byteLength !== laceTexels * laceTexels * BYTES) {
		throw new Error('the lace is not one f32 per colour texel');
	}
	const laceInverse = laceSoft > 0 ? 1 / laceSoft : 0;
	const count = fields.length;
	// The fields taken apart ONCE, into three plain arrays the inner loop indexes. This is the same
	// bilinear FoamField.sample does, written out rather than called because the call ran at every
	// one of a quarter of a million texels. `scale` is the division done here instead: cells per
	// stud, exact for every tile the presets use, since their sizes and their cell counts are all
	// powers of two.
	const grids = new Array(count);
	const sides = new Float64Array(count);
	const scales = new Float64Array(count);
	for (let index = 0; index < count; index++) {
		const field = fields[index];
		const side = field.texels;
		grids[index] = field.foam;
		sides[index] = side;
		// A grid field always carries its size.
		scales[index] = side / field.size;
	}
	// Where the coverage subsample lands. A base texel's centre falls on the BOUNDARY between two
	// colour texels rather than inside one: at ratio 1/4, base texel n covers colour texels
	// 4n .. 4n + 3 and its centre sits between 4n + 1 and 4n + 2, which tie for nearest. This takes
	// the upper one, i % 4 == 2 (i = 2, 6, 10 ...), so the subsample is biased an eighth of a base
	// texel toward (n + 1, m + 1). A matte roughness map does not show a shift that small.
	const stride = idiv(colourTexels, baseTexels);
	const centre = idiv(stride, 2);
	for (let j = rowStart; j <= rowStart + rowCount - 1; j++) {
		const v = (j + 0.5) * ratio - 0.5;
		const z = (j + 0.5) * studs;
		const rowOut = (j - rowStart) * colourTexels;
		// j, i and the texel counts are non-negative integers, so JavaScript's % matches Luau's for
		// laceRow, the lace column and the stride tests below.
		const laceRow = (j % laceTexels) * laceTexels;
		for (let i = 0; i <= colourTexels - 1; i++) {
			const u = (i + 0.5) * ratio - 0.5;
			const x = (i + 0.5) * studs;
			// The cascades' fields add, as the displacements they came from do: a cell that folds in
			// two cascades at once is whiter than either would paint on its own. Each field is
			// sampled on its own tiling, wrapping at its own cell count, and its cells sit AT the
			// cascade's lattice positions rather than half a cell in. The wrap is on the floored
			// integer cell, which cannot round up to `side`.
			let sum = 0;
			for (let index = 0; index < count; index++) {
				const side = sides[index];
				const grid = grids[index];
				const scale = scales[index];
				const cellU = x * scale;
				const cellV = z * scale;
				const column = Math.floor(cellU);
				const row = Math.floor(cellV);
				const fu = cellU - column;
				const fv = cellV - row;
				const column0 = mod(column, side);
				const column1 = mod(column + 1, side);
				const rowBase = mod(row, side) * side;
				const row1Base = mod(row + 1, side) * side;
				const f00 = grid[rowBase + column0];
				const f10 = grid[rowBase + column1];
				const f01 = grid[row1Base + column0];
				const f11 = grid[row1Base + column1];
				sum += f00 * (1 - fu) * (1 - fv) + f10 * fu * (1 - fv) + f01 * (1 - fu) * fv + f11 * fu * fv;
			}
			const fade = clamp((sum - threshold) * slope, 0, 1);
			let density = fade * fade * (3 - 2 * fade);
			if (texture != null) {
				const filament = texture[laceRow + (i % laceTexels)];
				density = clamp((filament - (1 - density)) * laceInverse, 0, 1);
			}
			const coverage = density * opacity;
			corners(u, v, baseTexels);
			const a3 = CORNERS[0] * BASE_BYTES;
			const b3 = CORNERS[1] * BASE_BYTES;
			const c3 = CORNERS[2] * BASE_BYTES;
			const d3 = CORNERS[3] * BASE_BYTES;
			const wa = CORNERS[4];
			const wb = CORNERS[5];
			const wc = CORNERS[6];
			const wd = CORNERS[7];
			const red = base[a3] * wa + base[b3] * wb + base[c3] * wc + base[d3] * wd;
			const green = base[a3 + 1] * wa + base[b3 + 1] * wb + base[c3 + 1] * wc + base[d3 + 1] * wd;
			const blue = base[a3 + 2] * wa + base[b3 + 2] * wb + base[c3 + 2] * wc + base[d3 + 2] * wd;
			const offset = (rowOut + i) * BYTES;
			// Rounded as the Luau rounds and not clamped, as the Luau does not clamp: a Uint8Array
			// store wraps modulo 256 as buffer.writeu8 does, and with coverage in 0 .. 1 and byte
			// colours the value stays in 0 .. 255 anyway.
			out[offset] = Math.floor(red + (foamR - red) * coverage + 0.5);
			out[offset + 1] = Math.floor(green + (foamG - green) * coverage + 0.5);
			out[offset + 2] = Math.floor(blue + (foamB - blue) * coverage + 0.5);
			out[offset + 3] = 255;
			if (coverageOut != null && i % stride === centre && j % stride === centre) {
				coverageOut[idiv(j, stride) * baseTexels + idiv(i, stride)] = coverage;
			}
		}
	}
}
