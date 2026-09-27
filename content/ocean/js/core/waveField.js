// The sea as one object: FFT cascades (three in the design) that divide the wavenumber
// range by the 12 pi / L handover rule, plus closed-form swells. `sample` reads the
// cascades' current tables (whatever time each was last synthesised at) and the swells at
// the given time; blending between two synthesised times is a later piece's job.
// The Field is mutable on purpose: `update` rewrites a cascade's tables in place, every
// frame, so it is not frozen.
// Twin of roblox-ocean/src/shared/Ocean/WaveField.luau.
import * as Cascade from './cascade.js';
import * as FFT from './fft.js';
import * as Jacobian from './jacobian.js';
import * as Swells from './swells.js';
import { check } from './luau.js';

/**
 * @typedef {object} Config
 * @property {import('./spectrum.js').Params} params
 * @property {number} n
 * @property {number[]} sizes patch sizes in studs, largest first
 * @property {number} seed
 * @property {number} loopPeriod
 * @property {number} chop lambda: scales horizontal displacement and the Jacobian
 * @property {import('./swells.js').SwellSpec[]} swells
 */

/**
 * @typedef {object} Band
 * @property {number} kMin
 * @property {number} kMax
 */

/**
 * @typedef {object} Field
 * @property {Config} config
 * @property {ReturnType<typeof FFT.plan>} plan
 * @property {import('./cascade.js').Cascade[]} cascades cascade i (Luau number) at cascades[i - 1]
 * @property {Readonly<import('./swells.js').Bank>} swells
 */

const HANDOVER = 12 * Math.PI;

// Per-call scratch for sample(): one cascade's eight values and the swells' seven. Shared at
// module level, so sample() is not reentrant (single-threaded use only).
const CASCADE_OUT = new Float64Array(8);
const SWELL_OUT = new Float64Array(7);

// Cascade i keeps wavenumbers from 12 pi / size_i (0 for the largest) up to 12 pi / size_{i+1}
// (open above for the smallest; Cascade caps it at Nyquist).
/** @returns {ReadonlyArray<Readonly<Band>>} */
export function bands(sizes, n) {
	const result = [];
	for (let index = 1; index <= sizes.length; index++) {
		const size = sizes[index - 1];
		const nextSize = sizes[index];
		const kMin = index === 1 ? 0 : HANDOVER / size;
		const kMax = nextSize !== undefined ? HANDOVER / nextSize : Infinity;
		const nyquist = (Math.PI * n) / size;
		check(
			kMax === Infinity || kMax <= nyquist + 1e-12,
			`cascade ${index} (${size} studs) cannot resolve its handover at ${kMax}: Nyquist is ${nyquist}. Use a smaller size ratio or a larger n`,
		);
		result.push(Object.freeze({ kMin, kMax }));
	}
	return Object.freeze(result);
}

/**
 * @param {Config} config
 * @returns {Field}
 */
export function create(config) {
	check(config.sizes.length >= 1, 'at least one cascade');
	for (let index = 2; index <= config.sizes.length; index++) {
		check(config.sizes[index - 1] < config.sizes[index - 2], 'sizes must be largest first');
	}
	const fieldBands = bands(config.sizes, config.n);
	const cascades = [];
	for (let index = 1; index <= config.sizes.length; index++) {
		// The seed uses the Luau cascade number (1-based), so a seed gives the same cascades
		// as the Luau does.
		cascades[index - 1] = Cascade.create({
			n: config.n,
			size: config.sizes[index - 1],
			kMin: fieldBands[index - 1].kMin,
			kMax: fieldBands[index - 1].kMax,
			seed: config.seed * 7919 + index,
			loopPeriod: config.loopPeriod,
			params: config.params,
		});
	}
	return {
		config,
		plan: FFT.plan(config.n),
		cascades,
		swells: Swells.create(config.swells, config.params, config.loopPeriod),
	};
}

// `index` is the Luau cascade number: 1 is the largest patch.
export function update(field, index, t) {
	const cascade = field.cascades[index - 1];
	check(cascade, `no cascade ${index}`);
	Cascade.evolve(cascade, t);
	Cascade.synthesise(cascade, field.plan);
}

// Writes height, dispX, dispZ, slopeX, slopeZ, jacobian at world (x, z) into out[0..5] and
// returns out.
export function sample(field, x, z, t, out = new Float64Array(6)) {
	const chop = field.config.chop;
	let height = 0;
	let dispX = 0;
	let dispZ = 0;
	let slopeX = 0;
	let slopeZ = 0;
	let jxx = 0;
	let jzz = 0;
	let jxz = 0;
	for (const cascade of field.cascades) {
		const s = Cascade.sample(cascade, x, z, CASCADE_OUT);
		height += s[0];
		dispX += s[1] * chop;
		dispZ += s[2] * chop;
		slopeX += s[3];
		slopeZ += s[4];
		jxx += s[5];
		jzz += s[6];
		jxz += s[7];
	}
	const swell = Swells.sample(field.swells, t, x, z, chop, SWELL_OUT);
	out[0] = height + swell[1];
	out[1] = dispX + swell[0];
	out[2] = dispZ + swell[2];
	out[3] = slopeX;
	out[4] = slopeZ;
	out[5] = Jacobian.determinant(jxx, jzz, jxz, chop);
	return out;
}

// The gameplay query: closed form, stateless, agrees on every machine.
export function heightAt(field, x, z, t) {
	return Swells.heightAt(field.swells, t, x, z);
}
