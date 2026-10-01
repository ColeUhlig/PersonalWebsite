// The math box's content, one entry per step (piece C2; lane A owns this file; spec 10.3): the
// equation so far as TeX (`tex`, with \htmlClass{fresh}{...} round what the step adds and the
// sliders' \htmlClass{t-...} term colours) and one plain sentence on what changed (`changed`, no
// digits). Task 0's version is a placeholder per step.
import { STEP_IDS } from '../stages/steps.js';

export const MATH_STEPS = Object.freeze(Object.fromEntries(STEP_IDS.map((id) => [id, Object.freeze({ tex: String.raw`\text{${id}}`, changed: 'Placeholder until the math box is written.' })])));

export function mathFor(id) {
	const entry = MATH_STEPS[id];
	if (!entry) {
		throw new RangeError(`the math box has no entry for ${JSON.stringify(id)}`);
	}
	return entry;
}
