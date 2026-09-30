// The story panels' sliders as data (A3): what kinds there are, how a raw value is brought inside a
// slider (clamped, snapped, or refused when it is the wrong type), and how slider values are bound
// into a recipe through each slider's dotted `bind` path. Piece C draws the widgets; this decides
// what a value means.
import { clamp } from '../core/luau.js';
import { deepFreeze, getPath, setPath } from './paths.js';

export const KINDS = Object.freeze(['range', 'toggle', 'counter', 'choice']);

function refuse(slider, rule, value) {
	throw new RangeError(`slider ${slider.id} needs ${rule}, got ${String(value)}`);
}

const finite = (value) => typeof value === 'number' && Number.isFinite(value);

export function clampSlider(slider, value) {
	switch (slider.kind) {
		case 'range': {
			if (!finite(value)) refuse(slider, 'a finite number', value);
			const steps = Math.round((clamp(value, slider.min, slider.max) - slider.min) / slider.step);
			// toFixed drops the float noise the step multiplication leaves (12.000000000000002).
			return clamp(Number((slider.min + steps * slider.step).toFixed(10)), slider.min, slider.max);
		}
		case 'toggle':
			if (typeof value !== 'boolean') refuse(slider, 'true or false', value);
			return value;
		case 'counter':
			if (!finite(value)) refuse(slider, 'a finite number', value);
			return Math.max(slider.min, Math.floor(value));
		case 'choice':
			if (!finite(value)) refuse(slider, 'a finite number', value);
			return slider.options.reduce((best, option) => (Math.abs(option - value) < Math.abs(best - value) ? option : best));
		default:
			throw new RangeError(`slider ${slider.id} has an unknown kind ${slider.kind}`);
	}
}

export function sliderById(recipe, id) {
	const slider = recipe.sliders.find((s) => s.id === id);
	if (!slider) {
		throw new RangeError(`step ${recipe.step} has no slider ${id}`);
	}
	return slider;
}

// The recipe with each given slider value clamped and bound in; values not given keep the
// recipe's own. No values gives back the recipe itself.
export function applySliders(recipe, values = {}) {
	let result = recipe;
	for (const [id, value] of Object.entries(values)) {
		const slider = sliderById(recipe, id);
		result = setPath(result, slider.bind, clampSlider(slider, value));
	}
	return result === recipe ? recipe : deepFreeze(result);
}

export function sliderValue(recipe, id) {
	return getPath(recipe, sliderById(recipe, id).bind);
}
