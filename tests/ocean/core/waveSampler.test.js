import { test } from 'node:test';
import * as expect from '../expect.js';
import * as WaveSampler from '../../../content/ocean/js/core/waveSampler.js';

// One wave: k, omega, A, phase, dx, dz
const ONE_WAVE = Float64Array.of(0.05, 0.7, 2, 0.3, 0.6, 0.8);
const TOLERANCE = 1e-5;
const FULL = Float64Array.of(1);
const EMPTY = new Float64Array(0);

test('no waves means no displacement and an up normal', () => {
	const [dx, dy, dz, nx, ny, nz] = WaveSampler.sample(EMPTY, 0, 1, 5, 5, 1, EMPTY, 0);
	expect.equal(dx, 0, 'dx');
	expect.equal(dy, 0, 'dy');
	expect.equal(dz, 0, 'dz');
	expect.equal(nx, 0, 'nx');
	expect.equal(ny, 1, 'ny');
	expect.equal(nz, 0, 'nz');
});

// Reference numbers from sampleDisplacement() in jonswap-ocean/js/jonswap.js.
test('displacement matches the JavaScript reference', () => {
	const [dx, dy, dz] = WaveSampler.sample(ONE_WAVE, 1, 1.5, 10, -4, 1, FULL, 0);
	expect.near(dx, 0.9835776889758373, TOLERANCE, 'dx');
	expect.near(dy, -1.145734852292749, TOLERANCE, 'dy');
	expect.near(dz, 1.3114368860645629, TOLERANCE, 'dz');
});

test('chop 0 removes the lateral term only', () => {
	const [dx, dy, dz] = WaveSampler.sample(ONE_WAVE, 1, 1.5, 10, -4, 0, FULL, 0);
	expect.equal(dx, 0, 'dx');
	expect.equal(dz, 0, 'dz');
	expect.near(dy, -1.145734852292749, TOLERANCE, 'dy');
});

test('normal is unit length and points up', () => {
	const [, , , nx, ny, nz] = WaveSampler.sample(ONE_WAVE, 1, 1.5, 10, -4, 1, FULL, 0);
	expect.near(nx * nx + ny * ny + nz * nz, 1, 1e-9, 'normal length');
	expect.truthy(ny > 0, 'normal should point up');
});

test('normal agrees with a finite-difference slope', () => {
	const t = 1.5;
	const x = 10;
	const z = -4;
	const step = 1e-3;
	const [, , , nx, ny, nz] = WaveSampler.sample(ONE_WAVE, 1, t, x, z, 0, FULL, 0);
	const hx0 = WaveSampler.sample(ONE_WAVE, 1, t, x - step, z, 0, FULL, 0)[1];
	const hx1 = WaveSampler.sample(ONE_WAVE, 1, t, x + step, z, 0, FULL, 0)[1];
	const hz0 = WaveSampler.sample(ONE_WAVE, 1, t, x, z - step, 0, FULL, 0)[1];
	const hz1 = WaveSampler.sample(ONE_WAVE, 1, t, x, z + step, 0, FULL, 0)[1];
	// Vector3.new(...).Unit
	const ux = -(hx1 - hx0) / (2 * step);
	const uz = -(hz1 - hz0) / (2 * step);
	const length = Math.sqrt(ux * ux + 1 + uz * uz);
	const expected = { X: ux / length, Y: 1 / length, Z: uz / length };
	expect.near(nx, expected.X, 1e-4, 'nx');
	expect.near(ny, expected.Y, 1e-4, 'ny');
	expect.near(nz, expected.Z, 1e-4, 'nz');
});

test('a weight scales the wave, and zero removes it', () => {
	const full = WaveSampler.sample(ONE_WAVE, 1, 1.5, 10, -4, 1, FULL, 0)[1];
	const half = WaveSampler.sample(ONE_WAVE, 1, 1.5, 10, -4, 1, Float64Array.of(0.5), 0)[1];
	const [, none, , , ny] = WaveSampler.sample(ONE_WAVE, 1, 1.5, 10, -4, 1, Float64Array.of(0), 0);
	expect.near(half, full / 2, 1e-9, 'half weight');
	expect.equal(none, 0, 'zero weight height');
	expect.equal(ny, 1, 'zero weight normal');
});

test('weights are read from the given offset', () => {
	const expected = WaveSampler.sample(ONE_WAVE, 1, 1.5, 10, -4, 1, Float64Array.of(0.25), 0)[1];
	const actual = WaveSampler.sample(ONE_WAVE, 1, 1.5, 10, -4, 1, Float64Array.of(9, 9, 0.25), 2)[1];
	expect.near(actual, expected, 1e-12, 'offset weight');
});

test('the Jacobian is 1 on flat water and drops where the surface pinches', () => {
	const flat = WaveSampler.sample(EMPTY, 0, 0, 0, 0, 1, EMPTY, 0)[6];
	expect.equal(flat, 1, 'flat Jacobian');
	// A steep single wave (k * A = 0.9): the crest, where sin(phi) = 1, is the tightest point.
	const steep = Float64Array.of(0.3, 1, 3, 0, 1, 0);
	const crestX = Math.PI / 2 / 0.3;
	const atCrest = WaveSampler.sample(steep, 1, 0, crestX, 0, 1, FULL, 0)[6];
	const atTrough = WaveSampler.sample(steep, 1, 0, -crestX, 0, 1, FULL, 0)[6];
	expect.near(atCrest, 0.1, 1e-9, 'crest Jacobian = 1 - kA');
	expect.near(atTrough, 1.9, 1e-9, 'trough Jacobian = 1 + kA');
});
