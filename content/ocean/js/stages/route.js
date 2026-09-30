// The dev route (A3; not a twin): `?step=N&progress=P` drives the stage director straight from the
// URL, with `s.<slider>=<value>` for the step's own sliders, `shot=0` to leave the camera free and
// `drift=<seconds>` to pin the finale's drifting camera to that point of its circle (a frozen
// clock never turns it), so every step can be loaded, tested and screenshotted without the story
// page. A value that does
// not fit is clamped or dropped with a warning, never handed to the maths; a key given twice takes
// its first value, with a warning.
import { STEP_COUNT } from './recipes.js';
import { clampSlider } from './sliders.js';

function readNumber(query, name, fallback, min, max, warnings, whole = false) {
	if (!query.has(name)) {
		return fallback;
	}
	const text = query.get(name);
	const value = Number(text);
	if (text.trim() === '' || !Number.isFinite(value)) {
		warnings.push(`${name}=${text} is not a number; ${fallback === null ? 'ignored' : `using ${fallback}`}`);
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
 * @returns {null | { step: number, progress: number, sliders: Record<string, string>, shots: boolean, drift: number | null, warnings: string[] }}
 */
export function parseStageRoute(search) {
	const query = search instanceof URLSearchParams ? search : new URLSearchParams(search ?? '');
	if (!query.has('step')) {
		return null;
	}
	const warnings = [];
	for (const name of ['step', 'progress', 'shot', 'drift']) {
		if (query.getAll(name).length > 1) {
			warnings.push(`${name} is given more than once; using the first, ${name}=${query.get(name)}`);
		}
	}
	const step = readNumber(query, 'step', 1, 1, STEP_COUNT, warnings, true);
	const progress = readNumber(query, 'progress', 0, 0, 1, warnings);
	const drift = readNumber(query, 'drift', null, 0, Number.MAX_SAFE_INTEGER, warnings);
	// No prototype: a key such as s.__proto__ is kept as a name like any other, so the resolver
	// can say it is not a slider, instead of it vanishing into the object's prototype.
	const sliders = Object.create(null);
	for (const [key, value] of query) {
		if (!key.startsWith('s.')) {
			continue;
		}
		const id = key.slice(2);
		if (Object.hasOwn(sliders, id)) {
			warnings.push(`s.${id} is given more than once; using the first, s.${id}=${sliders[id]}`);
			continue;
		}
		sliders[id] = value;
	}
	const shot = query.get('shot');
	if (shot !== null && shot !== '0' && shot !== '1') {
		warnings.push(`shot=${shot} is not 0 or 1; the recipe camera stays on`);
	}
	return Object.freeze({ step, progress, sliders: Object.freeze(sliders), shots: shot !== '0', drift, warnings: Object.freeze(warnings) });
}

// The route's raw slider texts turned into values for this recipe's sliders.
export function resolveSliderValues(recipe, raw) {
	if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
		throw new RangeError(`the route's slider values must be an object of id: text, got ${JSON.stringify(raw) ?? String(raw)}`);
	}
	const values = {};
	const warnings = [];
	for (const [id, text] of Object.entries(raw)) {
		if (typeof text !== 'string') {
			throw new RangeError(`the route's slider values must be texts, got s.${id}=${JSON.stringify(text)}`);
		}
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
