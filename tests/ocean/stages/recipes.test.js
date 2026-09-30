import { test } from 'node:test';
import * as expect from '../expect.js';
import * as Tier from '../../../content/ocean/js/core/tier.js';
import * as StageControl from '../../../content/ocean/js/engine/stageControl.js';
import * as Lighting from '../../../content/ocean/js/render/lighting.js';
import { getPath } from '../../../content/ocean/js/stages/paths.js';
import * as Recipes from '../../../content/ocean/js/stages/recipes.js';
import { PLACE_SUN } from '../../../content/ocean/js/stages/sun.js';
import { KINDS, clampSlider, sliderById } from '../../../content/ocean/js/stages/sliders.js';

const R = Recipes.RECIPES;
const deepFrozen = (value) => value === null || typeof value !== 'object' || (Object.isFrozen(value) && Object.values(value).every(deepFrozen));
const ids = (recipe) => recipe.sliders.map((s) => s.id).join(',');

test('thirteen recipes, one per step, in order, with unique ids, frozen all the way down', () => {
	expect.equal(R.length, Recipes.STEP_COUNT, 'thirteen');
	R.forEach((recipe, i) => expect.equal(recipe.step, i + 1, `step ${i + 1}`));
	expect.equal(new Set(R.map((r) => r.id)).size, 13, 'unique ids');
	expect.truthy(deepFrozen(R), 'deep frozen');
	expect.equal(Recipes.recipeFor(7), R[6], 'recipeFor');
});

test("every recipe's engine part is settings the engine accepts", () => {
	for (const recipe of R) {
		expect.equal(Object.keys(recipe.engine).sort().join(','), [...Recipes.ENGINE_FIELDS].sort().join(','), `step ${recipe.step} engine fields`);
		StageControl.normalise({ ...recipe.engine, normals: true, warm: { fft: false, maps: false, layers: [false, false, false] } });
		expect.truthy(Recipes.MATERIALS.includes(recipe.look.material), `step ${recipe.step} material`);
		expect.truthy(Recipes.MOVES.includes(recipe.shot.move), `step ${recipe.step} move`);
		expect.truthy(recipe.look.fog > 0, `step ${recipe.step} fog`);
	}
});

test('steps 1 to 6 draw the Gerstner sum, steps 7 to 13 the FFT (spec section 3)', () => {
	expect.equal(R.map((r) => r.engine.source).join(','), 'sine,sine,bank,bank,bank,bank,fft,fft,fft,fft,fft,fft,fft', 'sources');
});

test('step 1 is a flat white plane under its wireframe', () => {
	const one = R[0];
	expect.equal(one.engine.sine.amplitude, 0, 'no wave');
	expect.equal(one.look.material, 'white', 'white');
	expect.equal(one.look.wireframe, true, 'grid on');
	expect.equal(one.engine.sine.wavelength, R[1].engine.sine.wavelength, "step 2's wave, so scrolling raises it");
});

test("the parts come on in the story's order: light at 4, chop at 5, maps at 7, three layers at 10, foam at 11, glow at 12", () => {
	expect.equal(R.map((r) => r.look.material).join(','), 'white,white,white,sea,sea,sea,painted,painted,painted,painted,painted,painted,painted', 'materials');
	expect.equal(R.map((r) => r.engine.chop > 0).join(','), 'false,false,false,false,true,true,true,true,true,true,true,true,true', 'chop from 5');
	expect.equal(R.map((r) => r.engine.maps).join(','), 'false,false,false,false,false,false,true,true,true,true,true,true,true', 'maps from 7');
	expect.equal(R.map((r) => r.engine.layers.filter(Boolean).length).join(','), '1,1,1,1,1,1,1,1,1,3,3,3,3', 'layers');
	expect.equal(R.map((r) => r.engine.foam).join(','), 'false,false,false,false,false,false,false,false,false,false,true,true,true', 'foam from 11');
	expect.equal(R.map((r) => r.engine.glow).join(','), 'false,false,false,false,false,false,false,false,false,false,false,true,true', 'glow from 12');
});

