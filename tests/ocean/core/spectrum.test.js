import { test } from 'node:test';
import * as expect from '../expect.js';
import * as Spectrum from '../../../content/ocean/js/core/spectrum.js';

// The spec's P: the physical defaults with no swell narrowing, and no isotropy field (optional).
const P = Object.freeze({
	windSpeed: 12,
	fetch: 80000,
	depth: 60,
	gamma: 3.3,
	swell: 0,
	windDirection: 0,
	gravity: 9.81,
	scale: 1,
	tailBoost: 0,
});

test('peak frequency and alpha follow the fetch laws', () => {
	expect.near(Spectrum.peakOmega(P), 1.021985987944935, 1e-9, 'peakOmega');
	expect.near(Spectrum.alpha(P), 0.011450023071790175, 1e-12, 'alpha');
});

test('JONSWAP matches the reference values', () => {
	const wp = Spectrum.peakOmega(P);
	expect.near(Spectrum.jonswap(wp, P), 0.9344703089993789, 1e-9, 'S(wp)');
	expect.near(Spectrum.jonswap(2 * wp, P), 0.028565408221646948, 1e-9, 'S(2wp)');
	expect.near(Spectrum.jonswap(0.5 * wp, P), 6.518985421476582e-8, 1e-15, 'S(wp/2)');
});

test("depth factor is Horvath's tanh fit and tends to 1 in deep water", () => {
	expect.near(Spectrum.depthFactor(Spectrum.peakOmega(P), P), 0.9936244763800974, 1e-9, 'depth(wp)');
	const deep = { ...P };
	deep.depth = 5000;
	expect.near(Spectrum.depthFactor(0.5, deep), 1, 1e-6, 'deep water');
});

test('dispersion uses the finite-depth relation', () => {
	expect.near(Spectrum.omega(0.1, P), 0.9904483556094333, 1e-9, 'omega(0.1)');
	expect.near(Spectrum.omegaDerivative(0.1, P), 4.952972041049819, 1e-9, 'dw/dk(0.1)');
	// Deep water: omega^2 = g k.
	const deep = { ...P };
	deep.depth = 5000;
	expect.near(Spectrum.omega(0.5, deep) ** 2, 9.81 * 0.5, 1e-6, 'deep omega^2');
});

test('Donelan-Banner width follows the three regimes', () => {
	const wp = Spectrum.peakOmega(P);
	expect.near(Spectrum.beta(0.5 * wp, P), 1.0599893772448872, 1e-9, 'beta(0.5)');
	expect.near(Spectrum.beta(wp, P), 2.28, 1e-9, 'beta(1)');
	expect.near(Spectrum.beta(2 * wp, P), 0.9603456696593401, 1e-9, 'beta(2)');
});

test('Donelan-Banner width is continuous across its regime seams', () => {
	const wp = Spectrum.peakOmega(P);
	for (const ratio of [0.95, 1.6]) {
		const below = Spectrum.beta((ratio - 1e-6) * wp, P);
		const above = Spectrum.beta((ratio + 1e-6) * wp, P);
		expect.near(above, below, 0.01, `seam at ${ratio}`);
	}
});

test('normalised spreading integrates to one and peaks downwind', () => {
	const wp = Spectrum.peakOmega(P);
	for (const omega of [0.6 * wp, wp, 3 * wp]) {
		const normaliser = Spectrum.spreadNormaliser(omega, P);
		const steps = 720;
		let total = 0;
		for (let step = 0; step <= steps - 1; step++) {
			const theta = -Math.PI + (step + 0.5) * ((2 * Math.PI) / steps);
			total += Spectrum.spread(omega, theta, P) * normaliser * ((2 * Math.PI) / steps);
		}
		expect.near(total, 1, 1e-3, `integral at omega ${omega}`);
		expect.truthy(
			Spectrum.spread(omega, 0, P) > Spectrum.spread(omega, 1, P),
			`downwind is the maximum at omega ${omega}`,
		);
	}
});

test('swell narrows the spreading', () => {
	const swelly = { ...P };
	swelly.swell = 0.8;
	const wp = Spectrum.peakOmega(P);
	const wide = Spectrum.spread(wp, 0.8, P) * Spectrum.spreadNormaliser(wp, P);
	const narrow = Spectrum.spread(wp, 0.8, swelly) * Spectrum.spreadNormaliser(wp, swelly);
	expect.truthy(narrow < wide, 'off-axis energy drops with swell');
});

test('variance is zero at k = 0, positive downwind, and follows the wind direction', () => {
	expect.equal(Spectrum.variance(0, 0, P), 0, 'k = 0');
	expect.truthy(Spectrum.variance(0.1, 0, P) > 0, 'downwind');
	const rotated = { ...P };
	rotated.windDirection = Math.PI / 2;
	expect.near(Spectrum.variance(0, 0.1, rotated), Spectrum.variance(0.1, 0, P), 1e-12, 'rotation');
	expect.truthy(Spectrum.variance(0.1, 0, rotated) < Spectrum.variance(0, 0.1, rotated), 'crosswind is weaker');
});

