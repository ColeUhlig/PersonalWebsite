// The flat graph's arithmetic (piece C2, lane B, Task 3; spec 10.4): the plane's span in view, the
// curve the teaching surface makes along it (the engine's own sampler), each wave alone, and ribbons.
import { test } from 'node:test';
import * as expect from '../expect.js';
import * as WaveSampler from '../../../content/ocean/js/core/waveSampler.js';
import * as WaveBanks from '../../../content/ocean/js/engine/waveBanks.js';
import { CURVE_POINTS, LINE_LIFT, MAX_COMPONENTS, SPAN_MARGIN, componentWaves, graphSpan, ribbon, ribbonIndices, sampleComponent, sampleCurve } from '../../../content/ocean/js/page/graphModel.js';
import { GRAPH_PLANE_X } from '../../../content/ocean/js/stages/graph.js';
import { GRAPH_SHOT } from '../../../content/ocean/js/stages/recipeKit.js';

const unit = (v) => {
	const l = Math.hypot(...v);
	return v.map((x) => x / l);
};
const forwardOf = (shot) => unit(shot.target.map((t, i) => t - shot.position[i]));
const line = (count) => WaveBanks.withCount(WaveBanks.withFan(WaveBanks.teachingBank(), 0), count);

test('graphSpan: the plane in view from the graph shot, widened, and the studs a pixel covers', () => {
	const forward = forwardOf(GRAPH_SHOT);
	const span = graphSpan({ position: GRAPH_SHOT.position, forward, fovDegrees: 70, aspect: 16 / 9, heightPx: 767 });
	const along = (GRAPH_PLANE_X - GRAPH_SHOT.position[0]) / forward[0];
	const half = along * Math.tan((35 * Math.PI) / 180) * (16 / 9) * SPAN_MARGIN;
	expect.near(span.zMin, -half, 1e-9, 'left');
	expect.near(span.zMax, half, 1e-9, 'right');
	expect.near(span.depth, along, 1e-9, 'depth');
	expect.near(span.studsPerPixel, (2 * along * Math.tan((35 * Math.PI) / 180)) / 767, 1e-12, 'studs per pixel');
	expect.equal(graphSpan({ position: [10, 0, 0], forward: [-1, 0, 0], fovDegrees: 70, aspect: 1, heightPx: 100 }), null, 'looking away: no graph');
	expect.equal(graphSpan({ position: [-10, 0, 0], forward: [0, 0, -1], fovDegrees: 70, aspect: 1, heightPx: 100 }), null, 'looking along the plane: no graph');
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