test('the finale is the hero sea: the rough default, every part on', () => {
	for (const field of Recipes.ENGINE_FIELDS) {
		expect.equal(JSON.stringify(R[12].engine[field]), JSON.stringify(StageControl.DEFAULT_SETTINGS[field]), `finale ${field}`);
	}
	expect.equal(R[12].shot.move, 'drift', 'the finale camera drifts');
});

test('every slider is well formed and its default is the value its binding holds', () => {
	for (const recipe of R) {
		expect.equal(new Set(recipe.sliders.map((s) => s.id)).size, recipe.sliders.length, `step ${recipe.step} unique slider ids`);
		for (const slider of recipe.sliders) {
			const where = `step ${recipe.step} ${slider.id}`;
			expect.truthy(KINDS.includes(slider.kind), `${where} kind`);
			expect.truthy(typeof slider.label === 'string' && slider.label.length > 0, `${where} label`);
			expect.equal(getPath(recipe, slider.bind), slider.default, `${where} default is the bound value`);
			if (slider.kind === 'range') {
				expect.truthy(slider.min < slider.max && slider.step > 0, `${where} range`);
				expect.truthy(slider.default >= slider.min && slider.default <= slider.max, `${where} default inside`);
			}
			if (slider.kind === 'toggle') expect.equal(typeof slider.default, 'boolean', `${where} boolean`);
			if (slider.kind === 'counter') {
				expect.truthy(Number.isInteger(slider.default) && slider.default >= slider.min, `${where} counter`);
				expect.truthy(slider.max === undefined || (Number.isInteger(slider.max) && slider.default <= slider.max), `${where} counter default under its cap`);
			}
			if (slider.kind === 'choice') expect.truthy(slider.options.includes(slider.default), `${where} choice`);
		}
	}
});

test('each step offers the controls the story table names', () => {
	const expected = [
		'wireframe',
		'amplitude,wavelength,speed',
		'waveCount',
		'sunAzimuth,shading',
		'chop',
		'',
		'wind,fetch',
		'seed',
		'transformN',
		'layer1,layer2,layer3',
		'whitecap,fade',
		'sunHeight,glow',
		'',
	];
	R.forEach((recipe, i) => expect.equal(ids(recipe), expected[i], `step ${i + 1}`));
	const count = R[2].sliders[0];
	expect.equal(count.min, 1, 'wave count from 1');
	expect.equal(count.max, 32, 'to 32');
	expect.equal(R[8].sliders[0].options.join(','), '8,16,32,64', 'naive sum against FFT at these grid sizes');
	expect.equal(R[6].sliders[1].scale, 'log', 'fetch on a log slider');
});

test('every slider leaves its own default where it is (fix round 1)', () => {
	for (const recipe of R) {
		for (const slider of recipe.sliders.filter((s) => s.kind !== 'toggle')) {
			expect.equal(clampSlider(slider, slider.default), slider.default, `step ${recipe.step} ${slider.id}`);
		}
	}
	expect.equal(clampSlider(sliderById(R[3], 'sunAzimuth'), 173.4), 173, 'a value that is not the default still snaps');
});

test('the seed counter stops at 9999, and the engine refuses a seed past 2^31 - 1 (fix round 1)', () => {
	const seed = sliderById(R[7], 'seed');
	expect.equal(seed.max, 9999, 'max');
	expect.equal(clampSlider(seed, 1e305), 9999, '1e305 clamps');
	const settings = StageControl.normalise({ ...R[7].engine, seed: 9999, normals: true, warm: { fft: false, maps: false, layers: [false, false, false] } });
	expect.equal(settings.seed, 9999, 'the engine takes the counter at its cap');
});

test('the fetch slider steps 100 m on its log track and stays inside 5,000 .. 200,000 (fix round 1)', () => {
	const fetch = sliderById(R[6], 'fetch');
	expect.equal(fetch.step, 100, 'step');
	expect.equal(clampSlider(fetch, 4000), 5000, 'min');
	expect.equal(clampSlider(fetch, 1e9), 200000, 'max');
	expect.equal(clampSlider(fetch, 5260), 5300, 'snapped to 100 m');
});

