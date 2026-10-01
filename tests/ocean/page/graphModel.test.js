// The flat graph's arithmetic (piece C2, lane B, Task 3; spec 10.4): the plane's span in view, the
// curve the teaching surface makes along it (the engine's own sampler), each wave alone, and ribbons.
import { test } from 'node:test';
import * as expect from '../expect.js';
import * as WaveSampler from '../../../content/ocean/js/core/waveSampler.js';
import * as WaveBanks from '../../../content/ocean/js/engine/waveBanks.js';
import { CURVE_POINTS, FLOOR_MARGIN, LINE_LIFT, MAX_COMPONENTS, MAX_SPAN_HALF, SPAN_MARGIN, axisTicks, axisTicksInto, niceAtLeast, componentWaves, floorDepth, graphSpan, uprightLean, axisLayout, axisOpacityOf, lambdaPair, AXIS_LEFT_PX, AXIS_RIGHT_PX, niceStep, ribbon, ribbonIndices, sampleComponent, sampleCurve } from '../../../content/ocean/js/page/graphModel.js';
import { GRAPH_PLANE_X } from '../../../content/ocean/js/stages/graph.js';
import { GRAPH_SHOT } from '../../../content/ocean/js/stages/recipeKit.js';
import { recipeFor } from '../../../content/ocean/js/stages/recipes.js';
import { blendRecipes } from '../../../content/ocean/js/stages/blend.js';
import { stepOf } from '../../../content/ocean/js/stages/steps.js';

const unit = (v) => {
	const l = Math.hypot(...v);
	return v.map((x) => x / l);
};
const forwardOf = (shot) => unit(shot.target.map((t, i) => t - shot.position[i]));
const line = (count) => WaveBanks.withCount(WaveBanks.withFan(WaveBanks.teachingBank(), 0), count);

// Task 4 (Task 3 review): where a point lands across the frame, -1 at the left edge, +1 at the right
// (the camera never rolls, so its right is level).
const ndcX = (position, forward, fovDegrees, aspect, point) => {
	const right = unit([-forward[2], 0, forward[0]]);
	const p = point.map((v, i) => v - position[i]);
	const depth = p.reduce((sum, v, i) => sum + v * forward[i], 0);
	return p.reduce((sum, v, i) => sum + v * right[i], 0) / depth / (Math.tan((fovDegrees * Math.PI) / 360) * aspect);
};

test('graphSpan: the plane in view from the graph shot, widened, and the studs a pixel covers', () => {
	const forward = forwardOf(GRAPH_SHOT);
	const span = graphSpan({ position: GRAPH_SHOT.position, forward, fovDegrees: 70, aspect: 16 / 9, heightPx: 767 });
	const along = (GRAPH_PLANE_X - GRAPH_SHOT.position[0]) / forward[0];
	const frameHalf = along * Math.tan((35 * Math.PI) / 180) * (16 / 9);
	expect.truthy(span.zMin < -frameHalf && span.zMin > -frameHalf * SPAN_MARGIN * 1.02, `left ${span.zMin}`);
	expect.truthy(span.zMax > frameHalf && span.zMax < frameHalf * SPAN_MARGIN * 1.02, `right ${span.zMax}`);
	expect.near(span.zMin + span.zMax, 0, 1e-9, 'centred on the axis it faces');
	expect.near(span.depth, along, 1e-9, 'depth');
	expect.near(span.studsPerPixel, (2 * along * Math.tan((35 * Math.PI) / 180)) / 767, 1e-12, 'studs per pixel');
	expect.equal(graphSpan({ position: [10, 0, 0], forward: [-1, 0, 0], fovDegrees: 70, aspect: 1, heightPx: 100 }), null, 'looking away: no graph');
	expect.equal(graphSpan({ position: [-10, 0, 0], forward: [0, 0, -1], fovDegrees: 70, aspect: 1, heightPx: 100 }), null, 'looking along the plane: no graph');
});

