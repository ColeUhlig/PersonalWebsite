import { test } from 'node:test';
import * as expect from '../expect.js';
import * as RingLayout from '../../../content/ocean/js/core/ringLayout.js';
import { mod } from '../../../content/ocean/js/core/luau.js';

function ring(spacing, halfExtent) {
	return { spacing, halfExtent, cascades: [1], jacobian: false };
}

function spec(rings, cells) {
	return { rings, patchCells: cells, textureTile: 256 };
}

// Luau's `pcall(f, ...)`: true when the call returns, false when it throws.
function pcall(fn, ...args) {
	try {
		fn(...args);
		return true;
	} catch {
		return false;
	}
}

// The High tier's ladder, so this file's counts and Tier.spec's vertex count are the same
// numbers. Every ring is a full square: 4 x 4, 4 x 4, 8 x 8, 8 x 8, 8 x 8 patches.
const HIGH = spec([ring(2, 32), ring(4, 64), ring(8, 256), ring(16, 512), ring(32, 1024)], 8);

// Every pair of patches IN THE SAME RING must be separated along at least one axis. Rings do
// overlap each other now: each covers its whole window, and the sampler drops the vertices a
// finer ring already owns into the skirt.
function expectNoOverlap(layout) {
	for (const patch of layout.patches) {
		const half = (patch.cells * patch.spacing) / 2;
		for (const other of layout.patches) {
			if (other !== patch && other.ring === patch.ring) {
				const otherHalf = (other.cells * other.spacing) / 2;
				const apart =
					Math.abs(patch.centreX - other.centreX) >= half + otherHalf - 1e-9 ||
					Math.abs(patch.centreZ - other.centreZ) >= half + otherHalf - 1e-9;
				expect.truthy(apart, `patches overlap at (${patch.centreX}, ${patch.centreZ})`);
			}
		}
	}
}

test('the high layout has 224 patches of 81 vertices', () => {
	const layout = RingLayout.build(HIGH);
	expect.equal(layout.patches.length, 224, 'patches');
	expect.equal(layout.vertexCount, 224 * 81, 'vertices');
	const perRing = {};
	for (const patch of layout.patches) {
		perRing[patch.ring] = (perRing[patch.ring] ?? 0) + 1;
	}
	let total = 0;
	HIGH.rings.forEach((ringSpec, i) => {
		const index = i + 1;
		const perSide = (2 * ringSpec.halfExtent) / (HIGH.patchCells * ringSpec.spacing);
		expect.equal(perRing[index], perSide * perSide, `ring ${index} is a full ${perSide} x ${perSide}`);
		total += perSide * perSide;
	});
	expect.equal(total, 224, '16 + 16 + 64 + 64 + 64');
});

test('patches tile each ring without overlap or gaps', () => {
	const layout = RingLayout.build(HIGH);
	const area = {};
	for (const patch of layout.patches) {
		const size = patch.cells * patch.spacing;
		area[patch.ring] = (area[patch.ring] ?? 0) + size * size;
	}
	expectNoOverlap(layout);
	layout.spec.rings.forEach((ringSpec, i) => {
		const index = i + 1;
		const side = 2 * ringSpec.halfExtent;
		expect.near(area[index], side * side, 1e-6, `ring ${index} covers its whole square`);
	});
});

test('local vertex offsets span the patch and are centred', () => {
	const layout = RingLayout.build(HIGH);
	const patch = layout.patches[0];
	const size = patch.cells * patch.spacing;
	expect.equal(patch.localX.length, 81, 'count');
	expect.near(patch.localX[RingLayout.vertexIndex(8, 0, 0) - 1], -size / 2, 1e-12, 'first column');
	expect.near(patch.localX[RingLayout.vertexIndex(8, 8, 3) - 1], size / 2, 1e-12, 'last column');
	expect.near(patch.localZ[RingLayout.vertexIndex(8, 3, 8) - 1], size / 2, 1e-12, 'last row');
	expect.near(patch.localZ[RingLayout.vertexIndex(8, 4, 4) - 1], 0, 1e-12, 'centre');
});

