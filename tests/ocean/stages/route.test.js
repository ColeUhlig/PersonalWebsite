import { test } from 'node:test';
import * as expect from '../expect.js';
import { recipeFor } from '../../../content/ocean/js/stages/recipes.js';
import { parseStageRoute, resolveSliderValues } from '../../../content/ocean/js/stages/route.js';

test('no step, no route: the page stays the A2 hero sea', () => {
	expect.equal(parseStageRoute(''), null, 'empty');
	expect.equal(parseStageRoute('?cam=deck&stats=1'), null, 'other knobs only');
});

test('step, progress, slider values and the camera switch are read', () => {
	const route = parseStageRoute('?step=3&progress=0.25&s.waveCount=12&shot=0&freeze=12');
	expect.equal(route.step, 3, 'step');
	expect.equal(route.progress, 0.25, 'progress');
	expect.equal(route.sliders.waveCount, '12', 'raw slider text');
	expect.equal(route.shots, false, 'the recipe camera off');
	expect.equal(route.warnings.length, 0, 'no warnings');
	expect.equal(parseStageRoute('?step=13').progress, 0, 'progress defaults to 0');
	expect.equal(parseStageRoute('?step=13').shots, true, 'the recipe camera on by default');
});

test('a route out of range is clamped and a garbled one falls back, each with a warning (Review Focus 3)', () => {
	const high = parseStageRoute('?step=99&progress=-1');
	expect.equal(high.step, 13, 'step clamped');
	expect.equal(high.progress, 0, 'progress clamped');
	expect.truthy(high.warnings.some((w) => w.includes('step=99')), 'a step warning');
	expect.truthy(high.warnings.some((w) => w.includes('progress=-1')), 'a progress warning');
	const garbled = parseStageRoute('?step=abc&progress=lots');
	expect.equal(garbled.step, 1, 'a non-number step is step 1');
	expect.equal(garbled.progress, 0, 'a non-number progress is 0');
	expect.equal(garbled.warnings.length, 2, 'both said');
	expect.equal(parseStageRoute('?step=2.6').step, 3, 'a fractional step rounds');
});

test("slider values are resolved against the step's own sliders, with a warning for anything that does not fit", () => {
	const seven = resolveSliderValues(recipeFor(7), { wind: '20', fetch: '9999999', sideways: '1' });
	expect.equal(seven.values.wind, 20, 'wind');
	expect.equal(seven.values.fetch, 200000, 'fetch clamped');
	expect.equal(seven.values.sideways, undefined, 'unknown dropped');
	expect.truthy(seven.warnings.some((w) => w.includes('s.fetch')), 'the clamp said');
	expect.truthy(seven.warnings.some((w) => w.includes('s.sideways')), 'the unknown said');
	const one = resolveSliderValues(recipeFor(1), { wireframe: '0' });
	expect.equal(one.values.wireframe, false, 'a toggle from 0');
	const bad = resolveSliderValues(recipeFor(1), { wireframe: 'maybe' });
	expect.equal(bad.values.wireframe, undefined, 'not a toggle value');
	expect.equal(bad.warnings.length, 1, 'said');
	const garbled = resolveSliderValues(recipeFor(7), { wind: 'abc' });
	expect.equal(garbled.values.wind, undefined, 'not a number');
	expect.truthy(garbled.warnings[0].includes('s.wind'), 'said');
});
