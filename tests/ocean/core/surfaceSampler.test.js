import { test } from 'node:test';
import * as expect from '../expect.js';
import * as Cascade from '../../../content/ocean/js/core/cascade.js';
import * as FieldStore from '../../../content/ocean/js/core/fieldStore.js';
import * as RingLayout from '../../../content/ocean/js/core/ringLayout.js';
import * as Spectrum from '../../../content/ocean/js/core/spectrum.js';
import * as SurfaceSampler from '../../../content/ocean/js/core/surfaceSampler.js';
import * as Swells from '../../../content/ocean/js/core/swells.js';
import * as WaveField from '../../../content/ocean/js/core/waveField.js';
import { check, clamp } from '../../../content/ocean/js/core/luau.js';

const N = 32;
const SIZES = [256, 128, 64];
const SWELLS = [
	{ wavelength: 400, amplitude: 1.2, direction: 0.2, phase: 0 },
	{ wavelength: 230, amplitude: 0.6, direction: -0.3, phase: 1 },
];
const T = 3;
const CHOP = 1.5;
// The depth the engine drops a vertex a finer ring already covers to. Any value inside the
// part's box will do; the sampler only writes it.
const SKIRT_Y = -30;
// The last ring's flatten band, in studs: two of that ring's own cells (the sampler's
// `2 * ringSpec.spacing`), restated here so the cases below say what weight they expect instead
// of reading it back from the module. This layout's last ring has 4-stud cells, so 8.
const FLATTEN_BAND = 8;

// "Is this a unit vector" is checked to 1e-6, not 1e-9: a Vector3 stores float32 components,
// so .Unit lands up to about 1.5 float32 ulp (1.8e-7 measured over 20,000 random normals) away
// from length 1 whatever the maths behind it. 1e-6 is the tolerance every spec in this repo uses
// for a length or a component that has been through .Unit.
// Anything that has been through .Unit is compared at 1e-6 for the same reason; comparisons
// between two Vector3 values that were not normalised stay at 1e-9.

// The Luau spec's Vector3 values, as [x, y, z]. Vector3 stores float32 components, so every
// constructor and every arithmetic result rounds to float32 here too, as Vector3.new would; the
// sampler's Float32Array stores round the same way. `at` reads vertex v (Luau index) of a
// positions or normals array, stored at (v - 1) * 3.
const f32 = Math.fround;

function vector3(x, y, z) {
	return [f32(x), f32(y), f32(z)];
}

function at(array, v) {
	const o = (v - 1) * 3;
	return [array[o], array[o + 1], array[o + 2]];
}

function add(a, b) {
	return vector3(a[0] + b[0], a[1] + b[1], a[2] + b[2]);
}

