// The Gerstner wave banks of the teaching steps 2 to 6 (A3; not a twin). Each is a bank in the
// packed layout WaveSampler and Swells share (k, omega, A, phase, dx, dz per wave) and in the
// Swells.Bank shape SurfaceSampler.fill takes as its `swells`: { packed, count, weights, silent }.
// Handing the sampler one of these with every ring's cascade list empty is exactly how the Roblox
// coordinator's Gerstner-bank A/B drew the original prototype's sea (OceanClient.client.luau,
// `gerstnerBank`): every ring samples the whole bank, the last ring flattens it into the horizon,
// and the vertex normals are the bank's analytic ones.
//
// Two sources:
//   * one sine wave (step 2) travelling along +z, towards the story's cameras (which look along
//     -z), so its crests run across the view; from the panel's height, length and speed.
//     Changing the speed keeps the wave's phase where it was at that instant, so a slider drag
//     slows or quickens the wave instead of jumping it;
//   * the teaching bank (steps 3 to 6): the prototype's 32 JONSWAP waves, sorted tallest first so
//     the wave-count slider adds waves that show, with every wavevector snapped to the 256-stud
//     lattice. A sum of waves whose wavevectors sit on a 2 pi / 256 lattice repeats exactly every
//     256 studs, which is the repetition step 6 shows and the one an FFT patch has too. It rolls
//     along +z like the sine, so its crests also cross the view in steps 3 to 5.
//   * the spread (C2): `withFan` lays the bank along one axis for the flat graph, or fans it back out.
import * as Jonswap from '../core/jonswap.js';
import * as WaveSampler from '../core/waveSampler.js';
import { clamp, mod, round } from '../core/luau.js';
import { SEED } from './config.js';

const TAU = 2 * Math.PI;
const STRIDE = WaveSampler.STRIDE;

// howhow2315/JONSWAP-Ocean's recipe as the Roblox A/B builds it (OceanClient.client.luau), except
// the heading and the spread: the A/B's absent spread drew headings over the whole circle from a
// second generator; 45 degrees either side of +z (windDirection 90, Jonswap measures from +x towards
// +z) keeps the teaching sea rolling one way, towards the cameras, as the sine does.
export const TEACHING_RECIPE = Object.freeze({
	count: 32,
	firstFrequency: 0.02,
	deltaF: 0.02,
	peakFrequency: 0.16,
	alpha: 0.0081,
	gamma: 3.3,
	scale: 2.6,
	windDirection: 90,
	spread: 45,
	tailBoost: 0,
});
export const TEACHING_TILE = 256;

function fail(name, rule, value) {
	throw new RangeError(`wave bank: ${name} must be ${rule}, got ${value}`);
}

// Silent when every summed wave has zero weighted amplitude: the surface can then skip the bank.
function bank(packed, count, weights) {
	let silent = true;
	for (let wave = 0; wave < count; wave++) {
		if (packed[wave * STRIDE + 2] * weights[wave] !== 0) {
			silent = false;
			break;
		}
	}
	return Object.freeze({ packed, count, weights, silent });
}

export function checkSine(spec) {
	if (!(Number.isFinite(spec.amplitude) && spec.amplitude >= 0)) {
		fail('sine amplitude', 'finite and not negative', spec.amplitude);
	}
	if (!(Number.isFinite(spec.wavelength) && spec.wavelength > 0)) {
		fail('sine wavelength', 'finite and above 0', spec.wavelength);
	}
	if (!Number.isFinite(spec.speed)) {
		fail('sine speed', 'finite', spec.speed);
	}
}

/**
 * The single sine wave of step 2, y = A sin(k z - omega t + phase), with k = 2 pi / wavelength and
 * omega = k * speed (the visitor sets the speed; the wave need not obey dispersion). The panel's
 * y = A sin(kx - omega t) names the direction of travel x; here that is +z.
 * @param {{ omega: number, phase: number } | null} previous the last sine, or null for the first
 * @param {{ amplitude: number, wavelength: number, speed: number }} spec
 * @param {number} t the teaching clock now
 */
export function nextSine(previous, spec, t) {
	checkSine(spec);
	if (!Number.isFinite(t)) {
		fail('sine time', 'finite', t);
	}
	const k = TAU / spec.wavelength;
	const omega = k * spec.speed;
	// phase - omega t is what the wave shows at this instant; keep it when omega changes.
	const turned = previous ? mod(previous.phase + (omega - previous.omega) * t, TAU) : 0;
	// Floating point can leave mod a hair outside [0, TAU): exactly TAU for a tiny negative angle,
	// and a tiny negative number just under a whole number of turns (a / TAU rounds up to it).
	// Fold both back so 0 <= phase < TAU.
	const phase = turned >= TAU || turned < 0 ? 0 : turned;
	const packed = Float64Array.of(k, omega, spec.amplitude, phase, 0, 1);
	return Object.freeze({ omega, phase, bank: bank(packed, 1, Float64Array.of(1)) });
}

