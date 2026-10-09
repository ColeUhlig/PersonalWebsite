import { test } from 'node:test';
import * as expect from '../expect.js';
import * as FoamField from '../../../content/ocean/js/core/foamField.js';
import * as FoamPaint from '../../../content/ocean/js/core/foamPaint.js';

const BASE = 2; // the 128-side stands in as 2
const COLOUR = 8; // and the 512-side as 8: the same 4 x ratio
const TILE = 8; // studs the map covers, so a colour texel is one stud across

// Luau's `pcall(f, ...)`: true when the call returns, false when it throws.
function pcall(fn, ...args) {
	try {
		fn(...args);
		return true;
	} catch {
		return false;
	}
}

function flat(texels, value) {
	const out = new Float32Array(texels * texels);
	for (let index = 0; index < texels * texels; index++) {
		out[index] = value;
	}
	return out;
}

// A foam field of its own, on its own grid over `size` studs, at one value everywhere: a bilinear
// sample of it is that value wherever it lands.
function field(texels, size, value) {
	const out = FoamField.newGrid(texels, size);
	for (let index = 0; index < texels * texels; index++) {
		out.foam[index] = value;
	}
	return out;
}

function params() {
	return { threshold: 0, feather: 0, laceSoft: 0, opacity: 1, r: 200, g: 220, b: 240 };
}

function smoothstep(t) {
	return t * t * (3 - 2 * t);
}

// The erosion cases paint the 8-texel map over a base of its own (ratio 2) from one field of four
// cells over the whole tile, through a lace built by hand. One grey under it, so a byte is the
// coverage alone; feather 1 over threshold 0 makes the veil the field's own value.
const EROSION_BASE = 4;
const EROSION_GREY = 20;

function erosionParams(laceSoft, opacity) {
	const p = params();
	p.feather = 1;
	p.laceSoft = laceSoft;
	p.opacity = opacity;
	return p;
}

// A 2 x 2 base whose four texels are distinct greys, so a bilinear sample is checkable.
function base() {
	const out = new Uint8Array(BASE * BASE * 3);
	const greys = [0, 80, 160, 240]; // texels (0,0), (1,0), (0,1), (1,1)
	greys.forEach((grey, index) => {
		const offset = index * 3;
		out[offset] = grey;
		out[offset + 1] = grey;
		out[offset + 2] = grey;
	});
	return out;
}

// One grey everywhere, for the cases that read a byte as the coverage alone.
function greyBase(texels, grey) {
	const out = new Uint8Array(texels * texels * 3);
	for (let index = 0; index < texels * texels; index++) {
		const offset = index * 3;
		out[offset] = grey;
		out[offset + 1] = grey;
		out[offset + 2] = grey;
	}
	return out;
}

// Texel (2, 2) of the 8-map at u = v = 0.125 on the 2-texel base: mostly texel (0,0), an eighth
// toward (1,0) and (0,1). The bilinear is 30 exactly there, so the rounded byte is the lerp's foot.
function baseRed() {
	return Math.floor(
		0 * 0.875 * 0.875 + 80 * 0.125 * 0.875 + 160 * 0.875 * 0.125 + 240 * 0.125 * 0.125 + 0.5,
	);
}

test('a band writes its rows at a band-relative offset with alpha 255', () => {
	const out = new Uint8Array(COLOUR * 2 * 4); // two rows
	const fields = [field(BASE, TILE, 0)]; // no foam, so the bytes are the base
	FoamPaint.band(out, COLOUR, 2, 2, base(), BASE, fields, TILE, params(), null);
	// Row 2 of the 8-map is the first row of the band buffer.
	for (let i = 0; i < COLOUR; i++) {
		expect.equal(out[(0 * COLOUR + i) * 4 + 3], 255, `alpha at ${i}`);
	}
});

