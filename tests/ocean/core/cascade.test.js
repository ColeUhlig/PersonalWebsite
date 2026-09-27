import { test } from 'node:test';
import * as expect from '../expect.js';
import * as Cascade from '../../../content/ocean/js/core/cascade.js';
import * as FFT from '../../../content/ocean/js/core/fft.js';
import * as Spectrum from '../../../content/ocean/js/core/spectrum.js';
import { idiv, mod } from '../../../content/ocean/js/core/luau.js';

const N = 32;
const SIZE = 128;
const LOOP = 120;

const NYQUIST = (Math.PI * N) / SIZE;

function config(seed, kMax) {
	return {
		n: N,
		size: SIZE,
		kMin: 0,
		kMax: kMax ?? Infinity,
		seed,
		loopPeriod: LOOP,
		params: Spectrum.NORMAL,
	};
}

function synthesised(seed, t, kMax) {
	const cascade = Cascade.create(config(seed, kMax));
	Cascade.evolve(cascade, t);
	Cascade.synthesise(cascade, FFT.plan(N));
	return cascade;
}

function maxAbs(values) {
	let largest = 0;
	for (const value of values) {
		largest = Math.max(largest, Math.abs(value));
	}
	return largest;
}

// Centred finite difference of a periodic field along x (columns) or z (rows).
// `index` is a Luau (1-based) cell index; `before` and `after` are built 1-based too.
function finiteDifference(field, alongX, index) {
	const row = idiv(index - 1, N);
	const column = mod(index - 1, N);
	const spacing = SIZE / N;
	let before;
	let after;
	if (alongX) {
		before = row * N + mod(column - 1, N) + 1;
		after = row * N + mod(column + 1, N) + 1;
	} else {
		before = mod(row - 1, N) * N + column + 1;
		after = mod(row + 1, N) * N + column + 1;
	}
	return (field[after - 1] - field[before - 1]) / (2 * spacing);
}

test('the height field is real, non-trivial and not the DC term', () => {
	const cascade = synthesised(1, 3);
	expect.truthy(maxAbs(cascade.height) > 0.01, 'waves exist');
	let mean = 0;
	for (const value of cascade.height) {
		mean += value;
	}
	expect.near(mean / (N * N), 0, 1e-9, 'zero mean');
});

test('the same seed and time give the same sea, a different seed does not', () => {
	const a = synthesised(7, 5);
	const b = synthesised(7, 5);
	const c = synthesised(8, 5);
	let differs = false;
	for (let index = 1; index <= N * N; index++) {
		expect.equal(a.height[index - 1], b.height[index - 1], `height[${index}]`);
		if (a.height[index - 1] !== c.height[index - 1]) {
			differs = true;
		}
	}
	expect.truthy(differs, 'another seed is another sea');
});

test('the sea moves in time and loops exactly at the loop period', () => {
	const now = synthesised(2, 0);
	const later = synthesised(2, 1);
	const looped = synthesised(2, LOOP);
	let moved = false;
	for (let index = 1; index <= N * N; index++) {
		if (Math.abs(now.height[index - 1] - later.height[index - 1]) > 1e-6) {
			moved = true;
		}
		expect.near(now.height[index - 1], looped.height[index - 1], 1e-6, `looped height[${index}]`);
	}
	expect.truthy(moved, 'moved after one second');
});

test('packed transforms equal separate transforms', () => {
	const cascade = synthesised(3, 2);
	// The height spectrum alone (no packed partner) through its own transform must give
	// the same height field, with a vanishing imaginary part.
	const plan = FFT.plan(N);
	const re = new Float64Array(N * N);
	const im = new Float64Array(N * N);
	Cascade.heightSpectrum(cascade, re, im);
	FFT.inverse2D(plan, re, im);
	for (let index = 1; index <= N * N; index++) {
		expect.near(re[index - 1], cascade.height[index - 1], 1e-9, `height[${index}]`);
		expect.near(im[index - 1], 0, 1e-9, `imaginary[${index}] vanishes`);
	}
});

// Finite differences under-read short waves (error 1 - sin(k dx) / (k dx)), so the two
// derivative tests band-limit the cascade to a quarter of Nyquist, where that error is
// under 10 percent for the shortest wave present.
test('slopes match finite differences of the height', () => {
	const cascade = synthesised(4, 1, NYQUIST / 4);
	const scale = maxAbs(cascade.slopeX) + 1e-9;
	let worst = 0;
	for (let index = 1; index <= N * N; index++) {
		worst = Math.max(
			worst,
			Math.abs(finiteDifference(cascade.height, true, index) - cascade.slopeX[index - 1]),
		);
		worst = Math.max(
			worst,
			Math.abs(finiteDifference(cascade.height, false, index) - cascade.slopeZ[index - 1]),
		);
	}
	expect.truthy(worst < 0.1 * scale, `slope mismatch ${worst} against range ${scale}`);
});

