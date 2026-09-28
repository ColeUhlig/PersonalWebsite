import { test } from 'node:test';
import * as expect from '../expect.js';
import * as NormalTexels from '../../../content/ocean/js/core/normalTexels.js';
import { clamp } from '../../../content/ocean/js/core/luau.js';

const TEXELS = 4; // a 4 x 4 block map, so a texel is 2 studs of the block
const BLOCK = 8;
const SLOPE_X = 0.25;
const SLOPE_Z = -0.5;

// Luau's `pcall(f, ...)`: true when the call returns, false when it throws.
function pcall(fn, ...args) {
	try {
		fn(...args);
		return true;
	} catch {
		return false;
	}
}

// A 4 x 4 cascade over 8 studs carrying the same slopes at every cell, so a bilinear sample
// anywhere returns them exactly and one normal is the answer at every texel. The heights and
// displacements are the same synthetic fields as the PeakMask spec and go unread here: the normal
// bytes come from the slopes alone.
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
			f.slopeX[index] = SLOPE_X;
			f.slopeZ[index] = SLOPE_Z;
		}
	}
	return f;
}

// The module's own rounding: half up and clamped to a byte.
function byte(value) {
	return clamp(Math.floor(value * 255 + 0.5), 0, 255);
}

// The module's own normalisation, in its order, so the expected bytes match it bit for bit.
function normalise(x, y, z) {
	const inverse = 1 / Math.sqrt(x * x + y * y + z * z);
	return [x * inverse, y * inverse, z * inverse];
}

// One texel: R from n.x, G from n.z, B from n.y, each * 0.5 + 0.5, and an opaque alpha.
function encoded(out, i, j, nx, ny, nz, label) {
	const offset = (j * TEXELS + i) * 4;
	expect.equal(out[offset], byte(nx * 0.5 + 0.5), `${label} red`);
	expect.equal(out[offset + 1], byte(nz * 0.5 + 0.5), `${label} green`);
	expect.equal(out[offset + 2], byte(ny * 0.5 + 0.5), `${label} blue`);
	expect.equal(out[offset + 3], 255, `${label} alpha`);
}

test('bytes encode the unit normal of the summed slope', () => {
	const f = fields();
	const out = new Uint8Array(TEXELS * TEXELS * 4);
	NormalTexels.fill(out, TEXELS, BLOCK, [f], [1]);
	// The surface leans against its slopes: the normal is (-slopeX, 1, -slopeZ), normalised.
	const [nx, ny, nz] = normalise(-SLOPE_X, 1, -SLOPE_Z);
	for (let j = 0; j <= TEXELS - 1; j++) {
		for (let i = 0; i <= TEXELS - 1; i++) {
			encoded(out, i, j, nx, ny, nz, `texel ${i},${j}`);
		}
	}
	// The bytes this slope comes to, so a changed encoding fails here even if the helpers
	// above change with it.
	expect.equal(out[0], 100, 'red is the x tilt');
	expect.equal(out[1], 183, 'green is the z tilt');
	expect.equal(out[2], 239, 'blue is mostly up');
});

test('two cascades add their slopes', () => {
	const f = fields();
	const out = new Uint8Array(TEXELS * TEXELS * 4);
	// The same field listed twice, so the summed slope is double one cascade's.
	NormalTexels.fill(out, TEXELS, BLOCK, [f, f], [1, 2]);
	const [nx, ny, nz] = normalise(-2 * SLOPE_X, 1, -2 * SLOPE_Z);
	for (let j = 0; j <= TEXELS - 1; j++) {
		for (let i = 0; i <= TEXELS - 1; i++) {
			encoded(out, i, j, nx, ny, nz, `texel ${i},${j}`);
		}
	}
	// A steeper slope tilts the normal further off vertical: blue drops from 239 to 212.
	// The two 212s sit on a rounding TIE and are pinned as the module computes them, not as
	// exact arithmetic would: the normal here is (-1/3, 2/3, 2/3), so green and blue both encode
	// 2/3 * 0.5 + 0.5 = 5/6, and 5/6 * 255 is exactly 212.5, which half-up rounding would send to
	// 213. In doubles 1 / sqrt(2.25) lands just BELOW 2/3, so the product falls just under the tie
	// and floor(x + 0.5) gives 212. An equivalent re-association of the encode that landed just
	// above the tie would read 213 and fail here; that is a rounding difference of one byte, not
	// a regression, and this comment is the place to say so before the number is changed.
	expect.equal(out[0], 85, 'red is the doubled x tilt');
	expect.equal(out[1], 212, 'green is the doubled z tilt');
	expect.equal(out[2], 212, 'blue leans further over');
});

test('tile copies the block into every quadrant', () => {
	const block = new Uint8Array(2 * 2 * 4);
	for (let offset = 0; offset <= 2 * 2 * 4 - 1; offset++) {
		block[offset] = 10 + offset; // four texels, no two bytes alike
	}
	const image = new Uint8Array(4 * 4 * 4);
	NormalTexels.tile(block, 2, image, 4);
	for (let j = 0; j <= 3; j++) {
		for (let i = 0; i <= 3; i++) {
			// j, i >= 0, so JavaScript's % matches Luau's here.
			const from = ((j % 2) * 2 + (i % 2)) * 4;
			const to = (j * 4 + i) * 4;
			for (let channel = 0; channel <= 3; channel++) {
				expect.equal(
					image[to + channel],
					block[from + channel],
					`texel ${i},${j} channel ${channel}`,
				);
			}
		}
	}
	// A block that does not divide the image would tile off the end of a row.
	const ok = pcall(NormalTexels.tile, block, 2, new Uint8Array(3 * 3 * 4), 3);
	expect.equal(ok, false, 'an image that is not a whole number of blocks is refused');
});

// The Luau case sets the module's FLIP_G field and puts it back; an ES module's export cannot be
// reassigned from outside, so the switch is fill's trailing `flipG` argument and there is nothing
// to put back.
test('FLIP_G mirrors the green channel', () => {
	expect.equal(NormalTexels.FLIP_G, false, 'the flag is off by default');
	const f = fields();
	const plain = new Uint8Array(TEXELS * TEXELS * 4);
	NormalTexels.fill(plain, TEXELS, BLOCK, [f], [1]);
	const flipped = new Uint8Array(TEXELS * TEXELS * 4);
	NormalTexels.fill(flipped, TEXELS, BLOCK, [f], [1], true);
	for (let j = 0; j <= TEXELS - 1; j++) {
		for (let i = 0; i <= TEXELS - 1; i++) {
			const offset = (j * TEXELS + i) * 4;
			const label = `texel ${i},${j}`;
			const green = plain[offset + 1];
			expect.equal(flipped[offset], plain[offset], `${label} red`);
			// Mirroring a byte is off by one wherever the unflipped value rounded on a tie.
			expect.near(flipped[offset + 1], 255 - green, 1, `${label} green`);
			expect.equal(flipped[offset + 2], plain[offset + 2], `${label} blue`);
			expect.equal(flipped[offset + 3], 255, `${label} alpha`);
		}
	}
});
