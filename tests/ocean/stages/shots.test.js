// The camera shots against the world they look at (A3 Task 10 fix round 1): every recipe's shot
// and every blend between neighbours, at a portrait, a 16:9 and an ultrawide frame, is checked
// against the geometry the page builds -- the horizon's far edge (HorizonState), the last ring's
// flatten band (SurfaceSampler.ringContext) and the ring the teaching bank is resolved on -- and the
// camera's vertical field of view (render/lighting.js). The ground is taken as the plane y = 0 and
// the fog as three.js FogExp2 of view depth, 1 - exp(-(density * depth)^2).
// C2: a frame whose flat-graph backdrop is (nearly) opaque shows no world, and one clipped to the
// graph's band (stages/graph.js) shows only the edge inside the band (tests/ocean/stages/frames.js).
import { test } from 'node:test';
import * as expect from '../expect.js';
import * as RingLayout from '../../../content/ocean/js/core/ringLayout.js';
import * as SurfaceSampler from '../../../content/ocean/js/core/surfaceSampler.js';
import * as Tier from '../../../content/ocean/js/core/tier.js';
import * as WaveSampler from '../../../content/ocean/js/core/waveSampler.js';
import * as HorizonState from '../../../content/ocean/js/engine/horizonState.js';
import * as WaveBanks from '../../../content/ocean/js/engine/waveBanks.js';
import { FIELD_OF_VIEW, FOG_DENSITY } from '../../../content/ocean/js/render/lighting.js';
import { recipeFor } from '../../../content/ocean/js/stages/recipes.js';
import { stepOf } from '../../../content/ocean/js/stages/steps.js';
import { edgeBand, everyFrame } from './frames.js';

const ASPECTS = Object.freeze([0.9, 16 / 9, 2.4]);
const PROGRESS_STEP = 0.05;
const HIDDEN = 0.95; // the least fog that counts as hiding an edge
const RINGS = Tier.presets.High.rings;
const LAST = RINGS[RINGS.length - 1];
// The horizon's far edge, from the last ring's window centre (HorizonState.create's farEdge).
const WORLD_HALF = LAST.halfExtent - HorizonState.OVERLAP + HorizonState.QUAD;
// Where the last ring's flatten band starts: past it the sea sinks to the flat horizon plane.
const LAST_CONTEXT = SurfaceSampler.ringContext(LAST, null);
const MOVING_HALF = LAST_CONTEXT.fadeEdge - LAST_CONTEXT.fadeWidth;
const TAN_HALF = Math.tan((FIELD_OF_VIEW / 2) * (Math.PI / 180));
const EDGE_SAMPLES = 2000;

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const unit = (a) => {
	const length = Math.hypot(a[0], a[1], a[2]);
	return [a[0] / length, a[1] / length, a[2] / length];
};
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

// The camera's basis as lookAt builds it (up +y, no roll).
function basis(shot) {
	const forward = unit(sub(shot.target, shot.position));
	const right = unit(cross(forward, [0, 1, 0]));
	return { forward, right, up: cross(right, forward) };
}

// The view depth of a ground point if it is in the frame, else null.
function depthInFrame(shot, frame, aspect, point) {
	const v = sub(point, shot.position);
	const depth = dot(v, frame.forward);
	if (depth <= 0) {
		return null;
	}
	const inside = Math.abs(dot(v, frame.right) / depth) <= TAN_HALF * aspect && Math.abs(dot(v, frame.up) / depth) <= TAN_HALF;
	return inside ? depth : null;
}

// The least fog over the part of a square's boundary (on the ground, around the window centre a
// ring of `spacing` puts at the shot's target) that the frame shows; 1 when none of it shows. With
// `band` ([xMin, xMax] in world x), only the boundary inside the band counts.
function edgeFog(shot, fog, aspect, half, spacing, band = null) {
	const frame = basis(shot);
	const centre = RingLayout.windowCentre(shot.target[0], shot.target[2], spacing);
	let least = 1;
	for (let side = 0; side < 4; side++) {
		for (let i = 0; i <= EDGE_SAMPLES; i++) {
			const a = -half + (2 * half * i) / EDGE_SAMPLES;
			const [x, z] = [[a, -half], [a, half], [-half, a], [half, a]][side];
			if (band && (centre[0] + x < band[0] || centre[0] + x > band[1])) continue;
			const depth = depthInFrame(shot, frame, aspect, [centre[0] + x, 0, centre[1] + z]);
			if (depth !== null) {
				least = Math.min(least, 1 - Math.exp(-((fog * depth) ** 2)));
			}
		}
	}
	return least;
}

