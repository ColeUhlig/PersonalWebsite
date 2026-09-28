// Sea spectrum in wavevector space, the input to every cascade's initial state.
// JONSWAP (fetch-limited), Horvath's tanh depth factor (the "TMA" he ships), finite-depth
// dispersion, and Donelan-Banner directional spreading with Horvath's swell parameter, which
// `isotropy` can blend toward uniform when the look wants waves from every direction.
// Formulas: docs/research/tessendorf-fft.md section 1.10 (roblox-ocean). All angular frequencies
// are in radians per second; theta is measured from the wind direction.
// Twin of roblox-ocean/src/shared/Ocean/Spectrum.luau.
import { mod } from './luau.js';

/**
 * @typedef {object} Params
 * @property {number} windSpeed metres per second at 10 m
 * @property {number} fetch metres of open water the wind has blown across
 * @property {number} depth metres
 * @property {number} gamma JONSWAP peak enhancement, 3.3 is the canonical value
 * @property {number} swell 0 .. 1, Horvath: narrows spreading into long parallel trains
 * @property {number} windDirection radians from +x toward +z
 * @property {number} gravity
 * Shape knobs. The spectrum above is physical; a physical sea reads as glass at game scale,
 * so these exaggerate it. They are applied in `variance`, so every cascade sees them.
 * @property {number} scale visual amplitude multiplier, 1 = physical (variance scales by scale^2)
 * @property {number} tailBoost 0 = the true spectrum; above the peak, energy is multiplied by
 *   (omega / peakOmega) ^ (2 * tailBoost), lifting the short waves
 * @property {number} [isotropy] 0 = Donelan-Banner (physical), 1 = the same energy from every
 *   direction; between them a linear blend. Optional so older Params literals stay valid.
 */

const SIGMA_BELOW_PEAK = 0.07;
const SIGMA_ABOVE_PEAK = 0.09;
const NORMALISER_STEPS = 128;

/** @type {Readonly<Params>} */
export const NORMAL = Object.freeze({
	windSpeed: 12,
	fetch: 80000,
	depth: 60,
	gamma: 3.3,
	swell: 0.3,
	windDirection: 0,
	gravity: 9.81,
	scale: 1, // physical defaults; tuning changes them
	tailBoost: 0,
	isotropy: 0,
});

// Not in the Luau: the web page's sliders can reach values Studio never saw. A zero wind, fetch or
// depth turns the fetch laws into divisions by zero, a gamma at or below 0 or an isotropy outside
// 0 .. 1 gives negative or NaN variance, and an Infinity passes a bare `> 0`; each would hand the
// renderer a NaN sea. Returns p so callers can write validateParams(p) inline.
const POSITIVE_FIELDS = ['windSpeed', 'fetch', 'depth', 'gravity', 'gamma'];
const FINITE_FIELDS = ['scale', 'tailBoost', 'windDirection'];

function reject(name, rule, value) {
	throw new RangeError(`Spectrum params: ${name} must be ${rule}, got ${value}`);
}

function checkUnit(name, value) {
	if (!(Number.isFinite(value) && value >= 0 && value <= 1)) {
		reject(name, 'a finite number in 0 .. 1', value);
	}
}

export function validateParams(p) {
	for (const name of POSITIVE_FIELDS) {
		if (!(Number.isFinite(p[name]) && p[name] > 0)) {
			reject(name, 'finite and above 0', p[name]);
		}
	}
	for (const name of FINITE_FIELDS) {
		if (!Number.isFinite(p[name])) {
			reject(name, 'finite', p[name]);
		}
	}
	checkUnit('swell', p.swell); // Luau Params: "swell: number, -- 0 .. 1"
	if (p.isotropy !== undefined && p.isotropy !== null) {
		checkUnit('isotropy', p.isotropy); // optional, as in the Luau's `p.isotropy or 0`
	}
	return p;
}

export function peakOmega(p) {
	return 22 * ((p.gravity * p.gravity) / (p.windSpeed * p.fetch)) ** (1 / 3);
}

export function alpha(p) {
	return 0.076 * ((p.windSpeed * p.windSpeed) / (p.fetch * p.gravity)) ** 0.22;
}

