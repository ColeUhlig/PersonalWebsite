import { test } from 'node:test';
import * as expect from '../expect.js';
import * as Jonswap from '../../../content/ocean/js/core/jonswap.js';

const CONFIG = Object.freeze({
	count: 20,
	firstFrequency: 0.01,
	deltaF: 0.01,
	peakFrequency: 0.11,
	alpha: 0.0081,
	gamma: 3.3,
	scale: 2.5,
	windDirection: 40,
	tailBoost: 0,
	spread: 35,
});
const STRIDE = Jonswap.STRIDE;

// math.rad and math.deg
const rad = (degrees) => degrees * (Math.PI / 180);
const deg = (radians) => radians * (180 / Math.PI);

// Reference numbers from jonswap() in jonswap-ocean/js/jonswap.js.
test('spectrum matches the JavaScript reference', () => {
	expect.near(Jonswap.spectrum(0.11, 0.11, 3.3, 0.0081), 29.362022823596142, 1e-6, 'S(fp)');
	expect.near(Jonswap.spectrum(0.2, 0.11, 3.3, 0.0081), 1.3940480959842367, 1e-6, 'S(0.2)');
});

test('generates one wave per bin with stride 6', () => {
	const bank = Jonswap.generateWaves(CONFIG, 7);
	expect.equal(bank.count, CONFIG.count, 'count');
	expect.equal(bank.packed.length, CONFIG.count * STRIDE, '#packed');
});

test('follows deep-water dispersion and unit directions', () => {
	const bank = Jonswap.generateWaves(CONFIG, 7);
	for (let wave = 0; wave <= bank.count - 1; wave++) {
		const o = wave * STRIDE;
		const k = bank.packed[o];
		const omega = bank.packed[o + 1];
		const dx = bank.packed[o + 4];
		const dz = bank.packed[o + 5];
		expect.near(k, (omega * omega) / Jonswap.GRAVITY, 1e-9, `k of wave ${wave}`);
		expect.near(dx * dx + dz * dz, 1, 1e-9, `direction length of wave ${wave}`);
	}
});

test('applies scale exactly once', () => {
	const unit = Jonswap.generateWaves(
		Object.freeze({
			count: 20,
			firstFrequency: 0.01,
			deltaF: 0.01,
			peakFrequency: 0.11,
			alpha: 0.0081,
			gamma: 3.3,
			scale: 1,
			windDirection: 40,
			tailBoost: 0,
			spread: 35,
		}),
		7,
	);
	const scaled = Jonswap.generateWaves(CONFIG, 7);
	expect.near(scaled.packed[2], unit.packed[2] * CONFIG.scale, 1e-9, 'amplitude of wave 0');
	expect.near(scaled.peakHeight, unit.peakHeight * CONFIG.scale, 1e-9, 'peakHeight');
});

test('peak height is half the summed amplitude', () => {
	const bank = Jonswap.generateWaves(CONFIG, 7);
	let total = 0;
	for (let wave = 0; wave <= bank.count - 1; wave++) {
		total += bank.packed[wave * STRIDE + 2];
	}
	expect.near(bank.peakHeight, total / 2, 1e-9, 'peakHeight');
});

// The Luau also checks table.isfrozen(a.packed). A non-empty Float64Array cannot be frozen in
// JavaScript, so only the bank itself is checked (as the plan directs).
test('is deterministic per seed and frozen', () => {
	const a = Jonswap.generateWaves(CONFIG, 7);
	const b = Jonswap.generateWaves(CONFIG, 7);
	const c = Jonswap.generateWaves(CONFIG, 8);
	expect.equal(a.packed[3], b.packed[3], 'same seed, same phase');
	expect.truthy(a.packed[3] !== c.packed[3], 'different seed should change the phase');
	expect.truthy(Object.isFrozen(a), 'bank not frozen');
});

test('keeps every wave within the spread around the wind', () => {
	const bank = Jonswap.generateWaves(CONFIG, 7);
	const wind = { X: Math.cos(rad(CONFIG.windDirection)), Y: Math.sin(rad(CONFIG.windDirection)) };
	let narrowest = 1;
	for (let wave = 0; wave <= bank.count - 1; wave++) {
		const o = wave * STRIDE;
		const alignment = wind.X * bank.packed[o + 4] + wind.Y * bank.packed[o + 5];
		narrowest = Math.min(narrowest, alignment);
	}
	expect.truthy(
		narrowest >= Math.cos(rad(CONFIG.spread)) - 1e-9,
		`a wave strays ${deg(Math.acos(narrowest))} degrees from the wind`,
	);
});

test('tail boost lifts only the bins above the peak', () => {
	const boosted = { ...CONFIG };
	boosted.tailBoost = 1;
	const plain = Jonswap.generateWaves(CONFIG, 7);
	const lifted = Jonswap.generateWaves(Object.freeze(boosted), 7);
	const belowPeak = 5; // bin 5 = 0.05 Hz, under the 0.11 Hz peak
	const abovePeak = 20; // bin 20 = 0.20 Hz
	expect.near(
		lifted.packed[(belowPeak - 1) * STRIDE + 2],
		plain.packed[(belowPeak - 1) * STRIDE + 2],
		1e-12,
		'below the peak',
	);
	const ratio = lifted.packed[(abovePeak - 1) * STRIDE + 2] / plain.packed[(abovePeak - 1) * STRIDE + 2];
	expect.near(ratio, 0.2 / 0.11, 1e-9, 'above the peak scales by (f / fp) ^ tailBoost');
});

test('bins start at firstFrequency', () => {
	const shifted = { ...CONFIG };
	shifted.firstFrequency = 0.06;
	const bank = Jonswap.generateWaves(Object.freeze(shifted), 7);
	const omega = bank.packed[1];
	expect.near(omega, 2 * Math.PI * 0.06, 1e-12, 'first bin omega');
});

test('reports the RMS height of the sea', () => {
	const bank = Jonswap.generateWaves(CONFIG, 7);
	let sumSquares = 0;
	for (let wave = 0; wave <= bank.count - 1; wave++) {
		sumSquares += bank.packed[wave * STRIDE + 2] ** 2;
	}
	expect.near(bank.rmsHeight, Math.sqrt(sumSquares / 2), 1e-9, 'rmsHeight');
});

test('rejects invalid config', () => {
	const bad = Object.freeze({
		count: 0,
		firstFrequency: 0.01,
		deltaF: 0.01,
		peakFrequency: 0.11,
		alpha: 0.0081,
		gamma: 3.3,
		scale: 1,
		windDirection: 40,
		tailBoost: 0,
		spread: 35,
	});
	let threw = false;
	try {
		Jonswap.generateWaves(bad, 1);
	} catch {
		threw = true;
	}
	expect.truthy(threw, 'count = 0 should be rejected');
});
