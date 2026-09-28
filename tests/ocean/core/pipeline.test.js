// One frame of the High tier through the whole core, in the order the Roblox coordinator runs it
// (roblox-ocean/src/client/OceanCoordinator/OceanClient.client.luau and Surface.luau): the
// cascades evolve and pack into the store, the store promotes and blends, every patch of every
// ring is sampled with the coordinator's window centres, skirt depth and ring contexts, and the
// painter's colour base, peak mask and foam step read the blended display. Proves the modules
// compose the way A2 will call them; the one console line is the first Node timing of the port.
import { test } from 'node:test';
import * as expect from '../expect.js';
import * as Spectrum from '../../../content/ocean/js/core/spectrum.js';
import * as WaveField from '../../../content/ocean/js/core/waveField.js';
import * as FieldStore from '../../../content/ocean/js/core/fieldStore.js';
import * as RingLayout from '../../../content/ocean/js/core/ringLayout.js';
import * as Tier from '../../../content/ocean/js/core/tier.js';
import * as SurfaceSampler from '../../../content/ocean/js/core/surfaceSampler.js';
import * as Swells from '../../../content/ocean/js/core/swells.js';
import * as FoamField from '../../../content/ocean/js/core/foamField.js';
import * as WaterColour from '../../../content/ocean/js/core/waterColour.js';
import * as PeakMask from '../../../content/ocean/js/core/peakMask.js';
import { color3 } from '../../../content/ocean/js/core/luau.js';

const LOOP = 120;
const T = 12;
const SCALE = 8;
const CHOP = 0.8;
// The coordinator's SWELL_SPECS times Look.SEA.swellScale, which ships at 0: the two trains are
// there but silent, as on the live sea (Swells.create refuses an empty list).
const SWELL_SCALE = 0;
const SWELL_SPECS = [
	{ wavelength: 420, amplitude: 1.2 * SWELL_SCALE, direction: 0.2, phase: 0 },
	{ wavelength: 260, amplitude: 0.7 * SWELL_SCALE, direction: -0.4, phase: 1 },
];
// Surface.luau: the part's box height from the coordinator's bounds formula, and the skirt two
// studs inside it, through float32 as the Luau takes it through a Vector3.
const SKIRT_MARGIN = 2;
const BOUNDS_HEIGHT = 8 + 4 * SCALE + 2.5 * SWELL_SCALE;
const SKIRT_Y = Math.fround(-(BOUNDS_HEIGHT - SKIRT_MARGIN));
// The viewer, at the origin; every ring's window centre follows from it.
const FOCUS_X = 0;
const FOCUS_Z = 0;
// OceanFlatNormals is false by default from M3: the vertex normals are written.
const FLAT = false;

