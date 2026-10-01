// The arithmetic behind steps 14 and 15's charts (piece C2; lane E owns this file; spec 10.7;
// browser-free). One 256-stud tile of the flat graph's curve, sampled a stud apart along z from the
// engine's own WaveSampler over the bank laid along one axis (spread 0: every wavenumber on the
// tile's lattice, so the tile holds whole cycles and each wave is exactly one spike). Its spectrum
// comes from the engine's FFT twin (core/fft.js), which computes the inverse transform
// x[m] = sum X[k] e^{+2 pi i k m / N}: for a real signal the forward one is its conjugate over N.
// The chord is three fixed tones (TONES) summed; switching a tone off zeroes its two bins and the
// inverse transform rebuilds what is left. Nothing here is drawn by hand.
import * as FFT from '../core/fft.js';
import * as WaveSampler from '../core/waveSampler.js';
import { TEACHING_TILE } from '../engine/waveBanks.js';

export const SAMPLES = 256;
// Whole cycles across the window, so each tone is one bin; phases fixed so the chord never changes.
export const TONES = Object.freeze([
	Object.freeze({ cycles: 3, amplitude: 1, phase: 0 }),
	Object.freeze({ cycles: 7, amplitude: 0.6, phase: 0.6 }),
	Object.freeze({ cycles: 12, amplitude: 0.4, phase: 1.2 }),
]);
const PLAN = FFT.plan(SAMPLES);
const SAMPLE = new Float64Array(7);
const STRIDE = WaveSampler.STRIDE;
const UNIT = (2 * Math.PI) / TEACHING_TILE;
// Below this a bin counts as empty (the FFT's rounding is near 1e-15 of the signal).
export const FLOOR = 1e-6;

/** The surface's height along x = 0 for z = 0 .. 255 studs, at time t (chop 0, as the graph steps run). */
export function lineProfile(waves, t, out = new Float64Array(SAMPLES)) {
	for (let m = 0; m < SAMPLES; m++) {
		out[m] = WaveSampler.sample(waves.packed, waves.count, t, 0, (m * TEACHING_TILE) / SAMPLES, 0, waves.weights, 0, SAMPLE)[1];
	}
	return out;
}

/** X[k] = (1 / N) sum x[m] e^{-2 pi i k m / N}, for a real signal. */
export function forward(signal) {
	const re = Float64Array.from(signal);
	const im = new Float64Array(SAMPLES);
	FFT.inverse1D(PLAN, re, im, 0, 1);
	for (let k = 0; k < SAMPLES; k++) {
		re[k] /= SAMPLES;
		im[k] = -im[k] / SAMPLES;
	}
	return { re, im };
}

/** The signal back from forward's spectrum (its real part). */
export function inverse({ re, im }) {
	const r = Float64Array.from(re);
	const i = Float64Array.from(im);
	FFT.inverse1D(PLAN, r, i, 0, 1);
	return r;
}

/** Each frequency's height: |X0| at 0, 2|Xk| up to the Nyquist bin, |X(N/2)| there. */
export function amplitudes({ re, im }) {
	const half = SAMPLES / 2;
	const out = new Float64Array(half + 1);
	for (let k = 0; k <= half; k++) {
		const magnitude = Math.hypot(re[k], im[k]);
		out[k] = k === 0 || k === half ? magnitude : 2 * magnitude;
	}
	return out;
}

/** The bins above FLOOR (bin 0 excluded: a teaching sea has no mean height). */
export function peaks(heights, floor = FLOOR) {
	const found = [];
	for (let k = 1; k < heights.length; k++) if (heights[k] > floor) found.push(k);
	return found;
}

/** Where each summed wave of a bank laid along one axis should spike, and how tall. */
export function bankSpikes(waves) {
	const spikes = [];
	for (let wave = 0; wave < waves.count; wave++) {
		const o = wave * STRIDE;
		const amplitude = waves.packed[o + 2] * waves.weights[wave];
		if (amplitude === 0) continue;
		spikes.push({ n: Math.round((waves.packed[o] * waves.packed[o + 5]) / UNIT), amplitude });
	}
	return spikes;
}

/** The three tones summed, and rebuilt with the ones switched off removed from the spectrum. */
export function chord(notes) {
	const signal = new Float64Array(SAMPLES);
	for (const tone of TONES) {
		for (let m = 0; m < SAMPLES; m++) signal[m] += tone.amplitude * Math.sin((2 * Math.PI * tone.cycles * m) / SAMPLES + tone.phase);
	}
	const spectrum = forward(signal);
	const kept = { re: Float64Array.from(spectrum.re), im: Float64Array.from(spectrum.im) };
	TONES.forEach((tone, i) => {
		if (notes[i]) return;
		for (const bin of [tone.cycles, SAMPLES - tone.cycles]) {
			kept.re[bin] = 0;
			kept.im[bin] = 0;
		}
	});
	return { chord: signal, rebuilt: inverse(kept), before: amplitudes(spectrum), after: amplitudes(kept) };
}