test('with no foam the bytes are the bilinear base colour, wrapping at the edges', () => {
	const out = new Uint8Array(COLOUR * COLOUR * 4);
	const fields = [field(BASE, TILE, 0)];
	FoamPaint.band(out, COLOUR, 0, COLOUR, base(), BASE, fields, TILE, params(), null);
	expect.equal(out[(2 * COLOUR + 2) * 4], baseRed(), 'texel (2,2) red');
	// Texel (0, 0): u = -0.375, wrapping to the last column: between base (1,0)/(0,0) and rows 1/0.
	const u = -0.375;
	const v = -0.375;
	const fu = u - Math.floor(u); // 0.625 each, from column 1 toward column 0
	const fv = v - Math.floor(v);
	const expected0 = Math.floor(
		240 * (1 - fu) * (1 - fv) + 160 * fu * (1 - fv) + 80 * (1 - fu) * fv + 0 * fu * fv + 0.5,
	);
	expect.equal(out[0], expected0, 'texel (0,0) wraps to the last column and row');
});

test('full foam paints the foam colour and half foam the rounded midpoint', () => {
	const out = new Uint8Array(COLOUR * COLOUR * 4);
	// A uniform field of 1 samples 1 everywhere, and feather 0 is a hard threshold.
	FoamPaint.band(out, COLOUR, 0, COLOUR, base(), BASE, [field(BASE, TILE, 1)], TILE, params(), null);
	expect.equal(out[(5 * COLOUR + 3) * 4], 200, 'full foam red');
	expect.equal(out[(5 * COLOUR + 3) * 4 + 1], 220, 'full foam green');
	// Half foam: threshold 0, feather 1, so the coverage at a sum of 0.5 is smoothstep(0.5) = 0.5.
	const soft = params();
	soft.feather = 1;
	FoamPaint.band(out, COLOUR, 0, COLOUR, base(), BASE, [field(BASE, TILE, 0.5)], TILE, soft, null);
	const red = baseRed();
	expect.equal(
		out[(2 * COLOUR + 2) * 4],
		Math.floor(red + (200 - red) * 0.5 + 0.5),
		'half foam red at (2,2)',
	);
});

test('the fields sum before the fade', () => {
	// Two cascades' fields at 0.4 each: the fade sees 0.8, which no single field could reach, and
	// a fill that took one field or the maximum of the two would stop at 0.4.
	const out = new Uint8Array(COLOUR * COLOUR * 4);
	const fields = [field(BASE, TILE, 0.4), field(BASE, TILE, 0.4)];
	const soft = params();
	soft.feather = 1;
	FoamPaint.band(out, COLOUR, 0, COLOUR, base(), BASE, fields, TILE, soft, null);
	const coverage = smoothstep(0.8); // 0.896
	const red = baseRed();
	expect.equal(
		out[(2 * COLOUR + 2) * 4],
		Math.floor(red + (200 - red) * coverage + 0.5),
		'the summed coverage at (2,2)',
	);
});

test('a finer field tiles inside the map', () => {
	// A 2 x 2 field over HALF the tile: its four texels repeat twice across the map, so two colour
	// texels four studs apart sample the same place in it. The base is one grey here, so the byte
	// is the coverage alone.
	const out = new Uint8Array(COLOUR * COLOUR * 4);
	const fine = FoamField.newGrid(2, TILE / 2);
	fine.foam[0] = 1; // cell (0, 0) of the four, at the field's own origin
	const soft = params();
	soft.feather = 1;
	const grey = 40;
	FoamPaint.band(out, COLOUR, 0, COLOUR, greyBase(BASE, grey), BASE, [fine], TILE, soft, null);
	// The field's cells sit two studs apart, at 0 and 2 along each axis of its four-stud tile.
	// Colour texel (0, 0) sits at (0.5, 0.5) studs: a quarter of a cell from the foamed one on each
	// axis, so it takes 0.75 x 0.75 of it. Texel (4, 0) is the same point one tile of the field along.
	const near = Math.floor(grey + (200 - grey) * smoothstep(0.5625) + 0.5);
	expect.equal(out[0], near, 'texel (0,0)');
	expect.equal(out[(0 * COLOUR + 4) * 4], near, 'texel (4,0), one field tile along');
	// Texel (2, 0) is inside the same colour map and the same base texel, but it falls on the far
	// side of the field's own wrap: a quarter of the foamed cell rather than nine sixteenths.
	const far = Math.floor(grey + (200 - grey) * smoothstep(0.1875) + 0.5);
	expect.equal(out[(0 * COLOUR + 2) * 4], far, 'texel (2,0)');
});

