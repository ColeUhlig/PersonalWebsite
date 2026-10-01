// The frames the shot checks walk (piece C2, Task 0; shared by clearance.test.js, shots.test.js and
// orbitLimits.test.js): every recipe's own shot and every blend between neighbours, and the graph's
// rules: a lens on the dry side of the graph's band has no water under it, and while the graph's
// backdrop is (nearly) opaque the world behind it does not show.
import { blendRecipes } from '../../../content/ocean/js/stages/blend.js';
import { graphBand } from '../../../content/ocean/js/stages/graph.js';
import { recipeFor, STEP_COUNT } from '../../../content/ocean/js/stages/recipes.js';

export function everyFrame(progressStep) {
	const frames = [];
	for (let n = 1; n <= STEP_COUNT; n++) {
		frames.push({ name: `step ${n} (${recipeFor(n).id})`, blended: blendRecipes(recipeFor(n), recipeFor(n), 0) });
		if (n < STEP_COUNT) {
			for (let i = 1; i * progressStep < 1 - 1e-9; i++) {
				const p = i * progressStep;
				frames.push({ name: `${recipeFor(n).id} -> ${recipeFor(n + 1).id} at ${p.toFixed(2)}`, blended: blendRecipes(recipeFor(n), recipeFor(n + 1), p) });
			}
		}
	}
	return frames;
}

// True when the frame's surface is clipped to a band the lens (a square `lens` studs either side of
// the camera's x) lies wholly outside: no water can be under it.
export function lensIsDry(blended, position, lens) {
	const band = graphBand(blended.look.graph);
	if (band === null) return false;
	return position[0] + lens < band[0] || position[0] - lens > band[1];
}

// The x range of ground the frame can show, or null for the whole world; and whether the backdrop
// hides the world at all.
export function edgeBand(blended) {
	return { band: graphBand(blended.look.graph), hidden: blended.look.graph.opacity >= 0.95 };
}