test('seams sit on edges facing a coarser ring and average even neighbours', () => {
	const layout = RingLayout.build(HIGH);
	const counted = { boundary: 0, interior: 0, last: 0 };
	for (const patch of layout.patches) {
		const half = (patch.cells * patch.spacing) / 2;
		const outer = layout.spec.rings[patch.ring - 1].halfExtent;
		const onBoundary =
			Math.abs(Math.abs(patch.centreX) + half - outer) < 1e-9 ||
			Math.abs(Math.abs(patch.centreZ) + half - outer) < 1e-9;
		if (patch.ring === layout.spec.rings.length) {
			expect.equal(patch.seams.length, 0, 'the last ring has no seams');
			counted.last += 1;
		} else if (onBoundary) {
			expect.truthy(
				patch.seams.length === 4 || patch.seams.length === 8,
				`boundary patch has ${patch.seams.length} seams`,
			);
			counted.boundary += 1;
		} else {
			// Including the patches over the finer ring: a ring has no inner edge any more, so
			// nothing inside its window is seamed.
			expect.equal(patch.seams.length, 0, 'interior patch has no seams');
			counted.interior += 1;
		}
		for (const seam of patch.seams) {
			expect.near(
				patch.localX[seam.index - 1],
				(patch.localX[seam.a - 1] + patch.localX[seam.b - 1]) / 2,
				1e-12,
				'seam x midpoint',
			);
			expect.near(
				patch.localZ[seam.index - 1],
				(patch.localZ[seam.a - 1] + patch.localZ[seam.b - 1]) / 2,
				1e-12,
				'seam z midpoint',
			);
			// The even neighbours coincide with the coarser ring's lattice (spacing 2s).
			const coarse = 2 * patch.spacing;
			expect.near(
				mod(patch.centreX + patch.localX[seam.a - 1], coarse),
				0,
				1e-9,
				'neighbour a on the coarse lattice',
			);
			expect.near(
				mod(patch.centreZ + patch.localZ[seam.b - 1], coarse),
				0,
				1e-9,
				'neighbour b on the coarse lattice',
			);
		}
	}
	expect.equal(counted.last, 64, 'last ring patches');
	expect.equal(counted.boundary, 80, '12 + 12 + 28 + 28 patches touch their ring\'s outer edge');
	expect.equal(counted.interior, 80, '4 + 4 + 36 + 36 patches are inside their ring');
});

test("windowCentre snaps to twice the ring's spacing", () => {
	let [x, z] = RingLayout.windowCentre(13, -9, 2);
	expect.equal(x, 12, 'x snaps to a multiple of 4');
	expect.equal(z, -8, 'z snaps to a multiple of 4');
	[x, z] = RingLayout.windowCentre(13, -9, 8);
	expect.equal(x, 16, 'a coarser ring snaps to a multiple of 16');
	expect.equal(z, -16, 'z on the coarser lattice');
	[x, z] = RingLayout.windowCentre(6, 6, 4);
	expect.equal(x, 8, 'half rounds up');
	expect.equal(z, 8, 'half rounds up in z');
	// Whatever the focus, a ring's centre is a multiple of twice its spacing (so the window's
	// edges land on the next ring's lattice) and the focus is never more than one cell from it.
	for (const spacing of [2, 4, 8, 16, 32]) {
		for (const focus of [-1234.7, -3, 0, 0.5, 77.2, 1e5]) {
			const [centreX, centreZ] = RingLayout.windowCentre(focus, -focus, spacing);
			expect.near(mod(centreX, 2 * spacing), 0, 1e-9, `centre x is a multiple of ${2 * spacing}`);
			expect.near(mod(centreZ, 2 * spacing), 0, 1e-9, `centre z is a multiple of ${2 * spacing}`);
			expect.truthy(
				Math.abs(centreX - focus) <= spacing + 1e-9,
				`the focus is within a cell of the centre at spacing ${spacing}`,
			);
		}
	}
});

test('rejects rings that do not double or do not tile', () => {
	expect.truthy(!pcall(RingLayout.build, spec([ring(2, 32), ring(8, 64)], 8)), 'spacing must double');
	expect.truthy(
		!pcall(RingLayout.build, spec([ring(2, 40)], 8)),
		'extent must be a multiple of the patch size',
	);
	expect.truthy(!pcall(RingLayout.build, spec([ring(2, 32), ring(4, 32)], 8)), 'extent must grow');
	expect.truthy(
		!pcall(RingLayout.build, spec([ring(2, 64), ring(4, 32)], 8)),
		'a ring may not end inside the one before it',
	);
	expect.truthy(!pcall(RingLayout.build, spec([ring(2, 32)], 7)), 'patch cells must be even');
	// A ring's extent no longer has to be tiled by the NEXT ring's patches: ring 2 draws its
	// whole square and skirts whatever ring 1 covers, so there is no hole to tile.
	expect.truthy(
		pcall(RingLayout.build, spec([ring(2, 16), ring(4, 64)], 8)),
		"a ring need not be tiled by the next ring's patches",
	);
});

