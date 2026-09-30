// Two or three long analytic Gerstner waves outside the FFT. They carry the slow silhouette
// motion a 256 stud patch cannot hold, break up the FFT's repetition, and are the closed
// form that buoyancy needs (WaveField.heightAt). Same packed layout as Jonswap's banks so
// WaveSampler does the work.
// Twin of roblox-ocean/src/shared/Ocean/Swells.luau.
import * as Spectrum from './spectrum.js';
import * as WaveSampler from './waveSampler.js';
import { check } from './luau.js';

/**
 * @typedef {object} SwellSpec
 * @property {number} wavelength studs
 * @property {number} amplitude studs
 * @property {number} direction radians from +x toward +z
 * @property {number} phase radians
 */

/**
 * @typedef {object} Bank
 * @property {Float64Array} packed STRIDE numbers per wave: k, omega, A, phase, dx, dz
 * @property {number} count
 * @property {Float64Array} weights all 1; WaveSampler requires a weight per wave
 * @property {boolean} silent every amplitude is zero, so the whole bank can be skipped
 */

const STRIDE = WaveSampler.STRIDE;

// Dispersion comes from Spectrum.omega, the same finite-depth relation the cascades use, so
// a swell and an FFT wave of the same wavelength travel at the same speed.
/**
 * @param {SwellSpec[]} list
 * @param {import('./spectrum.js').Params} params
 * @param {number} loopPeriod
 * @returns {Readonly<Bank>}
 */
export function create(list, params, loopPeriod) {
	check(list.length >= 1, 'at least one swell');
	const omega0 = (2 * Math.PI) / loopPeriod;
	const packed = new Float64Array(list.length * STRIDE);
	const weights = new Float64Array(list.length).fill(1);
	// Decided here, once, because the surface sampler asks it per patch per frame.
	let silent = true;
	for (let wave = 0; wave <= list.length - 1; wave++) {
		const swell = list[wave];
		check(swell.wavelength > 0, `wavelength must be positive, got ${swell.wavelength}`);
		if (swell.amplitude !== 0) {
			silent = false;
		}
		const k = (2 * Math.PI) / swell.wavelength;
		const omega = Math.floor(Spectrum.omega(k, params) / omega0) * omega0;
		const o = wave * STRIDE;
		packed[o] = k;
		packed[o + 1] = omega;
		packed[o + 2] = swell.amplitude;
		packed[o + 3] = swell.phase;
		packed[o + 4] = Math.cos(swell.direction);
		packed[o + 5] = Math.sin(swell.direction);
	}
	// The Luau freezes packed and weights too; a non-empty Float64Array cannot be frozen, so
	// they stay writable.
	return Object.freeze({
		packed,
		count: list.length,
		weights,
		silent,
	});
}

// True when every swell has zero amplitude (the look turned them off), so samplers can skip
// the bank entirely. Swells.create worked this out; this is a field read.
export function isSilent(bank) {
	return bank.silent;
}

// Writes dx, dy, dz, nx, ny, nz, jacobian (see WaveSampler) into out[0..6] and returns out.
export function sample(bank, t, x, z, chop, out = new Float64Array(7)) {
	return WaveSampler.sample(bank.packed, bank.count, t, x, z, chop, bank.weights, 0, out);
}

// Height only, no lateral displacement: cheap, stateless, identical on every machine.
// Assumes every weight is 1, which Swells.create guarantees; sample() applies weights,
// heightAt does not.
export function heightAt(bank, t, x, z) {
	const packed = bank.packed;
	let total = 0;
	for (let wave = 0; wave <= bank.count - 1; wave++) {
		const o = wave * STRIDE;
		const k = packed[o];
		const omega = packed[o + 1];
		const amplitude = packed[o + 2];
		const phase = packed[o + 3];
		const dirX = packed[o + 4];
		const dirZ = packed[o + 5];
		total += amplitude * Math.sin(k * (dirX * x + dirZ * z) - omega * t + phase);
	}
	return total;
}