test("graphSpan from step 4's oblique shot puts both ends of the curve outside the frame, desktop and phone", () => {
	const shot = recipeFor(stepOf('into-3d')).shot;
	const forward = forwardOf(shot);
	for (const aspect of [16 / 9, 390 / 422]) {
		const span = graphSpan({ position: shot.position, forward, fovDegrees: 70, aspect, heightPx: 767 });
		const left = ndcX(shot.position, forward, 70, aspect, [GRAPH_PLANE_X - LINE_LIFT, 0, span.zMin]);
		const right = ndcX(shot.position, forward, 70, aspect, [GRAPH_PLANE_X - LINE_LIFT, 0, span.zMax]);
		// Past NDC 1.05: 34 px beyond the edge at 1366 wide. (From step 4 the line's vanishing point is at
		// NDC -1.35, so a capped end cannot be far beyond it.)
		expect.truthy(Math.min(left, right) < -1.05 && Math.max(left, right) > 1.05, `aspect ${aspect.toFixed(2)}: ends at NDC ${left.toFixed(2)}, ${right.toFixed(2)}`);
		const centre = shot.position[2] + (forward[2] * (GRAPH_PLANE_X - shot.position[0])) / forward[0];
		expect.truthy(span.zMin >= centre - MAX_SPAN_HALF - 1e-9 && span.zMax <= centre + MAX_SPAN_HALF + 1e-9, 'capped');
		expect.truthy((span.zMax - span.zMin) / (CURVE_POINTS - 1) <= 3.01, 'points no more than three studs apart');
	}
	// Looking almost along the plane: the far side runs to the cap, the near side stays in view.
	const grazing = graphSpan({ position: [-10, 5, 0], forward: unit([0.2, -0.05, -1]), fovDegrees: 70, aspect: 16 / 9, heightPx: 767 });
	expect.truthy(Number.isFinite(grazing.zMin) && Number.isFinite(grazing.zMax) && grazing.zMin < grazing.zMax, 'finite and ordered at a grazing angle');
	expect.truthy(grazing.zMax - grazing.zMin <= 2 * MAX_SPAN_HALF + 1e-9, 'no wider than the cap');
});

test('sampleCurve is the engine sampler along the plane, drawn yScale times taller, just in front of it', () => {
	const waves = line(5);
	const span = { zMin: -60, zMax: 90 };
	const out = new Float32Array(CURVE_POINTS * 3);
	const tallest = sampleCurve(waves, 7.25, span, 4, out);
	const s = new Float64Array(7);
	let most = 0;
	for (let i = 0; i < CURVE_POINTS; i += 16) {
		const z = -60 + (150 * i) / (CURVE_POINTS - 1);
		const y = WaveSampler.sample(waves.packed, waves.count, 7.25, GRAPH_PLANE_X, z, 0, waves.weights, 0, s)[1];
		expect.near(out[i * 3 + 1], Math.fround(4 * y), 1e-5, `point ${i}`);
		expect.near(out[i * 3 + 2], Math.fround(z), 1e-4, `z ${i}`);
		expect.near(out[i * 3], Math.fround(GRAPH_PLANE_X - LINE_LIFT), 1e-7, `x ${i}`);
	}
	for (let i = 0; i < CURVE_POINTS; i++) most = Math.max(most, Math.abs(out[i * 3 + 1]) / 4);
	expect.near(tallest, most, 1e-5, 'the tallest true height');
});