function sub(a, b) {
	return vector3(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

function scale(a, s) {
	return vector3(a[0] * s, a[1] * s, a[2] * s);
}

function magnitude(a) {
	return Math.sqrt(a[0] * a[0] + a[1] * a[1] + a[2] * a[2]);
}

function unit(a) {
	const length = magnitude(a);
	return vector3(a[0] / length, a[1] / length, a[2] / length);
}

// Vector3 ==: componentwise.
function same(a, b) {
	return a[0] === b[0] && a[1] === b[1] && a[2] === b[2];
}

const Y_AXIS = [0, 1, 0];

// A store whose display tables equal a WaveField's cascades at time T (blend fraction 1).
function storeFrom(field) {
	const store = FieldStore.create(N, SIZES);
	const packed = new Float32Array(FieldStore.bufferSize(N * N) / 4);
	field.cascades.forEach((cascade, i) => {
		const index = i + 1;
		WaveField.update(field, index, T);
		FieldStore.pack(cascade, packed);
		FieldStore.receive(store, index, packed, T);
		FieldStore.promote(store, index, 1);
		FieldStore.blend(store, index, 1);
	});
	return store;
}

function field() {
	return WaveField.create({
		params: Spectrum.NORMAL,
		n: N,
		sizes: SIZES,
		seed: 21,
		loopPeriod: 120,
		chop: CHOP,
		swells: SWELLS,
	});
}

const layout = RingLayout.build({
	rings: [
		{ spacing: 2, halfExtent: 32, cascades: [1, 2, 3], jacobian: true },
		{ spacing: 4, halfExtent: 64, cascades: [1], jacobian: false },
	],
	patchCells: 8,
	textureTile: 256,
});

// table.create(count, Vector3.zero), twice: xyz triples.
function arrays(count) {
	return [new Float32Array(count * 3), new Float32Array(count * 3)];
}

function patchAt(ring, centreX, centreZ) {
	for (const patch of layout.patches) {
		if (patch.ring === ring && patch.centreX === centreX && patch.centreZ === centreZ) {
			return patch;
		}
	}
	throw new Error(`no ring ${ring} patch at (${centreX}, ${centreZ})`);
}

// Ring fades. Ring 2 of this layout samples cascade 1 only, so ring 1's cascades 2 and 3 fade
// out over a band at ring 1's edge: the fade reaches 0 one cell INSIDE the ring's extent
// (where the boundary can be once the window snaps) and the distance is measured from the
// FOCUS, not from the window. `patches[6]` (Luau; `patches[5]` here) is the interior patch the
// first cases use; its centre is (-8, -8) and its vertices reach 16 studs from the centre in
// each axis, so with the focus on the window centre the largest distance any of its vertices
// reaches is max(|-8| + 8, |-8| + 8) = 16, inside 32 - 2 - 32/4 = 22. Every one of its vertices
// therefore has fade 1 and the pre-fade expectations still hold. The assertion below fails the
// suite if that ever stops being true.
function maxDistance(patch) {
	let largest = 0;
	for (let index = 1; index <= patch.localX.length; index++) {
		largest = Math.max(
			largest,
			Math.abs(patch.centreX + patch.localX[index - 1]),
			Math.abs(patch.centreZ + patch.localZ[index - 1]),
		);
	}
	return largest;
}

// A ring-1 spec that SAMPLES cascades 1 and 2 while its vertex normals take `normalCascades`
// only (nil means both, which is what every ring did before M3). The layout's own ring 1 samples
// three cascades and names no list, so the normal cases below build their ring instead of
// borrowing it; the spacing and extent are ring 1's, so the fade band is the one the layout's
// patches were placed against.
function twoCascadeRing(normalCascades) {
	const ring1 = layout.spec.rings[0];
	return {
		spacing: ring1.spacing,
		halfExtent: ring1.halfExtent,
		cascades: [1, 2],
		normalCascades,
		jacobian: false,
	};
}

// The swell height alone: the second value of Swells.sample.
function swellHeightOf(f) {
	return (x, z) => Swells.sample(f.swells, T, x, z, CHOP)[1];
}

test('a full-detail patch reproduces WaveField.sample at every vertex, minus seam averaging', () => {
	const f = field();
	const store = storeFrom(f);
	const patch = layout.patches[5]; // an interior ring-1 patch (no seams); see the assertions
	expect.equal(patch.seams.length, 0, 'interior patch');
	expect.equal(patch.centreX, -8, 'centre x');
	expect.equal(patch.centreZ, -8, 'centre z');
	const ring = layout.spec.rings[0];
	expect.truthy(
		maxDistance(patch) <= ring.halfExtent - ring.spacing - ring.halfExtent * 0.25,
		'every vertex of patch 6 is clear of the fade band, so its fade is 1',
	);
	const [positions, normals] = arrays(81);
	const originX = 100;
	const originZ = -40;
	SurfaceSampler.fill(
		patch,
		layout.spec.rings[0],
		layout.spec.rings[1],
		layout.spec.rings[0].halfExtent,
		store,
		f.swells,
		T,
		CHOP,
		originX,
		originZ,
		originX,
		originZ,
		0,
		0,
		0,
		SKIRT_Y,
		positions,
		normals,
	);
	for (let index = 1; index <= 81; index++) {
		const wx = originX + patch.centreX + patch.localX[index - 1];
		const wz = originZ + patch.centreZ + patch.localZ[index - 1];
		const [height, dispX, dispZ] = WaveField.sample(f, wx, wz, T);
		const p = at(positions, index);
		expect.near(p[1], height, 1e-6, `height[${index}]`);
		expect.near(p[0], patch.localX[index - 1] + dispX, 1e-6, `x[${index}]`);
		expect.near(p[2], patch.localZ[index - 1] + dispZ, 1e-6, `z[${index}]`);
		expect.near(magnitude(at(normals, index)), 1, 1e-6, `unit normal[${index}]`);
	}
});

// The normal must encode (cascade slope + swell slope). The swell half is what a sign error
// lands in, so it is derived here by finite difference of the swell height alone, never from
// the sampler's own nx/ny expression: flipping the sign in SurfaceSampler moves -n.X/n.Y by
// 2 * 0.0211 = 0.042, twenty times the tolerance, so this case fails if the sign regresses.
// The cascade half is read from the display tables' slope fields, which the sampler only sums.
// A finite difference of the *total* height cannot be used: the FFT slope fields are spectral
// derivatives, while a difference of the bilinearly sampled height is a chord slope across a
// 2 to 8 stud cell. At this vertex those are -0.0686 and -0.0203 -- a 0.048 gap that is
// inherent to bilinear sampling, not a defect, and would swamp the sign under test.
test('a normal follows the summed slopes and the swell normal', () => {
	const f = field();
	const store = storeFrom(f);
	const patch = layout.patches[5];
	const [positions, normals] = arrays(81);
	SurfaceSampler.fill(
		patch,
		layout.spec.rings[0],
		layout.spec.rings[1],
		layout.spec.rings[0].halfExtent,
		store,
		f.swells,
		T,
		CHOP,
		0,
		0,
		0,
		0,
		0,
		0,
		0,
		SKIRT_Y,
		positions,
		normals,
	);
	const index = 41;
	const wx = patch.centreX + patch.localX[index - 1];
	const wz = patch.centreZ + patch.localZ[index - 1];
	const e = 0.05;
	const swellHeight = swellHeightOf(f);
	const swellSlopeX = (swellHeight(wx + e, wz) - swellHeight(wx - e, wz)) / (2 * e);
	const swellSlopeZ = (swellHeight(wx, wz + e) - swellHeight(wx, wz - e)) / (2 * e);
	let cascadeSlopeX = 0;
	let cascadeSlopeZ = 0;
	for (let cascadeIndex = 1; cascadeIndex <= 3; cascadeIndex++) {
		const s = Cascade.sampleNoJacobian(store.display[cascadeIndex - 1], wx, wz);
		cascadeSlopeX += s[3];
		cascadeSlopeZ += s[4];
	}
	const n = at(normals, index);
	expect.near(
		-n[0] / n[1],
		cascadeSlopeX + swellSlopeX,
		2e-3,
		'normal x agrees with the summed height gradient',
	);
	expect.near(
		-n[2] / n[1],
		cascadeSlopeZ + swellSlopeZ,
		2e-3,
		'normal z agrees with the summed height gradient',
	);
});

// M3's normal map carries the fine cascades at the texel resolution of the 256-stud tile, so a
// ring samples them for HEIGHT and displacement and leaves them out of its vertex normals:
// `normalCascades` names the ones that tilt a vertex. Cascade 2 is sampled here and not listed,
// so its slopes must be missing from every normal while its displacement is still in every
// position -- the second fill, which lists nothing and so takes both, pins that half. Ring 2 of
// the layout samples cascade 1 alone, so cascade 2 fades at ring 1's edge; patch 6 is clear of
// that band (the assertion the first case makes), so every weight here is 1 and the expectation
// is the bare slope. The swell half is a finite difference of the swell height for the reason
// the case above gives, and carries the same tolerance.
test('vertex normals sum only the normalCascades slopes', () => {
	const f = field();
	const store = storeFrom(f);
	const patch = layout.patches[5];
	expect.equal(patch.seams.length, 0, 'interior patch: no seam averaging over these normals');
	const ring1 = layout.spec.rings[0];
	expect.truthy(
		maxDistance(patch) <= ring1.halfExtent - ring1.spacing - ring1.halfExtent * 0.25,
		'every vertex of patch 6 is clear of the fade band, so its fade is 1',
	);
	const [positions, normals] = arrays(81);
	const [bothPositions, bothNormals] = arrays(81);
	SurfaceSampler.fill(
		patch,
		twoCascadeRing([1]),
		layout.spec.rings[1],
		ring1.halfExtent,
		store,
		f.swells,
		T,
		CHOP,
		0,
		0,
		0,
		0,
		0,
		0,
		0,
		SKIRT_Y,
		positions,
		normals,
	);
	SurfaceSampler.fill(
		patch,
		twoCascadeRing(null),
		layout.spec.rings[1],
		ring1.halfExtent,
		store,
		f.swells,
		T,
		CHOP,
		0,
		0,
		0,
		0,
		0,
		0,
		0,
		SKIRT_Y,
		bothPositions,
		bothNormals,
	);
	const e = 0.05;
	const swellHeight = swellHeightOf(f);
	// Vertices whose normal MOVED when cascade 2 was added to the list. Without this the case
	// would still pass if cascade 2 were silent here (a flat field, a fade that zeroed it, a
	// sampler that never read it), because both fills would then agree with cascade 1 alone and
	// with each other. One vertex over the tolerance is enough to prove the two fills differ, so
	// the expectation above is a real exclusion rather than an accident.
	let moved = 0;
	for (let index = 1; index <= 81; index++) {
		const wx = patch.centreX + patch.localX[index - 1];
		const wz = patch.centreZ + patch.localZ[index - 1];
		const s = Cascade.sampleNoJacobian(store.display[0], wx, wz);
		const slopeX = s[3];
		const slopeZ = s[4];
		const swellSlopeX = (swellHeight(wx + e, wz) - swellHeight(wx - e, wz)) / (2 * e);
		const swellSlopeZ = (swellHeight(wx, wz + e) - swellHeight(wx, wz - e)) / (2 * e);
		// A normal encodes the NEGATED gradient, which is why the swell half is subtracted here
		// and added in the case above (it compares -n.X/n.Y, the gradient itself).
		const want = unit(vector3(-(slopeX + swellSlopeX), 1, -(slopeZ + swellSlopeZ)));
		expect.near(
			magnitude(sub(at(normals, index), want)),
			0,
			2e-3,
			`normal[${index}] is cascade 1 and the swells, without cascade 2`,
		);
		// Exactly equal, not near: cascade 2 still displaces, through the same arithmetic.
		expect.truthy(
			same(at(bothPositions, index), at(positions, index)),
			`position[${index}] is unchanged by the normal list`,
		);
		if (magnitude(sub(at(bothNormals, index), at(normals, index))) > 2e-3) {
			moved += 1;
		}
	}
	expect.truthy(moved > 0, 'at least one normal moved when cascade 2 joined the list');
});

test('a ring that samples one cascade ignores the others', () => {
	const f = field();
	const store = storeFrom(f);
	const patch = layout.patches[layout.patches.length - 1]; // ring 2, one cascade, no seams
	expect.equal(patch.ring, 2, 'ring 2');
	expect.equal(patch.seams.length, 0, 'outermost ring has no seams');
	const [positions, normals] = arrays(81);
	// Ring 2 is the last ring of this layout, so nothing follows it and everything it samples
	// fades to nothing over its outer two cells (spacing 4, so the fade reaches 0 at 64 - 8 = 56
	// and runs back over the 8 studs inside that).
	SurfaceSampler.fill(
		patch,
		layout.spec.rings[1],
		layout.spec.rings[2], // Luau rings[3]: nil, there is no third ring
		layout.spec.rings[1].halfExtent,
		store,
		f.swells,
		T,
		CHOP,
		0,
		0,
		0,
		0,
		0,
		0,
		0,
		SKIRT_Y,
		positions,
		normals,
	);
	const index = 23;
	const ring = layout.spec.rings[1];
	const wx = patch.centreX + patch.localX[index - 1];
	const wz = patch.centreZ + patch.localZ[index - 1];
	// Ring 2 is the last ring, so its flatten weights everything it samples: the band is two of
	// its 4-stud cells and reaches 1 at 64 - 8 - 8 = 48 studs from the focus. This vertex sits
	// exactly there, at full weight. See "the last ring fades to flat at its edge".
	const distance = Math.max(Math.abs(wx), Math.abs(wz));
	expect.equal(distance, 48, "the sampled vertex's Chebyshev distance from the focus");
	const weight = clamp((ring.halfExtent - 2 * ring.spacing - distance) / FLATTEN_BAND, 0, 1);
	expect.near(weight, 1, 1e-12, 'the flatten weight that distance gives');
	const height = Cascade.sampleNoJacobian(store.display[0], wx, wz)[0];
	const swellY = Swells.sample(f.swells, T, wx, wz, CHOP)[1];
	expect.near(
		at(positions, index)[1],
		weight * (height + swellY),
		1e-6,
		'height from cascade 1 and the swells only',
	);
});

test('seam vertices are the average of their even neighbours', () => {
	const f = field();
	const store = storeFrom(f);
	let seamPatch;
	for (const patch of layout.patches) {
		if (patch.seams.length > 0) {
			seamPatch = patch;
			break;
		}
	}
	check(seamPatch, 'a patch with seams exists');
	const [positions, normals] = arrays(81);
	SurfaceSampler.fill(
		seamPatch,
		layout.spec.rings[0],
		layout.spec.rings[1],
		layout.spec.rings[0].halfExtent,
		store,
		f.swells,
		T,
		CHOP,
		0,
		0,
		0,
		0,
		0,
		0,
		0,
		SKIRT_Y,
		positions,
		normals,
	);
	for (const seam of seamPatch.seams) {
		const want = scale(add(at(positions, seam.a), at(positions, seam.b)), 0.5);
		expect.near(magnitude(sub(at(positions, seam.index), want)), 0, 1e-9, 'seam position');
		expect.near(magnitude(at(normals, seam.index)), 1, 1e-6, 'seam normal is unit');
		expect.near(
			magnitude(sub(at(normals, seam.index), unit(add(at(normals, seam.a), at(normals, seam.b))))),
			0,
			1e-6,
			'seam normal is the normalised average',
		);
	}
});

test('chop scales the cascade displacement once', () => {
	const f = field();
	const store = storeFrom(f);
	const patch = layout.patches[5];
	const [a, aNormals] = arrays(81);
	const [b, bNormals] = arrays(81);
	const ring = layout.spec.rings[0];
	const nextRing = layout.spec.rings[1];
	SurfaceSampler.fill(
		patch,
		ring,
		nextRing,
		ring.halfExtent,
		store,
		f.swells,
		T,
		0,
		0,
		0,
		0,
		0,
		0,
		0,
		0,
		SKIRT_Y,
		a,
		aNormals,
	);
	SurfaceSampler.fill(
		patch,
		ring,
		nextRing,
		ring.halfExtent,
		store,
		f.swells,
		T,
		2,
		0,
		0,
		0,
		0,
		0,
		0,
		0,
		SKIRT_Y,
		b,
		bNormals,
	);
	const index = 30;
	const wx = patch.centreX + patch.localX[index - 1];
	const wz = patch.centreZ + patch.localZ[index - 1];
	let cascadeDx = 0;
	for (let cascadeIndex = 1; cascadeIndex <= 3; cascadeIndex++) {
		cascadeDx += Cascade.sampleNoJacobian(store.display[cascadeIndex - 1], wx, wz)[1];
	}
	const swellX0 = Swells.sample(f.swells, T, wx, wz, 0)[0];
	const swellX2 = Swells.sample(f.swells, T, wx, wz, 2)[0];
	expect.near(at(a, index)[0] - patch.localX[index - 1], swellX0, 1e-9, 'chop 0 leaves only the swell term');
	expect.near(
		at(b, index)[0] - patch.localX[index - 1],
		2 * cascadeDx + swellX2,
		1e-6,
		'chop 2 doubles the cascade displacement',
	);
});

// The crack Cole saw along a ring boundary: the fine side summed cascades the coarse side does
// not have, so the two computed different heights on the shared edge. At the edge the cascades
// the next ring lacks must contribute nothing at all.
test("cascades the next ring lacks fade to zero at the ring's edge", () => {
	const f = field();
	const store = storeFrom(f);
	const patch = layout.patches[0]; // ring 1's outer corner patch, centre (-24, -24)
	expect.equal(patch.ring, 1, 'ring 1');
	expect.equal(patch.centreX, -24, 'centre x');
	expect.equal(patch.centreZ, -24, 'centre z');
	const [positions, normals] = arrays(81);
	SurfaceSampler.fill(
		patch,
		layout.spec.rings[0],
		layout.spec.rings[1],
		layout.spec.rings[0].halfExtent,
		store,
		f.swells,
		T,
		CHOP,
		0,
		0,
		0,
		0,
		0,
		0,
		0,
		SKIRT_Y,
		positions,
		normals,
	);
	// Column 0, row 2: on the ring's -x edge, and an even step along it, so the seam averaging
	// (which only rewrites odd steps) leaves it alone.
	const index = RingLayout.vertexIndex(8, 0, 2);
	for (const seam of patch.seams) {
		expect.truthy(seam.index !== index, 'the sampled vertex is not a seam vertex');
	}
	const wx = patch.centreX + patch.localX[index - 1];
	const wz = patch.centreZ + patch.localZ[index - 1];
	expect.equal(
		Math.max(Math.abs(wx), Math.abs(wz)),
		layout.spec.rings[0].halfExtent,
		"the sampled vertex is on the ring's edge, where the fade is 0",
	);
	// Ring 2 samples cascade 1 only, so only cascade 1 and the swells survive here.
	const height = Cascade.sampleNoJacobian(store.display[0], wx, wz)[0];
	const swellY = Swells.sample(f.swells, T, wx, wz, CHOP)[1];
	expect.near(at(positions, index)[1], height + swellY, 1e-6, 'cascades 2 and 3 contribute nothing at the boundary');
});

// The fade band belongs to the VIEWER, not to the window: the window is snapped, so the ring's
// boundary sits up to a cell away from the viewer's own square, and a fade measured from the
// window centre would leave a different weight on each side of a boundary as the viewer walks.
// Same patch and vertex as the case above -- world (-32, -28), Chebyshev distance 32 from the
// window centre -- with the focus moved to (-8, -4), which brings it 8 studs nearer on both
// axes and so 8 studs nearer in Chebyshev distance.
test('fades follow the focus, not the window', () => {
	const f = field();
	const store = storeFrom(f);
	const patch = layout.patches[0]; // ring 1's outer corner patch, centre (-24, -24)
	const ring = layout.spec.rings[0];
	const [positions, normals] = arrays(81);
	const focusX = -8;
	const focusZ = -4;
	SurfaceSampler.fill(
		patch,
		ring,
		layout.spec.rings[1],
		ring.halfExtent,
		store,
		f.swells,
		T,
		CHOP,
		0,
		0,
		focusX,
		focusZ,
		0,
		0,
		0,
		SKIRT_Y,
		positions,
		normals,
	);
	const index = RingLayout.vertexIndex(8, 0, 2);
	const wx = patch.centreX + patch.localX[index - 1];
	const wz = patch.centreZ + patch.localZ[index - 1];
	const distance = Math.max(Math.abs(wx - focusX), Math.abs(wz - focusZ));
	expect.equal(distance, ring.halfExtent - 8, "the vertex is 8 studs inside the fade's reach");
	// The window still puts it on the ring's edge, where a window-relative fade would be 0.
	expect.equal(
		Math.max(Math.abs(wx), Math.abs(wz)),
		ring.halfExtent,
		"and on the window's edge, so the two fades differ",
	);
	const weight = (ring.halfExtent - ring.spacing - distance) / (ring.halfExtent * 0.25);
	expect.near(weight, 0.75, 1e-12, "the weight this vertex's distance gives");
	// Ring 2 samples cascade 1 only, so cascades 2 and 3 carry the weight and the swells, which
	// only the last ring fades, carry none.
	let height = Cascade.sampleNoJacobian(store.display[0], wx, wz)[0];
	for (let cascadeIndex = 2; cascadeIndex <= 3; cascadeIndex++) {
		height += weight * Cascade.sampleNoJacobian(store.display[cascadeIndex - 1], wx, wz)[0];
	}
	const swellY = Swells.sample(f.swells, T, wx, wz, CHOP)[1];
	expect.near(at(positions, index)[1], height + swellY, 1e-6, 'cascades 2 and 3 are weighted 0.75');
});

// The coarse rings draw their whole window and drop whatever a finer ring already covers into
// a skirt below the water, so no coarse triangle shows through the fine ring and no hole has
// to be cut in the layout. A patch entirely under the finer ring is not drawn at all.
test("vertices inside the finer ring's window are skirted and a fully covered patch reports it", () => {
	const f = field();
	const store = storeFrom(f);
	const ring = layout.spec.rings[1]; // 4-stud cells to +/- 64
	// The corner patch straddles an inner window of half-extent 40: its vertices run from -64
	// to -32 in both axes, so the two innermost rows and columns are covered and the rest is
	// not. The patch over the middle is covered completely.
	const straddling = patchAt(2, -48, -48);
	const covered = patchAt(2, -16, -16);
	const [positions, normals] = arrays(81);
	const fullyCovered = SurfaceSampler.fill(
		straddling,
		ring,
		null,
		ring.halfExtent,
		store,
		f.swells,
		T,
		CHOP,
		0,
		0,
		0,
		0,
		0,
		0,
		40,
		SKIRT_Y,
		positions,
		normals,
	);
	expect.truthy(!fullyCovered, 'a patch with vertices outside the inner window is drawn');
	const inside = RingLayout.vertexIndex(8, 7, 7); // world (-36, -36), inside 40
	const outside = RingLayout.vertexIndex(8, 4, 4); // world (-48, -48), outside 40
	expect.equal(straddling.centreX + straddling.localX[inside - 1], -36, "the covered vertex's world x");
	expect.equal(straddling.centreX + straddling.localX[outside - 1], -48, "the open vertex's world x");
	expect.truthy(
		same(
			at(positions, inside),
			vector3(straddling.localX[inside - 1], SKIRT_Y, straddling.localZ[inside - 1]),
		),
		'a covered vertex drops straight down to the skirt, undisplaced',
	);
	// Ring 2 samples cascade 1 only, and as the last ring its flatten weights that vertex:
	// 48 studs from the focus gives (64 - 2 * 4 - 48) / 8 = 1, so it is at full weight.
	const height = Cascade.sampleNoJacobian(store.display[0], -48, -48)[0];
	const swellY = Swells.sample(f.swells, T, -48, -48, CHOP)[1];
	expect.near(at(positions, outside)[1], height + swellY, 1e-6, 'an open vertex is sampled as usual');

	const [allCovered, allNormals] = arrays(81);
	const everything = SurfaceSampler.fill(
		covered,
		ring,
		null,
		ring.halfExtent,
		store,
		f.swells,
		T,
		CHOP,
		0,
		0,
		0,
		0,
		0,
		0,
		40,
		SKIRT_Y,
		allCovered,
		allNormals,
	);
	expect.truthy(everything, 'a patch entirely inside the inner window reports itself covered');
	for (let index = 1; index <= 81; index++) {
		expect.truthy(
			same(at(allCovered, index), vector3(covered.localX[index - 1], SKIRT_Y, covered.localZ[index - 1])),
			`every vertex is skirted[${index}]`,
		);
	}

	// An inner window that swallows the whole ring covers the straddling patch too...
	const swallowed = SurfaceSampler.fill(
		straddling,
		ring,
		null,
		ring.halfExtent,
		store,
		f.swells,
		T,
		CHOP,
		0,
		0,
		0,
		0,
		0,
		0,
		200,
		SKIRT_Y,
		positions,
		normals,
	);
	expect.truthy(swallowed, 'innerHalf 200 covers every vertex');
	for (let index = 1; index <= 81; index++) {
		expect.equal(at(positions, index)[1], SKIRT_Y, `skirted[${index}]`);
	}
	// ...and the finest ring, which has no finer ring, passes innerHalf 0 and skirts nothing.
	const none = SurfaceSampler.fill(
		straddling,
		ring,
		null,
		ring.halfExtent,
		store,
		f.swells,
		T,
		CHOP,
		0,
		0,
		0,
		0,
		0,
		0,
		0,
		SKIRT_Y,
		positions,
		normals,
	);
	expect.truthy(!none, 'innerHalf 0 skirts nothing');
	for (let index = 1; index <= 81; index++) {
		expect.truthy(at(positions, index)[1] !== SKIRT_Y, `sampled[${index}]`);
	}
});

// The dashed gap Cole saw along the far edge: the last ring's troughs dropped below the flat
// horizon plane. The last ring fades everything, swells included, so its outer cell is sea
// level.
// Since 2026-09-19 that flatten is VIEWER-relative and two of the ring's OWN cells wide, and its
// inner end sits TWO cells inside the ring's extent. Two reasons. The horizon plane tucks under the
// ring's edge, so a fade that only reached zero exactly at the edge still left a quarter of the
// amplitude showing over the join at scale 8; and the window snaps to 2 * spacing, so a
// window-relative band jumped a whole window step (64 studs at High) every time the last ring
// shifted and Cole saw the far silhouette pop. The window edge is never more than a cell from
// halfExtent, so two cells of margin flatten the whole outermost cell whatever the offset.
// The band is two cells too, not the fixed 64 studs it was until now: 64 is half a cell on Low's
// 128-stud last ring, which flattened almost nothing, and the whole extent on this toy layout.
test('the last ring fades to flat at its edge', () => {
	const f = field();
	const store = storeFrom(f);
	const ring = layout.spec.rings[1];
	const patch = layout.patches[layout.patches.length - 1]; // ring 2, centre (48, 48)
	expect.equal(patch.ring, 2, 'ring 2');
	const [positions, normals] = arrays(81);
	SurfaceSampler.fill(
		patch,
		ring,
		null, // the last ring: nothing follows it
		ring.halfExtent,
		store,
		f.swells,
		T,
		CHOP,
		0, // the window centre
		0,
		0, // and the focus, here the same point
		0,
		0,
		0,
		0,
		SKIRT_Y,
		positions,
		normals,
	);
	const index = RingLayout.vertexIndex(8, 8, 8); // the patch's far corner, world (64, 64)
	const wx = patch.centreX + patch.localX[index - 1];
	const wz = patch.centreZ + patch.localZ[index - 1];
	expect.equal(
		Math.max(Math.abs(wx), Math.abs(wz)),
		ring.halfExtent,
		"the sampled vertex is on the last ring's edge, where the fade is 0",
	);
	expect.near(at(positions, index)[1], 0, 1e-6, 'flat at sea level');
	expect.near(at(positions, index)[0], patch.localX[index - 1], 1e-6, 'no lateral displacement in x');
	expect.near(at(positions, index)[2], patch.localZ[index - 1], 1e-6, 'no lateral displacement in z');
	expect.near(magnitude(sub(at(normals, index), Y_AXIS)), 0, 1e-6, 'flat normal');

	// The inner end of the band, two cells inside the extent: still exactly flat. That margin is
	// what makes the whole outermost cell flat however far the window has slid from the viewer.
	const inner = RingLayout.vertexIndex(8, 6, 0); // world (56, 32)
	const innerX = patch.centreX + patch.localX[inner - 1];
	const innerZ = patch.centreZ + patch.localZ[inner - 1];
	expect.equal(
		Math.max(Math.abs(innerX), Math.abs(innerZ)),
		ring.halfExtent - 2 * ring.spacing,
		'the vertex at the inner end of the flatten band',
	);
	expect.near(at(positions, inner)[1], 0, 1e-6, 'two cells inside the extent is still flat');
	expect.near(at(positions, inner)[0], patch.localX[inner - 1], 1e-6, 'and undisplaced in x');
	expect.near(at(positions, inner)[2], patch.localZ[inner - 1], 1e-6, 'and undisplaced in z');

	// Halfway across the band, 4 studs inside its inner end -- half of two 4-stud cells, where it
	// was 32 studs while the band was a flat 64: weight 0.5 on the cascades AND on the swells,
	// summed here from the display tables and the bank rather than from the sampler.
	const half = RingLayout.vertexIndex(8, 5, 0); // world (52, 32), on the same patch
	const hx = patch.centreX + patch.localX[half - 1];
	const hz = patch.centreZ + patch.localZ[half - 1];
	expect.equal(
		Math.max(Math.abs(hx), Math.abs(hz)),
		ring.halfExtent - 2 * ring.spacing - 4,
		"the vertex 4 studs inside the band's inner end",
	);
	expect.near(
		(ring.halfExtent - 2 * ring.spacing - Math.max(Math.abs(hx), Math.abs(hz))) / FLATTEN_BAND,
		0.5,
		1e-12,
		'halfway across the band',
	);
	const [height, dispX, dispZ] = Cascade.sampleNoJacobian(store.display[0], hx, hz);
	const [swellX, swellY, swellZ] = Swells.sample(f.swells, T, hx, hz, CHOP);
	expect.near(at(positions, half)[1], 0.5 * (height + swellY), 1e-6, 'half the height, cascade and swell alike');
	expect.near(
		at(positions, half)[0],
		patch.localX[half - 1] + 0.5 * (CHOP * dispX + swellX),
		1e-6,
		'half the displacement in x',
	);
	expect.near(
		at(positions, half)[2],
		patch.localZ[half - 1] + 0.5 * (CHOP * dispZ + swellZ),
		1e-6,
		'half the displacement in z',
	);
});

// Flat lighting (2026-09-19): the sampler skips slopes and normals entirely. Positions must
// be identical to the full path, and the normals array must not be touched.
test('flat mode writes the same positions as the full path and leaves the normals alone', () => {
	const f = field();
	const store = storeFrom(f);
	const patch = layout.patches[0]; // ring 1's outer corner patch: seams and a fade band
	const [positions, normals] = arrays(81);
	SurfaceSampler.fill(
		patch,
		layout.spec.rings[0],
		layout.spec.rings[1],
		layout.spec.rings[0].halfExtent,
		store,
		f.swells,
		T,
		CHOP,
		100,
		-40,
		100,
		-40,
		0,
		0,
		0,
		SKIRT_Y,
		positions,
		normals,
	);
	const [flatPositions, flatNormals] = arrays(81);
	const sentinel = vector3(7, 8, 9);
	for (let index = 1; index <= 81; index++) {
		flatNormals.set(sentinel, (index - 1) * 3);
	}
	SurfaceSampler.fill(
		patch,
		layout.spec.rings[0],
		layout.spec.rings[1],
		layout.spec.rings[0].halfExtent,
		store,
		f.swells,
		T,
		CHOP,
		100,
		-40,
		100,
		-40,
		0,
		0,
		0,
		SKIRT_Y,
		flatPositions,
		flatNormals,
		true,
	);
	for (let index = 1; index <= 81; index++) {
		expect.near(magnitude(sub(at(flatPositions, index), at(positions, index))), 0, 1e-9, `position[${index}]`);
		expect.truthy(same(at(flatNormals, index), sentinel), `normal[${index}] untouched`);
	}
});

test('flat mode skirts and reports coverage exactly like the full path', () => {
	const f = field();
	const store = storeFrom(f);
	const ring = layout.spec.rings[1];
	const patch = patchAt(2, -48, -48);
	const [positions, normals] = arrays(81);
	const [flatPositions, flatNormals] = arrays(81);
	const full = SurfaceSampler.fill(
		patch,
		ring,
		null,
		ring.halfExtent,
		store,
		f.swells,
		T,
		CHOP,
		0,
		0,
		0,
		0,
		0,
		0,
		40,
		SKIRT_Y,
		positions,
		normals,
	);
	const flat = SurfaceSampler.fill(
		patch,
		ring,
		null,
		ring.halfExtent,
		store,
		f.swells,
		T,
		CHOP,
		0,
		0,
		0,
		0,
		0,
		0,
		40,
		SKIRT_Y,
		flatPositions,
		flatNormals,
		true,
	);
	expect.truthy(full === flat, 'both paths report the same coverage');
	expect.truthy(!full, 'and this patch is not fully covered');
	for (let index = 1; index <= 81; index++) {
		expect.near(magnitude(sub(at(flatPositions, index), at(positions, index))), 0, 1e-9, `position[${index}]`);
	}
});

// Per-ring work, hoisted out of the caller's patch loop (2026-09-19, the write stage's frame
// budget). Everything `fill` used to work out for itself on every call -- which of the ring's
// cascades fade, the band they fade over, and the table that answers the first question --
// depends on the RING, not on the patch, so `ringContext` computes it once and `fill` takes it
// as an optional last argument. It is an optimisation and must never be a difference: this case
// pins what the context holds, and the next one fills the same patch both ways and compares
// every vertex.
test("a ring context holds the ring's fades and fade band", () => {
	const inner = SurfaceSampler.ringContext(layout.spec.rings[0], layout.spec.rings[1]);
	const ring1 = layout.spec.rings[0];
	expect.truthy(Object.isFrozen(inner), 'the context is frozen');
	expect.truthy(!inner.last, 'ring 1 is not the last ring');
	// fades[c - 1] answers for Luau cascade c.
	expect.equal(inner.fades[1 - 1], false, 'ring 2 samples cascade 1 too, so it does not fade');
	expect.equal(inner.fades[2 - 1], true, 'ring 2 lacks cascade 2, so it fades out at the edge');
	expect.equal(inner.fades[3 - 1], true, 'ring 2 lacks cascade 3, so it fades out at the edge');
	expect.equal(inner.fadeWidth, ring1.halfExtent * 0.25, "the band is the ring's outer quarter");
	expect.equal(inner.fadeEdge, ring1.halfExtent - ring1.spacing, 'ending one cell inside');

	const ring2 = layout.spec.rings[1];
	const last = SurfaceSampler.ringContext(ring2, null);
	expect.truthy(last.last, 'ring 2 is the last ring of this layout');
	expect.equal(last.fades[1 - 1], true, 'the last ring fades everything it samples');
	expect.equal(last.fadeWidth, 2 * ring2.spacing, "the last ring's band is two of its cells");
	expect.equal(last.fadeWidth, FLATTEN_BAND, 'which is 8 studs on this layout');
	expect.equal(last.fadeEdge, ring2.halfExtent - 2 * ring2.spacing, 'ending two cells inside the extent');
});

// The second boolean table the context carries: which of the ring's cascades tilt its vertices,
// from `normalCascades` (nil means every cascade it samples). Per-ring like the fades, and read
// once per cascade in the vertex loop rather than searched for there.
test('a ring context carries the slope list', () => {
	const mapped = SurfaceSampler.ringContext(twoCascadeRing([1]), layout.spec.rings[1]);
	expect.truthy(Object.isFrozen(mapped), 'the context is frozen');
	expect.equal(mapped.slopes[1 - 1], true, 'cascade 1 is listed, so it tilts the vertices');
	expect.truthy(!mapped.slopes[2 - 1], 'cascade 2 is sampled and not listed: it rides in the normal map');

	const both = SurfaceSampler.ringContext(twoCascadeRing(null), layout.spec.rings[1]);
	expect.equal(both.slopes[1 - 1], true, 'no list means every cascade the ring samples');
	expect.equal(both.slopes[2 - 1], true, 'cascade 2 included');
});

test("a ring context fills a patch exactly as fill's own per-patch working does", () => {
	const f = field();
	const store = storeFrom(f);
	const ring1 = layout.spec.rings[0];
	const ring2 = layout.spec.rings[1];
	// An off-centre focus, so both fade bands carry a weight that is neither 0 nor 1.
	const focusX = -8;
	const focusZ = 12;
	const trials = [
		// An interior ring-1 patch, full lighting: the fading cascades and the normals.
		{ patch: layout.patches[5], ring: ring1, nextRing: ring2, innerHalf: 0, flat: false },
		// Ring 1's outer corner patch, flat lighting: the fade band and the seams.
		{ patch: layout.patches[0], ring: ring1, nextRing: ring2, innerHalf: 0, flat: true },
		// The last ring straddling a finer window: the flatten band and the skirt, both ways.
		{
			patch: patchAt(2, -48, -48),
			ring: ring2,
			nextRing: null,
			innerHalf: 40,
			flat: false,
		},
		{ patch: patchAt(2, -48, -48), ring: ring2, nextRing: null, innerHalf: 40, flat: true },
	];
	trials.forEach((setup, i) => {
		const trial = i + 1;
		const [positions, normals] = arrays(81);
		const [hoisted, hoistedNormals] = arrays(81);
		const plain = SurfaceSampler.fill(
			setup.patch,
			setup.ring,
			setup.nextRing,
			setup.ring.halfExtent,
			store,
			f.swells,
			T,
			CHOP,
			0,
			0,
			focusX,
			focusZ,
			0,
			0,
			setup.innerHalf,
			SKIRT_Y,
			positions,
			normals,
			setup.flat,
		);
		const context = SurfaceSampler.ringContext(setup.ring, setup.nextRing);
		const contextual = SurfaceSampler.fill(
			setup.patch,
			setup.ring,
			setup.nextRing,
			setup.ring.halfExtent,
			store,
			f.swells,
			T,
			CHOP,
			0,
			0,
			focusX,
			focusZ,
			0,
			0,
			setup.innerHalf,
			SKIRT_Y,
			hoisted,
			hoistedNormals,
			setup.flat,
			context,
		);
		expect.equal(contextual, plain, `trial ${trial}: the same coverage`);
		for (let index = 1; index <= 81; index++) {
			// Exactly equal, not near: the same inputs through the same arithmetic.
			expect.truthy(same(at(hoisted, index), at(positions, index)), `trial ${trial}: position[${index}]`);
			if (!setup.flat) {
				expect.truthy(
					same(at(hoistedNormals, index), at(normals, index)),
					`trial ${trial}: normal[${index}]`,
				);
			}
		}
	});
});

test('flat mode skips silent swells without changing the positions', () => {
	const f = field();
	const store = storeFrom(f);
	const silent = Swells.create(
		[{ wavelength: 400, amplitude: 0, direction: 0.2, phase: 0 }],
		Spectrum.NORMAL,
		120,
	);
	expect.truthy(Swells.isSilent(silent), 'zero amplitude is silent');
	expect.truthy(!Swells.isSilent(f.swells), 'the spec swells are not');
	const patch = layout.patches[5];
	const [positions, normals] = arrays(81);
	SurfaceSampler.fill(
		patch,
		layout.spec.rings[0],
		layout.spec.rings[1],
		layout.spec.rings[0].halfExtent,
		store,
		silent,
		T,
		CHOP,
		0,
		0,
		0,
		0,
		0,
		0,
		0,
		SKIRT_Y,
		positions,
		normals,
		true,
	);
	for (let index = 1; index <= 81; index++) {
		const wx = patch.centreX + patch.localX[index - 1];
		const wz = patch.centreZ + patch.localZ[index - 1];
		let height = 0;
		for (const c of layout.spec.rings[0].cascades) {
			height += Cascade.sampleNoJacobian(store.display[c - 1], wx, wz)[0];
		}
		// 1e-6: a Vector3 component is float32 (see the note at the top of this file).
		expect.near(at(positions, index)[1], height, 1e-6, `cascades only[${index}]`);
	}
});

// The lit path has the same shortcut and one more thing to get right: with the swells silent the
// normals must be the cascade slopes alone, not the cascade slopes plus a swell term that
// happens to be zero. There is no way to run the lit path over a silent bank with the shortcut
// bypassed (Swells.create decides silence from the amplitudes, so a silent bank is the only way
// in), so the expectation is written out from the cascades: the heights the flat case above
// checks, and normalise(-slopeX, 1, -slopeZ) over the ring's cascades. Patch 6 is interior, so no
// seam averages a normal and every fade weight is 1.
test('the lit path skips silent swells without changing positions or normals', () => {
	const f = field();
	const store = storeFrom(f);
	const silent = Swells.create(
		[{ wavelength: 400, amplitude: 0, direction: 0.2, phase: 0 }],
		Spectrum.NORMAL,
		120,
	);
	expect.truthy(Swells.isSilent(silent), 'zero amplitude is silent');
	const patch = layout.patches[5];
	expect.equal(patch.seams.length, 0, 'interior patch: no seam averaging over these normals');
	const ring = layout.spec.rings[0];
	const [positions, normals] = arrays(81);
	SurfaceSampler.fill(
		patch,
		ring,
		layout.spec.rings[1],
		ring.halfExtent,
		store,
		silent,
		T,
		CHOP,
		0,
		0,
		0,
		0,
		0,
		0,
		0,
		SKIRT_Y,
		positions,
		normals,
	);
	for (let index = 1; index <= 81; index++) {
		const wx = patch.centreX + patch.localX[index - 1];
		const wz = patch.centreZ + patch.localZ[index - 1];
		let height = 0;
		let slopeX = 0;
		let slopeZ = 0;
		for (const c of ring.cascades) {
			const s = Cascade.sampleNoJacobian(store.display[c - 1], wx, wz);
			height += s[0];
			slopeX += s[3];
			slopeZ += s[4];
		}
		// 1e-6: a Vector3 component is float32 (see the note at the top of this file).
		expect.near(at(positions, index)[1], height, 1e-6, `cascades only[${index}]`);
		const want = unit(vector3(-slopeX, 1, -slopeZ));
		expect.near(
			magnitude(sub(at(normals, index), want)),
			0,
			1e-6,
			`normal[${index}] is the cascade slopes with no swell term`,
		);
	}
});
