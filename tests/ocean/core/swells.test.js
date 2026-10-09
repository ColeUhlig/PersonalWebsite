import { test } from 'node:test';
import * as expect from '../expect.js';
import * as Spectrum from '../../../content/ocean/js/core/spectrum.js';
import * as Swells from '../../../content/ocean/js/core/swells.js';

const LOOP = 120;
const G = 9.81;

// Swells.create takes Spectrum params and uses the finite-depth omega, so a depth of 5000 m
// keeps tanh(k depth) at 1 to well within 1e-9 for every wavelength used below: the
// deep-water expectations omega = sqrt(g k) still hold exactly at that tolerance.
const P = Object.freeze({
	windSpeed: 12,
	fetch: 80000,
	depth: 5000,
	gamma: 3.3,
	swell: 0,
	windDirection: 0,
	gravity: G,
	scale: 1,
	tailBoost: 0,
});

test('one swell is a travelling sine with quantised frequency', () => {
	const bank = Swells.create([{ wavelength: 200, amplitude: 1.5, direction: 0, phase: 0.4 }], P, LOOP);
	expect.equal(bank.count, 1, 'count');
	const k = (2 * Math.PI) / 200;
	const omega = Math.floor(Math.sqrt(G * k) / ((2 * Math.PI) / LOOP)) * ((2 * Math.PI) / LOOP);
	const t = 3;
	const x = 17;
	expect.near(Swells.heightAt(bank, t, x, 0), 1.5 * Math.sin(k * x - omega * t + 0.4), 1e-9, 'height');
	const [, dy] = Swells.sample(bank, t, x, 0, 1);
	expect.near(dy, 1.5 * Math.sin(k * x - omega * t + 0.4), 1e-9, 'sampled height');
});

test('swells loop at the loop period', () => {
	const bank = Swells.create(
		[
			{ wavelength: 180, amplitude: 1, direction: 0.3, phase: 0 },
			{ wavelength: 90, amplitude: 0.5, direction: -0.4, phase: 2 },
		],
		P,
		LOOP,
	);
	for (const point of [
		[5, 9],
		[130, -40],
	]) {
		expect.near(
			Swells.heightAt(bank, 11 + LOOP, point[0], point[1]),
			Swells.heightAt(bank, 11, point[0], point[1]),
			1e-6,
			'loops',
		);
	}
});

test('chop moves points laterally along the wave direction', () => {
	const bank = Swells.create([{ wavelength: 100, amplitude: 1, direction: Math.PI / 2, phase: 0 }], P, LOOP);
	// z = 20 is 0.2 wavelengths in: cos(0.4 pi) = 0.309, so the lateral term is clearly nonzero
	// (z = 25 would sit on a quarter wavelength where it vanishes).
	const [dx, , dz] = Swells.sample(bank, 0, 0, 20, 1);
	expect.near(dx, 0, 1e-9, 'no x displacement for a wave travelling along z');
	expect.truthy(Math.abs(dz) > 0.3, 'z displacement');
	const [dx0, , dz0] = Swells.sample(bank, 0, 0, 20, 0);
	expect.near(dx0, 0, 1e-9, 'chop 0 x');
	expect.near(dz0, 0, 1e-9, 'chop 0 z');
});

test('dispersion is the finite-depth relation, not deep water', () => {
	// At 60 m and a 400 stud wavelength, tanh(k depth) = 0.736, so the finite-depth omega is
	// clearly slower than sqrt(g k) and the two quantise to different multiples of omega0.
	const shallow = { ...P };
	shallow.depth = 60;
	const bank = Swells.create([{ wavelength: 400, amplitude: 1.7, direction: 0, phase: 0.9 }], shallow, LOOP);
	const omega0 = (2 * Math.PI) / LOOP;
	const k = (2 * Math.PI) / 400;
	const quantised = Math.floor(Spectrum.omega(k, shallow) / omega0) * omega0;
	const deep = Math.floor(Math.sqrt(G * k) / omega0) * omega0;
	expect.truthy(quantised < deep - 1e-9, `finite depth ${quantised} is slower than deep ${deep}`);
	const t = 4;
	const x = 23;
	expect.near(
		Swells.heightAt(bank, t, x, 0),
		1.7 * Math.sin(k * x - quantised * t + 0.9),
		1e-9,
		'finite-depth height',
	);
});

// The sampler asks "are the swells off?" once per patch per frame. Scanning the pack for that
// is work the bank already knows the answer to, so `silent` is decided in Swells.create and
// isSilent just reads it.
test('a bank remembers whether every swell is silent', () => {
	const loud = Swells.create([{ wavelength: 200, amplitude: 1.5, direction: 0, phase: 0 }], P, LOOP);
	expect.truthy(!loud.silent, 'a swell with amplitude is not silent');
	expect.truthy(!Swells.isSilent(loud), 'and isSilent agrees');
	const quiet = Swells.create(
		[
			{ wavelength: 200, amplitude: 0, direction: 0, phase: 0 },
			{ wavelength: 90, amplitude: 0, direction: 1, phase: 2 },
		],
		P,
		LOOP,
	);
	expect.truthy(quiet.silent, 'all-zero amplitudes are silent');
	expect.truthy(Swells.isSilent(quiet), 'and isSilent agrees');
	const mixed = Swells.create(
		[
			{ wavelength: 200, amplitude: 0, direction: 0, phase: 0 },
			{ wavelength: 90, amplitude: 0.5, direction: 1, phase: 2 },
		],
		P,
		LOOP,
	);
	expect.truthy(!mixed.silent, 'one swell with amplitude is enough');
	expect.truthy(!Swells.isSilent(mixed), 'and isSilent agrees');
});

test('heightAt is deterministic', () => {
	const a = Swells.create([{ wavelength: 150, amplitude: 2, direction: 1, phase: 1 }], P, LOOP);
	const b = Swells.create([{ wavelength: 150, amplitude: 2, direction: 1, phase: 1 }], P, LOOP);
	expect.equal(Swells.heightAt(a, 42, 7, 8), Swells.heightAt(b, 42, 7, 8), 'same inputs, same height');
});
