// The code facts the ocean page's copy quotes (piece C, Task 3), measured from the code itself.
import { test } from 'node:test';
import * as expect from '../expect.js';
import * as Tier from '../../../content/ocean/js/core/tier.js';
import * as RingLayout from '../../../content/ocean/js/core/ringLayout.js';
import * as HorizonState from '../../../content/ocean/js/engine/horizonState.js';
import { COLOUR_TEXELS, FOAM_TEXELS, LOOP_PERIOD, PHONE_TIER, SEED, SWELL_SPECS, readConfig } from '../../../content/ocean/js/engine/config.js';
import * as Charts from '../../../content/ocean/js/engine/charts.js';
import * as WaveBanks from '../../../content/ocean/js/engine/waveBanks.js';
import * as WaveField from '../../../content/ocean/js/core/waveField.js';
import * as Spectrum from '../../../content/ocean/js/core/spectrum.js';
import { recipeFor } from '../../../content/ocean/js/stages/recipes.js';
import { cascadeOptions } from '../../../content/ocean/js/proof/proofConfig.js';

// The structural numbers the page's copy quotes, measured from the code the ocean runs. The copy
// sources (copySources.js) cite these test names, so a change to a tier or a map size fails here
// before the page can say something that is no longer true. Where a test name carries the page's
// own wording ("the top tier: three layers, ..."), copySources.js quotes it for that sentence. No
// wave count: the teaching bank's count includes silent bins, and the page claims none.
const layoutOf = (name) => {
	const preset = Tier.presets[name];
	return RingLayout.build({ rings: preset.rings, patchCells: preset.patchCells, textureTile: preset.textureTile });
};

test('the High tier: 224 patches in 5 rings, 18,144 vertices', () => {
	const layout = layoutOf('High');
	expect.equal(layout.patches.length, 224, 'patches');
	expect.equal(Tier.presets.High.rings.length, 5, 'rings');
	expect.equal(layout.vertexCount, 18144, 'vertices');
});

test('the top tier\'s 232 materials: 224 patches plus 8 horizon pieces', () => {
	const preset = Tier.presets.High;
	const horizon = HorizonState.create(preset.textureTile, preset.rings[preset.rings.length - 1].halfExtent);
	expect.equal(horizon.quads.length, 8, 'horizon quads');
	expect.equal(layoutOf('High').patches.length + horizon.quads.length, 232, 'materials');
});

test('ring spacing 2, 4, 8, 16 and 32 studs', () => {
	expect.equal(Tier.presets.High.rings.map((ring) => ring.spacing).join(','), '2,4,8,16,32', 'spacings');
});

test('three layers of 64 × 64 over 256, 64 and 16 studs: 3 × 64 × 64 = 12,288', () => {
	const preset = Tier.presets.High;
	expect.equal(preset.n, 64, 'grid');
	expect.equal(preset.sizes.join(','), '256,64,16', 'patch sizes');
	expect.equal(preset.sizes.length * preset.n * preset.n, 12288, 'wave components');
});

test('the colour map is 512 × 512 and the foam field 256 × 256', () => {
	expect.equal(COLOUR_TEXELS, 512, 'colour map');
	expect.equal(FOAM_TEXELS, 256, 'foam field');
});

test('the top tier: three layers, 232 materials and 18,144 points', () => {
	const preset = Tier.presets.High;
	const horizon = HorizonState.create(preset.textureTile, preset.rings[preset.rings.length - 1].halfExtent);
	expect.equal(preset.sizes.length, 3, 'layers');
	expect.equal(layoutOf('High').patches.length + horizon.quads.length, 232, 'materials');
	expect.equal(layoutOf('High').vertexCount, 18144, 'points');
});

test('the teaching bank sits on the 256-stud tile', () => {
	expect.equal(WaveBanks.TEACHING_TILE, 256, 'tile');
});

