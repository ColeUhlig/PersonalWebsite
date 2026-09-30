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

// Task 8 minors: keys that are not ordinary names, camera switches that are neither 0 nor 1,
// repeated keys, and a raw value set that is not an object.
test('odd route keys and values are said, never silently dropped', () => {
	const route = parseStageRoute('?step=3&s.__proto__=5&s.constructor=1');
	expect.equal(route.sliders.__proto__, '5', 'kept as a slider name like any other');
	const resolved = resolveSliderValues(recipeFor(3), route.sliders);
	expect.truthy(resolved.warnings.some((w) => w.includes('s.__proto__')), `the __proto__ key said: ${resolved.warnings}`);
	expect.truthy(resolved.warnings.some((w) => w.includes('s.constructor')), 'the constructor key said');
	const shot = parseStageRoute('?step=3&shot=maybe');
	expect.equal(shot.shots, true, 'anything but 0 keeps the recipe camera');
	expect.truthy(shot.warnings.some((w) => w.includes('shot=maybe')), 'and says so');
	const twice = parseStageRoute('?step=3&step=5&s.waveCount=4&s.waveCount=9');
	expect.equal(twice.step, 3, 'the first step given');
	expect.equal(twice.sliders.waveCount, '4', 'the first slider value given');
	expect.truthy(twice.warnings.some((w) => w.includes('step')), 'the repeated step said');
	expect.truthy(twice.warnings.some((w) => w.includes('s.waveCount')), 'the repeated slider said');
});

test('resolveSliderValues refuses raw values that are not an object of texts', () => {
	for (const bad of [null, undefined, 'wind=3', ['3']]) {
		let message = '';
		try {
			resolveSliderValues(recipeFor(7), bad);
		} catch (error) {
			message = error instanceof RangeError ? error.message : `not a RangeError: ${error}`;
		}
		expect.truthy(message.includes('slider values'), `${JSON.stringify(bad)}: ${message}`);
	}
	let message = '';
	try {
		resolveSliderValues(recipeFor(7), { wind: 20 });
	} catch (error) {
		message = error.message;
	}
	expect.truthy(message.includes('s.wind'), `a raw value that is not text is named: ${message}`);
});

// Final fix: the capture script and the browser tests pin the finale's drift to a point of its
// circle, since a frozen clock never turns it.
test('drift pins the finale camera to a point of its circle, in seconds of the drift', () => {
	expect.equal(parseStageRoute('?step=13').drift, null, 'the drift runs by default');
	expect.equal(parseStageRoute('?step=13&drift=120').drift, 120, 'pinned at 120 s');
	const bad = parseStageRoute('?step=13&drift=soon');
	expect.equal(bad.drift, null, 'a non-number leaves it running');
	expect.truthy(bad.warnings.some((w) => w.includes('drift=soon')), 'and says so');
	const negative = parseStageRoute('?step=13&drift=-5');
	expect.equal(negative.drift, 0, 'clamped to 0');
	expect.truthy(negative.warnings.some((w) => w.includes('drift=-5')), 'and says so');
});
