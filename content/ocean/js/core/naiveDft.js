// Teaching helper for step 9, not a twin of any Luau module: the inverse 2-D DFT summed term by
// term, the O(n^4) way the FFT replaces. Same convention as FFT.inverse2D, so the two can be
// compared value for value: x[m] = sum_k X[k] exp(+2 pi i k . m / n), no scaling, n x n row-major
// arrays, index = row * n + column. Out of place: every output sums the whole input.
import { check } from './luau.js';

export function inverse2D(n, re, im, outRe, outIm) {
	check(Number.isInteger(n) && n >= 1, `n must be a positive integer, got ${n}`);
	const cells = n * n;
	for (const [name, array] of [['re', re], ['im', im], ['outRe', outRe], ['outIm', outIm]]) {
		check(array.length === cells, `${name} holds ${array.length} values, needs ${cells}`);
	}
	check(outRe !== re && outRe !== im && outIm !== re && outIm !== im, 'the output must not be the input: every sum reads the whole input');
	const cosines = new Float64Array(n);
	const sines = new Float64Array(n);
	for (let j = 0; j < n; j++) {
		cosines[j] = Math.cos((2 * Math.PI * j) / n);
		sines[j] = Math.sin((2 * Math.PI * j) / n);
	}
	for (let mRow = 0; mRow < n; mRow++) {
		for (let mColumn = 0; mColumn < n; mColumn++) {
			let sumRe = 0;
			let sumIm = 0;
			for (let kRow = 0; kRow < n; kRow++) {
				const rowTurn = (kRow * mRow) % n;
				for (let kColumn = 0; kColumn < n; kColumn++) {
					// The angle in whole n-ths of a turn: exp(+2 pi i j / n).
					const j = (rowTurn + kColumn * mColumn) % n;
					const index = kRow * n + kColumn;
					const c = cosines[j];
					const s = sines[j];
					sumRe += re[index] * c - im[index] * s;
					sumIm += re[index] * s + im[index] * c;
				}
			}
			outRe[mRow * n + mColumn] = sumRe;
			outIm[mRow * n + mColumn] = sumIm;
		}
	}
}
