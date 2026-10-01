// The Gerstner step's crests as its camera sees them (piece C, Task 6, then step 5; `gerstner` in C2;
// not a twin). The panel says the tops pinch into points, so the shot must look across the waves'
// profile, not along it: a camera looking the way the teaching bank rolls (+z, towards the deck
// cameras) sees each crest end-on as a smooth swell whatever the choppiness. The measure is the
// surface slope across the frame (along the camera's horizontal right axis), from the engine's own
// sampler (WaveSampler, the sum the Gerstner step draws), over the water the frame shows: the
// ground between NEAR and FAR studs ahead of the camera and inside its horizontal field of view at
// a 16:9 frame, over a minute of the clock.
//   * At the crests (the tallest SHARE of that water), the step's default choppiness must read well
//     steeper than the same sea at choppiness 0: the tops pinch.
//   * At the troughs (the lowest SHARE) it must not read steeper: the troughs widen, so what the
//     frame shows is the pinch and not just rougher water everywhere.
import { test } from 'node:test';
import * as expect from '../expect.js';
import * as WaveSampler from '../../../content/ocean/js/core/waveSampler.js';
import * as WaveBanks from '../../../content/ocean/js/engine/waveBanks.js';
import { FIELD_OF_VIEW } from '../../../content/ocean/js/render/lighting.js';
import { recipeFor } from '../../../content/ocean/js/stages/recipes.js';
import { sliderById } from '../../../content/ocean/js/stages/sliders.js';
import { stepOf } from '../../../content/ocean/js/stages/steps.js';

const SHARE = 0.05;
const SHARPER = 1.5; // how many times steeper the crests' flanks must read than at choppiness 0
const NEAR = 30; // studs ahead of the camera: the near edge of the band the frame shows
const FAR = 120; // and the far edge, where the crests are still more than a few pixels tall
const ASPECT = 16 / 9;
const GRID = 2; // studs between samples
const SECONDS = 60;
const TIME_STEP = 4;

const HALF_WIDTH = Math.tan(((FIELD_OF_VIEW / 2) * Math.PI) / 180) * ASPECT;

// The median slope across the frame at the crests and at the troughs, for the bank the recipe sums
// at `chop`, over the ground the shot's frame shows.
function slopes(recipe, chop) {
	const bank = WaveBanks.withCount(WaveBanks.withFan(WaveBanks.teachingBank(), recipe.engine.bank.fan), recipe.engine.bank.count);
	const { position, target } = recipe.shot;
	const fx = target[0] - position[0];
	const fz = target[2] - position[2];
	const length = Math.hypot(fx, fz);
	const [forwardX, forwardZ] = [fx / length, fz / length];
	const [rightX, rightZ] = [-forwardZ, forwardX];
	const out = new Float64Array(7);
	const samples = [];
	for (let t = 0; t < SECONDS; t += TIME_STEP) {
		for (let ahead = NEAR; ahead <= FAR; ahead += GRID) {
			const half = ahead * HALF_WIDTH;
			for (let across = -half; across <= half; across += GRID) {
				const x = position[0] + forwardX * ahead + rightX * across;
				const z = position[2] + forwardZ * ahead + rightZ * across;
				WaveSampler.sample(bank.packed, bank.count, t, x, z, chop, bank.weights, 0, out);
				samples.push({ height: out[1], slope: Math.abs((out[3] * rightX + out[5] * rightZ) / out[4]) });
			}
		}
	}
	samples.sort((a, b) => b.height - a.height);
	const count = Math.floor(samples.length * SHARE);
	const medianOf = (list) => list.map((s) => s.slope).sort((a, b) => a - b)[list.length >> 1];
	return { crest: medianOf(samples.slice(0, count)), trough: medianOf(samples.slice(-count)) };
}

test("the Gerstner step's camera looks across the crests, so its choppiness visibly pinches them and widens the troughs", () => {
	const five = recipeFor(stepOf('gerstner'));
	const chop = sliderById(five, 'chop');
	const smooth = slopes(five, 0);
	const pinched = slopes(five, chop.default);
	const said = `crests ${pinched.crest.toFixed(3)} and troughs ${pinched.trough.toFixed(3)} at choppiness ${chop.default}; ${smooth.crest.toFixed(3)} and ${smooth.trough.toFixed(3)} at 0`;
	expect.truthy(pinched.crest > SHARPER * smooth.crest, `the crests pinch: ${said}`);
	expect.truthy(pinched.trough <= smooth.trough, `the troughs do not steepen: ${said}`);
});
