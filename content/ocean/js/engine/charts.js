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
// The naive sum is O(n^4): 28 ms at n = 64 in Node on Cole's Mac (2026-09-30, warm), about 0.45 s
// at 128, which would freeze the page.
export const MAX_NAIVE_N = 64;
// Before the first clock starts, both transforms run untimed at WARMUP_N until the JIT has
// optimised them: timed cold, the naive sum read up to 4 times slower than it runs, and the speedup
// with it (43x at n = 8, twice the operation ratio). 120 naive runs is what brings a first single
// run at n = 64 down to the warm figure: after 30 it still read 25 to 35% slow, and 4 runs at
// n = 32 fixed n = 64 but left a first n = 8 call slow. The warm-up costs about 21 ms (20 naive,
// 1.3 FFT), so it runs once per page (the `warmedUp` flag below), at 16 whatever n the first call
// asks for: a warm-up at n = 2 would leave a later n = 64 cold.
const WARMUP_N = 16;
const WARMUP_RUNS = Object.freeze({ naive: 120, fft: 200 });
// Then the two are timed in alternating batches and each reports its median batch, so a spike of
// load hits both and moves neither. Fast runs repeat within a batch until the clock has something
// to read (browsers coarsen performance.now()). Batches stop at MAX_BATCHES, or after MIN_BATCHES
// once TIME_BUDGET_MS has gone. A naive run slower than SINGLE_NAIVE_MS (n = 64, 28 ms) is timed
// once, not three times: one run that long is already a steady reading, and three blocked the page
// for 200 ms and more under load. The FFT still takes its median.
export const SINGLE_NAIVE_MS = 20;
const MIN_BATCH_MS = 2;
const MAX_BATCH_RUNS = 5000;
const MIN_BATCHES = 3;
const MAX_BATCHES = 5;
const TIME_BUDGET_MS = 100;
// The wavenumber whose omega is this one, by bisection: the inverse of Spectrum.omega.
const BISECTION_STEPS = 200;
// The page's one piece of module state: whether the JIT has had its warm-up yet.
let warmedUp = false;

/**
 * S(omega) across the axis: `physical` is JONSWAP with the depth factor (m^2 s / rad), `shaped` is
 * what the sea actually runs, times scale^2 and the tail boost above the peak (Spectrum.variance's
 * shaping). `bands` are the wavenumbers each cascade actually holds, in k and in omega, for a chart
 * that shades which layer carries which waves: the band's bottom is no lower than the lattice's
 * longest wave (one wave across the patch, k = 2 pi / size; cascade 1's band itself starts at 0),
 * and the open top is capped at Nyquist. `peakWavelength` is the peak's wavelength under the
 * engine's finite-depth dispersion, not the deep-water 2 pi g / omega^2.
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
		const kMin = Math.max(band.kMin, (2 * Math.PI) / sizes[i]);
		const kMax = Math.min(band.kMax, (Math.PI * n) / sizes[i]);
		return { size: sizes[i], kMin, kMax, omegaMin: Spectrum.omega(kMin, params), omegaMax: Spectrum.omega(kMax, params) };
	});
	return { omega, physical, shaped, peakOmega, peakWavelength: (2 * Math.PI) / wavenumberFor(peakOmega, params), bands };
}

// Spectrum.omega rises with k and never exceeds the deep-water sqrt(g k), so the answer is at least
// omega^2 / g: start there and double until the bracket closes over it.
function wavenumberFor(omega, params) {
	let low = (omega * omega) / params.gravity;
	let high = 2 * low;
	while (Spectrum.omega(high, params) < omega) {
		low = high;
		high *= 2;
	}
	for (let step = 0; step < BISECTION_STEPS && high - low > Number.EPSILON * high; step++) {
		const middle = (low + high) / 2;
		if (Spectrum.omega(middle, params) < omega) {
			low = middle;
		} else {
			high = middle;
		}
	}
	return (low + high) / 2;
}

/**
 * The `count` tallest starting waves of cascade 1 at this sea and seed: the very h0 the ocean's
 * cascade 1 holds (same band, seed and loop period), so the arrows beside the ocean are its own
 * waves. Builds one cascade (4 to 9 ms in Node): make it once per sea and seed, then read it with
 * phaseArrowsAt every frame.
 *
 * Each component: `kx`, `kz` (rad/stud), `wavelength` (studs), `omega` (rad/s, the cascade's
 * loop-quantised value), `h0Re`, `h0Im` and `amplitude` = |h0| (studs). The amplitude is the
 * arrow's length, not the wave's. Cell -k holds its own h0(-k), a separate wave running the other
 * way, but its h~ also carries conj(h0(k)) e^{+i omega t}, and that term and this arrow's
 * h0(k) e^{-i omega t} make the travelling wave 2 |h0| cos(k . x - omega t + phase): its crest
 * 2 |h0| above the mean and 4 |h0| above its trough. |h0| is half the wave's amplitude.
 *
 * `count` that is not an integer from 1 to the number of cells that hold a wave (cascade 1's band
 * leaves the rest at zero) is a RangeError, not quietly fewer arrows.
 */
