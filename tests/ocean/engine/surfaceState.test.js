import { test } from 'node:test';
import * as expect from '../expect.js';
import * as RingLayout from '../../../content/ocean/js/core/ringLayout.js';
import * as Tier from '../../../content/ocean/js/core/tier.js';
import * as FieldStore from '../../../content/ocean/js/core/fieldStore.js';
import * as Swells from '../../../content/ocean/js/core/swells.js';
import * as Spectrum from '../../../content/ocean/js/core/spectrum.js';
import * as SurfaceState from '../../../content/ocean/js/engine/surfaceState.js';
import * as WaveBanks from '../../../content/ocean/js/engine/waveBanks.js';
import { probeSurface } from '../../../content/ocean/js/engine/surfaceProbe.js';

const BOUNDS = Object.freeze({ height: 40, lateral: 46.4 });
const SILENT = [
	{ wavelength: 420, amplitude: 0, direction: 0.2, phase: 0 },
	{ wavelength: 260, amplitude: 0, direction: -0.4, phase: 1 },
];

function setup({ wavy = false } = {}) {
	const preset = Tier.presets.High;
	const layout = RingLayout.build({ rings: preset.rings, patchCells: preset.patchCells, textureTile: preset.textureTile });
	const store = FieldStore.create(preset.n, preset.sizes);
	for (let index = 1; index <= preset.sizes.length; index++) {
		const display = store.display[index - 1];
		for (let cell = 0; cell < preset.n * preset.n; cell++) {
			display.height[cell] = wavy ? Math.sin(cell * 0.37 + index) * 2 : 0;
			display.slopeX[cell] = wavy ? Math.cos(cell * 0.21) * 0.1 : 0;
		}
	}
	const swells = Swells.create(SILENT, Spectrum.NORMAL, 120);
	return { preset, layout, store, swells };
}

test('create gives every patch typed arrays sized for it and snaps to the origin', () => {
	const { layout, preset } = setup();
	const surface = SurfaceState.create(layout, BOUNDS, false);
	const count = (preset.patchCells + 1) ** 2;
	expect.equal(surface.patches.length, layout.patches.length, 'one state per patch');
	expect.equal(surface.patches[0].positions.length, count * 3, 'positions');
	expect.equal(surface.patches[0].normals[1], 1, 'normals start up');
	expect.equal(surface.patches[0].uvs.length, count * 2, 'uvs');
	expect.equal(surface.skirtY, Math.fround(-(BOUNDS.height - SurfaceState.SKIRT_MARGIN)), 'skirt parked float32-exact');
	for (let ring = 1; ring <= preset.rings.length; ring++) {
		const [x, z] = RingLayout.windowCentre(0, 0, preset.rings[ring - 1].spacing);
		expect.equal(surface.centres[ring - 1].x, x, `ring ${ring} centre x`);
		expect.equal(surface.centres[ring - 1].z, z, `ring ${ring} centre z`);
	}
	expect.truthy(surface.patches.every((p) => p.uvsChanged), 'every ring placed once');
});

test('snap moves exactly the rings whose window centre changed and rewrites only their uvs', () => {
	const { layout, preset } = setup();
	const surface = SurfaceState.create(layout, BOUNDS, false);
	for (const p of surface.patches) p.uvsChanged = false;
	const focusX = 5;
	const focusZ = -3;
	const expected = preset.rings.map((spec, i) => {
		const [x, z] = RingLayout.windowCentre(focusX, focusZ, spec.spacing);
		return x !== surface.centres[i].x || z !== surface.centres[i].z;
	});
	const moved = SurfaceState.snap(surface, focusX, focusZ);
	expect.equal(moved, expected.filter(Boolean).length, 'moved count');
	for (const p of surface.patches) {
		expect.equal(p.uvsChanged, expected[p.ring - 1], `patch in ring ${p.ring} uvsChanged`);
		const centre = surface.centres[p.ring - 1];
		expect.equal(p.worldX, centre.x + p.patch.centreX, 'worldX');
		expect.equal(p.worldZ, centre.z + p.patch.centreZ, 'worldZ');
	}
	expect.equal(SurfaceState.snap(surface, focusX, focusZ), 0, 'the same focus moves nothing');
});

test('write fills every uncovered patch and hides the ones a finer ring covers', () => {
	const { layout, store, swells } = setup();
	const surface = SurfaceState.create(layout, BOUNDS, false);
	SurfaceState.write(surface, store, swells, 0, 0.8);
	const hidden = surface.patches.filter((p) => p.hidden);
	expect.truthy(hidden.length > 0 && hidden.length < surface.patches.length, `some but not all hidden: ${hidden.length}`);
	for (const p of surface.patches) {
		expect.equal(p.written, !p.hidden, 'written unless hidden');
		if (!p.hidden) {
			for (let v = 0; v < p.positions.length / 3; v++) {
				const y = p.positions[v * 3 + 1];
				expect.truthy(y === 0 || y === surface.skirtY, `flat sea or skirt, got ${y}`);
			}
		}
	}
	expect.equal(surface.everWritten, true, 'every ring written once');
});