test('the components add up to the curve, and only weighted waves are drawn, at most eight', () => {
	const waves = line(3);
	const span = { zMin: -40, zMax: 40 };
	const curve = new Float32Array(CURVE_POINTS * 3);
	sampleCurve(waves, 2, span, 1, curve);
	const list = new Int32Array(MAX_COMPONENTS);
	const count = componentWaves(waves, list);
	expect.equal(count, 3, 'three waves');
	const sum = new Float64Array(CURVE_POINTS);
	const one = new Float32Array(CURVE_POINTS * 3);
	for (let c = 0; c < count; c++) {
		sampleComponent(waves, list[c], 2, span, 1, one);
		for (let i = 0; i < CURVE_POINTS; i++) sum[i] += one[i * 3 + 1];
	}
	for (let i = 0; i < CURVE_POINTS; i += 8) expect.near(sum[i], curve[i * 3 + 1], 1e-5, `point ${i}`);
	expect.equal(componentWaves(WaveBanks.withCount(WaveBanks.teachingBank(), 32), list), MAX_COMPONENTS, 'capped at eight');
	expect.equal(componentWaves(WaveBanks.withCount(WaveBanks.teachingBank(), 0), list), 0, 'none summed, none drawn');
});

test('a ribbon is halfWidth either side of the line, square to it, with two triangles per segment', () => {
	const points = new Float32Array([0, 0, 0, 0, 1, 1, 0, 1, 2, 0, 0, 3]);
	const out = new Float32Array(4 * 6);
	ribbon(points, 4, 0.25, out);
	for (let i = 0; i < 4; i++) {
		const dy = out[i * 6 + 1] - out[i * 6 + 4];
		const dz = out[i * 6 + 2] - out[i * 6 + 5];
		expect.near(Math.hypot(dy, dz), 0.5, 1e-6, `width at ${i}`);
		expect.near((out[i * 6 + 1] + out[i * 6 + 4]) / 2, points[i * 3 + 1], 1e-6, `centred at ${i}`);
	}
	const indices = ribbonIndices(4);
	expect.equal(indices.length, 18, 'three segments');
	expect.truthy(Math.max(...indices) === 7, 'eight vertices');
});

test('axis ticks: a round step for the range, ticks on its multiples, inside the range', () => {
	expect.equal(niceStep(150, 8), 20, '150 studs in about eight ticks');
	expect.equal(niceStep(9, 6), 2, 'nine studs');
	expect.equal(niceStep(0.9, 4), 0.2, 'under a stud');
	expect.equal(axisTicks(-31, 47, 20).join(','), '-20,0,20,40', 'multiples inside');
	expect.equal(axisTicks(0, 0.5, 0.2).map((v) => v.toFixed(1)).join(','), '0.0,0.2,0.4', 'no float noise');
});

// Pre-flight R18: the stage writes its ticks into a buffer made once.
test('axisTicksInto writes the same ticks into a reused buffer, at most its length', () => {
	const out = new Float64Array(4);
	expect.equal(axisTicksInto(-31, 47, 20, out), 4, 'four ticks');
	expect.equal(Array.from(out).join(','), '-20,0,20,40', 'the same ticks');
	expect.equal(axisTicksInto(0, 100, 10, out), 4, 'stops at the buffer');
	expect.equal(Array.from(out).join(','), '0,10,20,30', 'the first four');
	expect.equal(axisTicksInto(0, 0.5, 0.2, out), 3, 'three');
	expect.near(out[2], 0.4, 0, 'no float noise');
});

// The skirts hang below the clipped sheet's cut edge; the floor clip keeps y above the deepest the
// summed waves can reach, so it never touches the sheet.
test('floorDepth is the most the summed waves can add up to, plus a margin', () => {
	const waves = line(3);
	let sum = 0;
	for (let i = 0; i < 3; i++) sum += Math.abs(waves.packed[i * WaveSampler.STRIDE + 2]) * waves.weights[i];
	expect.near(floorDepth(waves), sum + FLOOR_MARGIN, 1e-12, 'the bank extent plus the margin');
	const s = new Float64Array(7);
	let lowest = 0;
	for (let z = -256; z <= 256; z += 0.5) lowest = Math.min(lowest, WaveSampler.sample(waves.packed, 3, 4, GRAPH_PLANE_X, z, 0, waves.weights, 0, s)[1]);
	expect.truthy(-floorDepth(waves) < lowest, `the floor ${-floorDepth(waves)} under the lowest trough ${lowest}`);
});

