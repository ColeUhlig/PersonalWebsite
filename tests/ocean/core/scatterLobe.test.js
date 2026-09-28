import { test } from 'node:test';
import * as expect from '../expect.js';
import * as ScatterLobe from '../../../content/ocean/js/core/scatterLobe.js';

const P = ScatterLobe.DEFAULTS;

const rad = (degrees) => (degrees * Math.PI) / 180;

// A Vector3 is 32-bit per component in the engine: an xyz Float32Array, as the porting rules have it.
function vector3(x, y, z) {
	return Float32Array.of(x, y, z);
}

// Vector3.Unit, into a new vector3.
function unit(v) {
	const length = Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]);
	return vector3(v[0] / length, v[1] / length, v[2] / length);
}

// Vector3:Dot
function dot(a, b) {
	return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

// Sun low in the +x direction (elevation 15 degrees): towards the sun is (cos 15, sin 15, 0).
const SUN = vector3(Math.cos(rad(15)), Math.sin(rad(15)), 0);

test('looking into the sun through the water glows, looking away does not', () => {
	// Camera on the -x side of the patch, low, looking toward +x (toward the sun).
	const into = ScatterLobe.strength(0, 0, -100, 5, 0, SUN[0], SUN[1], SUN[2], P);
	// Camera on the +x side: the sun is behind the camera.
	const away = ScatterLobe.strength(0, 0, 100, 5, 0, SUN[0], SUN[1], SUN[2], P);
	expect.truthy(into > 0, 'into the sun glows');
	expect.equal(away, 0, 'away from the sun is zero');
	// Exact value: the lobe takes the vector from the patch centre to the camera,
	// V = (-100, 5, 0) / |.|; towardSun = -(L . V).
	const v = unit(vector3(-100, 5, 0));
	const towardSun = -dot(SUN, v);
	const face = 0.5 - 0.5 * SUN[1];
	const expected = P.strength * Math.min(towardSun, 1) ** P.viewPower * face ** P.facePower;
	// 1e-6, not tighter: Vector3.Unit and Vector3:Dot are 32-bit float while the module works in
	// doubles, so the two sides differ around 1e-7 (the M2 specs hit the same thing). Here the
	// unit vector is stored in 32 bits and the dot is taken in doubles.
	expect.near(into, expected, 1e-6, 'formula');
});

test('a higher sun glows less through the same crest', () => {
	const high = vector3(Math.cos(rad(60)), Math.sin(rad(60)), 0);
	const low = ScatterLobe.strength(0, 0, -100, 5, 0, SUN[0], SUN[1], SUN[2], P);
	const highGlow = ScatterLobe.strength(0, 0, -100, 5, 0, high[0], high[1], high[2], P);
	expect.truthy(highGlow < low, 'the lobe falls with sun elevation');
});

test('strength scales linearly and a zero strength is zero', () => {
	const double = { ...P };
	double.strength = P.strength * 2;
	const one = ScatterLobe.strength(0, 0, -100, 5, 0, SUN[0], SUN[1], SUN[2], P);
	const two = ScatterLobe.strength(0, 0, -100, 5, 0, SUN[0], SUN[1], SUN[2], double);
	expect.near(two, one * 2, 1e-9, 'linear');
	const zero = { ...P };
	zero.strength = 0;
	expect.equal(ScatterLobe.strength(0, 0, -100, 5, 0, SUN[0], SUN[1], SUN[2], zero), 0, 'zero');
});
