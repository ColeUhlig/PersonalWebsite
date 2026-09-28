import { test } from 'node:test';
import * as expect from '../expect.js';
import * as FoamField from '../../../content/ocean/js/core/foamField.js';

const TILE = 8;

// Luau's `pcall(f, ...)`: true when the call returns, false when it throws.
function pcall(fn, ...args) {
	try {
		fn(...args);
		return true;
	} catch {
		return false;
	}
}

// A 4 x 4 cascade over 8 studs with constant Jacobian derivatives, so J is the same at every cell.
function fields(jxx, jzz, jxz) {
	const n = 4;
	const size = 8;
	const f = { n, size };
	for (const name of ['height', 'dispX', 'dispZ', 'slopeX', 'slopeZ', 'jxx', 'jzz', 'jxz']) {
		f[name] = new Float64Array(n * n);
	}
	for (let index = 0; index < n * n; index++) {
		f.jxx[index] = jxx;
		f.jzz[index] = jzz;
		f.jxz[index] = jxz;
	}
	return f;
}

// The field stepRows runs on: 8 x 8 texels over the same 8 studs, so a texel is one stud and the
// 4 x 4 cascade above covers it exactly once, two texels to a cell.
const FIELD_TEXELS = 8;

function stepField() {
	return FoamField.newGrid(FIELD_TEXELS, TILE);
}

function fill(field, value) {
	for (let index = 0; index < field.texels * field.texels; index++) {
		field.foam[index] = value;
	}
}

test('stepRows folds where the summed Jacobian is under the whitecap', () => {
	// Two cascades at jxx = -0.4 each: the SUM is -0.8, so at chop 1 the determinant is
	// (1 - 0.8) * 1 - 0 = 0.2, a fifth of a whitecap of 0.5 away from flat water. At grow 1 with no
	// decay the step writes the shortfall itself, 0.5 - 0.2.
	const field = stepField();
	const a = fields(-0.4, 0, 0);
	const b = fields(-0.4, 0, 0);
	const params = { whitecap: 0.5, grow: 1, decay: 0 };
	const cover = FoamField.stepRows(field, 0, FIELD_TEXELS, [a, b], [1, 2], TILE, 1, params);
	expect.near(cover, 0.3, 1e-9, 'the mean of the rows it stepped');
	for (let j = 0; j < FIELD_TEXELS; j++) {
		for (let i = 0; i < FIELD_TEXELS; i++) {
			expect.near(FoamField.at(field, i, j), 0.3, 1e-6, `texel (${i}, ${j})`);
		}
	}
	// One of those cascades alone is J = (1 - 0.4) * 1 = 0.6, over the whitecap and no fold at all:
	// what foams is the sum of the three displacements, not any one cascade's own.
	const single = stepField();
	const alone = FoamField.stepRows(single, 0, FIELD_TEXELS, [a], [1], TILE, 1, params);
	expect.equal(alone, 0, "one cascade's own fold is over the cap");
	expect.equal(FoamField.at(single, 3, 5), 0, 'so its texels stay dry');
});

test('stepRows touches only its rows', () => {
	// Flat water is J = 1, over any whitecap, so the rows it steps only decay.
	const field = stepField();
	fill(field, 0.5);
	const params = { whitecap: 0.5, grow: 1, decay: 0.5 };
	const cover = FoamField.stepRows(field, 2, 2, [fields(0, 0, 0)], [1], TILE, 1, params);
	expect.near(cover, 0.25, 1e-9, 'the mean is of the two rows, not the field');
	for (let j = 0; j < FIELD_TEXELS; j++) {
		const expected = j === 2 || j === 3 ? 0.25 : 0.5;
		for (let i = 0; i < FIELD_TEXELS; i++) {
			expect.equal(FoamField.at(field, i, j), expected, `texel (${i}, ${j})`);
		}
	}
});

test('stepRows clamps at one and decays from there', () => {
	// grow 10 over the same 0.3 shortfall is 3, which the clamp takes to 1 in one step.
	const field = stepField();
	const params = { whitecap: 0.5, grow: 10, decay: 0.5 };
	const folding = [fields(-0.4, 0, 0), fields(-0.4, 0, 0)];
	FoamField.stepRows(field, 0, FIELD_TEXELS, folding, [1, 2], TILE, 1, params);
	expect.equal(FoamField.at(field, 0, 0), 1, 'clamped');
	// Flat water from here: nothing grows and the decay alone runs the texel down.
	const cover = FoamField.stepRows(field, 0, FIELD_TEXELS, [fields(0, 0, 0)], [1], TILE, 1, params);
	expect.equal(FoamField.at(field, 0, 0), 0.5, 'one decay');
	expect.near(cover, 0.5, 1e-9, 'the mean follows the field');
});

test('stepRows errors outside the field', () => {
	const field = stepField();
	const flat = [fields(0, 0, 0)];
	const params = { whitecap: 0.5, grow: 1, decay: 0.5 };
	const over = pcall(FoamField.stepRows, field, 6, 4, flat, [1], TILE, 1, params);
	expect.equal(over, false, 'rows past the last one');
	const under = pcall(FoamField.stepRows, field, -1, 2, flat, [1], TILE, 1, params);
	expect.equal(under, false, 'rows before the first one');
});

test('a grid field samples bilinearly in world studs and wraps', () => {
	// A 2 x 2 field over 8 studs: its cells sit AT 0 and 4 studs along each axis, the cascade
	// lattice's own positions, and only cell (1, 0) carries foam, so a sample is the weight it lands
	// on that cell.
	const field = FoamField.newGrid(2, 8);
	field.foam[0 * 2 + 1] = 1;
	expect.equal(FoamField.sample(field, 4, 0), 1, "the foamed cell's own position");
	expect.equal(FoamField.sample(field, 0, 0), 0, "its neighbour's");
	expect.near(FoamField.sample(field, 2, 0), 0.5, 1e-6, 'midway between the two');
	expect.near(FoamField.sample(field, 6, 0), 0.5, 1e-6, 'midway the other way, wrapping at 8');
});

// Review Focus 1: the camera wanders to negative x and z. The field's period is its size, 16 studs
// here, so +32 and +48 land on the same place. (-1e-15, -1e-15) is the "a hair below zero" edge
// Task 3 met in Cascade: it must read cell 0's neighbourhood and never NaN.
test('sample at negative world coordinates wraps like the positive side', () => {
	const field = FoamField.newGrid(8, 16);
	for (let index = 0; index < 64; index++) {
		field.foam[index] = (index % 7) / 7;
	}
	for (const [x, z] of [[-1.5, 3.25], [-16.1, -0.2], [-0.001, -47.9], [-1e-15, -1e-15]]) {
		expect.near(FoamField.sample(field, x, z), FoamField.sample(field, x + 32, z + 48), 1e-6, `(${x}, ${z})`);
	}
});