test('Jacobian derivatives match finite differences of the displacement', () => {
	const cascade = synthesised(5, 1, NYQUIST / 4);
	const scale = maxAbs(cascade.jxx) + 1e-9;
	let worst = 0;
	for (let index = 1; index <= N * N; index++) {
		worst = Math.max(
			worst,
			Math.abs(finiteDifference(cascade.dispX, true, index) - cascade.jxx[index - 1]),
		);
		worst = Math.max(
			worst,
			Math.abs(finiteDifference(cascade.dispZ, false, index) - cascade.jzz[index - 1]),
		);
		worst = Math.max(
			worst,
			Math.abs(finiteDifference(cascade.dispX, false, index) - cascade.jxz[index - 1]),
		);
		worst = Math.max(
			worst,
			Math.abs(finiteDifference(cascade.dispZ, true, index) - cascade.jxz[index - 1]),
		);
	}
	expect.truthy(worst < 0.1 * scale, `jacobian mismatch ${worst} against range ${scale}`);
});

// Pins the Jacobian sign only: jxx + jzz has spectrum -(kx^2 + kz^2) / k h~, formed from h~
// by real factors, so this case never reads dispX or dispZ. The finite-difference case above
// ties dispX to jxx, so the two together pin the chop sign.
test('crests pinch: displacement divergence is negative at crests (with the finite-difference case, this pins the chop sign)', () => {
	const cascade = synthesised(10, 1, NYQUIST / 4);
	let sumH = 0;
	let sumJ = 0;
	let sumHH = 0;
	let sumJJ = 0;
	let sumHJ = 0;
	for (let index = 0; index < N * N; index++) {
		const h = cascade.height[index];
		const j = cascade.jxx[index] + cascade.jzz[index];
		sumH += h;
		sumJ += j;
		sumHH += h * h;
		sumJJ += j * j;
		sumHJ += h * j;
	}
	const count = N * N;
	const covariance = sumHJ / count - (sumH / count) * (sumJ / count);
	const varianceH = sumHH / count - (sumH / count) ** 2;
	const varianceJ = sumJJ / count - (sumJ / count) ** 2;
	const correlation = covariance / Math.sqrt(varianceH * varianceJ);
	expect.truthy(correlation < -0.5, `correlation ${correlation} should be strongly negative`);
});

test('the band mask keeps only wavenumbers inside [kMin, kMax)', () => {
	const c = config(6);
	c.kMin = 0.3;
	c.kMax = 0.6;
	const cascade = Cascade.create(c);
	let inside = 0;
	let outside = 0;
	for (let index = 0; index < N * N; index++) {
		const k = Math.sqrt(cascade.kx[index] ** 2 + cascade.kz[index] ** 2);
		const amplitude = Math.abs(cascade.h0Re[index]) + Math.abs(cascade.h0Im[index]);
		if (k >= 0.3 && k < 0.6) {
			inside += amplitude;
		} else {
			outside += amplitude;
		}
	}
	expect.truthy(inside > 0, 'energy inside the band');
	expect.equal(outside, 0, 'no energy outside the band');
});

test("the height variance matches the spectrum's resolved energy", () => {
	// Mean square height over the patch, averaged over seeds and times, against the sum of
	// the lattice variance: the discrete Parseval identity, which pins the amplitude
	// convention, sqrt(P dk^2 / 4): eq 42's 1 / sqrt 2 and a further 1 / sqrt 2 because
	// eq 43's two conjugate terms are independent draws. No FFT scaling.
	// A short-fetch sea puts the spectral peak many cells from the origin, so the sum is
	// spread over enough cells for a 36-realisation average to be within a few percent.
	const rough = { ...Spectrum.NORMAL };
	rough.fetch = 5000;
	const c = config(0);
	c.params = rough;
	let expected = 0;
	const dk = (2 * Math.PI) / SIZE;
	const probe = Cascade.create(c);
	for (let index = 0; index < N * N; index++) {
		const k = Math.sqrt(probe.kx[index] ** 2 + probe.kz[index] ** 2);
		if (k < NYQUIST) {
			expected += Spectrum.variance(probe.kx[index], probe.kz[index], rough) * dk * dk;
		}
	}
	let measured = 0;
	let samples = 0;
	for (let seed = 1; seed <= 12; seed++) {
		for (const t of [0, 7, 31]) {
			const cascadeConfig = config(seed);
			cascadeConfig.params = rough;
			const cascade = Cascade.create(cascadeConfig);
			Cascade.evolve(cascade, t);
			Cascade.synthesise(cascade, FFT.plan(N));
			for (const value of cascade.height) {
				measured += value * value;
				samples += 1;
			}
		}
	}
	measured /= samples;
	expect.near(measured / expected, 1, 0.15, 'variance ratio');
});