// The furthest (Chebyshev, from the window centre) that any ground point in the frame lies; Infinity
// when the frame reaches the horizon.
function groundReach(shot, aspect, spacing) {
	const frame = basis(shot);
	const centre = RingLayout.windowCentre(shot.target[0], shot.target[2], spacing);
	let furthest = 0;
	const steps = 60;
	for (let i = 0; i <= steps; i++) {
		for (let j = 0; j <= steps; j++) {
			const sx = (2 * i) / steps - 1;
			const sy = (2 * j) / steps - 1;
			const ray = [0, 1, 2].map((k) => frame.forward[k] + sx * TAN_HALF * aspect * frame.right[k] + sy * TAN_HALF * frame.up[k]);
			if (ray[1] >= 0) {
				return Infinity;
			}
			const t = -shot.position[1] / ray[1];
			const x = shot.position[0] + ray[0] * t - centre[0];
			const z = shot.position[2] + ray[2] * t - centre[1];
			furthest = Math.max(furthest, Math.abs(x), Math.abs(z));
		}
	}
	return furthest;
}

test('the numbers the checks use come from the page, not copies', () => {
	expect.equal(WORLD_HALF, 3064, 'the horizon reaches 3,064 studs at High');
	expect.equal(MOVING_HALF, 896, 'the last ring starts to flatten 896 studs out');
	expect.equal(FIELD_OF_VIEW, 70, "the camera's vertical field of view");
});

test("the world's edge is out of frame or under fog in every shot and blend (fix round 1)", () => {
	const failures = [];
	for (const { name, blended } of everyFrame(PROGRESS_STEP)) {
		const { band, hidden } = edgeBand(blended);
		if (hidden) continue;
		for (const aspect of ASPECTS) {
			const fog = edgeFog(blended.shot, blended.look.fog, aspect, WORLD_HALF, LAST.spacing, band);
			// The floor is A2's fog density applied to this same frame, not the number A2's own deck
			// shot gets. At an ultrawide frame the sides see the world's side edge at about 1,830
			// studs (3,064 / tan 59 degrees); from the deck shot that edge is 93% fogged. Other
			// frames meet the edge nearer: the foam -> glow blends at 2.4 get 0.863 to 0.889 between
			// progress 0.1 and 0.5, under HIDDEN and under the deck's 0.93. They pass because they
			// keep A2's density, so a foam-to-glow frame shows as much edge as A2's density would
			// show from that camera, and no more.
			const a2 = edgeFog(blended.shot, FOG_DENSITY, aspect, WORLD_HALF, LAST.spacing, band);
			if (fog < Math.min(HIDDEN, a2)) {
				failures.push(`${name} at ${aspect.toFixed(2)}: ${fog.toFixed(3)}`);
			}
		}
	}
	expect.equal(failures.join('; '), '', 'the edge shows');
});

test('the high teaching shots keep the frame on moving water, never on the flat horizon plane', () => {
	// The tiling and layers steps look down from hundreds of studs up with little fog, where the join
	// of the last ring's flatten band and the flat horizon plane reads as the edge of a pool.
	for (const id of ['tiling', 'layers']) {
		const recipe = recipeFor(stepOf(id));
		for (const aspect of ASPECTS) {
			const reach = groundReach(recipe.shot, aspect, LAST.spacing);
			const fog = edgeFog(recipe.shot, recipe.look.fog, aspect, MOVING_HALF, LAST.spacing);
			expect.truthy(reach <= MOVING_HALF || fog >= HIDDEN, `${id} at ${aspect.toFixed(2)} reaches ${reach.toFixed(0)} studs`);
		}
	}
});

