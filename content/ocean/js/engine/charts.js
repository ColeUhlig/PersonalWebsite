// The numbers behind the story's charts (A3; not a twin): the spectrum curve of step 7, the
// spinning phase arrows of step 8 and the naive-sum against FFT timing of step 9, as plain arrays
// and objects. Nothing here draws; piece C does. Every number comes from the same core the ocean
// runs, at the parameters it is given (the page passes the ocean's live ones), so a chart never
// shows a sea the water is not.
import * as Cascade from '../core/cascade.js';
import * as FFT from '../core/fft.js';
import * as NaiveDft from '../core/naiveDft.js';
import * as Random from '../core/random.js';
import * as Spectrum from '../core/spectrum.js';
import * as Tier from '../core/tier.js';
import * as WaveField from '../core/waveField.js';
import { check } from '../core/luau.js';
import { cascadeSeed, LOOP_PERIOD, SEED } from './config.js';

// A fixed axis, so moving the wind moves the curve rather than the axis: 0.2 to 6 rad/s holds the
// peak from the calmest slider setting (wind 3 m/s at 5,000 m, peak 4.1 rad/s) to the stormiest
// (25 m/s at 200,000 m, 0.59 rad/s).
export const SPECTRUM_AXIS = Object.freeze({ from: 0.2, to: 6, points: 200 });
// The naive sum is O(n^4): 38 ms at n = 64 in Node on Cole's Mac (2026-09-30), about 0.6 s at 128,
// which would freeze the page.
export const MAX_NAIVE_N = 64;
// Fast runs are repeated until the clock has something to read: browsers coarsen performance.now().
const MIN_TIMED_MS = 5;
const MAX_RUNS = 2000;

/**
 * S(omega) across the axis: `physical` is JONSWAP with the depth factor (m^2 s / rad), `shaped` is
 * what the sea actually runs, times scale^2 and the tail boost above the peak (Spectrum.variance's
 * shaping). `bands` are the cascades' wavenumber ranges, open tops capped at Nyquist, in k and in
 * omega, for a chart that shades which layer carries which waves.
 */
export function spectrumCurve(
	params,
	{
		from = SPECTRUM_AXIS.from,
		to = SPECTRUM_AXIS.to,
		points = SPECTRUM_AXIS.points,
		sizes = Tier.presets.High.sizes,
		n = Tier.presets.High.n,
	} = {},
) {
	Spectrum.validateParams(params);
	check(Number.isFinite(from) && from > 0 && Number.isFinite(to) && to > from, `the axis must run upwards from a positive omega, got ${from} .. ${to}`);
	check(Number.isInteger(points) && points >= 2, `points must be an integer of at least 2, got ${points}`);
	const peakOmega = Spectrum.peakOmega(params);
	const omega = [];
	const physical = [];
	const shaped = [];
	for (let i = 0; i < points; i++) {
		const w = i === points - 1 ? to : from + ((to - from) * i) / (points - 1);
		const s = Spectrum.jonswap(w, params) * Spectrum.depthFactor(w, params);
		const boost = w > peakOmega ? (w / peakOmega) ** (2 * params.tailBoost) : 1;
		omega.push(w);
		physical.push(s);
		shaped.push(s * params.scale * params.scale * boost);
	}
	const bands = WaveField.bands(sizes, n).map((band, i) => {
		const kMax = Math.min(band.kMax, (Math.PI * n) / sizes[i]);
		return { size: sizes[i], kMin: band.kMin, kMax, omegaMin: Spectrum.omega(band.kMin, params), omegaMax: Spectrum.omega(kMax, params) };
	});
	return { omega, physical, shaped, peakOmega, peakWavelength: (2 * Math.PI * params.gravity) / (peakOmega * peakOmega), bands };
}

/**
 * The `count` tallest starting waves of cascade 1 at this sea and seed: the very h0 the ocean's
 * cascade 1 holds (same band, seed and loop period), so the arrows beside the ocean are its own
 * waves. Builds one cascade (4 to 9 ms in Node): make it once per sea and seed, then read it with
 * phaseArrowsAt every frame.
 */
