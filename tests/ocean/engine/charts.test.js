import { execFile } from 'node:child_process';
import { test } from 'node:test';
import { promisify } from 'node:util';
import * as expect from '../expect.js';
import * as Cascade from '../../../content/ocean/js/core/cascade.js';
import * as Spectrum from '../../../content/ocean/js/core/spectrum.js';
import * as WaveField from '../../../content/ocean/js/core/waveField.js';
import { cascadeSeed, readConfig } from '../../../content/ocean/js/engine/config.js';
import * as Charts from '../../../content/ocean/js/engine/charts.js';

const HERO = readConfig('').params;

test('the spectrum curve is plain arrays over the fixed axis, peaking where JONSWAP says', () => {
	const curve = Charts.spectrumCurve(HERO);
	for (const name of ['omega', 'physical', 'shaped']) {
		expect.truthy(Array.isArray(curve[name]), `${name} is a plain array`);
		expect.equal(curve[name].length, Charts.SPECTRUM_AXIS.points, `${name} has one value per point`);
	}
	expect.equal(curve.omega[0], Charts.SPECTRUM_AXIS.from, 'axis start');
	expect.equal(curve.omega.at(-1), Charts.SPECTRUM_AXIS.to, 'axis end');
	const step = curve.omega[1] - curve.omega[0];
	const peakIndex = curve.physical.indexOf(Math.max(...curve.physical));
	expect.near(curve.omega[peakIndex], Spectrum.peakOmega(HERO), step, 'the peak where peakOmega is');
	// The wavelength the engine gives the peak: finite-depth dispersion (omega^2 = g k tanh(k depth)),
	// not the deep-water 2 pi g / omega^2, which is 2.5% long at the storm extreme.
	expect.near(Spectrum.omega((2 * Math.PI) / curve.peakWavelength, HERO), Spectrum.peakOmega(HERO), 1e-9, 'the finite-depth peak wavelength');
	const storm = Charts.spectrumCurve({ ...HERO, windSpeed: 25, fetch: 200000 });
	expect.near(storm.peakWavelength, 172.9, 0.05, 'the storm peak is 172.9 m on 60 m of water');
	expect.truthy(storm.peakWavelength < (2 * Math.PI * 9.81) / storm.peakOmega ** 2, 'shorter than the deep-water 177.3 m');
	const shallow = Charts.spectrumCurve({ ...HERO, depth: 2 });
	expect.near(Spectrum.omega((2 * Math.PI) / shallow.peakWavelength, { ...HERO, depth: 2 }), shallow.peakOmega, 1e-9, 'and on 2 m of water, far from deep');
	for (const i of [10, peakIndex, 150]) {
		const w = curve.omega[i];
		const boost = w > curve.peakOmega ? (w / curve.peakOmega) ** (2 * HERO.tailBoost) : 1;
		expect.near(curve.shaped[i], curve.physical[i] * HERO.scale ** 2 * boost, 1e-9 * curve.shaped[i] + 1e-15, `shaped ${i} is the sea's shaping`);
	}
});

test('a stronger wind moves the peak to longer waves and lifts it', () => {
	const calm = Charts.spectrumCurve({ ...HERO, windSpeed: 6 });
	const storm = Charts.spectrumCurve({ ...HERO, windSpeed: 20 });
	expect.truthy(storm.peakOmega < calm.peakOmega, 'the peak moves down');
	expect.truthy(Math.max(...storm.physical) > Math.max(...calm.physical), 'and up');
});

test("the bands are the cascades' wavenumber ranges, in omega too", () => {
	const curve = Charts.spectrumCurve(HERO);
	const bands = WaveField.bands([256, 64, 16], 64);
	expect.equal(curve.bands.length, 3, 'three layers');
	expect.equal(curve.bands[0].size, 256, 'largest first');
	expect.equal(curve.bands[1].kMin, bands[1].kMin, 'the handover');
	expect.equal(curve.bands[2].kMax, (Math.PI * 64) / 16, 'the open top capped at Nyquist');
	expect.near(curve.bands[1].omegaMin, Spectrum.omega(bands[1].kMin, HERO), 1e-12, 'omega of the handover');
	// Cascade 1's band starts at k = 0, but its lattice's longest wave is one whole wave across the
	// 256-stud patch: nothing below k = 2 pi / 256 is held, so the chart must not shade it.
	expect.equal(curve.bands[0].kMin, (2 * Math.PI) / 256, "the 256-stud lattice's longest wave");
	expect.near(curve.bands[0].omegaMin, Spectrum.omega((2 * Math.PI) / 256, HERO), 1e-12, 'omega of the longest wave');
	expect.truthy(curve.bands[0].omegaMin > 0.46 && curve.bands[0].omegaMin < 0.47, `about 0.466 rad/s: ${curve.bands[0].omegaMin}`);
});

