// The texture insets' arithmetic (piece C2; lane F owns this file; spec 10.7 steps 22, 23 and 25;
// browser-free). The FFT's answer is grids of numbers (core/fieldStore.js display fields, n x n per
// layer): fieldToRgba draws one as an image, blue below zero, pale at zero, amber above, scaled to its
// own largest magnitude (or a scale given, so a zoom can keep the whole field's). bilinear is the
// blend the engine's sampler does (core/cascade.js corners: floored modulo, a hair below zero folded
// back, the right and bottom neighbours wrapping to column and row 0), written out with its corners
// and weights so the sampling inset can show them; its value equals Cascade.sampleHeight's exactly.
// The sampling inset zooms on a ZOOM x ZOOM window round a point that walks back and forth across the
// tile's edge, so the wrap is always on screen; zoomLayout places the point and the seam in that
// window's cells, samples at cell centres, so the seam (x at the tile's size, which is 0 again) runs
// through sample 0 itself. downsample shrinks a painted texture for the painted-map inset by
// averaging blocks.
import { mod } from '../core/luau.js';

export const FIELD_VIEWS = Object.freeze([
	Object.freeze({ name: 'height', label: 'Height' }),
	Object.freeze({ name: 'slopeX', label: 'Slope along x' }),
	Object.freeze({ name: 'dispX', label: 'Push at this choppiness' }),
]);
export const ZOOM = 6;
const PALE = [232, 238, 242]; // style.css --ink
const BLUE = [20, 70, 150];
const AMBER = [242, 178, 92]; // --term-a

/** The largest magnitude in `values`: the colour scale fieldToRgba uses by default. */
export function magnitude(values) {
	let largest = 0;
	for (let i = 0; i < values.length; i++) largest = Math.max(largest, Math.abs(values[i]));
	return largest;
}

/** values (n x n) into RGBA bytes, scaled to `scale` (default: their own largest magnitude); returns their range. */
export function fieldToRgba(values, out, scale = 0) {
	let min = Infinity;
	let max = -Infinity;
	for (let i = 0; i < values.length; i++) {
		if (values[i] < min) min = values[i];
		if (values[i] > max) max = values[i];
	}
	scale = scale || Math.max(Math.abs(min), Math.abs(max)) || 1;
	for (let i = 0; i < values.length; i++) {
		const t = Math.max(-1, Math.min(1, values[i] / scale));
		const to = t < 0 ? BLUE : AMBER;
		const w = Math.abs(t);
		out[i * 4] = PALE[0] + (to[0] - PALE[0]) * w;
		out[i * 4 + 1] = PALE[1] + (to[1] - PALE[1]) * w;
		out[i * 4 + 2] = PALE[2] + (to[2] - PALE[2]) * w;
		out[i * 4 + 3] = 255;
	}
	return { min, max };
}

/** The engine's bilinear blend of `fields.height` at world offset (x, z), with its working shown. */
export function bilinear(fields, x, z) {
	const n = fields.n;
	let u = mod((x / fields.size) * n, n);
	let v = mod((z / fields.size) * n, n);
	if (u >= n) u -= n;
	if (v >= n) v -= n;
	const column = Math.floor(u);
	const row = Math.floor(v);
	const fu = u - column;
	const fv = v - row;
	const column1 = (column + 1) % n;
	const row1 = (row + 1) % n;
	const indices = [row * n + column, row * n + column1, row1 * n + column, row1 * n + column1];
	const weights = [(1 - fu) * (1 - fv), fu * (1 - fv), (1 - fu) * fv, fu * fv];
	const h = fields.height;
	const value = h[indices[0]] * weights[0] + h[indices[1]] * weights[1] + h[indices[2]] * weights[2] + h[indices[3]] * weights[3];
	return { column, row, column1, row1, fu, fv, indices, weights, value };
}

/** The ZOOM x ZOOM heights round (x, z), two texels before the point's cell, indices wrapped. */
export function zoomWindow(fields, x, z, out) {
	const n = fields.n;
	const { column, row } = bilinear(fields, x, z);
	const first = [mod(column - 2, n), mod(row - 2, n)];
	let wraps = false;
	for (let j = 0; j < ZOOM; j++) {
		for (let i = 0; i < ZOOM; i++) {
			const c = mod(first[0] + i, n);
			const r = mod(first[1] + j, n);
			if (first[0] + i >= n || first[1] + j >= n) wraps = true;
			out[j * ZOOM + i] = fields.height[r * n + c];
		}
	}
	return { first, wraps };
}

/**
 * The zoom window round (x, z) (heights into `out`) with the point and the tile's seam placed in the
 * window's cells: sample k of the window is drawn at k + 0.5, the point at its sample coordinate + 0.5,
 * and the seam on the window's sample of column 0 (null when the window does not cross it).
 */
export function zoomLayout(fields, x, z, out) {
	const n = fields.n;
	const blend = bilinear(fields, x, z);
	const { first, wraps } = zoomWindow(fields, x, z, out);
	const point = [mod(blend.column - first[0], n) + blend.fu + 0.5, mod(blend.row - first[1], n) + blend.fv + 0.5];
	const seam = n - first[0];
	const edge = wraps && seam > 0 && seam < ZOOM ? seam + 0.5 : null;
	return { blend, first, wraps, point, edge };
}

/** A point swinging three studs either side of the tile's x edge, about every four seconds. */
export function walkPoint(t, size, out = [0, 0]) {
	out[0] = mod(size + 3 * Math.sin(t * 1.6), size);
	out[1] = size * 0.37;
	return out;
}

/** Shrinks srcTexels x srcTexels RGBA to outTexels x outTexels by averaging square blocks. */
export function downsample(src, srcTexels, out, outTexels) {
	const block = srcTexels / outTexels;
	const area = block * block;
	for (let y = 0; y < outTexels; y++) {
		for (let x = 0; x < outTexels; x++) {
			let r = 0;
			let g = 0;
			let b = 0;
			let a = 0;
			for (let dy = 0; dy < block; dy++) {
				const row = (y * block + dy) * srcTexels;
				for (let dx = 0; dx < block; dx++) {
					const o = (row + x * block + dx) * 4;
					r += src[o];
					g += src[o + 1];
					b += src[o + 2];
					a += src[o + 3];
				}
			}
			const o = (y * outTexels + x) * 4;
			out[o] = r / area;
			out[o + 1] = g / area;
			out[o + 2] = b / area;
			out[o + 3] = a / area;
		}
	}
}