// The graph shot looks a little down at the plane, so a true upright at the frame's edge leans on
// screen; the axes lean the other way to stand straight (Task 4's screenshots: 13 px over the axis).
test('uprightLean: a line leaning this much projects straight up the frame', () => {
	const forward = forwardOf(GRAPH_SHOT);
	for (const z of [-36, -10, 0, 25]) {
		const lean = uprightLean(GRAPH_SHOT.position, forward, z);
		const low = ndcX(GRAPH_SHOT.position, forward, 70, 16 / 9, [GRAPH_PLANE_X, -12, z - 12 * lean]);
		const high = ndcX(GRAPH_SHOT.position, forward, 70, 16 / 9, [GRAPH_PLANE_X, 12, z + 12 * lean]);
		expect.near(low, high, 1e-9, `upright at z ${z}`);
		if (z !== 0) {
			const plainLow = ndcX(GRAPH_SHOT.position, forward, 70, 16 / 9, [GRAPH_PLANE_X, -12, z]);
			const plainHigh = ndcX(GRAPH_SHOT.position, forward, 70, 16 / 9, [GRAPH_PLANE_X, 12, z]);
			expect.truthy(Math.abs(plainLow - plainHigh) > 1e-4, `a plain upright leans at z ${z}`);
		}
	}
	expect.near(uprightLean(GRAPH_SHOT.position, forward, 0), 0, 1e-12, 'none at the centre');
	expect.equal(uprightLean([10, 0, 0], [-1, 0, 0], 5), 0, 'none facing away');
});

// NDC y of a point (+1 the top edge), for a camera that never rolls.
const ndcY = (position, forward, fovDegrees, point) => {
	const right = unit([-forward[2], 0, forward[0]]);
	const up = [right[1] * forward[2] - right[2] * forward[1], right[2] * forward[0] - right[0] * forward[2], right[0] * forward[1] - right[1] * forward[0]];
	const p = point.map((v, i) => v - position[i]);
	const depth = p.reduce((sum, v, i) => sum + v * forward[i], 0);
	return p.reduce((sum, v, i) => sum + v * up[i], 0) / depth / Math.tan((fovDegrees * Math.PI) / 360);
};

test('graphSpan also gives where the line crosses the frame itself', () => {
	const forward = forwardOf(GRAPH_SHOT);
	const span = graphSpan({ position: GRAPH_SHOT.position, forward, fovDegrees: 70, aspect: 16 / 9, heightPx: 767 });
	expect.near(ndcX(GRAPH_SHOT.position, forward, 70, 16 / 9, [GRAPH_PLANE_X, 0, span.frameMin]), -1, 1e-9, 'left edge');
	expect.near(ndcX(GRAPH_SHOT.position, forward, 70, 16 / 9, [GRAPH_PLANE_X, 0, span.frameMax]), 1, 1e-9, 'right edge');
});

