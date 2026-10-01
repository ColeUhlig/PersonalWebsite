// URL knobs that a panel's slider owns, held to that slider's range in story mode (piece C; A2
// final review: "unbounded URL knobs clamped by sliders"). readConfig accepts any finite number
// for these; a slider can only show its own range, and the opening's sea should be one the story's
// controls can reach. Browser-free. Each clamped knob gives a warning naming the knob, its value
// and the range used; the config returned is new and frozen, the one given is untouched.
import { stepOf } from '../stages/steps.js';

const freezeWith = (object, changes) => Object.freeze({ ...object, ...changes });

export const SLIDER_KNOBS = Object.freeze([
	{ knob: 'wind', step: stepOf('jonswap'), slider: 'wind', read: (c) => c.params.windSpeed, write: (c, v) => ({ ...c, params: freezeWith(c.params, { windSpeed: v }) }) },
	{ knob: 'fetch', step: stepOf('jonswap'), slider: 'fetch', read: (c) => c.params.fetch, write: (c, v) => ({ ...c, params: freezeWith(c.params, { fetch: v }) }) },
	{ knob: 'chop', step: stepOf('choppiness'), slider: 'chop', read: (c) => c.chop, write: (c, v) => ({ ...c, chop: v }) },
	{ knob: 'whitecap', step: stepOf('foam'), slider: 'whitecap', read: (c) => c.foam.whitecap, write: (c, v) => ({ ...c, foam: freezeWith(c.foam, { whitecap: v }) }) },
	{ knob: 'foamDecay', step: stepOf('foam'), slider: 'fade', read: (c) => c.foam.decay, write: (c, v) => ({ ...c, foam: freezeWith(c.foam, { decay: v }) }) },
	{ knob: 'scatter', step: stepOf('glow'), slider: 'glow', read: (c) => c.scatter.strength, write: (c, v) => ({ ...c, scatter: freezeWith(c.scatter, { strength: v }) }) },
].map((entry) => Object.freeze(entry)));

export function clampKnobsToSliders(config, recipeFor) {
	let next = config;
	const warnings = [];
	for (const entry of SLIDER_KNOBS) {
		const slider = recipeFor(entry.step).sliders.find((s) => s.id === entry.slider);
		if (!slider) {
			throw new Error(`knobs: step ${entry.step} has no slider ${entry.slider}`);
		}
		const value = entry.read(next);
		const clamped = Math.min(Math.max(value, slider.min), slider.max);
		if (clamped !== value) {
			warnings.push(`${entry.knob}=${value} is outside the ${slider.label} slider's ${slider.min}..${slider.max}; using ${clamped}`);
			next = entry.write(next, clamped);
		}
	}
	return { config: next === config ? config : Object.freeze(next), warnings };
}
