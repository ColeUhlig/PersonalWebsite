import { test } from 'node:test';
import * as expect from '../expect.js';
import * as FFT from '../../../content/ocean/js/core/fft.js';
import * as Random from '../../../content/ocean/js/core/random.js';

const N = 8;

// Plain inverse DFT sum, O(N^4), the reference the fast transform must match.
function naiveInverse2D(re, im, n) {
	const outRe = new Float64Array(n * n);
	const outIm = new Float64Array(n * n);
	for (let row = 0; row <= n - 1; row++) {
		for (let column = 0; column <= n - 1; column++) {
			let sumRe = 0;
			let sumIm = 0;
			for (let kz = 0; kz <= n - 1; kz++) {
				for (let kx = 0; kx <= n - 1; kx++) {
					const angle = (2 * Math.PI * (kx * column + kz * row)) / n;
					const c = Math.cos(angle);
					const s = Math.sin(angle);
					const index = kz * n + kx;
					sumRe += re[index] * c - im[index] * s;
					sumIm += re[index] * s + im[index] * c;
				}
			}
			outRe[row * n + column] = sumRe;
			outIm[row * n + column] = sumIm;
		}
	}
	return [outRe, outIm];
}

function randomField(seed, n) {
	const random = Random.create(seed);
	const re = new Float64Array(n * n);
	const im = new Float64Array(n * n);
	for (let index = 0; index < n * n; index++) {
		re[index] = random.nextNumber(-1, 1);
		im[index] = random.nextNumber(-1, 1);
	}
	return [re, im];
}

function succeeds(fn, ...args) {
	try {
		fn(...args);
		return true;
	} catch {
		return false;
	}
}

test('rejects sizes that are not powers of two', () => {
	expect.truthy(!succeeds(FFT.plan, 12), '12 should be rejected');
	expect.truthy(!succeeds(FFT.plan, 1), '1 should be rejected');
	expect.truthy(succeeds(FFT.plan, 64), '64 should be accepted');
});

test('matches a naive inverse DFT', () => {
	const plan = FFT.plan(N);
	const [re, im] = randomField(3, N);
	const [wantRe, wantIm] = naiveInverse2D(re, im, N);
	FFT.inverse2D(plan, re, im);
	for (let index = 0; index < N * N; index++) {
		expect.near(re[index], wantRe[index], 1e-9, `re[${index + 1}]`);
		expect.near(im[index], wantIm[index], 1e-9, `im[${index + 1}]`);
	}
});

test('a single DC coefficient gives a constant field', () => {
	const plan = FFT.plan(N);
	const re = new Float64Array(N * N);
	const im = new Float64Array(N * N);
	re[0] = 2.5;
	FFT.inverse2D(plan, re, im);
	for (let index = 0; index < N * N; index++) {
		expect.near(re[index], 2.5, 1e-12, `re[${index + 1}]`);
		expect.near(im[index], 0, 1e-12, `im[${index + 1}]`);
	}
});

test('Hermitian input gives a real field', () => {
	const plan = FFT.plan(N);
	const [re, im] = randomField(5, N);
	// Impose X(-k) = conj(X(k)) on the random field.
	for (let kz = 0; kz <= N - 1; kz++) {
		for (let kx = 0; kx <= N - 1; kx++) {
			const index = kz * N + kx;
			// Both operands are non-negative integers, so JavaScript's % matches Luau's here.
			const mirror = ((N - kz) % N) * N + ((N - kx) % N);
			if (mirror > index) {
				re[mirror] = re[index];
				im[mirror] = -im[index];
			} else if (mirror === index) {
				im[index] = 0;
			}
		}
	}
	FFT.inverse2D(plan, re, im);
	for (let index = 0; index < N * N; index++) {
		expect.near(im[index], 0, 1e-9, `im[${index + 1}] should vanish`);
	}
});

test('plan accepts the phone sizes and rejects a size that is not a power of two', () => {
	for (const n of [16, 32, 64]) {
		expect.equal(FFT.plan(n).n, n, `plan(${n})`);
	}
	for (const n of [0, 1, 12, 48, 64.5]) {
		let threw = false;
		try {
			FFT.plan(n);
		} catch (error) {
			threw = /power of two/.test(error.message);
		}
		expect.truthy(threw, `plan(${n}) throws naming the power-of-two rule`);
	}
});