test('a ring may be several patches wide', () => {
	const layout = RingLayout.build(spec([ring(2, 32), ring(4, 96)], 8));
	// Keyed by the Luau ring number (1-based), read at [ring - 1].
	const perRing = [0, 0];
	const seamed = [0, 0];
	for (const patch of layout.patches) {
		perRing[patch.ring - 1] += 1;
		if (patch.seams.length > 0) {
			seamed[patch.ring - 1] += 1;
			expect.truthy(
				patch.seams.length === 4 || patch.seams.length === 8,
				`patch has ${patch.seams.length} seams`,
			);
		}
	}
	expect.equal(layout.patches.length, 52, 'patches');
	expect.equal(perRing[0], 16, 'ring 1 is a full 4 x 4');
	expect.equal(perRing[1], 36, 'ring 2 is a full 6 x 6, a patch wider on every side');
	expect.equal(seamed[0], 12, "ring 1's boundary patches still face the coarser ring");
	expect.equal(seamed[1], 0, 'the outermost ring has no seams however wide it is');
	expectNoOverlap(layout);
});

// The refresh schedule, which used to live as a private function inside Surface and so had no
// spec of its own. Every ring is written every frame EXCEPT the outermost, which takes the even
// frames (`outerRate=1/2` on the tier line). Cole judged the mid-distance water choppy on
// 2026-09-19 when rings 3 and 4 ran at 30 Hz and ring 5 at 20 Hz, and the machine had headroom,
// so everything but the outermost went back to 60 Hz.
function pattern(index, ringCount) {
	const frames = [];
	for (let frame = 1; frame <= 6; frame++) {
		frames.push(RingLayout.writesRing(index, ringCount, frame) ? '1' : '0');
	}
	return frames.join('');
}

test('writesRing halves the outermost ring and nothing else', () => {
	for (let index = 1; index <= 4; index++) {
		expect.equal(pattern(index, 5), '111111', `High ring ${index} is written every frame`);
	}
	expect.equal(pattern(5, 5), '010101', 'the outermost ring takes the even frames');
	expect.equal(pattern(3, 4), '111111', 'a four-ring tier: ring 3 every frame');
	expect.equal(pattern(4, 4), '010101', 'a four-ring tier: the outermost alternates');
});

test('writesRing writes everything when there is only one ring', () => {
	expect.equal(pattern(1, 1), '111111', 'a one-ring tier has nothing to spare');
	// Two rings is the smallest ladder: the finest every frame, the outermost alternating.
	expect.equal(pattern(1, 2), '111111', 'two rings: the finest is never skipped');
	expect.equal(pattern(2, 2), '010101', 'two rings: the outermost alternates');
});

test('only the outermost ring is ever skipped', () => {
	for (const ringCount of [2, 3, 4, 5, 6]) {
		let outer = 0;
		for (let frame = 1; frame <= 60; frame++) {
			for (let index = 1; index <= ringCount - 1; index++) {
				expect.truthy(
					RingLayout.writesRing(index, ringCount, frame),
					`ringCount ${ringCount} frame ${frame}: ring ${index} was skipped`,
				);
			}
			if (RingLayout.writesRing(ringCount, ringCount, frame)) {
				outer += 1;
			}
		}
		expect.equal(outer, 30, `ringCount ${ringCount}: the outermost is written half the frames`);
	}
});

test('snapping lands on whole steps and UVs stay small', () => {
	const [ox, oz] = RingLayout.snapOrigin(1234.6, -77.1, 2);
	expect.equal(ox, 1234, 'x snaps to the nearest step');
	expect.equal(oz, -78, 'z snaps to the nearest step');
	const [bx, bz] = RingLayout.uvBase(1234, -78, 256);
	expect.equal(bx, 1024, 'x base is a whole tile');
	expect.equal(bz, -256, 'z base is a whole tile');
	const uv = RingLayout.uv(1234 + 500, -78 + 3, bx, bz, 256);
	expect.near(uv[0], (1234 + 500 - 1024) / 256, 1e-12, 'u');
	expect.near(uv[1], (-78 + 3 + 256) / 256, 1e-12, 'v');
	expect.truthy(uv[0] < 12 && uv[1] < 12, 'values stay within a few tiles');
});
