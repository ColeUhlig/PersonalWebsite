// JONSWAP sea spectrum, discretised into a bank of sinusoids. Port of
// jonswap-ocean/js/jonswap.js with its fix kept: the amplitude scale is applied once.
// Twin of roblox-ocean/src/shared/Ocean/Jonswap.luau.
import { check, mod } from './luau.js';
import * as Random from './random.js';

/**
 * @typedef {object} Config
 * @property {number} count frequency bins, one wave each
 * @property {number} firstFrequency Hz of the first bin; start where the energy is, not at zero
 * @property {number} deltaF bin width in Hz
 * @property {number} peakFrequency
 * @property {number} alpha Phillips constant
 * @property {number} gamma peak enhancement
 * @property {number} scale visual amplitude multiplier
 * @property {number} windDirection degrees from +x toward +z; the waves travel this way
 * @property {number} spread degrees either side of the wind that a wave may head
 * @property {number} tailBoost Stylisation: bins above the peak are scaled by (f / peak) ^ tailBoost.
 *   0 is the true spectrum, whose short waves are centimetres tall and read as glass at game scale.
 */

/**
 * @typedef {object} WaveBank
 * @property {Float64Array} packed STRIDE numbers per wave: k, omega, A, phase, dx, dz
 * @property {number} count
 * @property {number} peakHeight every wave in phase: a bound, almost never reached
 * @property {number} rmsHeight the sea's typical height; use this to scale colour and glow
 */

export const GRAVITY = 9.81;
const TAU = 2 * Math.PI;
export const STRIDE = 6;
const SIGMA_BELOW_PEAK = 0.07;
const SIGMA_ABOVE_PEAK = 0.09;

// math.rad
function rad(degrees) {
	return degrees * (Math.PI / 180);
}

// Pierson-Moskowitz (fully developed sea) times gamma^r, where r is a Gaussian around the
// peak with an asymmetric width.
export function spectrum(f, peakFrequency, gamma, alpha) {
	const sigma = f <= peakFrequency ? SIGMA_BELOW_PEAK : SIGMA_ABOVE_PEAK;
	const offset = f - peakFrequency;
	const r = Math.exp(-(offset * offset) / (2 * sigma * sigma * peakFrequency * peakFrequency));
	const ratio = peakFrequency / f;
	const piersonMoskowitz = alpha * GRAVITY * GRAVITY * TAU ** -4 * f ** -5 * Math.exp(-1.25 * ratio ** 4);
	return piersonMoskowitz * gamma ** r;
}

// Amplitude of a bin is sqrt(2 S(f) df). Phase is random; direction is the wind plus a
// random offset weighted toward zero (the mean of two uniforms), so the sea rolls one way
// instead of boiling. Wave number follows deep-water dispersion, k = omega^2 / g.
// Same seed, same sea.
/** @returns {Readonly<WaveBank>} */
export function generateWaves(config, seed) {
	check(config.count >= 1 && mod(config.count, 1) === 0, `count must be a positive integer, got ${config.count}`);
	check(config.firstFrequency > 0, `firstFrequency must be positive, got ${config.firstFrequency}`);
	check(config.deltaF > 0, `deltaF must be positive, got ${config.deltaF}`);
	check(config.peakFrequency > 0, `peakFrequency must be positive, got ${config.peakFrequency}`);
	check(config.spread >= 0, `spread must not be negative, got ${config.spread}`);

	const random = Random.create(seed);
	const packed = new Float64Array(config.count * STRIDE);
	let totalAmplitude = 0;
	let sumSquares = 0;

	for (let bin = 1; bin <= config.count; bin++) {
		const f = config.firstFrequency + (bin - 1) * config.deltaF;
		const omega = TAU * f;
		const s = spectrum(f, config.peakFrequency, config.gamma, config.alpha);
		let amplitude = Math.sqrt(2 * s * config.deltaF) * config.scale;
		if (f > config.peakFrequency) {
			amplitude *= (f / config.peakFrequency) ** config.tailBoost;
		}
		const offset = random.nextNumber() + random.nextNumber() - 1;
		const theta = rad(config.windDirection + offset * config.spread);
		const phase = random.nextNumber() * TAU;
		totalAmplitude += amplitude;
		sumSquares += amplitude * amplitude;

		const o = (bin - 1) * STRIDE;
		packed[o] = (omega * omega) / GRAVITY;
		packed[o + 1] = omega;
		packed[o + 2] = amplitude;
		packed[o + 3] = phase;
		packed[o + 4] = Math.cos(theta);
		packed[o + 5] = Math.sin(theta);
	}

	// The Luau freezes packed too; a non-empty Float64Array cannot be frozen, so it stays writable.
	return Object.freeze({
		packed,
		count: config.count,
		peakHeight: totalAmplitude / 2,
		rmsHeight: Math.sqrt(sumSquares / 2),
	});
}