test("a band writes its coverage at the map's absolute rows", () => {
	const out = new Uint8Array(COLOUR * 4 * 4); // the lower half of the 8-map, four rows
	const one = FoamField.newGrid(BASE, TILE);
	one.foam[1 * BASE + 1] = 1; // the field's texel (1,1) foamed
	const coverage = flat(BASE, -1);
	FoamPaint.band(out, COLOUR, 4, 4, base(), BASE, [one], TILE, params(), null, coverage);
	// The bytes are band-relative but the coverage is not. Base texel (1,1)'s subsample is colour
	// texel (6,6), which sits between the field's foamed cell at (4,4) studs and its wrap at (8,8)
	// and so carries some of it; this band paints that row, so its coverage is written. Base texel
	// (0,0)'s subsample is colour texel (2,2), two rows above the band, so the sentinel there
	// survives. A coverage row taken from the band instead of the map would have put (6,6)'s answer
	// into (0,0).
	expect.equal(coverage[1 * BASE + 1], 1, '(1,1) written by this band');
	expect.equal(coverage[0], -1, '(0,0) left to the band that holds its row');
});

test('lace stays in 0 .. 1, is ridged, tiles and is deterministic', () => {
	const texels = 16;
	const one = FoamPaint.lace(texels, 4, 7, 2, 0.5);
	const at = (i, j) => one[j * texels + i];
	let total = 0;
	for (let index = 0; index < texels * texels; index++) {
		const value = one[index];
		expect.truthy(value >= 0 && value <= 1, `texel ${index} reads ${value}, outside 0 .. 1`);
		total += value;
	}
	// The ridge fold turns the dark half of the noise back up, so the texture sits well above the
	// mid grey a plain value noise would average to.
	expect.truthy(total / (texels * texels) > 0.4, 'the mean of a ridged texture');
	// The lattice wraps, so the last column and the first are neighbours like any other pair: the
	// seam is no wider a step than the widest one inside the row.
	for (let j = 0; j < texels; j++) {
		let widest = 0;
		for (let i = 0; i <= texels - 2; i++) {
			widest = Math.max(widest, Math.abs(at(i + 1, j) - at(i, j)));
		}
		const seam = Math.abs(at(texels - 1, j) - at(0, j));
		expect.truthy(seam <= widest, `row ${j} steps ${seam} at the seam against ${widest} inside`);
	}
	const two = FoamPaint.lace(texels, 4, 7, 2, 0.5);
	for (let index = 0; index < texels * texels; index++) {
		expect.equal(two[index], one[index], `texel ${index} of a second call`);
	}
	// Four octaves off four cells want a 32-cell lattice, which 16 texels cannot carry.
	expect.equal(pcall(FoamPaint.lace, texels, 4, 7, 4, 0.5), false, 'a lattice finer than the texels');
});

test('the erosion shows filaments at thin coverage and solid foam at full', () => {
	const out = new Uint8Array(COLOUR * COLOUR * 4);
	const lace = flat(COLOUR, 0);
	lace[0] = 0.9; // texel (0, 0): a bright filament
	lace[1] = 0.1; // texel (1, 0): a faint one
	const soft = erosionParams(0.3, 1);
	const grey = greyBase(EROSION_BASE, EROSION_GREY);
	// A full veil puts the water line at 0, so the lace itself is what is left, spread over
	// laceSoft: 0.9 is three softs clear of the line and paints solid, 0.1 a third of one.
	const full = [field(EROSION_BASE, TILE, 1)];
	FoamPaint.band(out, COLOUR, 0, COLOUR, grey, EROSION_BASE, full, TILE, soft, lace);
	expect.near(out[0], 200, 1, 'the bright filament under a full veil');
	const third = EROSION_GREY + (200 - EROSION_GREY) / 3;
	expect.near(out[1 * 4], third, 1, 'the faint one, a third of the way');
	// Half a veil lifts the water line to 0.5: the bright filament still stands clear of it, the
	// faint one is under water and the base shows through. That is the lace at thin coverage.
	const half = [field(EROSION_BASE, TILE, 0.5)];
	FoamPaint.band(out, COLOUR, 0, COLOUR, grey, EROSION_BASE, half, TILE, soft, lace);
	expect.near(out[0], 200, 1, 'the bright filament under half a veil');
	expect.near(out[1 * 4], EROSION_GREY, 1, 'the faint one is gone');
});

