// Inverse 2-D complex FFT on flat, row-major arrays (0-based storage). Iterative radix-2, in place.
// It evaluates the plain sum x[m] = sum_k X[k] exp(+2 pi i k m / N), with no 1 / N^2
// scaling, which is the form Tessendorf's equations (36), (37) and (44) take.
// Hot path: `inverse2D` allocates nothing; it rewrites the arrays it is given.
// Twin of roblox-ocean/src/shared/Ocean/FFT.luau.
import { bit32, check, idiv, mod, round } from './luau.js';

/**
 * @typedef {object} Plan
 * @property {number} n
 * @property {Int32Array} reversed bit-reversed index for each index, 0-based values
 * @property {Float64Array} cosines cos(2 pi j / n) for j = 0 .. n / 2 - 1
 * @property {Float64Array} sines
 */

function isPowerOfTwo(n) {
	return n >= 2 && mod(n, 1) === 0 && bit32.band(n, n - 1) === 0;
}

/** @returns {Readonly<Plan>} */
export function plan(n) {
	check(isPowerOfTwo(n), `FFT size must be a power of two and at least 2, got ${n}`);
	const bits = round(Math.log2(n));
	const reversed = new Int32Array(n);
	for (let index = 0; index <= n - 1; index++) {
		let result = 0;
		let value = index;
		for (let b = 1; b <= bits; b++) {
			result = result * 2 + mod(value, 2);
			value = idiv(value, 2);
		}
		reversed[index] = result;
	}
	const half = idiv(n, 2);
	const cosines = new Float64Array(half);
	const sines = new Float64Array(half);
	for (let j = 0; j <= half - 1; j++) {
		const angle = (2 * Math.PI * j) / n;
		cosines[j] = Math.cos(angle);
		sines[j] = Math.sin(angle);
	}
	// Typed arrays cannot be frozen; the plan record itself is.
	return Object.freeze({ n, reversed, cosines, sines });
}

// One length-n inverse transform over the elements at offset + i * stride, i = 0 .. n-1
// (offset is 0-based, as in the Luau, where it was shifted by 1 only to index a 1-based table).
export function inverse1D(fftPlan, re, im, offset, stride) {
	const n = fftPlan.n;
	const reversed = fftPlan.reversed;
	const cosines = fftPlan.cosines;
	const sines = fftPlan.sines;
	const base = offset;

	for (let index = 0; index <= n - 1; index++) {
		const swapWith = reversed[index];
		if (swapWith > index) {
			const a = base + index * stride;
			const b = base + swapWith * stride;
			const tr = re[a];
			re[a] = re[b];
			re[b] = tr;
			const ti = im[a];
			im[a] = im[b];
			im[b] = ti;
		}
	}

	let size = 2;
	while (size <= n) {
		// size and n are powers of two with size <= n, so these divisions are exact (Luau: //).
		const half = size / 2;
		const twiddleStep = n / size;
		const halfStride = half * stride;
		for (let start = 0; start <= n - 1; start += size) {
			// The twiddle index starts at 0 here (the Luau starts at 1 to index its 1-based table).
			let twiddle = 0;
			let a = base + start * stride;
			for (let i = 1; i <= half; i++) {
				const b = a + halfStride;
				const c = cosines[twiddle];
				const s = sines[twiddle];
				const br = re[b];
				const bi = im[b];
				const tr = br * c - bi * s;
				const ti = br * s + bi * c;
				const ar = re[a];
				const ai = im[a];
				re[b] = ar - tr;
				im[b] = ai - ti;
				re[a] = ar + tr;
				im[a] = ai + ti;
				twiddle += twiddleStep;
				a += stride;
			}
		}
		size *= 2;
	}
}

// Rows (along x) then columns (along z). Both arrays must hold n * n numbers.
export function inverse2D(fftPlan, re, im) {
	const n = fftPlan.n;
	for (let row = 0; row <= n - 1; row++) {
		inverse1D(fftPlan, re, im, row * n, 1);
	}
	for (let column = 0; column <= n - 1; column++) {
		inverse1D(fftPlan, re, im, column, n);
	}
}