test('after the first full write the outer ring takes only even frames', () => {
	const { layout, store, swells, preset } = setup();
	const surface = SurfaceState.create(layout, BOUNDS, false);
	SurfaceState.write(surface, store, swells, 0, 0.8, 1);
	const outer = preset.rings.length;
	for (const p of surface.patches) p.written = false;
	SurfaceState.write(surface, store, swells, 0, 0.8, 3);
	expect.truthy(surface.patches.filter((p) => p.ring === outer).every((p) => !p.written), 'odd frame skips the outer ring');
	expect.truthy(surface.patches.some((p) => p.ring === 1 && p.written), 'inner rings still written');
	SurfaceState.write(surface, store, swells, 0, 0.8, 4);
	expect.truthy(surface.patches.some((p) => p.ring === outer && p.written), 'even frame writes it');
});

test('a focus far from the origin keeps every position finite (Review Focus 5)', () => {
	const { layout, store, swells, preset } = setup({ wavy: true });
	const surface = SurfaceState.create(layout, BOUNDS, false);
	for (const [fx, fz] of [[-5000.3, 12000.7], [123456.5, -98765.25]]) {
		SurfaceState.snapAndWrite(surface, fx, fz, store, swells, 3, 0.8);
		for (const p of surface.patches) {
			for (const value of p.positions) expect.truthy(Number.isFinite(value), 'position finite');
			for (const value of p.normals) expect.truthy(Number.isFinite(value), 'normal finite');
			for (const value of p.uvs) expect.truthy(Number.isFinite(value), 'uv finite');
		}
		const inner = preset.rings[0].spacing;
		expect.truthy(Math.abs(surface.centres[0].x - fx) <= 4 * inner, 'finest ring follows x');
		expect.truthy(Math.abs(surface.centres[0].z - fz) <= 4 * inner, 'finest ring follows z');
	}
});

test('takeExtremes returns the running extremes and resets them', () => {
	const { layout, store, swells } = setup({ wavy: true });
	const surface = SurfaceState.create(layout, BOUNDS, false);
	SurfaceState.write(surface, store, swells, 0, 0.8);
	const [maxY, maxLateral] = SurfaceState.takeExtremes(surface);
	expect.truthy(maxY > 0, `height extreme recorded: ${maxY}`);
	expect.truthy(Number.isFinite(maxLateral), 'lateral extreme finite');
	const [again] = SurfaceState.takeExtremes(surface);
	expect.equal(again, 0, 'reset after taking');
});

test("probeSurface reads ring 1's interior: sixteen patches on High, all zero on a fresh surface", () => {
	const { layout } = setup();
	const surface = SurfaceState.create(layout, BOUNDS, false);
	const probe = probeSurface(surface);
	expect.equal(probe.patches, 16, 'ring 1 has sixteen patches');
	for (const name of ['maxAbsY', 'maxLateral', 'xSpread', 'zSpread', 'sumY']) {
		expect.equal(probe[name], 0, `${name} on the flat starting grid`);
	}
});

test('setRingCascades drops a cascade from every ring, and the write follows', () => {
	const { layout, store, swells } = setup();
	// Only cascade 2 carries waves.
	for (let cell = 0; cell < store.cells; cell++) store.display[1].height[cell] = 3;
	const surface = SurfaceState.create(layout, BOUNDS, false);
	SurfaceState.write(surface, store, swells, 0, 0.8);
	expect.truthy(probeSurface(surface).maxAbsY > 2, 'cascade 2 lifts ring 1');
	SurfaceState.setRingCascades(surface, [true, false, true]);
	expect.truthy(surface.ringSpecs.every((spec) => !spec.cascades.includes(2)), 'no ring samples cascade 2');
	expect.equal(surface.ringSpecs[0].cascades.join(','), '1', 'ring 1 keeps cascade 1');
	expect.equal(surface.ringSpecs[0].normalCascades.join(','), '1', 'and its vertex normals keep cascade 1');
	expect.equal(surface.contexts.length, surface.ringSpecs.length, 'one sampler context per ring');
	expect.equal(surface.stale, true, 'the next write must be whole');
	SurfaceState.write(surface, store, swells, 0, 0.8);
	expect.equal(probeSurface(surface).maxAbsY, 0, 'cascade 2 gone from the surface');
});