test('one High-tier frame: cascades, store, every patch, foam and the colour and mask maps', () => {
	const preset = Tier.presets.High;
	const params = Spectrum.validateParams({ ...Spectrum.NORMAL, scale: SCALE, tailBoost: -0.3, isotropy: 0.4 });
	const field = WaveField.create({ params, n: preset.n, sizes: preset.sizes, seed: 1, loopPeriod: LOOP, chop: CHOP, swells: SWELL_SPECS });
	const store = FieldStore.create(preset.n, preset.sizes);
	const cells = preset.n * preset.n;
	const packed = new Float32Array(FieldStore.bufferSize(cells) / 4);
	const started = performance.now();
	for (let index = 1; index <= preset.sizes.length; index++) {
		WaveField.update(field, index, T);
		FieldStore.pack(field.cascades[index - 1], packed);
		FieldStore.receive(store, index, packed, T);
		expect.truthy(FieldStore.promote(store, index, index), `cascade ${index} promoted`);
		FieldStore.blend(store, index, 1);
	}
	const cascadeMs = performance.now() - started;

	const layout = RingLayout.build({ rings: preset.rings, patchCells: preset.patchCells, textureTile: preset.textureTile });
	const swells = Swells.create(SWELL_SPECS, params, LOOP);
	const rings = preset.rings;
	// Surface.adopt: each ring's window centre for this viewer.
	const centres = rings.map((ringSpec) => RingLayout.windowCentre(FOCUS_X, FOCUS_Z, ringSpec.spacing));
	let written = 0;
	let covered = 0;
	let maxHeight = 0;
	const fillStarted = performance.now();
	// Surface.write: ring by ring, the ring's context and the finer window it skirts worked out once.
	for (let ring = 1; ring <= rings.length; ring++) {
		const ringSpec = rings[ring - 1];
		const nextRingSpec = rings[ring] ?? null;
		const context = SurfaceSampler.ringContext(ringSpec, nextRingSpec);
		const centre = centres[ring - 1];
		const inner = centres[ring - 2];
		const innerRing = rings[ring - 2];
		const innerX = inner ? inner[0] : 0;
		const innerZ = inner ? inner[1] : 0;
		const innerHalf = innerRing ? innerRing.halfExtent : 0;
		for (const patch of layout.patches) {
			if (patch.ring !== ring) {
				continue;
			}
			const count = (patch.cells + 1) * (patch.cells + 1);
			const positions = new Float32Array(count * 3);
			const normals = new Float32Array(count * 3);
			const hidden = SurfaceSampler.fill(
				patch, ringSpec, nextRingSpec, ringSpec.halfExtent, store, swells, T, CHOP,
				centre[0], centre[1], FOCUS_X, FOCUS_Z, innerX, innerZ, innerHalf, SKIRT_Y,
				positions, normals, FLAT, context,
			);
			for (let i = 0; i < positions.length; i++) {
				expect.truthy(Number.isFinite(positions[i]) && Number.isFinite(normals[i]), `patch value ${i} finite`);
			}
			for (let v = 0; v < count; v++) {
				const y = positions[v * 3 + 1];
				// Skirted vertices sit at a known depth and say nothing about the waves (Surface.write).
				if (y !== SKIRT_Y) {
					maxHeight = Math.max(maxHeight, Math.abs(y));
					const length = Math.hypot(normals[v * 3], normals[v * 3 + 1], normals[v * 3 + 2]);
					expect.near(length, 1, 1e-5, `unit normal on ring ${ring}`);
				}
			}
			covered += hidden ? 1 : 0;
			written += count;
		}
	}
	const fillMs = performance.now() - fillStarted;
	expect.equal(written, layout.vertexCount, 'every vertex of the layout was written');
	expect.truthy(covered > 0 && covered < layout.patches.length, `some patches, not all, lie under a finer ring: ${covered}`);
	expect.truthy(maxHeight > 0.5 && maxHeight < BOUNDS_HEIGHT, `plausible heights at scale 8: max ${maxHeight}`);

	const texels = 128;
	const all = [1, 2, 3];
	const mapsStarted = performance.now();
	// WaterColour.base is RGB, 3 bytes a texel; the peak mask is RGBA, 4.
	const colour = new Uint8Array(texels * texels * 3);
	const lut = WaterColour.lut(color3(8 / 255, 46 / 255, 72 / 255), color3(28 / 255, 168 / 255, 156 / 255));
	WaterColour.base(colour, texels, preset.textureTile, store.display, all, 10.3, 0.35, lut);
	const mask = new Uint8Array(texels * texels * 4);
	const found = PeakMask.fill(mask, texels, preset.textureTile, store.display, all, 10.3, 0.8);
	expect.truthy(Number.isFinite(found) && found > 0, `mask found a crest: ${found}`);
	expect.truthy(colour.some((byte) => byte > 0), 'the colour map has colour');
	expect.truthy(mask.some((byte, i) => i % 4 !== 3 && byte > 0), 'the mask lights a crest');

	const foam = FoamField.create(256);
	const cover = FoamField.stepRows(foam, 0, 256, store.display, all, preset.textureTile, CHOP, { whitecap: 0.35, grow: 2, decay: 0.86 });
	const mapsMs = performance.now() - mapsStarted;
	expect.truthy(cover >= 0 && cover <= 1, `foam cover in range: ${cover}`);

	console.log(`[ocean-core] cascades ${cascadeMs.toFixed(1)} ms, surface fill ${fillMs.toFixed(1)} ms (${written} vertices), maps ${mapsMs.toFixed(1)} ms, foam cover ${cover.toFixed(3)}`);
});