// Final review I3: over 0 .. 1 the slider barely changed the frame; the engine takes 0 .. 2.
test("step 5's choppiness slider runs to the engine's 2 and starts well into it", () => {
	const chop = sliderById(R[4], 'chop');
	expect.equal(chop.min, 0, 'min');
	expect.equal(chop.max, 2, 'max: the most StageControl.normalise takes');
	expect.equal(chop.default, 1.3, 'default');
	expect.equal(R[4].engine.chop, 1.3, 'the recipe runs the default');
	const settings = StageControl.normalise({ ...R[4].engine, chop: chop.max, normals: true, warm: { fft: false, maps: false, layers: [false, false, false] } });
	expect.equal(settings.chop, 2, 'the engine takes the slider at its top');
});

test("the layer toggles name the High tier's cascade sizes", () => {
	R[9].sliders.forEach((slider, i) => {
		expect.truthy(slider.label.includes(String(Tier.presets.High.sizes[i])), `${slider.label}`);
		expect.equal(slider.bind, `engine.layers.${i}`, 'bound to its layer');
	});
});

// Task 10 fix round 1: the high shots look steeply down under A2's fog instead of out across a
// thinned one, which showed the world's edge and the flat horizon plane (shots.test.js).
test('step 6 flies the camera up and looks steeply down, so the repetition shows', () => {
	expect.truthy(R[5].shot.position[1] > 5 * R[4].shot.position[1], 'far higher than step 5');
	const [x, y, z] = R[5].shot.position.map((v, i) => v - R[5].shot.target[i]);
	expect.truthy(Math.atan2(y, Math.hypot(x, z)) > (60 * Math.PI) / 180, 'looking down at more than 60 degrees');
	expect.equal(R[5].look.fog, Lighting.FOG_DENSITY, "A2's fog");
	expect.equal(R[9].look.fog, Lighting.FOG_DENSITY, "A2's fog for the layers too");
});

test("the look's defaults are the page's lighting", () => {
	expect.equal(R[12].look.fog, Lighting.FOG_DENSITY, 'the A2 fog');
	expect.equal(R[12].look.sun.azimuth, PLACE_SUN.azimuth, "the finale has the place's sun");
	expect.equal(R[12].look.sun.elevation, PLACE_SUN.elevation, "at the place's height");
});

// Final review minor 1: the place sun (173 degrees, off to the left of the deck camera) left step
// 4's default frame without a highlight. The sun must be ahead of the camera to glint in the frame.
test("step 4's sun starts ahead of the deck camera, so its highlight is on the water in frame", () => {
	const four = R[3];
	expect.equal(sliderById(four, 'sunAzimuth').default, four.look.sun.azimuth, 'the slider starts at the recipe sun');
	const [fx, , fz] = four.shot.target.map((v, i) => v - four.shot.position[i]);
	const a = (four.look.sun.azimuth * Math.PI) / 180;
	const off = (Math.acos((fx * Math.cos(a) + fz * Math.sin(a)) / Math.hypot(fx, fz)) * 180) / Math.PI;
	expect.truthy(off < 60, `the sun is ${off.toFixed(0)} degrees off the line of sight`);
	expect.equal(R[4].look.sun.azimuth, four.look.sun.azimuth, 'step 5 keeps it, so scrolling on does not swing the sun');
	expect.equal(R[5].look.sun.azimuth, four.look.sun.azimuth, 'and step 6');
});

test('recipeFor refuses a step outside 1..13', () => {
	for (const bad of [0, 14, 2.5, '3']) {
		let message = '';
		try {
			Recipes.recipeFor(bad);
		} catch (error) {
			message = error instanceof RangeError ? error.message : `not a RangeError: ${error}`;
		}
		expect.truthy(message.includes('step'), `${bad}: ${message}`);
	}
});