export function createPhaseArrows(params, { seed = SEED, count = 8, sizes = Tier.presets.High.sizes, n = Tier.presets.High.n } = {}) {
	check(Number.isInteger(count) && count >= 1 && count <= n * n, `count must be an integer 1 .. ${n * n}, got ${count}`);
	const band = WaveField.bands(sizes, n)[0];
	const cascade = Cascade.create({ n, size: sizes[0], kMin: band.kMin, kMax: band.kMax, seed: cascadeSeed(seed, 1), loopPeriod: LOOP_PERIOD, params });
	const amplitude = (i) => Math.hypot(cascade.h0Re[i], cascade.h0Im[i]);
	const order = Array.from({ length: cascade.cells }, (_, i) => i).sort((a, b) => amplitude(b) - amplitude(a) || a - b);
	const components = order.slice(0, count).map((i) =>
		Object.freeze({
			kx: cascade.kx[i],
			kz: cascade.kz[i],
			wavelength: 2 * Math.PI * cascade.invK[i],
			omega: cascade.omega[i],
			h0Re: cascade.h0Re[i],
			h0Im: cascade.h0Im[i],
			amplitude: amplitude(i),
		}),
	);
	return Object.freeze({ components: Object.freeze(components) });
}

// Each arrow at time t: h0 e^{-i omega t} (Euler's formula), the phasor the cascade's evolve turns.
export function phaseArrowsAt(arrows, t) {
	check(Number.isFinite(t), `t must be finite, got ${t}`);
	return arrows.components.map((c) => {
		const phase = -c.omega * t;
		const cp = Math.cos(phase);
		const sp = Math.sin(phase);
		return { re: c.h0Re * cp - c.h0Im * sp, im: c.h0Re * sp + c.h0Im * cp, amplitude: c.amplitude, omega: c.omega, wavelength: c.wavelength, kx: c.kx, kz: c.kz };
	});
}

function timePerRun(run) {
	let runs = 0;
	let elapsed = 0;
	const started = performance.now();
	do {
		run();
		runs += 1;
		elapsed = performance.now() - started;
	} while (elapsed < MIN_TIMED_MS && runs < MAX_RUNS);
	return elapsed / runs;
}

/**
 * One n x n grid of random waves summed both ways, timed live on this machine: the naive
 * term-by-term inverse DFT and the radix-2 FFT the ocean runs, and the largest difference between
 * their answers. `operations` counts complex multiply-adds: n^4 for the naive sum, n^2 log2 n
 * butterflies for the FFT. The FFT time includes copying its input (it works in place). Runs on
 * the calling thread: the naive sum at n = 64 blocks for tens of milliseconds, so call it on a
 * slider change, never per frame.
 */
export function measureTransforms(n, { seed = 1 } = {}) {
	check(
		Number.isInteger(n) && n >= 2 && n <= MAX_NAIVE_N && (n & (n - 1)) === 0,
		`n must be a power of two from 2 to ${MAX_NAIVE_N}, got ${n}`,
	);
	const cells = n * n;
	const random = Random.create(seed);
	const re = new Float64Array(cells);
	const im = new Float64Array(cells);
	for (let i = 0; i < cells; i++) {
		re[i] = random.nextNumber() * 2 - 1;
		im[i] = random.nextNumber() * 2 - 1;
	}
	const naiveRe = new Float64Array(cells);
	const naiveIm = new Float64Array(cells);
	const naiveMs = timePerRun(() => NaiveDft.inverse2D(n, re, im, naiveRe, naiveIm));
	const plan = FFT.plan(n);
	const fftRe = new Float64Array(cells);
	const fftIm = new Float64Array(cells);
	const fftMs = timePerRun(() => {
		fftRe.set(re);
		fftIm.set(im);
		FFT.inverse2D(plan, fftRe, fftIm);
	});
	let maxDifference = 0;
	for (let i = 0; i < cells; i++) {
		maxDifference = Math.max(maxDifference, Math.abs(naiveRe[i] - fftRe[i]), Math.abs(naiveIm[i] - fftIm[i]));
	}
	return Object.freeze({
		n,
		waves: cells,
		naiveMs,
		fftMs,
		speedup: naiveMs / fftMs,
		operations: Object.freeze({ naive: cells * cells, fft: cells * Math.log2(n) }),
		maxDifference,
	});
}
