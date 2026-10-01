// The slider model's unit tests (piece C, Task 6): tracks, log scale, value text and term colours.
import { test } from 'node:test';
import * as expect from '../expect.js';
import { formatValue, fromInput, inputRange, LOG_STEPS, TERM_BY_SLIDER, toInput } from '../../../content/ocean/js/page/sliderModel.js';
import { RECIPES } from '../../../content/ocean/js/stages/recipes.js';

const WIND = { id: 'wind', label: 'Wind speed', kind: 'range', min: 3, max: 25, step: 0.5, unit: 'm/s', scale: 'linear' };
const FETCH = { id: 'fetch', label: 'Fetch', kind: 'range', min: 5000, max: 200000, step: 1000, unit: 'm', scale: 'log' };
const SUN = { id: 'sunAzimuth', label: 'Sun direction', kind: 'range', min: 0, max: 360, step: 1, unit: '°', scale: 'linear' };

test('a linear range maps straight through; a log range spreads its decades over the track', () => {
	expect.equal(inputRange(WIND).step, 0.5, 'linear step');
	expect.equal(toInput(WIND, 12), 12, 'linear in');
	expect.equal(fromInput(WIND, 12.5), 12.5, 'linear out');
	const log = inputRange(FETCH);
	expect.equal(`${log.min}..${log.max}/${log.step}`, `0..${LOG_STEPS}/1`, 'log track');
	expect.equal(toInput(FETCH, 5000), 0, 'bottom');
	expect.equal(toInput(FETCH, 200000), LOG_STEPS, 'top');
	expect.near(fromInput(FETCH, toInput(FETCH, 80000)), 80000, 400, 'round trip');
	expect.equal(toInput(FETCH, 1), 0, 'below the range clamps');
	expect.equal(fromInput(FETCH, 5000), 200000, 'past the track clamps');
});

test('values read as the panel shows them', () => {
	expect.equal(formatValue(WIND, 12), '12.0 m/s', 'one decimal for a 0.5 step');
	expect.equal(formatValue(FETCH, 80000), '80,000 m', 'thousands');
	expect.equal(formatValue(SUN, 173), '173°', 'degrees without a space');
	expect.equal(formatValue({ kind: 'toggle' }, true), 'On', 'toggle on');
	expect.equal(formatValue({ kind: 'toggle' }, false), 'Off', 'toggle off');
	expect.equal(formatValue({ kind: 'counter' }, 8), 'Sea 8', 'the seed');
	expect.equal(formatValue({ kind: 'choice' }, 32), '32 × 32', 'a grid size');
	expect.equal(formatValue({ kind: 'range', step: 1, unit: '' }, 16), '16', 'no unit');
});

test('only range sliders have a track, and every recipe slider has a term colour', () => {
	let message = '';
	try {
		inputRange({ kind: 'toggle' });
	} catch (error) {
		message = error instanceof RangeError ? error.message : `not a RangeError: ${error}`;
	}
	expect.truthy(message.includes('range'), message);
	for (const recipe of RECIPES) {
		for (const slider of recipe.sliders) {
			expect.truthy(typeof TERM_BY_SLIDER[slider.id] === 'string', `step ${recipe.step} slider ${slider.id} has no term colour`);
		}
	}
});
