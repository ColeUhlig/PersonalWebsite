import { test } from 'node:test';
import * as expect from '../expect.js';
import * as Cascade from '../../../content/ocean/js/core/cascade.js';
import * as WaterColour from '../../../content/ocean/js/core/waterColour.js';
import { clamp, color3, lerpColor3 } from '../../../content/ocean/js/core/luau.js';

const TEXELS = 4; // a 4 x 4 map, so a texel is 2 studs of the tile
const TILE = 8;
// Eighths: every component and every Lerp between them is exact in the engine's 32-bit colour
// channels, so the expected bytes match to the bit and the cases can use expect.equal.
const DEEP = color3(0.125, 0.25, 0.375);
const SUBSURFACE = color3(0.625, 0.75, 0.875);

// A 4 x 4 cascade over 8 studs whose dispX is x/8, dispZ is z/8 and height is x + z at each
// cell, so a bilinear sample at a cell centre is exact.
function fields() {
	const n = 4;
	const size = 8;
	const f = { n, size };
	for (const name of ['height', 'dispX', 'dispZ', 'slopeX', 'slopeZ', 'jxx', 'jzz', 'jxz']) {
		f[name] = new Float64Array(n * n);
	}
	for (let row = 0; row <= n - 1; row++) {
		for (let column = 0; column <= n - 1; column++) {
			const index = row * n + column;
			const x = (column * size) / n;
			const z = (row * size) / n;
			f.height[index] = x + z;
			f.dispX[index] = x / 8;
			f.dispZ[index] = z / 8;
		}
	}
	return f;
}

function byteOf(value) {
	return Math.floor(value * 255 + 0.5);
}

// One texel of a base fill: the LUT's entry as three bytes, with no alpha between the texels.
function expectTriple(out, index, lut, entry, label) {
	const offset = index * 3;
	const base = entry * 3;
	expect.equal(out[offset], lut[base], `${label} red`);
	expect.equal(out[offset + 1], lut[base + 1], `${label} green`);
	expect.equal(out[offset + 2], lut[base + 2], `${label} blue`);
}

test('the LUT runs from deep to subsurface', () => {
	const lut = WaterColour.lut(DEEP, SUBSURFACE);
	expect.equal(lut.byteLength, 256 * 3, '256 RGB triples');
	expect.equal(lut[0], byteOf(DEEP.r), 'entry 0 red');
	expect.equal(lut[1], byteOf(DEEP.g), 'entry 0 green');
	expect.equal(lut[2], byteOf(DEEP.b), 'entry 0 blue');
	expect.equal(lut[255 * 3], byteOf(SUBSURFACE.r), 'entry 255 red');
	expect.equal(lut[255 * 3 + 1], byteOf(SUBSURFACE.g), 'entry 255 green');
	expect.equal(lut[255 * 3 + 2], byteOf(SUBSURFACE.b), 'entry 255 blue');
	const middle = lerpColor3(DEEP, SUBSURFACE, 128 / 255);
	expect.equal(lut[128 * 3], byteOf(middle.r), 'entry 128 red');
	expect.equal(lut[128 * 3 + 1], byteOf(middle.g), 'entry 128 green');
	expect.equal(lut[128 * 3 + 2], byteOf(middle.b), 'entry 128 blue');
	// The ramp climbs, so the middle entry is neither end.
	expect.truthy(lut[0] < lut[128 * 3], 'deep below the middle');
	expect.truthy(lut[128 * 3] < lut[255 * 3], 'middle below the top');
});

test('base writes the height tint as RGB triples', () => {
	const f = fields();
	const lut = WaterColour.lut(DEEP, SUBSURFACE);
	const out = new Uint8Array(TEXELS * TEXELS * 3);
	const peak = 16;
	const tint = 0.5;
	WaterColour.base(out, TEXELS, TILE, [f], [1], peak, tint, lut);
	const step = TILE / TEXELS;
	for (let j = 0; j <= TEXELS - 1; j++) {
		for (let i = 0; i <= TEXELS - 1; i++) {
			const height = Cascade.sampleHeight(f, (i + 0.5) * step, (j + 0.5) * step)[0];
			const ramp = clamp((height / peak + 1) / 2, 0, 1);
			const entry = Math.floor(tint * ramp * 255 + 0.5);
			expectTriple(out, j * TEXELS + i, lut, entry, `texel ${i},${j}`);
		}
	}
	// The first texel sits at world (1, 1), where the height samples 2 studs: the ramp is 0.5625
	// and the entry floor(0.5 * 0.5625 * 255 + 0.5).
	expectTriple(out, 0, lut, 72, 'the texel at world (1, 1)');
});

test('tint 0 is deep everywhere; heights beyond the peak clamp', () => {
	const f = fields();
	const lut = WaterColour.lut(DEEP, SUBSURFACE);
	const out = new Uint8Array(TEXELS * TEXELS * 3);
	const count = TEXELS * TEXELS;
	// A tint of 0 holds the whole map at entry 0 whatever the height does.
	WaterColour.base(out, TEXELS, TILE, [f], [1], 16, 0, lut);
	for (let index = 0; index <= count - 1; index++) {
		expectTriple(out, index, lut, 0, `untinted texel ${index}`);
	}
	// Every height in this field is above a peak of 1 stud, so the ramp saturates at the top.
	WaterColour.base(out, TEXELS, TILE, [f], [1], 1, 1, lut);
	for (let index = 0; index <= count - 1; index++) {
		expectTriple(out, index, lut, 255, `crest texel ${index}`);
	}
	// The same field negated puts every height below minus the peak, which clamps the other way.
	const sunk = fields();
	for (let cell = 0; cell < sunk.n * sunk.n; cell++) {
		sunk.height[cell] = -sunk.height[cell];
	}
	WaterColour.base(out, TEXELS, TILE, [sunk], [1], 1, 1, lut);
	for (let index = 0; index <= count - 1; index++) {
		expectTriple(out, index, lut, 0, `trough texel ${index}`);
	}
});
