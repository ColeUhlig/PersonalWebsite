// The math box's choices (piece C2; lane A owns this file; spec 10.3; browser-free): which entry a
// scroll reading shows, the per-viewer collapse, and what the TeX says about itself. The collapse is
// a convenience kept in localStorage: storage can refuse (a private window throws on every access),
// so a refusal reads as "open" and a write reports false; the box carries on without remembering.
import { MATH_STEPS } from './mathSteps.js';
import { idOf } from '../stages/steps.js';

export const COLLAPSE_KEY = 'ocean.mathbox.collapsed';
// How long the terms a step adds glow when the step is entered (spec 10.3: about a second).
export const FRESH_SECONDS = 1.2;
// What the phone's bar says before the first step (Task 2): no digits.
export const PROMPT = 'The math shows up here as you scroll.';

export function entryFor(reading) {
	if (!reading || reading.phase !== 'step') {
		return null;
	}
	const id = idOf(reading.step);
	return Object.freeze({ step: reading.step, id, tex: MATH_STEPS[id].tex, changed: MATH_STEPS[id].changed, bar: MATH_STEPS[id].bar });
}

export function readCollapsed(storage) {
	try {
		return storage?.getItem(COLLAPSE_KEY) === '1';
	} catch {
		return false;
	}
}

export function writeCollapsed(storage, collapsed) {
	try {
		if (!storage) return false;
		storage.setItem(COLLAPSE_KEY, collapsed ? '1' : '0');
		return true;
	} catch {
		return false;
	}
}

export const freshCount = (tex) => (tex.match(/\\htmlClass\{fresh\}/g) ?? []).length;
export const termsIn = (tex) => new Set([...tex.matchAll(/\\htmlClass\{(t-[a-z]+)\}/g)].map((m) => m[1]));
// Final review Minor 7: the TeX the box shows when KaTeX can't typeset it, without the colour
// wrappers (\htmlClass{name}); the wrapped symbol keeps its braces, so the TeX means the same.
export const readableTex = (tex) => tex.replace(/\\htmlClass\{[^}]*\}/g, '');
