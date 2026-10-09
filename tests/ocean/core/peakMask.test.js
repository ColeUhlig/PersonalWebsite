import { test } from 'node:test';
import * as expect from '../expect.js';
import * as Cascade from '../../../content/ocean/js/core/cascade.js';
import * as FoamField from '../../../content/ocean/js/core/foamField.js';
import * as PeakMask from '../../../content/ocean/js/core/peakMask.js';
import { clamp } from '../../../content/ocean/js/core/luau.js';

const TEXELS = 4; // a 4 x 4 map, so a texel is 2 studs of the tile
const TILE = 8;

// A 4 x 4 cascade over 8 studs whose dispX is x/8, dispZ is z/8 and height is x + z + `offset`
// at each cell, so a bilinear sample at a cell centre is exact. The offset moves the whole field
// against the mean surface: absent leaves every cell at or above it, -8 puts half of them below.
function fields(offset) {
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
			f.height[index] = x + z + (offset ?? 0);
			f.dispX[index] = x / 8;
			f.dispZ[index] = z / 8;
		}
	}
	return f;
}

// Texel (i, j) is sampled at its centre, ((i + 0.5) * 2, (j + 0.5) * 2), which falls between
// cells, so the expected height is the bilinear sample's and not a cell value.
function heightAt(f, i, j) {
	const step = TILE / TEXELS;
	return Cascade.sampleHeight(f, (i + 0.5) * step, (j + 0.5) * step)[0];
}

// What `fill` writes a byte from: the summed height of the listed cascades, clamped at zero.
function magnitudeAt(f, i, j) {
	return Math.max(heightAt(f, i, j), 0);
}

// One texel: a grey RGB and an opaque alpha.
function grey(out, i, j, expected, label) {
	const offset = (j * TEXELS + i) * 4;
	expect.equal(out[offset], expected, `${label} red`);
	expect.equal(out[offset + 1], expected, `${label} green`);
	expect.equal(out[offset + 2], expected, `${label} blue`);
	expect.equal(out[offset + 3], 255, `${label} alpha`);
}

test('bytes are the normalised height above the mean surface', () => {
	const f = fields();
	const out = new Uint8Array(TEXELS * TEXELS * 4);
	const found = PeakMask.fill(out, TEXELS, TILE, [f], [1], 0, 1);
	let largest = 0;
	for (let j = 0; j <= TEXELS - 1; j++) {
		for (let i = 0; i <= TEXELS - 1; i++) {
			const magnitude = magnitudeAt(f, i, j);
			largest = Math.max(largest, magnitude);
			grey(out, i, j, Math.floor((magnitude / found) * 255 + 0.5), `texel ${i},${j}`);
		}
	}
	expect.equal(found, largest, 'the return value is the largest height seen');
	// The sample is tallest at the third row and column of this field (the fourth wraps back onto
	// the first), so the map does reach white when it normalises by what it found.
	grey(out, 2, 2, 255, 'the tallest texel');
});

test('gamma bends the ramp', () => {
	const f = fields();
	const out = new Uint8Array(TEXELS * TEXELS * 4);
	const found = PeakMask.fill(out, TEXELS, TILE, [f], [1], 0, 2);
	for (let j = 0; j <= TEXELS - 1; j++) {
		for (let i = 0; i <= TEXELS - 1; i++) {
			const ramp = magnitudeAt(f, i, j) / found;
			grey(out, i, j, Math.floor(ramp ** 2 * 255 + 0.5), `texel ${i},${j}`);
		}
	}
	// Everything below the maximum darkens: the texel at six tenths of it is 153 at gamma 1.
	grey(out, 1, 1, 92, 'the six tenths texel');
});

test('a given dMax clamps', () => {
	const f = fields();
	const out = new Uint8Array(TEXELS * TEXELS * 4);
	const reference = PeakMask.fill(out, TEXELS, TILE, [f], [1], 0, 1);
	const dMax = 0.5 * reference;
	const found = PeakMask.fill(out, TEXELS, TILE, [f], [1], dMax, 1);
	expect.equal(found, reference, 'the return value is still the true maximum');
	let white = 0;
	for (let j = 0; j <= TEXELS - 1; j++) {
		for (let i = 0; i <= TEXELS - 1; i++) {
			const ramp = clamp(magnitudeAt(f, i, j) / dMax, 0, 1);
			const expected = Math.floor(ramp * 255 + 0.5);
			grey(out, i, j, expected, `texel ${i},${j}`);
			if (expected === 255) {
				white += 1;
			}
		}
	}
	expect.truthy(white > 0, 'the texels at or above dMax saturate');
});

// No texel of the field above is below the mean surface, so nothing there proves the clamp. The
// same field dropped 8 studs puts half its cells under it: every texel whose sampled height is
// at or below zero has to come out black, and the maximum that comes back has to be the largest
// POSITIVE height and not the largest distance from the mean surface either way.
test('a texel at or below the mean surface is black', () => {
	const f = fields(-8);
	const out = new Uint8Array(TEXELS * TEXELS * 4);
	const found = PeakMask.fill(out, TEXELS, TILE, [f], [1], 0, 1);
	let largest = 0;
	let sunk = 0;
	for (let j = 0; j <= TEXELS - 1; j++) {
		for (let i = 0; i <= TEXELS - 1; i++) {
			const magnitude = magnitudeAt(f, i, j);
			largest = Math.max(largest, magnitude);
			grey(out, i, j, Math.floor((magnitude / found) * 255 + 0.5), `texel ${i},${j}`);
			if (heightAt(f, i, j) <= 0) {
				sunk += 1;
			}
		}
	}
	expect.equal(found, largest, 'the return value is the largest positive height');
	expect.truthy(sunk > 0, 'the field does put texels at or below the mean surface');
	grey(out, 0, 0, 0, 'the deepest texel');
});

