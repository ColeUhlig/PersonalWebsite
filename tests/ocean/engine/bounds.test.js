import { test } from 'node:test';
import * as expect from '../expect.js';
import * as Cascade from '../../../content/ocean/js/core/cascade.js';
import * as FFT from '../../../content/ocean/js/core/fft.js';
import * as Tier from '../../../content/ocean/js/core/tier.js';
import * as WaveField from '../../../content/ocean/js/core/waveField.js';
import { readConfig } from '../../../content/ocean/js/engine/config.js';
import * as Bounds from '../../../content/ocean/js/engine/bounds.js';

const HERO = readConfig('').params;

// The worst the three High cascades reach at a few times: each cascade's largest |height| summed
// (a bound on any one point of the surface), and the widest lateral displacement times chop.
function measured(params, chop) {
	const preset = Tier.presets.High;
	const bands = WaveField.bands(preset.sizes, preset.n);
	const plan = FFT.plan(preset.n);
	const cascades = preset.sizes.map((size, i) =>
		Cascade.create({ n: preset.n, size, kMin: bands[i].kMin, kMax: bands[i].kMax, seed: 7 * 7919 + i + 1, loopPeriod: 120, params }),
	);
	let height = 0;
	let lateral = 0;
	for (const t of [0, 12, 40, 77]) {
		let h = 0;
		let l = 0;
		for (const c of cascades) {
			Cascade.evolve(c, t);
			Cascade.synthesise(c, plan);
			let mh = 0;
			let ml = 0;
			for (let i = 0; i < c.cells; i++) {
				mh = Math.max(mh, Math.abs(c.height[i]));
				ml = Math.max(ml, Math.abs(c.dispX[i]), Math.abs(c.dispZ[i]));
			}
			h += mh;
			l += ml;
		}
		height = Math.max(height, h);
		lateral = Math.max(lateral, l * chop);
	}
	return { height, lateral };
}

test("at the shipped sea the bounds are A2's, to the last bit", () => {
	const b = Bounds.boundsFor({ params: HERO, chop: 0.8, swellScale: 0 });
	expect.equal(b.lateral, 8 + 6 * 0.8 * 8 + 2 * 0, 'lateral 46.4');
	expect.equal(b.height, 8 + 4 * 8 + 2.5 * 0, 'height 40');
	expect.equal(Bounds.seaFactor(HERO), 1, 'the reference sea');
	expect.truthy(Object.isFrozen(b), 'frozen');
});

test('the bounds cover the waves at the slider extremes (Review Focus 4)', () => {
	for (const [windSpeed, fetch] of [[25, 200000], [20, 80000], [25, 5000], [3, 200000], [3, 5000]]) {
		const params = { ...HERO, windSpeed, fetch };
		const bounds = Bounds.boundsFor({ params, chop: 0.8, swellScale: 0 });
		const worst = measured(params, 0.8);
		expect.truthy(bounds.height > worst.height + 2, `wind ${windSpeed} fetch ${fetch}: height bound ${bounds.height} over ${worst.height} plus the skirt margin`);
		expect.truthy(bounds.lateral > worst.lateral, `wind ${windSpeed} fetch ${fetch}: lateral bound ${bounds.lateral} over ${worst.lateral}`);
	}
});

test('a stronger wind or a longer fetch never shrinks the sea factor', () => {
	let last = 0;
	for (const windSpeed of [3, 6, 12, 18, 25]) {
		const factor = Bounds.seaFactor({ ...HERO, windSpeed });
		expect.truthy(factor > last, `wind ${windSpeed}: ${factor} over ${last}`);
		last = factor;
	}
	last = 0;
	for (const fetch of [5000, 20000, 80000, 200000]) {
		const factor = Bounds.seaFactor({ ...HERO, fetch });
		expect.truthy(factor > last, `fetch ${fetch}: ${factor} over ${last}`);
		last = factor;
	}
});

test('bankBounds covers a Gerstner bank and grow keeps the larger of each', () => {
	const b = Bounds.bankBounds(5, 0.6);
	expect.equal(b.height, 13, 'headroom plus the extent');
	expect.equal(b.lateral, 8 + 0.6 * 5, 'headroom plus chop times the extent');
	const g = Bounds.grow({ lateral: 10, height: 50 }, { lateral: 30, height: 20 });
	expect.equal(g.lateral, 30, 'the wider lateral');
	expect.equal(g.height, 50, 'the taller height');
	expect.truthy(Object.isFrozen(g), 'frozen');
});