// The shape knobs. Both multiply the variance, and amplitude is its square root, so `scale`
// appears squared and `tailBoost` is written as an exponent on 2 * tailBoost.
function kForOmega(target, p) {
	let low = 1e-9;
	let high = 100;
	for (let i = 1; i <= 200; i++) {
		const mid = (low + high) * 0.5;
		if (Spectrum.omega(mid, p) < target) {
			low = mid;
		} else {
			high = mid;
		}
	}
	return (low + high) * 0.5;
}

test('scale multiplies the variance by scale squared', () => {
	const doubled = { ...P };
	doubled.scale = 2;
	const downwind = Spectrum.variance(0.1, 0, P);
	expect.truthy(downwind > 0, 'the reference variance is positive');
	expect.near(Spectrum.variance(0.1, 0, doubled) / downwind, 4, 1e-12, 'scale 2 gives 4x');
	expect.equal(Spectrum.NORMAL.scale, 1, 'the default is physical');
});

test('tailBoost lifts only the tail', () => {
	const boosted = { ...P };
	boosted.tailBoost = 0.5;
	const wp = Spectrum.peakOmega(P);
	// omega = 2 wp: the factor is (2) ^ (2 * 0.5) = 2 exactly.
	const above = kForOmega(2 * wp, P);
	expect.near(Spectrum.omega(above, P), 2 * wp, 1e-9, 'k solved for omega = 2 wp');
	expect.near(
		Spectrum.variance(above, 0, boosted) / Spectrum.variance(above, 0, P),
		2,
		1e-9,
		'omega = 2 wp is doubled',
	);
	// Below the peak nothing changes at all.
	const below = kForOmega(0.5 * wp, P);
	expect.near(Spectrum.omega(below, P), 0.5 * wp, 1e-9, 'k solved for omega = 0.5 wp');
	expect.near(
		Spectrum.variance(below, 0, boosted) / Spectrum.variance(below, 0, P),
		1,
		1e-12,
		'omega = 0.5 wp is untouched',
	);
	expect.equal(Spectrum.NORMAL.tailBoost, 0, 'the default is the true spectrum');
});

test('the default parameter set is a normal sea', () => {
	expect.truthy(Spectrum.NORMAL.windSpeed > 0, 'windSpeed');
	expect.truthy(Spectrum.NORMAL.depth > 0, 'depth');
});

test('isotropy blends the spreading toward uniform and keeps it normalised', () => {
	const uniform = { ...P };
	uniform.isotropy = 1;
	const downwind = Spectrum.variance(0.1, 0, uniform);
	const crosswind = Spectrum.variance(0, 0.1, uniform);
	const upwind = Spectrum.variance(-0.1, 0, uniform);
	expect.truthy(downwind > 0, 'energy');
	expect.near(crosswind / downwind, 1, 1e-9, 'isotropy 1 has no direction (crosswind)');
	expect.near(upwind / downwind, 1, 1e-9, 'isotropy 1 has no direction (upwind)');
	const zero = { ...P };
	zero.isotropy = 0;
	expect.near(Spectrum.variance(0.1, 0, zero), Spectrum.variance(0.1, 0, P), 1e-15, 'isotropy 0 is the physical spread');
	// The directional factor still integrates to one over theta, at any blend.
	const half = { ...P };
	half.isotropy = 0.5;
	const omega = Spectrum.omega(0.1, half);
	const steps = 720;
	let total = 0;
	for (let step = 0; step <= steps - 1; step++) {
		const theta = -Math.PI + (step + 0.5) * ((2 * Math.PI) / steps);
		total += Spectrum.directional(omega, theta, half) * ((2 * Math.PI) / steps);
	}
	expect.near(total, 1, 1e-3, 'normalised at isotropy 0.5');
	expect.near(
		Spectrum.directional(omega, 0, half),
		0.5 * Spectrum.directional(omega, 0, zero) + 0.5 / (2 * Math.PI),
		1e-12,
		'the blend is linear',
	);
	expect.equal(Spectrum.NORMAL.isotropy, 0, 'the default is the physical spread');
});

// Not in the Luau spec (Review Focus 2): the web page's sliders reach values Studio never saw.
test('validateParams rejects zero or negative wind, fetch and depth, and extreme but valid seas stay finite', () => {
	for (const [name, value] of [['windSpeed', 0], ['windSpeed', -3], ['fetch', 0], ['depth', 0], ['depth', -1]]) {
		let threw = false;
		try {
			Spectrum.validateParams({ ...Spectrum.NORMAL, [name]: value });
		} catch (error) {
			threw = error instanceof RangeError && error.message.includes(name);
		}
		expect.truthy(threw, `${name} = ${value} throws a RangeError naming it`);
	}
	expect.equal(Spectrum.validateParams(Spectrum.NORMAL), Spectrum.NORMAL, 'returns the params it accepted');
	for (const windSpeed of [0.5, 2, 12, 40]) {
		for (const fetch of [1000, 80000, 1000000]) {
			const p = { ...Spectrum.NORMAL, windSpeed, fetch, isotropy: 0.4, scale: 8 };
			for (const k of [0.01, 0.1, 1, 10]) {
				for (const theta of [0, 1, Math.PI]) {
					const v = Spectrum.variance(k * Math.cos(theta), k * Math.sin(theta), p);
					expect.truthy(Number.isFinite(v) && v >= 0, `variance finite at wind ${windSpeed}, fetch ${fetch}, k ${k}: ${v}`);
				}
			}
		}
	}
});
