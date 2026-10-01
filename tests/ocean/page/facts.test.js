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
import { stepOf } from '../../../content/ocean/js/stages/steps.js';
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

// The tiling step's "the few tallest" (the copy names no count, by rule): the recipe's own count.
test("the tiling step sums the bank's 4 tallest waves", async () => {
	const { recipeFor } = await import('../../../content/ocean/js/stages/recipes.js');
	const { stepOf } = await import('../../../content/ocean/js/stages/steps.js');
	expect.equal(recipeFor(stepOf('tiling')).engine.bank.count, 4, 'four waves');
	expect.equal(recipeFor(stepOf('tiling')).engine.source, 'bank', 'from the teaching bank');
});

// C2 lane G, step 6: copySources.js quotes this test's name. Measured on the bank as the engine sums
// it (after every wavevector is snapped to the 256-stud lattice, which turns a heading a little),
// against the one heading the recipe fans round: +z, the way the teaching sea rolls.
test("the teaching bank's headings lie within 45° either side of one heading", () => {
	const bank = WaveBanks.teachingBank();
	expect.equal(WaveBanks.TEACHING_RECIPE.spread, 45, 'the recipe spread');
	let widest = 0;
	for (let wave = 0; wave < bank.count; wave++) {
		const o = wave * 6;
		if (bank.packed[o + 2] === 0) continue;
		widest = Math.max(widest, Math.abs(Math.atan2(bank.packed[o + 4], bank.packed[o + 5])) * (180 / Math.PI));
	}
	expect.truthy(widest > 0 && widest <= 45, `widest heading ${widest} degrees from +z`);
});

// C2 lane G: chapter one's words that no digit carries, so the copy check cannot see them. Step 1
// says "Two knobs" (height and length) and "four times taller"; step 5 says Spread at zero lines
// the waves up; step 13 says the tiling step's waves sit at full spread.
test('the sine step has two knobs, height and length, and the graph draws heights four times taller', () => {
	const sine = recipeFor(stepOf('sine'));
	expect.equal(sine.sliders.map((s) => s.id).join(','), 'amplitude,wavelength', 'two knobs');
	expect.equal(sine.look.graph.yScale, 4, 'four times taller');
	expect.equal(recipeFor(stepOf('moving-sine')).look.graph.yScale, 4, 'four times taller while it moves');
	expect.equal(recipeFor(stepOf('sum-of-sines')).look.graph.yScale, 4, 'four times taller in the sum');
});

test('Spread at zero lays every teaching wave along one heading, and the tiling step is at full spread', () => {
	const line = WaveBanks.withFan(WaveBanks.teachingBank(), 0);
	for (let wave = 0; wave < line.count; wave++) expect.near(line.packed[wave * 6 + 4], 0, 1e-12, `wave ${wave} along +z`);
	expect.equal(recipeFor(stepOf('directions')).sliders[0].id, 'fan', 'the directions step has the Spread slider');
	expect.equal(recipeFor(stepOf('directions')).sliders[0].min, 0, 'it goes down to zero');
	expect.equal(recipeFor(stepOf('tiling')).engine.bank.fan, 1, 'full spread on the tiling step');
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

// Step 8's math note: d in tanh(kd) is the water depth the engine's sea is built for, the depth
// core/spectrum.js ships ("depth metres") and the page's sea keeps (config.js takes
// Spectrum.NORMAL's). The engine treats a stud as a metre: a cascade's patch length is in studs
// (roblox-ocean src/shared/Ocean/Cascade.luau: "patch length in studs (metres)"), and its
// wavenumbers, in radians per stud, go straight into the dispersion with g in m/s² and d in metres,
// with no conversion. So the depth is 60 studs on screen. At that depth tanh(kd) is within 1% of 1
// for every wave up to 128 studs long; only the 256-stud layer's longest few fall short (0.90 for
// one wave across the tile).
test('the water depth the engine uses is 60 studs (the engine treats a stud as a metre), deep enough that tanh(kd) is close to 1 for all but the longest waves', () => {
	const params = readConfig('').params;
	expect.equal(Spectrum.NORMAL.depth, 60, 'shipped depth');
	expect.equal(params.depth, 60, "the page's sea");
	for (const k of [0.01, 0.1, 1]) {
		expect.near(Spectrum.omega(k, params), Math.sqrt(params.gravity * k * Math.tanh(k * 60)), 1e-12, `omega at k = ${k}`);
	}
	const preset = Tier.presets.High;
	const field = WaveField.create({ params, n: preset.n, sizes: preset.sizes, seed: SEED, loopPeriod: LOOP_PERIOD, chop: 0, swells: SWELL_SPECS });
	// A stud is a metre: the wave once across the 256-stud tile (k = 2 pi / 256 per stud) turns at
	// the metre dispersion's omega for that k, rounded down to the loop.
	const tile = field.cascades[0];
	const fundamental = (2 * Math.PI) / preset.sizes[0];
	const cell = [...tile.kx.keys()].find((i) => Math.abs(tile.kx[i] - fundamental) < 1e-12 && tile.kz[i] === 0);
	expect.truthy(cell !== undefined, 'the tile holds the wave once across it');
	const metres = Spectrum.omega(fundamental, params);
	expect.truthy(tile.omega[cell] <= metres + 1e-12 && tile.omega[cell] > metres - (2 * Math.PI) / LOOP_PERIOD, `omega ${tile.omega[cell]} against ${metres}`);
	let short = 0;
	for (const cascade of field.cascades) {
		for (let i = 0; i < cascade.kx.length; i++) {
			const k = Math.hypot(cascade.kx[i], cascade.kz[i]);
			if (k === 0) continue;
			const depthTerm = Math.tanh(k * params.depth);
			if ((2 * Math.PI) / k <= 128 + 1e-9) {
				expect.truthy(depthTerm >= 0.99, `a ${((2 * Math.PI) / k).toFixed(0)}-stud wave: tanh(kd) = ${depthTerm}`);
			} else {
				short += 1;
			}
		}
	}
	expect.truthy(short > 0, 'some long waves feel the bottom');
	expect.near(Math.tanh(fundamental * params.depth), 0.9, 0.01, 'one wave across the 256-stud tile');
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