// A wavevector rounded to the tile's lattice. One that rounds to zero (a wave longer than the tile)
// takes the lattice's shortest step along its larger component instead, so no wave stands still.
function snap(k, dx, dz, unit) {
	let m = round((k * dx) / unit);
	let n = round((k * dz) / unit);
	if (m === 0 && n === 0) {
		if (Math.abs(dx) >= Math.abs(dz)) {
			m = dx < 0 ? -1 : 1;
		} else {
			n = dz < 0 ? -1 : 1;
		}
	}
	return [m * unit, n * unit];
}

export function teachingBank(seed = SEED, tile = TEACHING_TILE) {
	if (!(Number.isFinite(tile) && tile > 0)) {
		fail('teaching tile', 'finite and above 0', tile);
	}
	const source = Jonswap.generateWaves(TEACHING_RECIPE, seed);
	const count = source.count;
	const amplitude = (wave) => source.packed[wave * STRIDE + 2];
	// Tallest first; ties keep the bank's own (frequency) order.
	const order = Array.from({ length: count }, (_, wave) => wave).sort((a, b) => amplitude(b) - amplitude(a) || a - b);
	const packed = new Float64Array(count * STRIDE);
	const unit = TAU / tile;
	order.forEach((from, to) => {
		const i = from * STRIDE;
		const o = to * STRIDE;
		const [kx, kz] = snap(source.packed[i], source.packed[i + 4], source.packed[i + 5], unit);
		const k = Math.hypot(kx, kz);
		packed[o] = k;
		// Deep water, the bank's own dispersion (Jonswap gives each wave k = omega^2 / g).
		packed[o + 1] = Math.sqrt(Jonswap.GRAVITY * k);
		packed[o + 2] = source.packed[i + 2];
		packed[o + 3] = source.packed[i + 3];
		packed[o + 4] = kx / k;
		packed[o + 5] = kz / k;
	});
	return bank(packed, count, new Float64Array(count).fill(1));
}

// The first `count` waves of a full bank; a fractional count fades the last one in. Only the waves
// with weight are summed (`count` rounded up), so fewer waves cost less.
export function withCount(full, count) {
	if (!Number.isFinite(count)) {
		fail('wave count', 'finite', count);
	}
	const total = full.packed.length / STRIDE;
	const clamped = clamp(count, 0, total);
	const summed = Math.ceil(clamped);
	const weights = new Float64Array(total);
	for (let wave = 0; wave < summed; wave++) {
		weights[wave] = clamp(clamped - wave, 0, 1);
	}
	return bank(full.packed, summed, weights);
}

/**
 * The bank with its headings spread by `fan` (piece C2; spec 10.4). At 1 it is the bank as built
 * (the same object). At 0 every wave lies along +z with its wavenumber rounded to the tile's lattice
 * (n = max(1, round(k / unit))), so the sum varies along z only and repeats every tile exactly: the
 * flat graph's curve and its frequency spikes. Between, each wavevector moves in a straight line
 * from (0, n0 unit) to its own lattice point (m unit, n unit). Heights, phases and weights are kept;
 * omega follows deep-water dispersion for the new k, as teachingBank's does.
 */
export function withFan(full, fan, tile = TEACHING_TILE) {
	if (!(Number.isFinite(fan) && fan >= 0 && fan <= 1)) {
		fail('wave bank fan', 'a number in 0 .. 1', fan);
	}
	if (fan === 1) {
		return full;
	}
	const unit = TAU / tile;
	const total = full.packed.length / STRIDE;
	const packed = new Float64Array(full.packed.length);
	for (let wave = 0; wave < total; wave++) {
		const o = wave * STRIDE;
		const k = full.packed[o];
		const m = round((k * full.packed[o + 4]) / unit);
		const n = round((k * full.packed[o + 5]) / unit);
		const along = Math.max(1, round(k / unit));
		let kx = fan * m * unit;
		let kz = ((1 - fan) * along + fan * n) * unit;
		if (kx === 0 && kz === 0) {
			kz = unit;
		}
		const length = Math.hypot(kx, kz);
		packed[o] = length;
		packed[o + 1] = Math.sqrt(Jonswap.GRAVITY * length);
		packed[o + 2] = full.packed[o + 2];
		packed[o + 3] = full.packed[o + 3];
		packed[o + 4] = kx / length;
		packed[o + 5] = kz / length;
	}
	return bank(packed, full.count, full.weights);
}

export function bankExtent(waves) {
	let sum = 0;
	for (let wave = 0; wave < waves.count; wave++) {
		sum += Math.abs(waves.packed[wave * STRIDE + 2]) * waves.weights[wave];
	}
	return sum;
}
