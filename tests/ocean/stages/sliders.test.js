import { test } from 'node:test';
import * as expect from '../expect.js';
import { deepFreeze, getPath, setPath } from '../../../content/ocean/js/stages/paths.js';
import { applySliders, clampSlider, sliderById, sliderValue } from '../../../content/ocean/js/stages/sliders.js';
import { PLACE_SUN, sunAngles, sunDirection } from '../../../content/ocean/js/stages/sun.js';
import * as Lighting from '../../../content/ocean/js/render/lighting.js';

const RANGE = { id: 'wind', kind: 'range', bind: 'engine.sea.windSpeed', min: 3, max: 25, step: 0.5, default: 12 };
const TOGGLE = { id: 'wire', kind: 'toggle', bind: 'look.wireframe', default: true };
const COUNTER = { id: 'seed', kind: 'counter', bind: 'engine.seed', min: 1, default: 7 };
const CAPPED = { id: 'seed', kind: 'counter', bind: 'engine.seed', min: 1, max: 9999, default: 7 };
const CHOICE = { id: 'n', kind: 'choice', bind: 'charts.transformN', options: [8, 16, 32, 64], default: 32 };
const RECIPE = deepFreeze({
	step: 99,
	engine: { sea: { windSpeed: 12, fetch: 80000 }, seed: 7, layers: [true, false, false] },
	look: { wireframe: true },
	charts: { transformN: 32 },
	sliders: [RANGE, TOGGLE, COUNTER, CHOICE, { id: 'layer2', kind: 'toggle', bind: 'engine.layers.1', default: false }],
});

test('clampSlider keeps a range inside its ends and on its step (Review Focus 3)', () => {
	expect.equal(clampSlider(RANGE, 40), 25, 'clamped to max');
	expect.equal(clampSlider(RANGE, -5), 3, 'clamped to min');
	expect.equal(clampSlider(RANGE, 12.3), 12.5, 'snapped to the 0.5 step');
	expect.equal(clampSlider(RANGE, 12.1), 12, 'snapped down');
	for (const bad of [Number.NaN, Infinity, '12', null]) {
		let message = '';
		try {
			clampSlider(RANGE, bad);
		} catch (error) {
			message = error instanceof RangeError ? error.message : `not a RangeError: ${error}`;
		}
		expect.truthy(message.includes('wind'), `${bad} refused: ${message}`);
	}
});

// Task 8 minor: "got 12" for the text '12' read as if a number had been refused.
test('a refused value that is text is shown quoted, so it does not read as a number', () => {
	let message = '';
	try {
		clampSlider(RANGE, '12');
	} catch (error) {
		message = error.message;
	}
	expect.truthy(message.includes('"12"'), message);
});

test('toggles take only booleans, counters whole numbers from their minimum, choices the nearest option', () => {
	expect.equal(clampSlider(TOGGLE, false), false, 'boolean kept');
	let message = '';
	try {
		clampSlider(TOGGLE, 1);
	} catch (error) {
		message = error.message;
	}
	expect.truthy(message.includes('wire'), `1 is not a boolean: ${message}`);
	expect.equal(clampSlider(COUNTER, 9.7), 9, 'floored');
	expect.equal(clampSlider(COUNTER, -3), 1, 'at least min');
	expect.equal(clampSlider(CAPPED, 1e305), 9999, 'at most max (fix round 1)');
	expect.equal(clampSlider(CAPPED, 42.9), 42, 'floored under the cap');
	expect.equal(clampSlider(CHOICE, 20), 16, 'nearest option');
	expect.equal(clampSlider(CHOICE, 1000), 64, 'the largest');
});