test("the tiling step's frame stays on the rings that resolve every wave it sums", () => {
	// A ring resolves a wave while the wave advances under half a cycle per vertex along each axis;
	// past that it aliases into slower, blurrier false waves and the ring's square shows. The tiling
	// step sums the teaching bank's tallest waves; find the coarsest ring that resolves them all.
	const recipe = recipeFor(stepOf('tiling'));
	const bank = WaveBanks.withCount(WaveBanks.withFan(WaveBanks.teachingBank(), recipe.engine.bank.fan), recipe.engine.bank.count);
	const STRIDE = WaveSampler.STRIDE;
	const cyclesPerVertex = (spacing) => {
		let most = 0;
		for (let wave = 0; wave < bank.count; wave++) {
			if (bank.weights[wave] === 0) continue;
			const k = bank.packed[wave * STRIDE];
			const dx = bank.packed[wave * STRIDE + 4];
			const dz = bank.packed[wave * STRIDE + 5];
			most = Math.max(most, (k * spacing * Math.max(Math.abs(dx), Math.abs(dz))) / (2 * Math.PI));
		}
		return most;
	};
	let resolving = -1;
	RINGS.forEach((ring, i) => {
		if (cyclesPerVertex(ring.spacing) < 0.45) resolving = i;
	});
	expect.truthy(resolving >= 3, `the bank is resolved out to ring ${resolving + 1}`);
	const ring = RINGS[resolving];
	for (const aspect of [0.9, 16 / 9]) {
		const reach = groundReach(recipe.shot, aspect, ring.spacing);
		expect.truthy(reach <= ring.halfExtent, `tiling at ${aspect.toFixed(2)} reaches ${reach.toFixed(0)} studs, past ring ${resolving + 1}'s ${ring.halfExtent}`);
	}
});

// Final review I2: a crest runs across the frame when its wave travels towards or away from the
// camera, so each deck-like teaching step's heading must lie along the shot's own line of sight. The
// Gerstner step is the exception (piece C Task 6): its lesson is the crests' pinched profile, which
// only shows from the side, so it looks across the waves instead (tests/ocean/stages/crests.test.js).
// The graph steps look across the waves on purpose (spec 10.4), so they are not checked here.
test('the teaching crests run across the view in the deck-like 3D teaching steps', () => {
	const STRIDE = WaveSampler.STRIDE;
	const heading = (bank) => {
		let x = 0;
		let z = 0;
		for (let wave = 0; wave < bank.count; wave++) {
			const a = bank.packed[wave * STRIDE + 2] * bank.weights[wave];
			x += a * bank.packed[wave * STRIDE + 4];
			z += a * bank.packed[wave * STRIDE + 5];
		}
		const length = Math.hypot(x, z);
		return [x / length, z / length];
	};
	for (const id of ['many-waves', 'unlit', 'diffuse']) {
		const recipe = recipeFor(stepOf(id));
		const e = recipe.engine;
		const bank = e.source === 'sine' ? WaveBanks.nextSine(null, e.sine, 0).bank : WaveBanks.withCount(WaveBanks.withFan(WaveBanks.teachingBank(), e.bank.fan), e.bank.count);
		const [hx, hz] = heading(bank);
		const { forward } = basis(recipe.shot);
		const along = Math.abs(hx * forward[0] + hz * forward[2]) / Math.hypot(forward[0], forward[2]);
		expect.truthy(along > 0.9, `${id}: the waves travel ${Math.round((Math.acos(Math.min(along, 1)) * 180) / Math.PI)} degrees off the line of sight`);
	}
});

// Task 15 (the walk): step 11 is about the highlight, and on a wide screen the step's panel covers
// the frame's left third (from 2.5vw to about 35vw at 1366 px, NDC x below about -0.3). The glint
// runs down the water under the sun, so the sun's column is the glint's: it must sit right of the
// panel's column at 16:9 and inside a phone's frame (the ocean's top half at 390 x 844, aspect 0.9).
test("step 11's highlight lands in the open frame, clear of the wide layout's panel", async () => {
	const { sunDirection } = await import('../../../content/ocean/js/stages/sun.js');
	const recipe = recipeFor(stepOf('highlights'));
	const sun = sunDirection(recipe.look.sun);
	const { forward, right } = basis(recipe.shot);
	const flat = (v) => [v[0], 0, v[2]];
	const ndcX = (aspect) => dot(flat(sun), right) / dot(flat(sun), flat(forward)) / (TAN_HALF * aspect);
	expect.truthy(dot(flat(sun), flat(forward)) > 0, 'the sun is ahead of the camera');
	const wide = ndcX(16 / 9);
	expect.truthy(wide >= 0.05 && wide <= 0.5, `16:9: the glint's column at NDC x ${wide.toFixed(2)}, want 0.05 to 0.5`);
	const phone = ndcX(0.9);
	expect.truthy(Math.abs(phone) <= 0.7, `phone: the glint's column at NDC x ${phone.toFixed(2)}, want within 0.7 of the centre`);
});
