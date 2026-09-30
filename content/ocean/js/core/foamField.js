// The foam that falls out of the Jacobian.
//
// The sea's own is newGrid, stepRows and sample: ONE field over the whole tile at a texel to the
// stud, half the colour map's own texels, whose every texel runs the fold test on the SUM of all
// three cascades' derivatives, sampled bilinearly off each cascade's own lattice. That sum is
// Tessendorf's Jacobian of the total displacement, the only quantity that says whether the water at
// a point has folded; one cascade's own J says only whether its own band of wavelengths has, which
// is why nothing below a cascade's cell could show up before. 2Retr0 (GodotOceanWaves) runs the
// same test per cascade at the FFT's own 1024 texels on the GPU, 8.6 cm a texel on their 88 m
// tile; a CPU affords 256 texels over a 256-stud tile, a quarter of the rows a frame. The
// accumulation is theirs: `foam = clamp(foam * decay + grow * max(0, whitecap - J), 0, 1)`.
//
// A texel sits AT world (i * tile / texels, j * tile / texels) and not half a texel in, the cascade
// lattice's own convention: a texel has to draw its foam where the fold that made it is, and a half
// would slide the whole veil off the crests by half a texel.
//
// create and at are the plain texel field: one float per texel, no stepping of its own, which is the
// shape the maps worker's coverage mirror takes and the peak mask reads through `at`.
//
// Storage: `foam` is a Float32Array, one float per texel, texel (i, j) at index j * texels + i (the
// Luau's f32 buffer at byte offset (j * texels + i) * 4).
// Twin of roblox-ocean/src/shared/Ocean/FoamField.luau.
import * as Cascade from './cascade.js';
import * as Jacobian from './jacobian.js';
import { clamp, mod } from './luau.js';

/**
 * The fold test's three: J below the whitecap grows foam, in proportion to how far below it is.
 * @typedef {object} StepParams
 * @property {number} whitecap the determinant a texel has to fall under before it foams at all
 * @property {number} grow what one step adds where J is a whole whitecap under the cap
 * @property {number} decay what a texel keeps of itself per step
 */

/**
 * @typedef {object} Field
 * @property {number} texels
 * @property {number} [size] The studs the field tiles over, which is the cascade's own size on a
 *   grid field and the reason sample takes world studs. A plain texel field has none: it is only
 *   ever read by texel.
 * @property {Float32Array} foam one float per texel, index j * texels + i
 * @property {Float32Array} scratch A second array of the same shape, which nothing reads any more:
 *   it was the previous field a blur read back. `create` still sizes one; a grid field passes it
 *   empty.
 */

// The sampler's out, reused: stepRows calls it for every cascade at every texel.
const DERIVATIVES = new Float64Array(3);

/** @returns {Field} */
export function create(texels) {
	return {
		texels,
		foam: new Float32Array(texels * texels),
		scratch: new Float32Array(texels * texels),
	};
}

// One cascade's field, on that cascade's own grid: `texels` is the cascade's `n` and `size` its
// tile in studs, so the field wraps where the cascade does and sample takes world studs.
/** @returns {Field} */
export function newGrid(texels, size) {
	return {
		texels,
		size,
		foam: new Float32Array(texels * texels),
		// Nothing reads a grid field back, so there is nothing for a scratch to hold. An empty
		// array says that louder than a second field nothing ever touches.
		scratch: new Float32Array(0),
	};
}

export function at(field, i, j) {
	return field.foam[j * field.texels + i];
}

// One update of the field's rows `rowStart .. rowStart + rowCount - 1` (0-based), the quarter the
// caller is about to paint over. At each texel the three derivatives of every cascade in `cascades`
// (Luau cascade numbers, read at fields[c - 1]) are sampled at that texel's world position and
// SUMMED, and the fold test runs on that one Jacobian. Returns the mean over the texels it stepped,
// which is the coverage the report line prints.
/**
 * @param {Field} field
 * @param {number} rowStart
 * @param {number} rowCount
 * @param {Array<import('./cascade.js').Fields>} fields
 * @param {ReadonlyArray<number>} cascades
 * @param {number} tile
 * @param {number} chop
 * @param {StepParams} params
 * @returns {number}
 */
export function stepRows(field, rowStart, rowCount, fields, cascades, tile, chop, params) {
	const texels = field.texels;
	// Once a step, never per texel.
	if (rowStart < 0 || rowStart + rowCount > texels) {
		throw new Error('the rows to step are not inside the foam field');
	}
	const foam = field.foam;
	const whitecap = params.whitecap;
	const grow = params.grow;
	const decay = params.decay;
	const determinant = Jacobian.determinant;
	const sample = Cascade.sampleJacobian;
	const derivatives = DERIVATIVES;
	const studs = tile / texels; // one texel, and the step between two world positions
	const count = cascades.length;
	let total = 0;
	for (let j = rowStart; j <= rowStart + rowCount - 1; j++) {
		const z = j * studs;
		const rowBase = j * texels;
		for (let i = 0; i <= texels - 1; i++) {
			const x = i * studs;
			// The cascades' derivatives add, as the displacements they came from do: what folds is
			// the total surface, and a crest that only pinches in one band never reaches the cap.
			let jxx = 0;
			let jzz = 0;
			let jxz = 0;
			for (let index = 0; index < count; index++) {
				sample(fields[cascades[index] - 1], x, z, derivatives);
				jxx += derivatives[0];
				jzz += derivatives[1];
				jxz += derivatives[2];
			}
			const offset = rowBase + i;
			const fold = determinant(jxx, jzz, jxz, chop);
			const old = foam[offset];
			const value = clamp(old * decay + grow * Math.max(0, whitecap - fold), 0, 1);
			foam[offset] = value;
			// The unrounded double, as the Luau adds it: the store rounds to float32, the mean does not.
			total += value;
		}
	}
	return total / (rowCount * texels);
}

// Bilinear sample of a grid field at a world position in studs, wrapping at the field's size.
// The cells come one for one from the cascade's own lattice, whose cell (i, j) sits AT world
// (i * size / texels, j * size / texels) and not half a cell in (Cascade's corners works the same
// position out with no half taken off), so no half is taken off here either: a foamed cell has to
// draw its foam where the fold that made it is.
//
// The wrap is on the floored INTEGER cell (Luau floors first, then takes %), so a coordinate a hair
// below zero floors to -1 and wraps to the last cell exactly; an integer modulo cannot round up to
// `texels` the way Cascade's modulo of a continuous coordinate can, and needs no fold-back guard.
/** @param {Field} field */
export function sample(field, x, z) {
	const texels = field.texels;
	// A grid field always carries its size.
	const size = field.size;
	const u = (x / size) * texels;
	const v = (z / size) * texels;
	const column = Math.floor(u);
	const row = Math.floor(v);
	const fu = u - column;
	const fv = v - row;
	// Floored modulo: x and z go negative when the camera wanders (Review Focus 1).
	const column0 = mod(column, texels);
	const column1 = mod(column + 1, texels);
	const rowBase = mod(row, texels) * texels;
	const row1Base = mod(row + 1, texels) * texels;
	const foam = field.foam;
	return (
		foam[rowBase + column0] * (1 - fu) * (1 - fv) +
		foam[rowBase + column1] * fu * (1 - fv) +
		foam[row1Base + column0] * (1 - fu) * fv +
		foam[row1Base + column1] * fu * fv
	);
}
