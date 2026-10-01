// The URL-knob clamp's unit tests (piece C, Task 6): slider-owned knobs held to the sliders' ranges.
import { test } from 'node:test';
import * as expect from '../expect.js';
import { readConfig } from '../../../content/ocean/js/engine/config.js';
import { recipeFor } from '../../../content/ocean/js/stages/recipes.js';
import { clampKnobsToSliders, SLIDER_KNOBS } from '../../../content/ocean/js/page/knobs.js';

test('the shipped defaults sit inside every slider: nothing changes', () => {
	const config = readConfig('cam=deck');
	const { config: out, warnings } = clampKnobsToSliders(config, recipeFor);
	expect.equal(out, config, 'the same object');
	expect.equal(warnings.length, 0, 'no warnings');
});

test('knobs past a slider are clamped into it, each with a warning naming the knob', () => {
	const config = readConfig('wind=90&fetch=900000&chop=50&whitecap=-3&foamDecay=2&scatter=1000');
	const { config: out, warnings } = clampKnobsToSliders(config, recipeFor);
	expect.equal(out.params.windSpeed, 25, 'wind to the slider max');
	expect.equal(out.params.fetch, 200000, 'fetch');
	expect.equal(out.chop, 2, 'chop to the slider max (recipes.js runs it to the engine\'s 2)');
	expect.equal(out.foam.whitecap, 0, 'whitecap to the slider min');
	expect.equal(out.foam.decay, 0.97, 'fade');
	expect.equal(out.scatter.strength, 60, 'glow');
	for (const knob of ['wind=90', 'fetch=900000', 'chop=50', 'whitecap=-3', 'foamDecay=2', 'scatter=1000']) {
		expect.truthy(warnings.some((w) => w.startsWith(knob)), `a warning for ${knob}: ${warnings.join(' | ')}`);
	}
	expect.truthy(Object.isFrozen(out) && Object.isFrozen(out.params) && Object.isFrozen(out.foam), 'frozen');
	expect.equal(config.params.windSpeed, 90, 'the original is untouched');
});

test('every knob names a slider its step really has', () => {
	for (const { step, slider } of SLIDER_KNOBS) {
		expect.truthy(recipeFor(step).sliders.some((s) => s.id === slider && s.kind === 'range'), `step ${step} has range slider ${slider}`);
	}
});