test('bilinear sampling reproduces the grid and wraps', () => {
	const cascade = synthesised(9, 2);
	const spacing = SIZE / N;
	const height = Cascade.sample(cascade, 3 * spacing, 5 * spacing)[0];
	expect.near(height, cascade.height[5 * N + 3], 1e-9, 'grid point');
	const wrapped = Cascade.sample(cascade, 3 * spacing + SIZE, 5 * spacing - SIZE)[0];
	expect.near(wrapped, height, 1e-9, 'wraps');
	const mid = Cascade.sample(cascade, 3.5 * spacing, 5 * spacing)[0];
	expect.near(mid, (cascade.height[5 * N + 3] + cascade.height[5 * N + 4]) / 2, 1e-9, 'midpoint');
});

test('bilinear sampling returns all eight fields in order', () => {
	const cascade = synthesised(12, 3);
	const spacing = SIZE / N;
	const x = 6.25 * spacing;
	const z = 9.25 * spacing;
	const fields = [
		cascade.height,
		cascade.dispX,
		cascade.dispZ,
		cascade.slopeX,
		cascade.slopeZ,
		cascade.jxx,
		cascade.jzz,
		cascade.jxz,
	];
	const got = Cascade.sample(cascade, x, z);
	expect.equal(got.length, 8, 'eight returns');
	fields.forEach((field, i) => {
		const which = i + 1;
		// Manual bilinear at (column 6.25, row 9.25): the column weights 0.75/0.25 differ from
		// the row weights, so a swapped u and v would be caught.
		const a = field[9 * N + 6];
		const b = field[9 * N + 7];
		const c = field[10 * N + 6];
		const d = field[10 * N + 7];
		const want = (a * 0.75 + b * 0.25) * 0.75 + (c * 0.75 + d * 0.25) * 0.25;
		expect.near(got[which - 1], want, 1e-9, `field ${which}`);
	});
});

test('sampleNoJacobian returns the first five fields of sample', () => {
	const cascade = synthesised(14, 2);
	const spacing = SIZE / N;
	for (const point of [
		[6.25 * spacing, 9.25 * spacing],
		[3 * spacing, 5 * spacing],
		[-1.5 * spacing, 40.75 * spacing],
	]) {
		const full = Cascade.sample(cascade, point[0], point[1]);
		const [h, dx, dz, sx, sz] = Cascade.sampleNoJacobian(cascade, point[0], point[1]);
		expect.near(h, full[0], 1e-12, 'height');
		expect.near(dx, full[1], 1e-12, 'dispX');
		expect.near(dz, full[2], 1e-12, 'dispZ');
		expect.near(sx, full[3], 1e-12, 'slopeX');
		expect.near(sz, full[4], 1e-12, 'slopeZ');
	}
});

test('sampleJacobian is the bilinear sample of the three Jacobian arrays', () => {
	const cascade = synthesised(16, 4);
	const spacing = SIZE / N;
	// The foam field calls this sampler instead of `sample` and drops the five fields it does not
	// need, so the three it keeps have to be bit for bit what `sample` returns: the weights and
	// the order of the mixes are the same, and an exact compare catches a corner index swapped
	// between the two.
	for (const point of [
		[6.25 * spacing, 9.25 * spacing],
		[3 * spacing, 5 * spacing],
		[-1.5 * spacing, 40.75 * spacing],
	]) {
		const full = Cascade.sample(cascade, point[0], point[1]);
		const [jxx, jzz, jxz] = Cascade.sampleJacobian(cascade, point[0], point[1]);
		expect.equal(jxx, full[5], 'jxx');
		expect.equal(jzz, full[6], 'jzz');
		expect.equal(jxz, full[7], 'jxz');
	}
});

