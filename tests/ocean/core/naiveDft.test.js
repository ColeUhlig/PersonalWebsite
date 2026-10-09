import { test } from 'node:test';
import * as expect from '../expect.js';
import * as FFT from '../../../content/ocean/js/core/fft.js';
import * as NaiveDft from '../../../content/ocean/js/core/naiveDft.js';
import * as Random from '../../../content/ocean/js/core/random.js';

test('the term-by-term sum agrees with the FFT, value for value', () => {
	const n = 8;
	const random = Random.create(3);
	const re = new Float64Array(n * n).map(() => random.nextNumber() - 0.5);
	const im = new Float64Array(n * n).map(() => random.nextNumber() - 0.5);
	const outRe = new Float64Array(n * n);
	const outIm = new Float64Array(n * n);
	NaiveDft.inverse2D(n, re, im, outRe, outIm);
	const fftRe = re.slice();
	const fftIm = im.slice();
	FFT.inverse2D(FFT.plan(n), fftRe, fftIm);
	for (let i = 0; i < n * n; i++) {
		expect.near(outRe[i], fftRe[i], 1e-12, `re ${i}`);
		expect.near(outIm[i], fftIm[i], 1e-12, `im ${i}`);
	}
});

test('one frequency in, one plane wave out: exp(+2 pi i (kColumn mColumn + kRow mRow) / n)', () => {
	const n = 8;
	const re = new Float64Array(n * n);
	const im = new Float64Array(n * n);
	re[1 * n + 2] = 1; // kRow 1, kColumn 2
	const outRe = new Float64Array(n * n);
	const outIm = new Float64Array(n * n);
	NaiveDft.inverse2D(n, re, im, outRe, outIm);
	for (const [row, column] of [[0, 0], [3, 5], [7, 1]]) {
		const angle = (2 * Math.PI * (2 * column + 1 * row)) / n;
		expect.near(outRe[row * n + column], Math.cos(angle), 1e-12, `cos at ${row},${column}`);
		expect.near(outIm[row * n + column], Math.sin(angle), 1e-12, `sin at ${row},${column}`);
	}
});

test('arrays of the wrong size, or the output given as the input, are refused', () => {
	const attempt = (fn) => {
		try {
			fn();
			return 'ok';
		} catch (error) {
			return error.message;
		}
	};
	const a = new Float64Array(16);
	expect.truthy(attempt(() => NaiveDft.inverse2D(4, a, a, new Float64Array(15), new Float64Array(16))).includes('outRe'), 'short output');
	expect.truthy(attempt(() => NaiveDft.inverse2D(4, a, new Float64Array(16), a, new Float64Array(16))).includes('output'), 'in place');
});