test('the spectrum refuses a sea the maths cannot take', () => {
	let message = '';
	try {
		Charts.spectrumCurve({ ...HERO, windSpeed: 0 });
	} catch (error) {
		message = error.message;
	}
	expect.truthy(message.includes('windSpeed'), message);
});

test("the phase arrows are cascade 1's tallest waves at the ocean's seed, turning at their own omega", () => {
	const arrows = Charts.createPhaseArrows(HERO, { seed: 7, count: 6 });
	expect.equal(arrows.components.length, 6, 'six arrows');
	for (let i = 1; i < 6; i++) {
		expect.truthy(arrows.components[i].amplitude <= arrows.components[i - 1].amplitude, 'tallest first');
	}
	const band = WaveField.bands([256, 64, 16], 64)[0];
	const cascade = Cascade.create({ n: 64, size: 256, kMin: band.kMin, kMax: band.kMax, seed: cascadeSeed(7, 1), loopPeriod: 120, params: HERO });
	let tallest = 0;
	for (let i = 1; i < cascade.cells; i++) {
		if (Math.hypot(cascade.h0Re[i], cascade.h0Im[i]) > Math.hypot(cascade.h0Re[tallest], cascade.h0Im[tallest])) tallest = i;
	}
	expect.equal(arrows.components[0].h0Re, cascade.h0Re[tallest], "the ocean's own tallest wave");
	const start = Charts.phaseArrowsAt(arrows, 0);
	expect.equal(start[0].re, arrows.components[0].h0Re, 'at t = 0 the arrow is h0');
	const later = Charts.phaseArrowsAt(arrows, 3.7);
	for (let i = 0; i < 6; i++) {
		const c = arrows.components[i];
		expect.near(Math.hypot(later[i].re, later[i].im), c.amplitude, 1e-12, `arrow ${i} keeps its length`);
		const turned = Math.atan2(later[i].im, later[i].re) - Math.atan2(c.h0Im, c.h0Re);
		const expected = -c.omega * 3.7;
		expect.near(Math.cos(turned), Math.cos(expected), 1e-9, `arrow ${i} turned by -omega t`);
		expect.near(Math.sin(turned), Math.sin(expected), 1e-9, `arrow ${i} turned by -omega t (sine)`);
	}
	const looped = Charts.phaseArrowsAt(arrows, 120);
	expect.near(looped[0].re, start[0].re, 1e-9, 'the loop period brings every arrow home');
	expect.truthy(Array.isArray(later), 'plain array');
});

// One cache for the dev route and the story (ui/devStage.js, ui/storyStage.js): built once per sea
// and seed, turned every call.
test('the phase-arrow cache builds once per sea and seed and turns the arrows every call', () => {
	const at = Charts.createPhaseArrowCache({ sizes: [256, 64, 16], n: 64 });
	const first = at(HERO, 7, 0);
	const direct = Charts.phaseArrowsAt(Charts.createPhaseArrows(HERO, { seed: 7, sizes: [256, 64, 16], n: 64 }), 3.7);
	expect.equal(JSON.stringify(at(HERO, 7, 3.7)), JSON.stringify(direct), 'the same arrows as building them directly');
	expect.equal(at.builds(), 1, 'turned, not rebuilt');
	at({ ...HERO }, 7, 1);
	expect.equal(at.builds(), 1, 'an equal sea is the same sea');
	at(HERO, 8, 1);
	expect.equal(at.builds(), 2, 'a new seed rebuilds');
	at({ ...HERO, windSpeed: HERO.windSpeed + 1 }, 8, 1);
	expect.equal(at.builds(), 3, 'a new wind rebuilds');
	expect.equal(first.length, 8, 'eight arrows by default');
});

test('the transform timing measures both ways and proves they agree', () => {
	const result = Charts.measureTransforms(8);
	expect.equal(result.n, 8, 'n');
	expect.equal(result.waves, 64, 'n x n waves');
	expect.truthy(result.naiveMs > 0 && result.fftMs > 0, `both timed: ${result.naiveMs}, ${result.fftMs}`);
	expect.near(result.speedup, result.naiveMs / result.fftMs, 1e-12, 'speedup');
	expect.equal(result.operations.naive, 64 * 64, 'naive: every wave into every point');
	expect.equal(result.operations.fft, 64 * 3, 'fft: n^2 log2 n butterflies');
	expect.truthy(result.maxDifference < 1e-9, `the two agree: ${result.maxDifference}`);
	for (const bad of [12, 128, 1, 8.5]) {
		let message = '';
		try {
			Charts.measureTransforms(bad);
		} catch (error) {
			message = error.message;
		}
		expect.truthy(message.includes('power of two'), `n=${bad} refused: ${message}`);
	}
});

