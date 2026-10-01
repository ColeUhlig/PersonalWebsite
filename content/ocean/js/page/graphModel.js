// The flat graph's arithmetic (piece C2; lane B owns this file; spec 10.4; browser-free): where on
// the graph's plane the camera looks, the curve the teaching surface makes along that plane (the
// engine's own WaveSampler over the waves the surface is written from, chop 0 as the teaching steps
// with a graph run), each summed wave alone for the faint component curves, and the ribbons the
// lines are drawn as (WebGL lines are one pixel wide). Nothing here allocates per call except
// ribbonIndices, which the stage calls once.
import * as WaveSampler from '../core/waveSampler.js';
import { GRAPH_PLANE_X } from '../stages/graph.js';

export const CURVE_POINTS = 257;
export const MAX_COMPONENTS = 8;
// How much wider than the frame the curve is drawn, so the swing never shows its ends.
export const SPAN_MARGIN = 1.6;
// Studs the lines sit in front of the plane (towards the camera), so they draw over the sheet's edge.
export const LINE_LIFT = 0.05;
const STRIDE = WaveSampler.STRIDE;
const SAMPLE = new Float64Array(7);

/**
 * The z range of the plane x = GRAPH_PLANE_X in view, widened by SPAN_MARGIN, its depth, and the
 * studs one pixel covers there; null when the camera does not face the plane.
 * @param {{ position: number[], forward: number[], fovDegrees: number, aspect: number, heightPx: number }} camera forward is a unit vector
 */
export function graphSpan({ position, forward, fovDegrees, aspect, heightPx }, out = { zMin: 0, zMax: 0, depth: 0, studsPerPixel: 0 }) {
	if (!(forward[0] > 0.05)) {
		return null;
	}
	const along = (GRAPH_PLANE_X - position[0]) / forward[0];
	if (!(along > 0)) {
		return null;
	}
	const tanHalf = Math.tan((fovDegrees / 2) * (Math.PI / 180));
	const centre = position[2] + forward[2] * along;
	const half = along * tanHalf * aspect * SPAN_MARGIN;
	out.zMin = centre - half;
	out.zMax = centre + half;
	out.depth = along;
	out.studsPerPixel = (2 * along * tanHalf) / Math.max(heightPx, 1);
	return out;
}

/** The surface's height along the plane, times yScale, into out (x, y, z a point); returns the tallest true |height|. */
export function sampleCurve(waves, t, span, yScale, out) {
	const step = (span.zMax - span.zMin) / (CURVE_POINTS - 1);
	let tallest = 0;
	for (let i = 0; i < CURVE_POINTS; i++) {
		const z = span.zMin + i * step;
		WaveSampler.sample(waves.packed, waves.count, t, GRAPH_PLANE_X, z, 0, waves.weights, 0, SAMPLE);
		const y = SAMPLE[1];
		if (Math.abs(y) > tallest) tallest = Math.abs(y);
		out[i * 3] = GRAPH_PLANE_X - LINE_LIFT;
		out[i * 3 + 1] = y * yScale;
		out[i * 3 + 2] = z;
	}
	return tallest;
}

/** Wave `wave` of the bank alone along the plane (the term WaveSampler adds for it), times yScale. */
export function sampleComponent(waves, wave, t, span, yScale, out) {
	const o = wave * STRIDE;
	const k = waves.packed[o];
	const omega = waves.packed[o + 1];
	const amplitude = waves.packed[o + 2] * waves.weights[wave];
	const phase = waves.packed[o + 3];
	const dx = waves.packed[o + 4];
	const dz = waves.packed[o + 5];
	const step = (span.zMax - span.zMin) / (CURVE_POINTS - 1);
	for (let i = 0; i < CURVE_POINTS; i++) {
		const z = span.zMin + i * step;
		out[i * 3] = GRAPH_PLANE_X - LINE_LIFT;
		out[i * 3 + 1] = amplitude * Math.sin(k * (dx * GRAPH_PLANE_X + dz * z) - omega * t + phase) * yScale;
		out[i * 3 + 2] = z;
	}
}

/** The summed waves with height, in bank order, at most MAX_COMPONENTS, into out; returns how many. */
export function componentWaves(waves, out) {
	let count = 0;
	for (let wave = 0; wave < waves.count && count < MAX_COMPONENTS; wave++) {
		if (waves.weights[wave] > 0 && waves.packed[wave * STRIDE + 2] !== 0) {
			out[count] = wave;
			count += 1;
		}
	}
	return count;
}

/** A ribbon halfWidth studs either side of a polyline in a plane of constant x: two vertices a point. */
export function ribbon(points, count, halfWidth, out) {
	for (let i = 0; i < count; i++) {
		const a = i === 0 ? 0 : i - 1;
		const b = i === count - 1 ? i : i + 1;
		const ty = points[b * 3 + 1] - points[a * 3 + 1];
		const tz = points[b * 3 + 2] - points[a * 3 + 2];
		const length = Math.hypot(ty, tz) || 1;
		const ny = tz / length;
		const nz = -ty / length;
		const x = points[i * 3];
		const y = points[i * 3 + 1];
		const z = points[i * 3 + 2];
		out[i * 6] = x;
		out[i * 6 + 1] = y + ny * halfWidth;
		out[i * 6 + 2] = z + nz * halfWidth;
		out[i * 6 + 3] = x;
		out[i * 6 + 4] = y - ny * halfWidth;
		out[i * 6 + 5] = z - nz * halfWidth;
	}
}

/** Two triangles per segment of a `count`-point ribbon. */
export function ribbonIndices(count) {
	const indices = new Uint16Array((count - 1) * 6);
	for (let i = 0; i < count - 1; i++) {
		const a = i * 2;
		indices.set([a, a + 1, a + 2, a + 1, a + 3, a + 2], i * 6);
	}
	return indices;
}