// The magnitudes between `fill`'s two passes wait in a module-level scratch buffer, grown on
// demand and then kept, so a fill wider than the last one has to grow it and a fill narrower
// than the last one must not leave anything behind that a wider one would read. Both halves show
// here: the same fields are filled at 4 texels and then at 8, and those 8 x 8 bytes must be the
// bytes an 8 x 8 fill writes on its own. The scratch lives as long as the module, and no other
// case fills wider than 4, so the 8-texel fill takes the growth path whatever order the runner
// reaches the cases in. In Luau a fill into a short scratch errors, which is what makes the
// byte comparison a test there. In JavaScript it is not one: both 8-texel fills go through the
// same module scratch, and a typed array drops writes past its end and reads undefined there,
// so a scratch that never grew would give grown and fresh the same wrong bytes (black past the
// old 16 texels). The added check restores the guard: the first fill's maximum is the tallest
// texel's own magnitude, so that texel must read white, and with a 16-texel scratch it reads 0.
test('the scratch grows for a larger map', () => {
	const f = fields();
	const WIDE = TEXELS * 2;
	const small = new Uint8Array(TEXELS * TEXELS * 4);
	PeakMask.fill(small, TEXELS, TILE, [f], [1], 0, 1);
	const grown = new Uint8Array(WIDE * WIDE * 4);
	PeakMask.fill(grown, WIDE, TILE, [f], [1], 0, 1);
	const fresh = new Uint8Array(WIDE * WIDE * 4);
	PeakMask.fill(fresh, WIDE, TILE, [f], [1], 0, 1);
	for (let offset = 0; offset <= WIDE * WIDE * 4 - 1; offset++) {
		expect.equal(grown[offset], fresh[offset], `byte ${offset} after a narrower fill`);
	}
	let brightest = 0;
	for (let offset = 0; offset <= WIDE * WIDE * 4 - 1; offset += 4) {
		brightest = Math.max(brightest, grown[offset]);
	}
	expect.equal(brightest, 255, 'the tallest texel of the grown fill reads white');
});

// Foam is painted over the crest it came from, so a crest under it must not glow through it: the
// suppression holds the BYTE down. It does not touch the maximum the map normalises by, which
// stays the sea's tallest crest, so foam drifting over the crests cannot move the scale under the
// whole map. It did until 2026-09-21, and the glow pumped as caps came and went.
test('foam suppresses the mask but not its maximum', () => {
	const f = fields();
	const out = new Uint8Array(TEXELS * TEXELS * 4);
	const bare = PeakMask.fill(out, TEXELS, TILE, [f], [1], 0, 1);
	const foam = FoamField.create(TEXELS);
	// Full foam on the texel the maximum came from, the third row and column.
	foam.foam[2 * TEXELS + 2] = 1;
	const found = PeakMask.fill(out, TEXELS, TILE, [f], [1], 0, 1, foam);
	expect.equal(found, bare, 'the covered crest still sets the maximum');
	expect.equal(found, 10, "which is this field's tallest sample");
	for (let j = 0; j <= TEXELS - 1; j++) {
		for (let i = 0; i <= TEXELS - 1; i++) {
			const covered = i === 2 && j === 2 ? 1 : 0;
			const ramp = (magnitudeAt(f, i, j) * (1 - covered)) / found;
			grey(out, i, j, Math.floor(clamp(ramp, 0, 1) * 255 + 0.5), `texel ${i},${j}`);
		}
	}
	// The covered crest is black, and the tallest texel beside it reads the fraction of the true
	// crest that it is: nothing was promoted to white to fill the hole the foam left.
	grey(out, 2, 2, 0, 'the covered crest');
	grey(out, 1, 2, 204, 'the tallest uncovered texel');
});

test('nextMax decays', () => {
	expect.equal(PeakMask.nextMax(1, 0.5, 0.98), 0.98, 'a smaller find decays');
	expect.equal(PeakMask.nextMax(1, 2, 0.98), 2, 'a larger find takes over at once');
	expect.equal(PeakMask.DECAY, 0.98, 'the decay per fill');
});

// Not in the Luau, whose buffer writes error past the end: a typed array drops them instead.
test('an undersized mask buffer throws', () => {
	let threw = false;
	try {
		PeakMask.fill(new Uint8Array(TEXELS * TEXELS * 4 - 1), TEXELS, TILE, [fields()], [1], 0, 1);
	} catch (error) {
		threw = error instanceof Error && error.message.includes('bytes');
	}
	expect.truthy(threw, 'a buffer one byte short of four per texel throws');
	PeakMask.fill(new Uint8Array(TEXELS * TEXELS * 4), TEXELS, TILE, [fields()], [1], 0, 1);
});
