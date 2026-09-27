import { test } from 'node:test';
import * as expect from '../expect.js';
import * as Cascade from '../../../content/ocean/js/core/cascade.js';
import * as Jacobian from '../../../content/ocean/js/core/jacobian.js';
import * as Spectrum from '../../../content/ocean/js/core/spectrum.js';
import * as Swells from '../../../content/ocean/js/core/swells.js';
import * as WaveField from '../../../content/ocean/js/core/waveField.js';

// Ratio 2 between cascades: the handover rule needs n >= 12 * ratio, so n = 32 is the
// smallest cheap size that resolves it (the design's ratio 4 needs n = 64).
const N = 32;
const SIZES = [256, 128, 64];
const SWELLS = [
	{ wavelength: 400, amplitude: 1.2, direction: 0.2, phase: 0 },
	{ wavelength: 230, amplitude: 0.6, direction: -0.3, phase: 1 },
];

function field() {
	return WaveField.create({
		params: Spectrum.NORMAL,
		n: N,
		sizes: SIZES,
		seed: 11,
		loopPeriod: 120,
		chop: 1,
		swells: SWELLS,
	});
}

// pcall: true when fn(...args) returns, false when it throws.
function succeeds(fn, ...args) {
	try {
		fn(...args);
		return true;
	} catch {
		return false;
	}
}

test('bands hand over at 12 pi over the next size and cap at Nyquist', () => {
	const bands = WaveField.bands(SIZES, N);
	expect.equal(bands.length, 3, 'three bands');
	expect.equal(bands[0].kMin, 0, 'first starts at 0');
	expect.near(bands[0].kMax, (12 * Math.PI) / 128, 1e-12, 'first hands over');
	expect.near(bands[1].kMin, (12 * Math.PI) / 128, 1e-12, 'second starts there');
	expect.near(bands[1].kMax, (12 * Math.PI) / 64, 1e-12, 'second hands over');
	expect.near(bands[2].kMin, (12 * Math.PI) / 64, 1e-12, 'third starts there');
	expect.equal(bands[2].kMax, Infinity, 'third is open above (Cascade caps at Nyquist)');
});

test("bands must fit under each cascade's Nyquist", () => {
	// Ratio 2 at n = 16 gives a handover at 12 pi / 128 = 0.295 against a Nyquist of
	// pi * 16 / 256 = 0.196: above Nyquist, so create() must refuse it.
	expect.truthy(
		!succeeds(WaveField.create, {
			params: Spectrum.NORMAL,
			n: 16,
			sizes: SIZES,
			seed: 1,
			loopPeriod: 120,
			chop: 1,
			swells: SWELLS,
		}),
		'n = 16 cannot resolve a ratio of 2',
	);
});

test('update fills one cascade at a time', () => {
	const f = field();
	expect.equal(f.cascades[0].time, -1, 'not yet synthesised');
	WaveField.update(f, 1, 5);
	expect.equal(f.cascades[0].time, 5, 'first updated');
	expect.equal(f.cascades[1].time, -1, 'second untouched');
});

test('sample at a grid point equals the cascade tables plus the swells', () => {
	const f = field();
	for (let index = 1; index <= 3; index++) {
		WaveField.update(f, index, 2);
	}
	// Cells are 8, 4 and 2 studs, so (16, 32) is a grid point of every cascade.
	const x = 16;
	const z = 32;
	const height = WaveField.sample(f, x, z, 2)[0];
	let expected = Swells.heightAt(f.swells, 2, x, z);
	for (const cascade of f.cascades) {
		expected += Cascade.sample(cascade, x, z)[0];
	}
	expect.near(height, expected, 1e-9, 'height');
});

test('sample composes all six returns, with chop on the displacement and the Jacobian', () => {
	// chop = 2, so a displacement that merely passed the cascade's dx through would differ
	// from the sum by a factor of two, and the Jacobian would be the lambda = 1 one.
	const f = WaveField.create({
		params: Spectrum.NORMAL,
		n: N,
		sizes: SIZES,
		seed: 11,
		loopPeriod: 120,
		chop: 2,
		swells: SWELLS,
	});
	const t = 2;
	for (let index = 1; index <= 3; index++) {
		WaveField.update(f, index, t);
	}
	// Cells are 8, 4 and 2 studs, so (16, 32) is a grid point of every cascade.
	const x = 16;
	const z = 32;
	const [height, dispX, dispZ, slopeX, slopeZ, jacobian] = WaveField.sample(f, x, z, t);

	let wantHeight = 0;
	let wantDispX = 0;
	let wantDispZ = 0;
	let wantSlopeX = 0;
	let wantSlopeZ = 0;
	let jxx = 0;
	let jzz = 0;
	let jxz = 0;
	for (const cascade of f.cascades) {
		const [h, dx, dz, sx, sz, xx, zz, xz] = Cascade.sample(cascade, x, z);
		wantHeight += h;
		wantDispX += dx;
		wantDispZ += dz;
		wantSlopeX += sx;
		wantSlopeZ += sz;
		jxx += xx;
		jzz += zz;
		jxz += xz;
	}
	wantDispX *= 2;
	wantDispZ *= 2;
	// The swell height in sample() is Swells.sample's dy, not Swells.heightAt (they agree
	// here, but sample() is what the code reads).
	const [swellX, swellY, swellZ] = Swells.sample(f.swells, t, x, z, 2);
	wantHeight += swellY;
	wantDispX += swellX;
	wantDispZ += swellZ;

	expect.near(height, wantHeight, 1e-9, 'height');
	expect.near(dispX, wantDispX, 1e-9, 'dispX');
	expect.near(dispZ, wantDispZ, 1e-9, 'dispZ');
	expect.near(slopeX, wantSlopeX, 1e-9, 'slopeX');
	expect.near(slopeZ, wantSlopeZ, 1e-9, 'slopeZ');
	expect.near(jacobian, Jacobian.determinant(jxx, jzz, jxz, 2), 1e-9, 'jacobian');
});

test('the cascade part is periodic in the largest size', () => {
	const f = field();
	for (let index = 1; index <= 3; index++) {
		WaveField.update(f, index, 4);
	}
	const x = 37.5;
	const z = 101.25;
	const h1 = WaveField.sample(f, x, z, 4)[0] - Swells.heightAt(f.swells, 4, x, z);
	const h2 = WaveField.sample(f, x + 256, z - 512, 4)[0] - Swells.heightAt(f.swells, 4, x + 256, z - 512);
	expect.near(h2, h1, 1e-9, 'periodic');
});

test('heightAt is the swell height alone and needs no update', () => {
	const f = field();
	expect.near(WaveField.heightAt(f, 9, 9, 3), Swells.heightAt(f.swells, 3, 9, 9), 1e-12, 'swells only');
});

test('the Jacobian is one on a calm field', () => {
	const f = WaveField.create({
		params: Spectrum.NORMAL,
		n: N,
		sizes: SIZES,
		seed: 11,
		loopPeriod: 120,
		chop: 1,
		swells: [{ wavelength: 400, amplitude: 0, direction: 0, phase: 0 }],
	});
	// No cascade has been updated: every table is zero, so the surface is flat.
	const [, , , , , jacobian] = WaveField.sample(f, 3, 4, 0);
	expect.near(jacobian, 1, 1e-12, 'flat');
});
