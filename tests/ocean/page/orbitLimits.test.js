// How far the visitor may orbit in the story (piece C): page/orbitLimits.js. The reach and the
// tilt limits must never move a recipe's own shot, and from a high shot the visitor must not be able
// to tip the frame out to the flat horizon plane A3's shots keep out of view (recipes.js, "the two
// high shots"; tests/ocean/stages/shots.test.js).
import { test } from 'node:test';
import * as expect from '../expect.js';
import * as Tier from '../../../content/ocean/js/core/tier.js';
import { FIELD_OF_VIEW } from '../../../content/ocean/js/render/lighting.js';
import { blendRecipes } from '../../../content/ocean/js/stages/blend.js';
import { recipeFor, STEP_COUNT } from '../../../content/ocean/js/stages/recipes.js';
import { CAMERA_FLOOR, frameReach, HORIZON_HEIGHT, MAX_POLAR, movingReach, polarOf, polarRange, STORY_MAX_DISTANCE } from '../../../content/ocean/js/page/orbitLimits.js';

const ASPECTS = Object.freeze([0.9, 16 / 9, 2.4]);
const REACH = movingReach(Tier.presets.High.rings);
const view = (aspect) => ({ aspect, fovDegrees: FIELD_OF_VIEW, reach: REACH });

function everyShot() {
	const shots = [];
	for (let n = 1; n <= STEP_COUNT; n++) {
		shots.push({ name: `step ${n}`, shot: recipeFor(n).shot });
		if (n < STEP_COUNT) {
			for (let p = 0.05; p < 1 - 1e-9; p += 0.05) {
				shots.push({ name: `${n}->${n + 1} at ${p.toFixed(2)}`, shot: blendRecipes(recipeFor(n), recipeFor(n + 1), p).shot });
			}
		}
	}
	return shots;
}

test("the moving water's reach is A3's: the last ring starts to flatten 896 studs out", () => {
	expect.equal(REACH, 896, 'High');
});

test('every shot and blend stands inside the story reach, so applying a shot never clamps it', () => {
	let farthest = 0;
	for (const { shot } of everyShot()) {
		farthest = Math.max(farthest, polarOf(shot).distance);
	}
	expect.truthy(farthest < STORY_MAX_DISTANCE, `the farthest shot is ${farthest.toFixed(0)} studs out, the reach ${STORY_MAX_DISTANCE}`);
	expect.truthy(STORY_MAX_DISTANCE <= 450, 'the reach stays near the farthest shot');
});

test("the tilt range always holds the shot's own angle, so applying a shot never tilts it", () => {
	for (const { name, shot } of everyShot()) {
		const { polar } = polarOf(shot);
		for (const aspect of ASPECTS) {
			const range = polarRange(shot, view(aspect));
			expect.truthy(range.min <= polar && polar <= range.max, `${name} at ${aspect.toFixed(2)}: ${polar} outside ${range.min}..${range.max}`);
		}
	}
});

test('a low shot may tilt up over the whole range, but never lower than it stands: the crests are near', () => {
	for (const step of [4, 5, 13]) {
		const shot = recipeFor(step).shot;
		const range = polarRange(shot, view(16 / 9));
		expect.equal(range.min, 0, `step ${step} min`);
		expect.near(range.max, polarOf(shot).polar, 1e-9, `step ${step} max`);
	}
	// A shot above CAMERA_FLOOR may come down to it, and no further.
	const above = { position: [0, 30, 60], target: [0, 0, 0] };
	const range = polarRange(above, view(16 / 9));
	expect.near(polarOf(above).distance * Math.cos(range.max), CAMERA_FLOOR, 1e-9, 'down to the floor');
	expect.truthy(range.max < MAX_POLAR, 'short of level');
});

test('from a high shot the frame can tip no further than the moving water, never to the horizon', () => {
	for (const step of [6, 10]) {
		const shot = recipeFor(step).shot;
		for (const aspect of ASPECTS) {
			const range = polarRange(shot, view(aspect));
			const { distance, polar } = polarOf(shot);
			const top = (Math.PI / 2) - (FIELD_OF_VIEW / 2) * (Math.PI / 180);
			expect.truthy(range.max < top, `step ${step} at ${aspect.toFixed(2)}: the frame's top reaches the horizon at ${range.max}`);
			const reach = frameReach({ distance, polar: range.max, targetY: shot.target[1], aspect, fovDegrees: FIELD_OF_VIEW });
			// At the cap the frame reaches the moving water's edge, or stays at the shot's own view
			// when that view already reaches further (an ultrawide frame).
			const own = frameReach({ distance, polar, targetY: shot.target[1], aspect, fovDegrees: FIELD_OF_VIEW });
			expect.truthy(reach <= Math.max(REACH, own) + 1e-6, `step ${step} at ${aspect.toFixed(2)} reaches ${reach.toFixed(0)} studs`);
			expect.equal(range.min, 0, `step ${step} may look straight down`);
		}
	}
});

test('a shot high and far enough to need both limits keeps the side it is on', () => {
	// Below the tilt that would lift the frame to the horizon, and more than HORIZON_HEIGHT up:
	// looking down, it may look further down but not up to the horizon.
	const steep = { position: [0, 400, 100], target: [0, 0, 0] };
	const range = polarRange(steep, view(16 / 9));
	expect.truthy(range.max < Math.PI / 4, `steep max ${range.max}`);
	// Far out and low: it may tip towards the horizon but not rise above HORIZON_HEIGHT.
	const low = { position: [0, 60, 400], target: [0, 0, 0] };
	const lowRange = polarRange(low, view(16 / 9));
	const { distance } = polarOf(low);
	expect.near(distance * Math.cos(lowRange.min), HORIZON_HEIGHT, 1e-6, 'the highest it can rise');
	expect.near(distance * Math.cos(lowRange.max), CAMERA_FLOOR, 1e-6, 'the lowest it can sink');
});

test('frameReach is Infinity once the top of the frame reaches the horizon', () => {
	const top = (Math.PI / 2) - (FIELD_OF_VIEW / 2) * (Math.PI / 180);
	expect.equal(frameReach({ distance: 300, polar: top + 0.01, targetY: 0, aspect: 1, fovDegrees: FIELD_OF_VIEW }), Infinity, 'past the horizon');
	expect.truthy(Number.isFinite(frameReach({ distance: 300, polar: top - 0.01, targetY: 0, aspect: 1, fovDegrees: FIELD_OF_VIEW })), 'just below it');
});