test('with no cascades the swells slot carries a teaching bank: one sine is z-invariant', () => {
	const { layout, store } = setup();
	const surface = SurfaceState.create(layout, BOUNDS, false);
	SurfaceState.setRingCascades(surface, [false, false, false]);
	const { bank } = WaveBanks.nextSine(null, { amplitude: 2, wavelength: 24, speed: 5 }, 0);
	SurfaceState.write(surface, store, bank, 1.5, 0);
	const probe = probeSurface(surface);
	expect.equal(probe.zSpread, 0, 'nothing changes along z');
	expect.truthy(probe.xSpread > 0.5, `the wave changes along x: ${probe.xSpread}`);
	expect.equal(probe.maxLateral, 0, 'chop 0: no sideways motion');
	expect.truthy(probe.maxAbsY <= 2 && probe.maxAbsY > 1.5, `height within the amplitude: ${probe.maxAbsY}`);
});

test('a still surface is written once and then left alone until a window moves', () => {
	const { layout, store } = setup();
	const surface = SurfaceState.create(layout, BOUNDS, false);
	SurfaceState.setRingCascades(surface, [false, false, false]);
	const flat = WaveBanks.nextSine(null, { amplitude: 0, wavelength: 40, speed: 8 }, 0).bank;
	SurfaceState.snapAndWrite(surface, 0, 0, store, flat, 0, 0, 1, true);
	expect.equal(surface.skipped, false, 'the first write happens');
	for (const p of surface.patches) p.written = false;
	SurfaceState.snapAndWrite(surface, 0, 0, store, flat, 1, 0, 2, true);
	expect.equal(surface.skipped, true, 'nothing to do');
	expect.truthy(surface.patches.every((p) => !p.written), 'no patch rewritten');
	SurfaceState.snapAndWrite(surface, 40, 0, store, flat, 2, 0, 3, true);
	expect.equal(surface.skipped, false, 'a window moved: written');
	expect.equal(probeSurface(surface).maxAbsY, 0, 'still flat');
});

test('a live surface going still is written whole on the first still frame, odd or not', () => {
	const { layout, store, preset } = setup();
	const surface = SurfaceState.create(layout, BOUNDS, false);
	SurfaceState.setRingCascades(surface, [false, false, false]);
	const { bank: live } = WaveBanks.nextSine(null, { amplitude: 2, wavelength: 24, speed: 5 }, 0);
	SurfaceState.snapAndWrite(surface, 0, 0, store, live, 1.5, 0, 2, false);
	expect.truthy(probeSurface(surface).maxAbsY > 1.5, 'the live sine is up');
	const silent = WaveBanks.nextSine(null, { amplitude: 0, wavelength: 24, speed: 5 }, 0).bank;
	for (const p of surface.patches) p.written = false;
	SurfaceState.snapAndWrite(surface, 0, 0, store, silent, 1.6, 0, 3, true);
	expect.equal(surface.skipped, false, 'the first still frame is written');
	expect.equal(probeSurface(surface).maxAbsY, 0, 'flat at once');
	const outer = surface.patches.filter((p) => p.ring === preset.rings.length && !p.hidden);
	expect.truthy(outer.length > 0 && outer.every((p) => p.written), 'odd frame, yet every outer-ring patch is rewritten');
	for (const p of surface.patches) p.written = false;
	SurfaceState.snapAndWrite(surface, 0, 0, store, silent, 1.7, 0, 4, true);
	expect.equal(surface.skipped, true, 'the second still frame has nothing to do');
});

test('setBounds moves the skirt and makes the next write whole', () => {
	const { layout, store, swells, preset } = setup();
	const surface = SurfaceState.create(layout, BOUNDS, false);
	SurfaceState.write(surface, store, swells, 0, 0.8, 1);
	SurfaceState.setBounds(surface, { lateral: 100, height: 90 });
	expect.equal(surface.skirtY, Math.fround(-(90 - SurfaceState.SKIRT_MARGIN)), 'skirt lowered');
	expect.equal(surface.boundsVersion, 1, 'version bumped for the renderer');
	expect.equal(surface.bounds.height, 90, 'bounds kept');
	for (const p of surface.patches) p.written = false;
	SurfaceState.snapAndWrite(surface, 0, 0, store, swells, 0, 0.8, 3);
	const outer = preset.rings.length;
	expect.truthy(surface.patches.some((p) => p.ring === outer && p.written), 'odd frame, yet the outer ring is rewritten: the skirt moved');
	let message = '';
	try {
		SurfaceState.setBounds(surface, { lateral: 10, height: 1 });
	} catch (error) {
		message = error.message;
	}
	expect.truthy(message.includes('bounds'), `a bound under the skirt margin is refused: ${message}`);
});

test('setFlatNormals switches the normal writes and marks the surface stale', () => {
	const { layout } = setup();
	const surface = SurfaceState.create(layout, BOUNDS, false);
	expect.equal(surface.stale, false, 'fresh');
	SurfaceState.setFlatNormals(surface, false);
	expect.equal(surface.stale, false, 'no change, nothing to do');
	SurfaceState.setFlatNormals(surface, true);
	expect.equal(surface.flatNormals, true, 'flat');
	expect.equal(surface.stale, true, 'stale');
});
