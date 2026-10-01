// The flat graph's arithmetic (piece C2; lane B owns this file; spec 10.4; browser-free): where on
// the graph's plane the camera looks, the curve the teaching surface makes along that plane (the
// engine's own WaveSampler over the waves the surface is written from, chop 0 as the teaching steps
// with a graph run), each summed wave alone for the faint component curves, and the ribbons the
// lines are drawn as (WebGL lines are one pixel wide). Task 4 adds the axes' tick arithmetic and the
// floor the stage clips the sheet's skirts to. Nothing here allocates per call except ribbonIndices,
// which the stage calls once, and axisTicks, which the tests and graphLabels.js use (the stage writes
// its ticks with axisTicksInto).
import * as WaveSampler from '../core/waveSampler.js';
import { bankExtent } from '../engine/waveBanks.js';
import { GRAPH_PLANE_X } from '../stages/graph.js';

// 513: an oblique view (step 4) sees up to 2 * MAX_SPAN_HALF studs of the plane, and the points stay
// three studs apart there (the graph steps' waves are 23 studs and longer).
export const CURVE_POINTS = 513;
export const MAX_COMPONENTS = 8;
// How much wider than the frame the curve is drawn, so the swing never shows its ends.
export const SPAN_MARGIN = 1.6;
// Studs either side of the view's centre the curve reaches at most, where an edge of the frame never
// meets the curve's line (it runs to the horizon inside the frame).
export const MAX_SPAN_HALF = 768;
// Studs under the deepest trough the summed waves can reach where the stage clips the sheet: the
// skirts hang below the clipped edge down to the bounds' depth, and the sheet never reaches this low.
export const FLOOR_MARGIN = 0.25;
// Studs the lines sit in front of the plane (towards the camera), so they draw over the sheet's edge.
export const LINE_LIFT = 0.05;
const STRIDE = WaveSampler.STRIDE;
const SAMPLE = new Float64Array(7);

/**
 * The z range of the plane x = GRAPH_PLANE_X in view, its depth, and the studs one pixel covers
 * there; null when the camera does not face the plane. The range is where the curve's line (y = 0 on
 * the plane) crosses the frame's left and right edges widened SPAN_MARGIN times, so the ends sit
 * well outside the frame face-on and obliquely alike (step 4, the swing). An edge that never meets
 * the line (it runs to the horizon inside the frame) takes the line MAX_SPAN_HALF from the centre.
 * The camera never rolls, so its right is level.
 * @param {{ position: number[], forward: number[], fovDegrees: number, aspect: number, heightPx: number }} camera forward is a unit vector
 */
export function graphSpan({ position, forward, fovDegrees, aspect, heightPx }, out = { zMin: 0, zMax: 0, depth: 0, studsPerPixel: 0 }) {
	const fx = forward[0];
	const fy = forward[1];
	const fz = forward[2];
	if (!(fx > 0.05)) {
		return null;
	}
	const reach = GRAPH_PLANE_X - position[0];
	const along = reach / fx;
	if (!(along > 0)) {
		return null;
	}
	const tanHalf = Math.tan((fovDegrees / 2) * (Math.PI / 180));
	const centre = position[2] + fz * along;
	const level = Math.hypot(fx, fz);
	const rx = -fz / level;
	const rz = fx / level;
	// For the line's point at z = position[2] + w: right . p = a + rz w, forward . p = b + fz w.
	const a = rx * reach;
	const b = fx * reach - fy * position[1];
	const edge = tanHalf * aspect * SPAN_MARGIN;
	out.zMin = lineEnd(-edge, a, b, rz, fz, position[2], centre);
	out.zMax = lineEnd(edge, a, b, rz, fz, position[2], centre);
	if (out.zMin > out.zMax) {
		const swap = out.zMin;
		out.zMin = out.zMax;
		out.zMax = swap;
	}
	out.depth = along;
	out.studsPerPixel = (2 * along * tanHalf) / Math.max(heightPx, 1);
	return out;
}

// Where the line crosses the frame edge at screen slope `edge` (right . p = edge * forward . p), in
// front of the camera and within MAX_SPAN_HALF of the centre; else the cap on that edge's side.
function lineEnd(edge, a, b, rz, fz, z0, centre) {
	const towards = edge < 0 ? -Math.sign(rz) || -1 : Math.sign(rz) || 1;
	const cap = centre + towards * MAX_SPAN_HALF;
	const denominator = rz - edge * fz;
	if (Math.abs(denominator) < 1e-9) {
		return cap;
	}
	const w = (edge * b - a) / denominator;
	if (!(b + fz * w > 0)) {
		return cap;
	}
	return Math.min(Math.max(z0 + w, centre - MAX_SPAN_HALF), centre + MAX_SPAN_HALF);
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

/** Studs below y = 0 the sheet can never reach (the summed waves' extent) plus FLOOR_MARGIN. */
export function floorDepth(waves) {
	return bankExtent(waves) + FLOOR_MARGIN;
}

// A round tick step (1, 2 or 5 times a power of ten) giving about `targetCount` ticks over `range`.
export function niceStep(range, targetCount) {
	const raw = range / Math.max(targetCount, 1);
	const power = 10 ** Math.floor(Math.log10(raw));
	const scaled = raw / power;
	const nice = scaled < 1.5 ? 1 : scaled < 3.5 ? 2 : scaled < 7.5 ? 5 : 10;
	return Number((nice * power).toPrecision(6));
}

// The multiples of `step` inside [min, max], free of float noise.
export function axisTicks(min, max, step) {
	const ticks = [];
	for (let n = Math.ceil(min / step); n * step <= max + 1e-9; n++) ticks.push(Number((n * step).toPrecision(6)));
	return ticks;
}

// axisTicks into a buffer made once (R18), at most its length; returns how many.
export function axisTicksInto(min, max, step, out) {
	let count = 0;
	for (let n = Math.ceil(min / step); n * step <= max + 1e-9 && count < out.length; n++) {
		out[count] = Number((n * step).toPrecision(6));
		count += 1;
	}
	return count;
}

// The most an upright the stage draws may lean (studs of z per stud of height); past it the camera is
// far from face-on, the axes have faded, and the upright is drawn plain.
export const MAX_LEAN = 0.25;

/**
 * Studs of z per stud of height for a line on the plane through (z, 0) that the camera sees straight
 * up the frame. GRAPH_SHOT looks a little down at the plane, so true uprights converge towards the
 * frame's edges; the axes lean this much to stand upright on screen. 0 past MAX_LEAN or when the
 * camera does not face the plane. The camera never rolls, so its right is level.
 */
export function uprightLean(position, forward, z) {
	const fx = forward[0];
	const fy = forward[1];
	const fz = forward[2];
	if (!(fx > 0.05)) {
		return 0;
	}
	const level = Math.hypot(fx, fz);
	const rx = -fz / level;
	const rz = fx / level;
	const dx = GRAPH_PLANE_X - position[0];
	const dz = z - position[2];
	const depth = fx * dx - fy * position[1] + fz * dz;
	if (!(depth > 0)) {
		return 0;
	}
	// Screen slope s = right . q / forward . q at (z, 0); keeping it as y moves gives dz/dy below.
	const slope = (rx * dx + rz * dz) / depth;
	const denominator = rz - slope * fz;
	if (Math.abs(denominator) < 1e-9) {
		return 0;
	}
	const lean = (slope * fy) / denominator;
	return Math.abs(lean) <= MAX_LEAN ? lean : 0;
}