test('opacity caps the coverage and the coverage buffer carries the eroded value', () => {
	const out = new Uint8Array(COLOUR * COLOUR * 4);
	const coverage = flat(EROSION_BASE, -1);
	const soft = erosionParams(0.3, 0.7);
	const grey = greyBase(EROSION_BASE, EROSION_GREY);
	const full = [field(EROSION_BASE, TILE, 1)];
	// A lace of 1 everywhere erodes nothing: what is left is the opacity itself.
	FoamPaint.band(out, COLOUR, 0, COLOUR, grey, EROSION_BASE, full, TILE, soft, flat(COLOUR, 1), coverage);
	const capped = EROSION_GREY + (200 - EROSION_GREY) * 0.7;
	for (let index = 0; index < COLOUR * COLOUR; index++) {
		expect.near(out[index * 4], capped, 1, `colour texel ${index}`);
	}
	for (let index = 0; index < EROSION_BASE * EROSION_BASE; index++) {
		expect.near(coverage[index], 0.7, 1e-6, `base texel ${index}`);
	}
});

test('no lace paints the veil times the opacity', () => {
	const out = new Uint8Array(COLOUR * COLOUR * 4);
	// laceSoft is set and goes unread: with no texture there is nothing to erode.
	const soft = erosionParams(0.3, 0.5);
	const grey = greyBase(EROSION_BASE, EROSION_GREY);
	const full = [field(EROSION_BASE, TILE, 1)];
	FoamPaint.band(out, COLOUR, 0, COLOUR, grey, EROSION_BASE, full, TILE, soft, null);
	const midpoint = EROSION_GREY + (200 - EROSION_GREY) * 0.5;
	expect.near(out[0], midpoint, 1, 'the midpoint at texel (0,0)');
	expect.near(out[(5 * COLOUR + 3) * 4], midpoint, 1, 'and at (3,5)');
});

test('laceSoft 0 with a lace paints the veil times the opacity', () => {
	const out = new Uint8Array(COLOUR * COLOUR * 4);
	// The switch from the other side: a lace is handed over and laceSoft 0 says to leave it alone,
	// where the case above hands over none at all. A lace of 0 everywhere would erode the veil to
	// nothing if it were read, so the grey would show through instead of the midpoint.
	const soft = erosionParams(0, 0.5);
	const grey = greyBase(EROSION_BASE, EROSION_GREY);
	const full = [field(EROSION_BASE, TILE, 1)];
	FoamPaint.band(out, COLOUR, 0, COLOUR, grey, EROSION_BASE, full, TILE, soft, flat(COLOUR, 0));
	const midpoint = EROSION_GREY + (200 - EROSION_GREY) * 0.5;
	expect.near(out[0], midpoint, 1, 'the midpoint at texel (0,0)');
	expect.near(out[(5 * COLOUR + 3) * 4], midpoint, 1, 'and at (3,5)');
});

// Not in the Luau, whose buffer writes error past the end: a typed array drops them instead, so a
// short band buffer or base would paint a partial map without a word. Checked once per band.
test('an undersized band buffer or base throws', () => {
	const fields = [field(BASE, TILE, 0)];
	const shortOut = new Uint8Array(COLOUR * 2 * 4 - 1); // two rows need COLOUR * 2 * 4 bytes
	expect.truthy(!pcall(FoamPaint.band, shortOut, COLOUR, 2, 2, base(), BASE, fields, TILE, params(), null), 'short out');
	const shortBase = new Uint8Array(BASE * BASE * 3 - 1);
	const out = new Uint8Array(COLOUR * 2 * 4);
	expect.truthy(!pcall(FoamPaint.band, out, COLOUR, 2, 2, shortBase, BASE, fields, TILE, params(), null), 'short base');
	expect.truthy(pcall(FoamPaint.band, out, COLOUR, 2, 2, base(), BASE, fields, TILE, params(), null), 'exact sizes paint');
});