test('sampling works on any table with the Fields shape', () => {
	const cascade = synthesised(15, 1);
	const plain = {
		n: cascade.n,
		size: cascade.size,
		height: cascade.height,
		dispX: cascade.dispX,
		dispZ: cascade.dispZ,
		slopeX: cascade.slopeX,
		slopeZ: cascade.slopeZ,
		jxx: cascade.jxx,
		jzz: cascade.jzz,
		jxz: cascade.jxz,
	};
	const spacing = SIZE / N;
	const fromCascade = Cascade.sample(cascade, 2.5 * spacing, 7.25 * spacing);
	const fromPlain = Cascade.sample(plain, 2.5 * spacing, 7.25 * spacing);
	for (let which = 1; which <= 8; which++) {
		expect.near(fromPlain[which - 1], fromCascade[which - 1], 1e-12, `field ${which}`);
	}
});

test('the sea travels downwind', () => {
	// Spectrum.NORMAL has windDirection 0 (+x). Synthesise at t and t + dt and find the
	// column shift that best matches the later field to the earlier one: it must be
	// positive (toward +x). Band-limited so the shift is a few cells, not a full wrap.
	const before = synthesised(13, 0, NYQUIST / 4);
	const after = synthesised(13, 1.5, NYQUIST / 4);
	function correlation(shift) {
		let total = 0;
		for (let row = 0; row <= N - 1; row++) {
			for (let column = 0; column <= N - 1; column++) {
				const a = before.height[row * N + column];
				// shift runs negative, so this needs Luau's floored modulo.
				const b = after.height[row * N + mod(column + shift, N)];
				total += a * b;
			}
		}
		return total;
	}
	let best = -Infinity;
	let bestShift = 0;
	for (let shift = -N / 4; shift <= N / 4; shift++) {
		const value = correlation(shift);
		if (value > best) {
			best = value;
			bestShift = shift;
		}
	}
	expect.truthy(bestShift > 0, `best shift ${bestShift} should be positive (downwind)`);
});

test('sampleHeight returns the first three values of sampleNoJacobian', () => {
	const cascade = synthesised(11, 2);
	const x = 13.7;
	const z = 41.2;
	const [h, dx, dz] = Cascade.sampleHeight(cascade, x, z);
	const [h2, dx2, dz2] = Cascade.sampleNoJacobian(cascade, x, z);
	expect.near(h, h2, 1e-12, 'height');
	expect.near(dx, dx2, 1e-12, 'dispX');
	expect.near(dz, dz2, 1e-12, 'dispZ');
	// The same point one patch away in each axis. sampleHeight works out its own corner
	// indices (inlined for the frame budget) rather than sharing `corners` with
	// sampleNoJacobian, so this is the case that walks its modulo path: without the wrap the
	// offsets run off the grid instead of naming the same four cells.
	const wrappedX = x + SIZE;
	const wrappedZ = z - SIZE;
	const [wh, wdx, wdz] = Cascade.sampleHeight(cascade, wrappedX, wrappedZ);
	const [wh2, wdx2, wdz2] = Cascade.sampleNoJacobian(cascade, wrappedX, wrappedZ);
	expect.near(wh, wh2, 1e-12, 'wrapped height');
	expect.near(wdx, wdx2, 1e-12, 'wrapped dispX');
	expect.near(wdz, wdz2, 1e-12, 'wrapped dispZ');
	expect.near(wh, h, 1e-9, 'a patch away is the same sea');
});

test('sampling at negative world coordinates wraps like the positive side (Review Focus 1)', () => {
	const cascade = synthesised(4, 3);
	for (const [x, z] of [[-1.25, 7.5], [-SIZE - 3.3, -0.1], [-0.0001, -SIZE * 5 + 2]]) {
		const a = Cascade.sample(cascade, x, z);
		const b = Cascade.sample(cascade, x + 7 * SIZE, z + 11 * SIZE);
		for (let i = 0; i < 8; i++) {
			expect.near(a[i], b[i], 1e-9, `field ${i} at (${x}, ${z})`);
		}
	}
});

test('a zero scale gives a flat, finite sea (Review Focus 2)', () => {
	const flat = { ...config(3), params: { ...Spectrum.NORMAL, scale: 0 } };
	const cascade = Cascade.create(flat);
	Cascade.evolve(cascade, 5);
	Cascade.synthesise(cascade, FFT.plan(N));
	for (const name of ['height', 'dispX', 'dispZ', 'slopeX', 'slopeZ', 'jxx', 'jzz', 'jxz']) {
		for (const value of cascade[name]) {
			expect.equal(value, 0, `${name} is flat`);
		}
	}
});

test('an hour later the looped sea repeats (Review Focus 3)', () => {
	const t = 3600 * 5 + 17.25; // five hours in
	const a = synthesised(6, t);
	const b = synthesised(6, t + LOOP);
	for (let index = 0; index < N * N; index++) {
		expect.near(a.height[index], b.height[index], 1e-6, `height[${index}]`);
	}
});
