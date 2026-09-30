// The normal map: the fine cascades' slopes as tangent-space normals over one 64-stud block,
// copied 4 x 4 into the 256-stud image (their periods, 64 and 16 studs, divide the block).
// Bytes as the M0 probes rendered: R from n.x, G from n.z, B from n.y, each * 0.5 + 0.5.
// FLIP_G is kept as the calibration switch: if the ripples ever light from the wrong side, flip
// it. Verified false against both suns in Edit (ledger M14, 2026-09-20), so nothing needs it.
//
// The Luau module is left unfrozen so a caller can set NormalTexels.FLIP_G; an ES module's export
// cannot be reassigned from outside, so here the switch is fill's trailing `flipG` argument, which
// defaults to FLIP_G.
//
// Storage: the block and the image are Uint8Arrays of RGBA bytes, FOUR per texel (texel (i, j) at
// (j * texels + i) * 4), as the Luau writes and copies them.
// Twin of roblox-ocean/src/shared/Ocean/NormalTexels.luau.
import * as Cascade from './cascade.js';
import { check, clamp, idiv } from './luau.js';

export const FLIP_G = false;

// The sampler's out, reused: fill calls it for every cascade at every texel.
const SAMPLE = new Float64Array(5);

function byte(value) {
	return clamp(Math.floor(value * 255 + 0.5), 0, 255);
}

// `cascades` are Luau cascade numbers, read at fields[c - 1].
/**
 * @param {Uint8Array} out blockTexels * blockTexels * 4 bytes
 * @param {number} blockTexels
 * @param {number} blockStuds
 * @param {Array<import('./cascade.js').Fields>} fields
 * @param {ReadonlyArray<number>} cascades
 * @param {boolean} [flipG]
 */
export function fill(out, blockTexels, blockStuds, fields, cascades, flipG = FLIP_G) {
	// Not in the Luau, whose buffer writes error past the end: a typed array drops them.
	const needed = blockTexels * blockTexels * 4;
	if (out.byteLength < needed) {
		throw new Error(`the normal block holds ${out.byteLength} bytes, needs ${needed} (RGBA per texel)`);
	}
	const step = blockStuds / blockTexels;
	const flip = flipG ? -1 : 1;
	const sample = Cascade.sampleNoJacobian;
	const values = SAMPLE;
	const count = cascades.length;
	for (let j = 0; j <= blockTexels - 1; j++) {
		const z = (j + 0.5) * step;
		for (let i = 0; i <= blockTexels - 1; i++) {
			const x = (i + 0.5) * step;
			let slopeX = 0;
			let slopeZ = 0;
			for (let index = 0; index < count; index++) {
				sample(fields[cascades[index] - 1], x, z, values);
				slopeX += values[3];
				slopeZ += values[4];
			}
			let nx = -slopeX;
			let ny = 1;
			let nz = -slopeZ;
			const inverse = 1 / Math.sqrt(nx * nx + 1 + nz * nz);
			nx = nx * inverse;
			ny = ny * inverse;
			nz = nz * inverse * flip;
			const offset = (j * blockTexels + i) * 4;
			out[offset] = byte(nx * 0.5 + 0.5);
			out[offset + 1] = byte(nz * 0.5 + 0.5);
			out[offset + 2] = byte(ny * 0.5 + 0.5);
			out[offset + 3] = 255;
		}
	}
}

/**
 * @param {Uint8Array} block blockTexels * blockTexels * 4 bytes
 * @param {number} blockTexels
 * @param {Uint8Array} image imageTexels * imageTexels * 4 bytes
 * @param {number} imageTexels a whole multiple of blockTexels
 */
export function tile(block, blockTexels, image, imageTexels) {
	const copies = idiv(imageTexels, blockTexels);
	check(copies * blockTexels === imageTexels, 'the image must be a whole number of blocks');
	const rowBytes = blockTexels * 4;
	for (let y = 0; y <= imageTexels - 1; y++) {
		// y and blockTexels are non-negative integers, so JavaScript's % matches Luau's here.
		const source = (y % blockTexels) * rowBytes;
		const row = block.subarray(source, source + rowBytes);
		for (let c = 0; c <= copies - 1; c++) {
			image.set(row, (y * imageTexels + c * blockTexels) * 4);
		}
	}
}
