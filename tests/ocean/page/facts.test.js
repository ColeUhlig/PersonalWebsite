// The code facts the ocean page's copy quotes (piece C, Task 3), measured from the code itself.
import { test } from 'node:test';
import * as expect from '../expect.js';
import * as Tier from '../../../content/ocean/js/core/tier.js';
import * as RingLayout from '../../../content/ocean/js/core/ringLayout.js';
import * as HorizonState from '../../../content/ocean/js/engine/horizonState.js';
import { COLOUR_TEXELS, FOAM_TEXELS } from '../../../content/ocean/js/engine/config.js';
import * as WaveBanks from '../../../content/ocean/js/engine/waveBanks.js';
import { recipeFor } from '../../../content/ocean/js/stages/recipes.js';

// The structural numbers the page's copy quotes, measured from the code the ocean runs. The copy
// sources (copySources.js) cite these test names, so a change to a tier or a map size fails here
// before the page can say something that is no longer true. No wave count: the teaching bank's
// count includes silent bins, and the page makes no claim about how many waves it holds.
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

test('the horizon adds 8 quads: 232 materials', () => {
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

test('the teaching bank sits on the 256-stud tile', () => {
	expect.equal(WaveBanks.TEACHING_TILE, 256, 'tile');
});

// copySources.js quotes recipes.js's header for these counts; this keeps that comment honest.
test('steps 4 and 5 sum the 16 tallest bank waves, and step 6 the 4 tallest', () => {
	for (const step of [4, 5]) expect.equal(recipeFor(step).engine.bank.count, 16, `step ${step} bank count`);
	expect.equal(recipeFor(6).engine.bank.count, 4, 'step 6 bank count');
	for (const step of [4, 5, 6]) expect.equal(recipeFor(step).engine.source, 'bank', `step ${step} source`);
});

test('the phone tier (Medium) writes 6,480 vertices with two layers', () => {
	expect.equal(layoutOf('Medium').vertexCount, 6480, 'vertices');
	expect.equal(Tier.presets.Medium.sizes.length, 2, 'layers');
});
