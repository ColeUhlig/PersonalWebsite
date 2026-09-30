import { test } from 'node:test';
import * as expect from '../expect.js';
import * as WaveSampler from '../../../content/ocean/js/core/waveSampler.js';
import * as WaveBanks from '../../../content/ocean/js/engine/waveBanks.js';

const STRIDE = WaveSampler.STRIDE;
const TAU = 2 * Math.PI;
const heightAt = (bank, t, x, z, chop = 0) => WaveSampler.sample(bank.packed, bank.count, t, x, z, chop, bank.weights, 0, new Float64Array(7))[1];

test("one sine wave travels along +x with the panel's height, length and speed", () => {
	const { bank, omega, phase } = WaveBanks.nextSine(null, { amplitude: 1.5, wavelength: 40, speed: 8 }, 0);
	expect.equal(bank.count, 1, 'one wave');
	expect.near(bank.packed[0], TAU / 40, 1e-12, 'k');
	expect.near(omega, (TAU / 40) * 8, 1e-12, 'omega = k c');
	expect.equal(bank.packed[2], 1.5, 'amplitude');
	expect.equal(phase, 0, 'starts at phase 0');
	expect.equal(bank.packed[4], 1, 'dx');
	expect.equal(bank.packed[5], 0, 'dz');
	expect.equal(bank.silent, false, 'not silent');
	for (const x of [-37.5, 0, 12.25, 300]) {
		const h = heightAt(bank, 3, x, 0);
		expect.equal(heightAt(bank, 3, x, 91.5), h, `no change along z at x=${x}`);
		expect.near(h, 1.5 * Math.sin((TAU / 40) * x - omega * 3), 1e-12, `y = A sin(kx - wt) at x=${x}`);
	}
});

test('an amplitude of zero is a silent bank: the flat plane', () => {
	const { bank } = WaveBanks.nextSine(null, { amplitude: 0, wavelength: 40, speed: 8 }, 0);
	expect.equal(bank.silent, true, 'silent');
	expect.equal(heightAt(bank, 5, 10, 10), 0, 'flat');
});

test('changing the speed does not jump the wave: the phase at that instant is kept', () => {
	const t = 17.3;
	const slow = WaveBanks.nextSine(null, { amplitude: 1, wavelength: 30, speed: 4 }, 0);
	const fast = WaveBanks.nextSine(slow, { amplitude: 1, wavelength: 30, speed: 12 }, t);
	for (const x of [0, 7, -22.5, 150]) {
		expect.near(heightAt(fast.bank, t, x, 0), heightAt(slow.bank, t, x, 0), 1e-9, `continuous at x=${x}`);
	}
	expect.truthy(Math.abs(heightAt(fast.bank, t + 0.5, 5, 0) - heightAt(slow.bank, t + 0.5, 5, 0)) > 1e-3, 'and then moves at the new speed');
	expect.truthy(fast.phase >= 0 && fast.phase < TAU, 'phase kept in 0 .. 2 pi');
});

test('a sine the maths cannot draw is refused with a named error (Review Focus 3)', () => {
	for (const [spec, name] of [
		[{ amplitude: -1, wavelength: 40, speed: 8 }, 'amplitude'],
		[{ amplitude: 1, wavelength: 0, speed: 8 }, 'wavelength'],
		[{ amplitude: 1, wavelength: 40, speed: Number.NaN }, 'speed'],
	]) {
		let message = '';
		try {
			WaveBanks.nextSine(null, spec, 0);
		} catch (error) {
			message = error instanceof RangeError ? error.message : `not a RangeError: ${error}`;
		}
		expect.truthy(message.includes(name), `${name}: ${message}`);
	}
});

test("the teaching bank is the prototype's 32 waves, tallest first", () => {
	const bank = WaveBanks.teachingBank();
	expect.equal(bank.count, 32, 'count');
	expect.equal(bank.packed.length, 32 * STRIDE, 'packed');
	for (let wave = 1; wave < 32; wave++) {
		expect.truthy(bank.packed[wave * STRIDE + 2] <= bank.packed[(wave - 1) * STRIDE + 2], `wave ${wave} no taller than wave ${wave - 1}`);
	}
	expect.truthy(bank.packed[2] > 0.5, `the tallest wave shows: ${bank.packed[2]}`);
	expect.equal(WaveBanks.teachingBank().packed.join(','), bank.packed.join(','), 'same seed, same bank');
});

