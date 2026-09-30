import { test } from 'node:test';
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
	expect.near(curve.peakWavelength, (2 * Math.PI * 9.81) / Spectrum.peakOmega(HERO) ** 2, 1e-9, 'the deep-water peak wavelength');
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
