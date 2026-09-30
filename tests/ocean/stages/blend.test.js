import { test } from 'node:test';
import * as expect from '../expect.js';
import * as StageControl from '../../../content/ocean/js/engine/stageControl.js';
import { blendRecipes, engineSettings } from '../../../content/ocean/js/stages/blend.js';
import { recipeFor, STEP_COUNT } from '../../../content/ocean/js/stages/recipes.js';
import { applySliders } from '../../../content/ocean/js/stages/sliders.js';

test('progress 0 is the first recipe and 1 the second, number for number', () => {
	const a = recipeFor(4);
	const b = recipeFor(5);
	const start = blendRecipes(a, b, 0);
	const end = blendRecipes(a, b, 1);
	expect.equal(start.engine.chop, a.engine.chop, 'start chop');
	expect.equal(end.engine.chop, b.engine.chop, 'end chop');
	expect.equal(start.shot.position.join(','), a.shot.position.join(','), 'start shot');
	expect.equal(end.shot.position.join(','), b.shot.position.join(','), 'end shot');
	expect.equal(end.look.sun.azimuth, b.look.sun.azimuth, 'end sun');
	expect.equal(start.from, 4, 'from');
	expect.equal(start.to, 5, 'to');
	expect.truthy(Object.isFrozen(start.engine.sine), 'frozen');
});

test('numbers lerp between; fetch and fog on a log scale; the sun the short way round', () => {
	const rise = blendRecipes(recipeFor(1), recipeFor(2), 0.25);
	expect.near(rise.engine.sine.amplitude, 0.375, 1e-12, "a quarter of step 2's 1.5");
	const fetch = blendRecipes(applySliders(recipeFor(7), { fetch: 5000 }), recipeFor(7), 0.5);
	expect.near(fetch.engine.sea.fetch, Math.sqrt(5000 * 80000), 1e-6, 'geometric midpoint of the fetches');
	const fog = blendRecipes(recipeFor(5), recipeFor(6), 0.5);
	expect.near(fog.look.fog, Math.sqrt(recipeFor(5).look.fog * recipeFor(6).look.fog), 1e-12, 'geometric midpoint of the fogs');
	const sun = blendRecipes(applySliders(recipeFor(4), { sunAzimuth: 350 }), applySliders(recipeFor(4), { sunAzimuth: 10 }), 0.5);
	expect.near(sun.look.sun.azimuth, 0, 1e-9, 'through north, not round the long way');
	const shot = blendRecipes(recipeFor(5), recipeFor(6), 0.5);
	expect.equal(shot.shot.position.join(','), '0,152.5,57.5', 'the camera halfway up (crest [0, 5, 25], look-down [0, 300, 90])');
});

test('everything discrete snaps at the halfway point', () => {
	const before = blendRecipes(recipeFor(6), recipeFor(7), 0.49);
	const after = blendRecipes(recipeFor(6), recipeFor(7), 0.5);
	expect.equal(before.engine.source, 'bank', 'still the bank');
	expect.equal(after.engine.source, 'fft', 'the FFT from halfway');
	expect.equal(before.look.material, 'sea', 'sea material');
	expect.equal(after.look.material, 'painted', 'painted from halfway');
	expect.equal(before.engine.maps, false, 'maps off');
	expect.equal(after.engine.maps, true, 'maps on');
	const layers = blendRecipes(recipeFor(9), recipeFor(10), 0.7);
	expect.equal(layers.engine.layers.join(','), 'true,true,true', 'layers snap');
	expect.equal(layers.step, 10, 'the nearer step names the blend');
});

test('the parts the next step needs run warm while between, and not at the ends', () => {
	const between = blendRecipes(recipeFor(6), recipeFor(7), 0.3);
	expect.equal(between.warm.fft, true, 'the FFT warming');
	expect.equal(between.warm.maps, true, 'the painter warming');
	const atSix = blendRecipes(recipeFor(6), recipeFor(7), 0);
	expect.equal(atSix.warm.fft, false, 'at step 6 itself nothing warms');
	const layers = blendRecipes(recipeFor(9), recipeFor(10), 0.2);
	expect.equal(layers.warm.layers.join(','), 'true,true,true', 'the new layers warm up before they show');
	expect.equal(layers.engine.layers.join(','), 'true,false,false', 'while only one shows');
});

test("the panel's sliders stay the step being read until the next step is reached", () => {
	const late = blendRecipes(recipeFor(7), recipeFor(8), 0.9);
	expect.equal(late.sliders.map((s) => s.id).join(','), 'wind,fetch', "step 7's panel");
	expect.equal(late.charts.phaseArrows, true, "but step 8's chart is what shows");
});

test('engineSettings adds the normals the look needs and the warm parts, and the engine accepts every one', () => {
	expect.equal(engineSettings(blendRecipes(recipeFor(1), recipeFor(2), 0)).normals, false, 'white: unlit');
	expect.equal(engineSettings(blendRecipes(recipeFor(4), recipeFor(5), 0)).normals, true, 'lit sea');
	const unlit = applySliders(recipeFor(4), { shading: false });
	expect.equal(engineSettings(blendRecipes(unlit, unlit, 0)).normals, false, 'shading off: unlit');
	expect.equal(engineSettings(blendRecipes(recipeFor(7), recipeFor(8), 0)).normals, true, 'painted');
	for (let step = 1; step <= STEP_COUNT; step++) {
		const next = recipeFor(Math.min(step + 1, STEP_COUNT));
		for (const progress of [0, 0.3, 0.5, 0.8]) {
			StageControl.normalise(engineSettings(blendRecipes(recipeFor(step), next, progress)));
		}
	}
});

test('a progress that is not a number is refused; outside 0..1 it is clamped', () => {
	let message = '';
	try {
		blendRecipes(recipeFor(1), recipeFor(2), Number.NaN);
	} catch (error) {
		message = error instanceof RangeError ? error.message : `not a RangeError: ${error}`;
	}
	expect.truthy(message.includes('progress'), message);
	expect.equal(blendRecipes(recipeFor(1), recipeFor(2), 7).progress, 1, 'clamped to 1');
	expect.equal(blendRecipes(recipeFor(1), recipeFor(2), -3).engine.sine.amplitude, 0, 'clamped to 0');
});