// copySources.js quotes recipes.js's header for these counts; this keeps that comment honest.
test('steps 4 and 5 sum the 16 tallest bank waves, and step 6, the fly-up, the 4 tallest', () => {
	for (const step of [4, 5]) expect.equal(recipeFor(step).engine.bank.count, 16, `step ${step} bank count`);
	expect.equal(recipeFor(6).engine.bank.count, 4, 'step 6 bank count');
	for (const step of [4, 5, 6]) expect.equal(recipeFor(step).engine.source, 'bank', `step ${step} source`);
	expect.truthy(recipeFor(6).shot.position[1] > 10 * recipeFor(5).shot.position[1], "step 6's shot flies up");
});

// The arrows are built the way the page builds them (devStage.js: createPhaseArrows with the sea,
// seed and tier), and charts.js hands the cascade LOOP_PERIOD, which quantises every omega. So the
// whole set comes back to where it started after 120 s, and not after any shorter whole fraction.
test('the phase arrows loop every 120 s', () => {
	expect.equal(LOOP_PERIOD, 120, 'LOOP_PERIOD');
	const preset = Tier.presets.High;
	const arrows = Charts.createPhaseArrows(readConfig('').params, { seed: SEED, sizes: preset.sizes, n: preset.n });
	const at = (t) => Charts.phaseArrowsAt(arrows, t);
	const same = (a, b) => a.every((arrow, i) => Math.abs(arrow.re - b[i].re) <= 1e-9 * arrow.amplitude && Math.abs(arrow.im - b[i].im) <= 1e-9 * arrow.amplitude);
	for (const t of [0, 7.3, 55]) {
		expect.truthy(same(at(t), at(t + 120)), `the arrows at ${t} s and ${t + 120} s`);
		for (const shorter of [60, 40, 24]) expect.truthy(!same(at(t), at(t + shorter)), `the arrows do not already loop after ${shorter} s`);
	}
});

// Step 8's math note (Task 6 fix round 1): core/cascade.js rounds each dispersion frequency down to
// a multiple of 2 pi / LOOP_PERIOD, so every wave makes a whole number of turns in 120 s and the
// FFT sea comes back to where it started. Checked on every cell of every layer the High tier runs.
test("every wave's ω is rounded down to a whole number of turns per 120 s, so the sea repeats every 120 s", () => {
	const preset = Tier.presets.High;
	const config = readConfig('');
	const field = WaveField.create({ params: config.params, n: preset.n, sizes: preset.sizes, seed: SEED, loopPeriod: LOOP_PERIOD, chop: config.chop, swells: SWELL_SPECS.map((spec) => ({ ...spec, amplitude: spec.amplitude * config.swellScale })) });
	const turn = (2 * Math.PI) / 120;
	let moving = 0;
	for (const cascade of field.cascades) {
		for (let i = 0; i < cascade.omega.length; i++) {
			const turns = cascade.omega[i] / turn;
			expect.truthy(Math.abs(turns - Math.round(turns)) < 1e-9, `cell ${i}: ${turns} turns in 120 s`);
			const k = Math.hypot(cascade.kx[i], cascade.kz[i]);
			if (k > 0) {
				expect.truthy(cascade.omega[i] <= Spectrum.omega(k, config.params) + 1e-12, `cell ${i}: rounded down, not up`);
				moving += turns > 0 ? 1 : 0;
			}
		}
	}
	expect.truthy(moving > 0, 'some waves turn');
});

test('the proof panel runs one wave cascade, 64 × 64 cells at seed 7', () => {
	const options = cascadeOptions();
	expect.equal(options.n, 64, 'grid');
	expect.equal(options.seed, 7, 'seed');
	expect.equal(options.seed, SEED, "the page's seed");
});

test('the lighter tier by rule: 6,480 points instead of 18,144, and two layers of waves instead of three', () => {
	expect.equal(PHONE_TIER, 'Medium', 'the tier a phone gets by rule');
	expect.equal(layoutOf('Medium').vertexCount, 6480, 'vertices');
	expect.equal(layoutOf('High').vertexCount, 18144, 'top tier vertices');
	expect.equal(Tier.presets.High.sizes.length, 3, 'top tier layers');
	expect.equal(Tier.presets.Medium.sizes.length, 2, 'layers');
});