// S(omega) in m^2 s / rad.
export function jonswap(omega, p) {
	const wp = peakOmega(p);
	const sigma = omega <= wp ? SIGMA_BELOW_PEAK : SIGMA_ABOVE_PEAK;
	const offset = omega - wp;
	const r = Math.exp(-(offset * offset) / (2 * sigma * sigma * wp * wp));
	const g = p.gravity;
	return ((alpha(p) * g * g) / omega ** 5) * Math.exp(-1.25 * (wp / omega) ** 4) * p.gamma ** r;
}

// Kitaigorodskii depth limiting as Horvath ships it: a smooth tanh fit.
export function depthFactor(omega, p) {
	const wh = omega * Math.sqrt(p.depth / p.gravity);
	return 0.5 + 0.5 * Math.tanh(1.8 * (wh - 1.125));
}

// omega^2 = g k tanh(k depth).
export function omega(k, p) {
	return Math.sqrt(p.gravity * k * Math.tanh(k * p.depth));
}

export function omegaDerivative(k, p) {
	const g = p.gravity;
	const d = p.depth;
	const kd = k * d;
	const sech = 1 / Math.cosh(kd);
	return (g * Math.tanh(kd) + g * k * d * sech * sech) / (2 * omega(k, p));
}

// Donelan-Banner width parameter.
export function beta(omega, p) {
	const ratio = omega / peakOmega(p);
	if (ratio < 0.95) {
		return 2.61 * ratio ** 1.3;
	} else if (ratio < 1.6) {
		return 2.28 * ratio ** -1.3;
	}
	const epsilon = -0.4 + 0.8393 * Math.exp(-0.567 * Math.log(ratio * ratio));
	return 10 ** epsilon;
}

// Unnormalised spreading: sech^2(beta theta) times Horvath's swell shaping
// cos^(2 s)(theta / 2) with s = 16 tanh(wp / omega) swell^2. Multiply by
// spreadNormaliser(omega) so the integral over theta is 1.
export function spread(omega, theta, p) {
	const b = beta(omega, p);
	const sech = 1 / Math.cosh(b * theta);
	const base = sech * sech;
	if (p.swell <= 0) {
		return base;
	}
	const s = 16 * Math.tanh(peakOmega(p) / omega) * p.swell * p.swell;
	return base * Math.abs(Math.cos(theta * 0.5)) ** (2 * s);
}

// Numeric, midpoint rule over -pi .. pi. Called once per cell at cascade init only.
export function spreadNormaliser(omega, p) {
	const width = (2 * Math.PI) / NORMALISER_STEPS;
	let total = 0;
	for (let step = 0; step <= NORMALISER_STEPS - 1; step++) {
		const theta = -Math.PI + (step + 0.5) * width;
		total += spread(omega, theta, p) * width;
	}
	return 1 / total;
}

// Normalised directional factor: Donelan-Banner (with Horvath's swell shaping) blended
// toward uniform by isotropy. Both parts integrate to one over theta, so the blend does too.
export function directional(omega, theta, p) {
	const isotropy = p.isotropy ?? 0;
	const wind = spread(omega, theta, p) * spreadNormaliser(omega, p);
	return (1 - isotropy) * wind + isotropy / (2 * Math.PI);
}

// Variance per unit wavevector area at (kx, kz): S(omega) depth(omega) D(omega, theta)
// (d omega / dk) / k. This change of variables is what keeps wave heights physical when
// a frequency spectrum feeds a wavevector lattice (research note, section 1.10).
// The two shape knobs land here, and only here, so every cascade and every derived field
// (heights, displacements, slopes, the Jacobian) picks them up consistently.
export function variance(kx, kz, p) {
	const k = Math.sqrt(kx * kx + kz * kz);
	if (k === 0) {
		return 0;
	}
	const w = omega(k, p);
	let theta = Math.atan2(kz, kx) - p.windDirection;
	// Floored modulo: theta + pi is negative whenever the wavevector points clockwise of the wind.
	theta = mod(theta + Math.PI, 2 * Math.PI) - Math.PI;
	const d = directional(w, theta, p);
	const wp = peakOmega(p);
	// Amplitude is the square root of variance, so a scale of s needs s^2 here.
	const boost = w > wp ? (w / wp) ** (2 * p.tailBoost) : 1;
	return jonswap(w, p) * depthFactor(w, p) * d * omegaDerivative(k, p) / k * p.scale * p.scale * boost;
}