// Fix round 1: the axes are placed from the camera's own view of the line, so wherever they show
// across the swing from step 3 into step 4 their ends sit on the frame, at the pixel insets, and the
// height axis turns smoothly (no snap from a lean cut off at its limit).
test('across the 3 to 4 blend the axes, wherever they show, stay on the frame and turn smoothly', () => {
	const from = recipeFor(stepOf('sum-of-sines'));
	const to = recipeFor(stepOf('into-3d'));
	for (const [aspect, heightPx] of [[1366 / 767, 767], [390 / 422, 422]]) {
		const widthPx = heightPx * aspect;
		let previousLean = null;
		let shown = 0;
		for (let p = 0; p <= 1.0001; p += 0.01) {
			const blended = blendRecipes(from, to, Math.min(p, 1));
			const opacity = axisOpacityOf(blended.look.graph.opacity);
			if (opacity <= 0) continue;
			shown += 1;
			const { position, target } = blended.shot;
			const forward = unit(target.map((v, i) => v - position[i]));
			const camera = { position, forward, fovDegrees: 70, aspect, heightPx };
			const layout = axisLayout(camera);
			expect.truthy(layout !== null, `axes placed at ${p.toFixed(2)}`);
			const left = ndcX(position, forward, 70, aspect, [GRAPH_PLANE_X, 0, layout.left]);
			const right = ndcX(position, forward, 70, aspect, [GRAPH_PLANE_X, 0, layout.right]);
			expect.near(left, -1 + (2 * AXIS_LEFT_PX) / widthPx, 1e-6, `left end at ${p.toFixed(2)}`);
			expect.near(right, 1 - (2 * AXIS_RIGHT_PX) / widthPx, 1e-6, `right end at ${p.toFixed(2)}`);
			// The height axis, while it shows at all, stands upright on the frame.
			if (layout.upright > 0) {
				for (const y of [layout.top, layout.bottom]) {
					const point = [GRAPH_PLANE_X, y, layout.left + y * layout.lean];
					expect.truthy(Math.abs(ndcY(position, forward, 70, point)) <= 1, `height axis end on the frame at ${p.toFixed(2)}`);
					expect.near(ndcX(position, forward, 70, aspect, point), left, 1e-6, `height axis upright at ${p.toFixed(2)}`);
				}
			}
			if (previousLean !== null) {
				expect.truthy(Math.abs(layout.lean - previousLean.lean) < 0.03, `the lean turns smoothly at ${p.toFixed(2)}`);
				expect.truthy(Math.abs(layout.upright - previousLean.upright) < 0.35, `the height axis fades, not snaps, at ${p.toFixed(2)}`);
			}
			previousLean = { lean: layout.lean, upright: layout.upright };
		}
		expect.truthy(shown > 3, 'the axes show for part of the blend');
	}
});

// Fix round 1: on a phone the axes span about 1.8 wavelengths at the default 20 studs, so a crest pair
// does not always fit; a trough pair does then, so the λ bracket never blinks out.
test('lambdaPair always finds a crest or trough pair across 1.5 wavelengths, at any phase', () => {
	const k = (2 * Math.PI) / 20;
	let crests = 0;
	let troughs = 0;
	for (let t = 0; t < 20; t += 0.05) {
		const pair = lambdaPair(k, 8 * k, 0, t, -15, 15);
		expect.truthy(pair !== null, `a pair at t ${t.toFixed(2)}`);
		expect.truthy(pair.start >= -15 - 1e-9 && pair.start + 20 <= 15 + 1e-9, 'inside');
		expect.near(Math.sin(k * pair.start - 8 * k * t), pair.crest ? 1 : -1, 1e-9, pair.crest ? 'on a crest' : 'on a trough');
		if (pair.crest) crests += 1;
		else troughs += 1;
	}
	expect.truthy(crests > 0 && troughs > 0, `both kinds used (${crests} crests, ${troughs} troughs)`);
	expect.truthy(lambdaPair(k, 0, 0, 0, -38, 38).crest, 'crests when they fit');
	expect.equal(lambdaPair(k, 0, 0, 0, -10, 10), null, 'nothing across one wavelength');
});

// Fix round 2: the height ticks keep a minimum spacing on screen, so the step is at least a size.
test('niceAtLeast: the smallest 1, 2 or 5 times a power of ten at least a size', () => {
	expect.equal(niceAtLeast(0.13), 0.2, 'over a tenth');
	expect.equal(niceAtLeast(0.2), 0.2, 'exactly');
	expect.equal(niceAtLeast(0.21), 0.5, 'past two tenths');
	expect.equal(niceAtLeast(3), 5, 'three');
	expect.equal(niceAtLeast(7), 10, 'seven');
	expect.equal(niceAtLeast(1), 1, 'one');
});
