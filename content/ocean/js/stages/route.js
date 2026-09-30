// The dev route (A3): `?step=N&progress=P` drives the stage director straight from the URL, with
// `s.<slider>=<value>` for the step's own sliders and `shot=0` to leave the camera free, so every
// step can be loaded, tested and screenshotted without the story page. A value that does not fit
// is clamped or dropped with a warning, never handed to the maths.
import { STEP_COUNT } from './recipes.js';
import { clampSlider } from './sliders.js';

function readNumber(query, name, fallback, min, max, warnings, whole = false) {
	if (!query.has(name)) {
		return fallback;
	}
	const text = query.get(name);
	const value = Number(text);
	if (text.trim() === '' || !Number.isFinite(value)) {
		warnings.push(`${name}=${text} is not a number; using ${fallback}`);
		return fallback;
	}
	// A step rounds to the nearest whole step without a word; only leaving the range is said.
	const rounded = whole ? Math.round(value) : value;
	const fitted = Math.min(Math.max(rounded, min), max);
	if (fitted !== rounded) {
		warnings.push(`${name}=${text} is outside ${min}..${max}; using ${fitted}`);
	}
	return fitted;
}

/**
 * @param {string | URLSearchParams} search
 * @returns {null | { step: number, progress: number, sliders: Record<string, string>, shots: boolean, warnings: string[] }}
 */
export function parseStageRoute(search) {
	const query = search instanceof URLSearchParams ? search : new URLSearchParams(search ?? '');
	if (!query.has('step')) {
		return null;
	}
	const warnings = [];
	const step = readNumber(query, 'step', 1, 1, STEP_COUNT, warnings, true);
	const progress = readNumber(query, 'progress', 0, 0, 1, warnings);
	const sliders = {};
	for (const [key, value] of query) {
		if (key.startsWith('s.')) {
			sliders[key.slice(2)] = value;
		}
	}
	return Object.freeze({ step, progress, sliders: Object.freeze(sliders), shots: query.get('shot') !== '0', warnings: Object.freeze(warnings) });
}

// The route's raw slider texts turned into values for this recipe's sliders.
export function resolveSliderValues(recipe, raw) {
	const values = {};
	const warnings = [];
	for (const [id, text] of Object.entries(raw)) {
		const slider = recipe.sliders.find((s) => s.id === id);
		if (!slider) {
			warnings.push(`s.${id} is not a slider of step ${recipe.step}; ignored`);
			continue;
		}
		if (slider.kind === 'toggle') {
			if (text === '1' || text === 'true') {
				values[id] = true;
			} else if (text === '0' || text === 'false') {
				values[id] = false;
			} else {
				warnings.push(`s.${id}=${text} is not 0 or 1; ignored`);
			}
			continue;
		}
		const number = Number(text);
		if (text.trim() === '' || !Number.isFinite(number)) {
			warnings.push(`s.${id}=${text} is not a number; ignored`);
			continue;
		}
		const value = clampSlider(slider, number);
		if (value !== number) {
			warnings.push(`s.${id}=${text} does not fit the slider; using ${value}`);
		}
		values[id] = value;
	}
	return { values: Object.freeze(values), warnings: Object.freeze(warnings) };
}
