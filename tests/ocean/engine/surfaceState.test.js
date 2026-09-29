import { test } from 'node:test';
import * as expect from '../expect.js';
import * as RingLayout from '../../../content/ocean/js/core/ringLayout.js';
import * as Tier from '../../../content/ocean/js/core/tier.js';
import * as FieldStore from '../../../content/ocean/js/core/fieldStore.js';
import * as Swells from '../../../content/ocean/js/core/swells.js';
import * as Spectrum from '../../../content/ocean/js/core/spectrum.js';
import * as SurfaceState from '../../../content/ocean/js/engine/surfaceState.js';

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
