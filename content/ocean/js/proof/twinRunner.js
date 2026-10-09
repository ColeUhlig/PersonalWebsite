// The JavaScript side of the proof: the A1 core twins doing exactly what the Luau bundle's Entry
// does (roblox-ocean scripts/web_bundle.py), so the two answers can be compared byte for byte.
// Browser-free; timings use performance.now(), a global in Node and browsers.
import * as Cascade from '../core/cascade.js';
import * as FFT from '../core/fft.js';
import * as FieldStore from '../core/fieldStore.js';
import * as FoamField from '../core/foamField.js';
import * as PeakMask from '../core/peakMask.js';
import * as WaterColour from '../core/waterColour.js';
import * as WaveField from '../core/waveField.js';
import { color3 } from '../core/luau.js';

// The foam field steps 15 colour cycles a second, a quarter of its rows at a time (Entry.maps and
// scripts/m2_preview.py step it the same way).
const FOAM_HZ = 15;
const QUARTERS = 4;

function colour(bytes) {
	return color3(bytes[0] / 255, bytes[1] / 255, bytes[2] / 255);
}

/**
 * Entry.cascade's twin: one cascade built, evolved and synthesised, then packed.
 * @param {import('./luauRunner.js').CascadeOptions} o
 * @returns {{ packed: Float32Array, ms: number }}
 */
export function runCascadeTwin(o) {
	const bands = WaveField.bands(o.sizes, o.n);
	const started = performance.now();
	const cascade = Cascade.create({
		n: o.n,
		size: o.sizes[o.index - 1],
		kMin: bands[o.index - 1].kMin,
		kMax: bands[o.index - 1].kMax,
		seed: o.seed * 7919 + o.index,
		loopPeriod: o.loopPeriod,
		params: o.params,
	});
	Cascade.evolve(cascade, o.time);
	Cascade.synthesise(cascade, FFT.plan(o.n));
	const ms = performance.now() - started;
	const packed = new Float32Array(FieldStore.bufferSize(o.n * o.n) / 4);
	FieldStore.pack(cascade, packed);
	return { packed, ms };
}

/**
 * Entry.maps's twin: the whole field, the foam stepped over `foamSteps` cycles ending at `time`,
 * then the water colour base and the peak mask.
 * @param {import('./luauRunner.js').MapsOptions} o
 * @returns {{ base: Uint8Array, mask: Uint8Array, foam: Float32Array, found: number, ms: number }}
 */
export function runMapsTwin(o) {
	const started = performance.now();
	const field = WaveField.create({
		params: o.params,
		n: o.n,
		sizes: o.sizes,
		seed: o.seed,
		loopPeriod: o.loopPeriod,
		chop: o.chop,
		swells: [{ wavelength: 420, amplitude: 0, direction: 0.2, phase: 0 }],
	});
	const tile = o.sizes[0];
	const cascades = o.sizes.map((_, i) => i + 1);
	const foam = FoamField.newGrid(o.foamTexels, tile);
	const quarter = Math.floor(o.foamTexels / QUARTERS); // Luau's foamTexels // 4
	for (let k = 1; k <= o.foamSteps; k++) {
		const tk = o.time - (o.foamSteps - k) / FOAM_HZ;
		for (const index of cascades) {
			WaveField.update(field, index, tk);
		}
		for (let band = 1; band <= QUARTERS; band++) {
			FoamField.stepRows(foam, (band - 1) * quarter, quarter, field.cascades, cascades, tile, o.chop, o.foam);
		}
	}
	const base = new Uint8Array(o.texels * o.texels * 3);
	WaterColour.base(base, o.texels, tile, field.cascades, cascades, o.peak, o.tint, WaterColour.lut(colour(o.deep), colour(o.subsurface)));
	const mask = new Uint8Array(o.texels * o.texels * 4);
	const found = PeakMask.fill(mask, o.texels, tile, field.cascades, cascades, 0, o.gamma, undefined);
	const ms = performance.now() - started;
	return { base, mask, foam: foam.foam, found, ms };
}
