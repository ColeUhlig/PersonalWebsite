// What the proof panel and the parity test run: the hero sea (engine/config.js defaults, the sea
// Cole judged in A2) on the High tier's three cascades, at the page's seed and a frozen time.
import { readConfig, FOAM_TEXELS, LOOP_PERIOD, MAP_TEXELS, SEED } from '../engine/config.js';
import * as Tier from '../core/tier.js';

const SEA = readConfig('');
const HIGH = Tier.presets.High;

export const PROOF_TIME = 12; // seconds; the frozen time the Studio captures and previews use
// Colour cycles of sea the foam field is stepped over before the maps are painted. Three gives
// the foam something to compare (the parity test checks the field is not empty) while keeping the
// Luau maps run short: 1.4 to 2.8 s in Node on 2026-09-30, most of it building the field and
// painting, since one step alone took 1.3 s. The painter's own history is longer, which only
// changes how much foam there is, not whether the two sides agree about it.
export const FOAM_STEPS = 3;

/** @returns {import('./luauRunner.js').CascadeOptions} */
export function cascadeOptions(overrides = {}) {
	return Object.freeze({
		index: 1,
		seed: SEED,
		time: PROOF_TIME,
		n: HIGH.n,
		sizes: HIGH.sizes,
		loopPeriod: LOOP_PERIOD,
		params: SEA.params,
		...overrides,
	});
}

/** @returns {import('./luauRunner.js').MapsOptions} */
export function mapsOptions(overrides = {}) {
	return Object.freeze({
		...cascadeOptions(),
		chop: SEA.chop,
		peak: SEA.peak,
		tint: SEA.tint,
		gamma: SEA.maskGamma,
		foam: Object.freeze({ whitecap: SEA.foam.whitecap, grow: SEA.foam.grow, decay: SEA.foam.decay }),
		foamSteps: FOAM_STEPS,
		texels: MAP_TEXELS,
		foamTexels: FOAM_TEXELS,
		deep: SEA.deep,
		subsurface: SEA.subsurface,
		...overrides,
	});
}