test('applySliders binds values into a frozen copy and leaves the recipe alone', () => {
	const bound = applySliders(RECIPE, { wind: 20, wire: false, layer2: true });
	expect.equal(bound.engine.sea.windSpeed, 20, 'wind bound');
	expect.equal(bound.look.wireframe, false, 'wireframe bound');
	expect.equal(bound.engine.layers.join(','), 'true,true,false', 'an array element bound');
	expect.equal(bound.engine.sea.fetch, 80000, 'the rest kept');
	expect.equal(RECIPE.engine.sea.windSpeed, 12, 'the original untouched');
	expect.truthy(Object.isFrozen(bound.engine.sea) && Object.isFrozen(bound.engine.layers), 'frozen down the path');
	expect.equal(applySliders(RECIPE, {}), RECIPE, 'no values: the same recipe');
	expect.equal(applySliders(RECIPE, { wind: 99 }).engine.sea.windSpeed, 25, 'clamped on the way in');
	expect.equal(sliderValue(bound, 'wind'), 20, 'sliderValue reads through the binding');
	let message = '';
	try {
		applySliders(RECIPE, { sideways: 1 });
	} catch (error) {
		message = error.message;
	}
	expect.truthy(message.includes('sideways'), `an unknown slider is refused: ${message}`);
	message = '';
	try {
		applySliders(RECIPE, null);
	} catch (error) {
		message = error instanceof RangeError ? error.message : `not a RangeError: ${error}`;
	}
	expect.truthy(message.includes('slider values'), `null values are refused by name (fix round 1): ${message}`);
	expect.equal(sliderById(RECIPE, 'seed').kind, 'counter', 'sliderById');
});

test('paths: a missing path is an error, never a silent new field', () => {
	expect.equal(getPath(RECIPE, 'engine.layers.0'), true, 'array index');
	for (const fn of [() => getPath(RECIPE, 'engine.tide'), () => setPath(RECIPE, 'engine.tide.level', 1)]) {
		let message = '';
		try {
			fn();
		} catch (error) {
			message = error instanceof RangeError ? error.message : `not a RangeError: ${error}`;
		}
		expect.truthy(message.includes('engine.tide'), message);
	}
	// Fix round 1: inherited keys and array properties are not values a recipe declares.
	for (const path of ['engine.toString', 'engine.layers.length', 'engine.layers.3', 'engine.layers.01', 'engine.layers.x', 'engine.seed.x', '__proto__', 'constructor']) {
		for (const fn of [() => getPath(RECIPE, path), () => setPath(RECIPE, path, 1)]) {
			let message = '';
			try {
				fn();
			} catch (error) {
				message = error instanceof RangeError ? error.message : `not a RangeError: ${error}`;
			}
			expect.truthy(message.includes(`no value at ${path}`), `${path}: ${message}`);
		}
	}
	expect.equal(setPath(RECIPE, 'engine.layers.2', true).engine.layers.join(','), 'true,false,true', 'the last index is still a path');
});

test("the sun's angles and direction are one another's inverse, and PLACE_SUN is the page's sun", () => {
	const back = sunDirection(sunAngles([0.3, 0.5, -0.8]));
	const length = Math.hypot(0.3, 0.5, -0.8);
	[0.3, 0.5, -0.8].forEach((value, i) => expect.near(back[i], value / length, 1e-12, `component ${i}`));
	const place = sunDirection(PLACE_SUN);
	// lighting.js holds the place's sun as float32 values read from Studio, a few 1e-8 off unit length.
	Lighting.SUN_DIRECTION.forEach((value, i) => expect.near(place[i], value, 1e-6, `place sun ${i}`));
	expect.truthy(PLACE_SUN.azimuth > 170 && PLACE_SUN.azimuth < 176, `azimuth ${PLACE_SUN.azimuth}`);
	expect.truthy(PLACE_SUN.elevation > 16 && PLACE_SUN.elevation < 17, `elevation ${PLACE_SUN.elevation}`);
	// Fix round 1: a hair below +x rounds to 360 in degrees; the azimuth stays in [0, 360).
	expect.equal(sunAngles([1, 0, -1e-17]).azimuth, 0, 'just below +x is azimuth 0');
	const wrapped = sunAngles(sunDirection({ azimuth: 360, elevation: 10 })).azimuth;
	expect.truthy(wrapped >= 0 && wrapped < 1e-9, `azimuth 360 comes back as 0, got ${wrapped}`);
});
