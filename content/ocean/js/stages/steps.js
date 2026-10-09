// The story's steps by name (piece C2, Task 0; not a twin). The extended story (spec section 10)
// has 27 steps in six chapters plus the finale. Every module and test names a step by its id here and
// takes its number from stepOf, so a step can move without a search for numbers. The section
// elements keep id="step-N" (N from this order) and carry data-step-id.
export const STEP_IDS = Object.freeze([
	'sine', 'moving-sine', 'sum-of-sines', 'into-3d', 'directions', 'many-waves',
	'unlit', 'normals', 'slopes', 'diffuse', 'highlights',
	'gerstner', 'tiling',
	'frequency', 'fourier', 'jonswap', 'random-sea', 'time', 'fft', 'choppiness', 'layers',
	'fields', 'sampling', 'mesh', 'painted',
	'foam', 'glow', 'finale',
]);
export const STEP_COUNT = STEP_IDS.length;

// Each chapter's first step and its title, in order; the finale belongs to the last chapter.
export const CHAPTERS = Object.freeze([
	Object.freeze({ number: 1, first: 'sine', title: 'Wave synthesis' }),
	Object.freeze({ number: 2, first: 'unlit', title: 'Shading' }),
	Object.freeze({ number: 3, first: 'gerstner', title: 'Wave shape' }),
	Object.freeze({ number: 4, first: 'frequency', title: 'Spectral synthesis' }),
	Object.freeze({ number: 5, first: 'fields', title: 'Surface representation' }),
	Object.freeze({ number: 6, first: 'foam', title: 'Appearance' }),
]);

const NUMBERS = new Map(STEP_IDS.map((id, i) => [id, i + 1]));

export function stepOf(id) {
	const step = NUMBERS.get(id);
	if (step === undefined) {
		throw new RangeError(`there is no step called ${JSON.stringify(id)}`);
	}
	return step;
}

export function idOf(step) {
	if (!Number.isInteger(step) || step < 1 || step > STEP_COUNT) {
		throw new RangeError(`step must be an integer 1..${STEP_COUNT}, got ${JSON.stringify(step)}`);
	}
	return STEP_IDS[step - 1];
}

export function chapterOf(step) {
	idOf(step);
	let found = CHAPTERS[0];
	for (const chapter of CHAPTERS) {
		if (stepOf(chapter.first) <= step) found = chapter;
	}
	return found;
}