test('every teaching wavevector sits on the 256-stud lattice, so the sum repeats every 256 studs', () => {
	const bank = WaveBanks.teachingBank();
	const unit = TAU / WaveBanks.TEACHING_TILE;
	for (let wave = 0; wave < bank.count; wave++) {
		const o = wave * STRIDE;
		const kx = bank.packed[o] * bank.packed[o + 4];
		const kz = bank.packed[o] * bank.packed[o + 5];
		expect.near(kx / unit, Math.round(kx / unit), 1e-9, `wave ${wave} kx on the lattice`);
		expect.near(kz / unit, Math.round(kz / unit), 1e-9, `wave ${wave} kz on the lattice`);
		expect.truthy(bank.packed[o] > 0, `wave ${wave} not snapped to k = 0`);
		expect.near(bank.packed[o + 1], Math.sqrt(9.81 * bank.packed[o]), 1e-12, `wave ${wave} deep-water dispersion`);
	}
	for (const [x, z] of [[3.5, -12], [100.25, 40], [-250, 7]]) {
		const a = WaveSampler.sample(bank.packed, bank.count, 6, x, z, 0.6, bank.weights, 0, new Float64Array(7));
		const b = WaveSampler.sample(bank.packed, bank.count, 6, x + 256, z, 0.6, bank.weights, 0, new Float64Array(7));
		const c = WaveSampler.sample(bank.packed, bank.count, 6, x, z - 256, 0.6, bank.weights, 0, new Float64Array(7));
		for (let i = 0; i < 3; i++) {
			expect.near(b[i], a[i], 1e-9, `repeats along x at (${x}, ${z}), component ${i}`);
			expect.near(c[i], a[i], 1e-9, `repeats along z at (${x}, ${z}), component ${i}`);
		}
	}
});

test('withCount sums only the first waves, fading the last one in by the fraction', () => {
	const full = WaveBanks.teachingBank();
	const one = WaveBanks.withCount(full, 1);
	expect.equal(one.count, 1, 'one wave summed');
	expect.equal(one.weights[0], 1, 'full weight');
	expect.equal(one.packed, full.packed, 'the packed waves are shared, not copied');
	const partial = WaveBanks.withCount(full, 2.5);
	expect.equal(partial.count, 3, 'three waves summed');
	expect.equal([...partial.weights.slice(0, 4)].join(','), '1,1,0.5,0', 'weights');
	expect.equal(WaveBanks.withCount(full, 0).silent, true, 'none: silent');
	expect.equal(WaveBanks.withCount(full, 99).count, 32, 'clamped to the bank');
	let message = '';
	try {
		WaveBanks.withCount(full, Number.NaN);
	} catch (error) {
		message = error.message;
	}
	expect.truthy(message.includes('count'), `NaN refused: ${message}`);
});

test('bankExtent is the summed weighted amplitude: the tallest the bank can stand', () => {
	const full = WaveBanks.teachingBank();
	const two = WaveBanks.withCount(full, 1.5);
	expect.near(WaveBanks.bankExtent(two), full.packed[2] + 0.5 * full.packed[STRIDE + 2], 1e-12, 'extent');
	expect.equal(WaveBanks.bankExtent(WaveBanks.withCount(full, 0)), 0, 'silent extent');
});

test('a speed change so small it rounds the phase to 2 pi keeps the phase in 0 .. 2 pi', () => {
	const slow = WaveBanks.nextSine(null, { amplitude: 1, wavelength: 30, speed: 4 }, 0);
	const next = WaveBanks.nextSine(slow, { amplitude: 1, wavelength: 30, speed: 4 - 1e-15 }, 1e-3);
	expect.truthy(next.phase >= 0 && next.phase < TAU, `phase in 0 .. 2 pi: ${next.phase}`);
	expect.equal(next.bank.packed[3], next.phase, 'the bank carries the folded phase');
});

test('a sine at a time the clock cannot hold is refused with a named error', () => {
	const slow = WaveBanks.nextSine(null, { amplitude: 1, wavelength: 30, speed: 4 }, 0);
	for (const t of [Number.NaN, Infinity, -Infinity]) {
		let message = '';
		try {
			WaveBanks.nextSine(slow, { amplitude: 1, wavelength: 30, speed: 8 }, t);
		} catch (error) {
			message = error instanceof RangeError ? error.message : `not a RangeError: ${error}`;
		}
		expect.truthy(message.includes('time'), `t = ${t}: ${message}`);
	}
});

test('a teaching tile that is not a finite positive length is refused with a named error', () => {
	for (const tile of [0, -256, Number.NaN, Infinity]) {
		let message = '';
		try {
			WaveBanks.teachingBank(undefined, tile);
		} catch (error) {
			message = error instanceof RangeError ? error.message : `not a RangeError: ${error}`;
		}
		expect.truthy(message.includes('tile'), `tile = ${tile}: ${message}`);
	}
});