test('asking for more arrows than cascade 1 has waves is a RangeError; exactly that many is fine', () => {
	const band = WaveField.bands([256, 64, 16], 64)[0];
	const cascade = Cascade.create({ n: 64, size: 256, kMin: band.kMin, kMax: band.kMax, seed: cascadeSeed(7, 1), loopPeriod: 120, params: HERO });
	let waves = 0;
	for (let i = 0; i < cascade.cells; i++) {
		if (cascade.h0Re[i] !== 0 || cascade.h0Im[i] !== 0) waves += 1;
	}
	const all = Charts.createPhaseArrows(HERO, { count: waves });
	expect.equal(all.components.length, waves, 'every wave cascade 1 holds');
	expect.truthy(all.components.at(-1).amplitude > 0, 'and none of them empty');
	let error = null;
	try {
		Charts.createPhaseArrows(HERO, { count: waves + 1 });
	} catch (caught) {
		error = caught;
	}
	expect.truthy(error instanceof RangeError, `a RangeError: ${error}`);
	expect.truthy(error.message.includes(String(waves)), error.message);
	for (const bad of [0, 2.5, 64 * 64 + 1]) {
		let refused = null;
		try {
			Charts.createPhaseArrows(HERO, { count: bad });
		} catch (caught) {
			refused = caught;
		}
		expect.truthy(refused instanceof RangeError, `count ${bad} is a RangeError too: ${refused}`);
	}
});

test('a naive sum too slow to repeat is timed once; fast ones take the median of several batches', () => {
	const small = Charts.measureTransforms(8);
	expect.truthy(small.batches.naive >= 3 && small.batches.fft >= 3, `n=8 batches: ${JSON.stringify(small.batches)}`);
	expect.equal(small.batches.naive, small.batches.fft, 'alternating, one of each');
	const large = Charts.measureTransforms(64);
	expect.truthy(large.batches.fft >= 3, `the FFT keeps its median at n=64: ${JSON.stringify(large.batches)}`);
	if (large.batches.naive === 1) {
		expect.truthy(large.naiveMs > Charts.SINGLE_NAIVE_MS, `one batch only above ${Charts.SINGLE_NAIVE_MS} ms: ${large.naiveMs}`);
	} else {
		expect.truthy(large.batches.naive >= 3, `or a median: ${JSON.stringify(large.batches)}`);
	}
});

// A fresh process, so the JIT has seen neither transform: the very first call must already be
// warm on both sides. The naive sum does n^4 multiply-adds and the FFT n^2 log2 n butterflies, each
// dearer than one naive step (bit reversal, the copy, twiddle loads), so a true speedup stays under
// the operation ratio (21.3 at n = 8). A cold naive sum beside a warm FFT read 43x to 70x here.
// The 1.5 is headroom for a loaded machine, not for a cold start. Two children, and the smaller of
// their speedups: at load 20 about one child in several hundred read 100x or more, all or nothing,
// which looks like a starved background compiler rather than a cold start.
test('the first measurement in a fresh process is not inflated by a cold JIT', async (t) => {
	const url = new URL('../../../content/ocean/js/engine/charts.js', import.meta.url).href;
	const script = `const Charts = await import(${JSON.stringify(url)}); console.log(JSON.stringify(Charts.measureTransforms(8)));`;
	const results = [];
	for (let child = 0; child < 2; child++) {
		const { stdout } = await promisify(execFile)(process.execPath, ['--input-type=module', '-e', script]);
		results.push(JSON.parse(stdout));
	}
	const ratio = results[0].operations.naive / results[0].operations.fft;
	for (const result of results) {
		t.diagnostic(`fresh n=8: naive ${result.naiveMs} ms, fft ${result.fftMs} ms, speedup ${result.speedup}, op ratio ${ratio}`);
		expect.truthy(result.maxDifference < 1e-9, 'and the two still agree');
	}
	const speedup = Math.min(...results.map((result) => result.speedup));
	expect.truthy(speedup <= ratio * 1.5, `first-call speedup ${speedup} exceeds 1.5 x the op ratio ${ratio}`);
});
