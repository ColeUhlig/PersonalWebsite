// Step 5's crests as its camera sees them (piece C, Task 6; not a twin). The panel says the tops
// pinch into points, so the shot must look across the waves' profile, not along it: a camera looking
// the way the teaching bank rolls (+z, towards the deck cameras) sees each crest end-on as a smooth
// swell whatever the choppiness. The measure is the surface slope across the frame (along the
// camera's horizontal right axis) at the tallest CREST_SHARE of the water, from the engine's own
// sampler (WaveSampler, the sum step 5 draws) over one 256-stud tile and a minute of the clock. At the
// step's default choppiness it must be well above the same sea at choppiness 0.
import { test } from 'node:test';
import * as expect from '../expect.js';
import * as WaveSampler from '../../../content/ocean/js/core/waveSampler.js';
import * as WaveBanks from '../../../content/ocean/js/engine/waveBanks.js';
import { recipeFor } from '../../../content/ocean/js/stages/recipes.js';
import { sliderById } from '../../../content/ocean/js/stages/sliders.js';

const CREST_SHARE = 0.05;
const SHARPER = 1.5; // how many times steeper the crests' flanks must read than at choppiness 0
const TILE = 256;
const GRID = 4; // studs between samples
const SECONDS = 60;
const TIME_STEP = 6;

// The median slope across the frame at the crests, for the bank the recipe sums at `chop`.
function crestSlope(recipe, chop) {
	const bank = WaveBanks.withCount(WaveBanks.teachingBank(), recipe.engine.bank.count);
	const { position, target } = recipe.shot;
	const fx = target[0] - position[0];
	const fz = target[2] - position[2];
	const length = Math.hypot(fx, fz);
	const [rightX, rightZ] = [-fz / length, fx / length];
	const out = new Float64Array(7);
	const samples = [];
	for (let t = 0; t < SECONDS; t += TIME_STEP) {
		for (let x = 0; x < TILE; x += GRID) {
			for (let z = 0; z < TILE; z += GRID) {
				WaveSampler.sample(bank.packed, bank.count, t, x, z, chop, bank.weights, 0, out);
				samples.push({ height: out[1], slope: Math.abs((out[3] * rightX + out[5] * rightZ) / out[4]) });
			}
		}
	}
	samples.sort((a, b) => b.height - a.height);
	const crests = samples.slice(0, Math.floor(samples.length * CREST_SHARE)).map((s) => s.slope).sort((a, b) => a - b);
	return crests[crests.length >> 1];
}

test("step 5's camera looks across the crests, so its choppiness visibly sharpens them", () => {
	const five = recipeFor(5);
	const chop = sliderById(five, 'chop');
	const smooth = crestSlope(five, 0);
	const pinched = crestSlope(five, chop.default);
	expect.truthy(pinched > SHARPER * smooth, `crest slope across the frame: ${pinched.toFixed(3)} at choppiness ${chop.default}, ${smooth.toFixed(3)} at 0`);
});