export function createPhaseArrows(params, { seed = SEED, count = 8, sizes = Tier.presets.High.sizes, n = Tier.presets.High.n } = {}) {
	if (!(Number.isInteger(count) && count >= 1 && count <= n * n)) {
		throw new RangeError(`count must be an integer 1 .. ${n * n}, got ${count}`);
	}
	const band = WaveField.bands(sizes, n)[0];
	const cascade = Cascade.create({ n, size: sizes[0], kMin: band.kMin, kMax: band.kMax, seed: cascadeSeed(seed, 1), loopPeriod: LOOP_PERIOD, params });
	const amplitude = (i) => Math.hypot(cascade.h0Re[i], cascade.h0Im[i]);
	let waves = 0;
	for (let i = 0; i < cascade.cells; i++) {
		if (cascade.h0Re[i] !== 0 || cascade.h0Im[i] !== 0) waves += 1;
	}
	if (count > waves) {
		throw new RangeError(`count ${count} is more than the ${waves} waves cascade 1 holds at this sea`);
	}
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

/**
 * The phase arrows for the page's charts (the dev route and the story), built once per sea and seed
 * and turned every call: `at(params, seed, t)` returns phaseArrowsAt at time t, rebuilding only when
 * the wind, the fetch or the seed changed. `at.builds()` counts the builds.
 */
export function createPhaseArrowCache({ sizes, n }) {
	let arrows = null;
	let key = '';
	let builds = 0;
	function at(params, seed, t) {
		const next = `${params.windSpeed}|${params.fetch}|${seed}`;
		if (next !== key) {
			arrows = createPhaseArrows(params, { seed, sizes, n });
			key = next;
			builds += 1;
		}
		return phaseArrowsAt(arrows, t);
	}
	at.builds = () => builds;
	return at;
}

// Each arrow at time t: h0 e^{-i omega t} (Euler's formula), the phasor the cascade's evolve turns.
// Builds `count` small objects per call (8 by default): cheap, but call it once a frame at most.
export function phaseArrowsAt(arrows, t) {
	check(Number.isFinite(t), `t must be finite, got ${t}`);
	return arrows.components.map((c) => {
		const phase = -c.omega * t;
		const cp = Math.cos(phase);
		const sp = Math.sin(phase);
		return { re: c.h0Re * cp - c.h0Im * sp, im: c.h0Re * sp + c.h0Im * cp, amplitude: c.amplitude, omega: c.omega, wavelength: c.wavelength, kx: c.kx, kz: c.kz };
	});
}

function randomGrid(n, seed) {
	const cells = n * n;
	const random = Random.create(seed);
	const re = new Float64Array(cells);
	const im = new Float64Array(cells);
	for (let i = 0; i < cells; i++) {
		re[i] = random.nextNumber() * 2 - 1;
		im[i] = random.nextNumber() * 2 - 1;
	}
	return { re, im };
}

// The naive sum into (outRe, outIm), and the FFT on a copy of the input into (outRe, outIm).
function naiveRunner(n, input, outRe, outIm) {
	return () => NaiveDft.inverse2D(n, input.re, input.im, outRe, outIm);
}

function fftRunner(n, input, outRe, outIm) {
	const plan = FFT.plan(n);
	return () => {
		outRe.set(input.re);
		outIm.set(input.im);
		FFT.inverse2D(plan, outRe, outIm);
	};
}

function warmUpOnce(seed) {
	if (warmedUp) return;
	warmedUp = true;
	const size = WARMUP_N;
	const input = randomGrid(size, seed);
	const outRe = new Float64Array(size * size);
	const outIm = new Float64Array(size * size);
	const naive = naiveRunner(size, input, outRe, outIm);
	const fft = fftRunner(size, input, outRe, outIm);
	for (let i = 0; i < WARMUP_RUNS.naive; i++) naive();
	for (let i = 0; i < WARMUP_RUNS.fft; i++) fft();
}

// Milliseconds per run over one batch.
function timeBatch(run) {
	let runs = 0;
	let elapsed = 0;
	const started = performance.now();
	do {
		run();
		runs += 1;
		elapsed = performance.now() - started;
	} while (elapsed < MIN_BATCH_MS && runs < MAX_BATCH_RUNS);
	return elapsed / runs;
}

function median(values) {
	const sorted = [...values].sort((a, b) => a - b);
	const middle = Math.floor(sorted.length / 2);
	return sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function enoughBatches(count, started) {
	return count >= MAX_BATCHES || (count >= MIN_BATCHES && performance.now() - started >= TIME_BUDGET_MS);
}

function timeBoth(naive, fft) {
	const started = performance.now();
	const naiveTimes = [timeBatch(naive)];
	const fftTimes = [timeBatch(fft)];
	const single = naiveTimes[0] > SINGLE_NAIVE_MS;
	while (!enoughBatches(fftTimes.length, started)) {
		if (!single) naiveTimes.push(timeBatch(naive));
		fftTimes.push(timeBatch(fft));
	}
	return { naiveMs: median(naiveTimes), fftMs: median(fftTimes), batches: Object.freeze({ naive: naiveTimes.length, fft: fftTimes.length }) };
}

/**
 * One n x n grid of random waves summed both ways, timed live on this machine: the naive
 * term-by-term inverse DFT and the radix-2 FFT the ocean runs, and the largest difference between
 * their answers. `operations` counts complex multiply-adds: n^4 for the naive sum, n^2 log2 n
 * butterflies for the FFT. The FFT time includes copying its input (it works in place). Both are
 * warmed up untimed on the first call, then timed in alternating batches, and each time is its
 * median batch; `batches` says how many each took (the naive sum at n = 64 takes one, see
 * SINGLE_NAIVE_MS). Runs on the calling thread: about 25 to 30 ms per call up to n = 32 (the
 * batches; the first call adds the 21 ms warm-up) and about 40 ms at n = 64, so call it on a
 * slider change, never per frame. One naive sample at n = 64 is at the mercy of the machine's
 * load, where the smaller n take medians: under load spikes it read speedups from 64x to 1,729x
 * against an operation ratio of 683, so piece C re-measures a figure that lands far off the ratio.
 */
export function measureTransforms(n, { seed = 1 } = {}) {
	check(
		Number.isInteger(n) && n >= 2 && n <= MAX_NAIVE_N && (n & (n - 1)) === 0,
		`n must be a power of two from 2 to ${MAX_NAIVE_N}, got ${n}`,
	);
	const cells = n * n;
	warmUpOnce(seed);
	const input = randomGrid(n, seed);
	const naiveRe = new Float64Array(cells);
	const naiveIm = new Float64Array(cells);
	const fftRe = new Float64Array(cells);
	const fftIm = new Float64Array(cells);
	const { naiveMs, fftMs, batches } = timeBoth(naiveRunner(n, input, naiveRe, naiveIm), fftRunner(n, input, fftRe, fftIm));
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
		batches,
	});
}
