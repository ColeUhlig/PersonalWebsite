// The story's steps as recipes (spec section 10; A3, extended by piece C2; not a twin). Each chapter
// file (stages/chapters/) holds its steps' specs, keyed by step id; this assembles them in story order
// (stages/steps.js STEP_IDS) into frozen recipes (stages/recipeKit.js make) and fails at load if a
// step has no spec or a spec names no step. Pure data: the director (director.js) binds slider values
// in, blends two neighbours by the scroll progress (blend.js) and hands the result to the engine and
// the renderer.
//
// Steps 1 to 15 run the teaching sources (the sine, then the teaching bank through WaveSampler, as
// the original Roblox prototype drew its sea); from step 16 the surface is the FFT pipeline, one layer
// until step 21 brings in all three. Every step starts from the hero sea (stageControl.js
// DEFAULT_SETTINGS), which the finale is unchanged.
import { make } from './recipeKit.js';
import { STEP_COUNT, STEP_IDS } from './steps.js';
import { WAVES } from './chapters/waves.js';
import { LIGHT } from './chapters/light.js';
import { VECTORS } from './chapters/vectors.js';
import { BETTER_WAVES } from './chapters/betterWaves.js';
import { REAL_OCEAN } from './chapters/realOcean.js';
import { TEXTURES } from './chapters/textures.js';
import { FINISH } from './chapters/finish.js';

export { STEP_COUNT } from './steps.js';
export { ENGINE_FIELDS, MATERIALS, MOVES, OVERLAYS, PHASE_ARROWS } from './recipeKit.js';

const CHAPTER_SPECS = Object.freeze([WAVES, LIGHT, VECTORS, BETTER_WAVES, REAL_OCEAN, TEXTURES, FINISH]);

function assemble() {
	const specs = {};
	for (const chapter of CHAPTER_SPECS) {
		for (const [id, spec] of Object.entries(chapter)) {
			if (Object.hasOwn(specs, id)) {
				throw new Error(`recipes: step ${id} is specified twice`);
			}
			specs[id] = spec;
		}
	}
	const missing = STEP_IDS.filter((id) => !Object.hasOwn(specs, id));
	const extra = Object.keys(specs).filter((id) => !STEP_IDS.includes(id));
	if (missing.length > 0 || extra.length > 0) {
		throw new Error(`recipes: no spec for ${missing.join(', ') || 'none'}; not a step: ${extra.join(', ') || 'none'}`);
	}
	return Object.freeze(STEP_IDS.map((id, i) => make(i + 1, id, specs[id])));
}

export const RECIPES = assemble();

export function recipeFor(step) {
	if (!Number.isInteger(step) || step < 1 || step > STEP_COUNT) {
		throw new RangeError(`step must be an integer 1..${STEP_COUNT}, got ${step}`);
	}
	return RECIPES[step - 1];
}
