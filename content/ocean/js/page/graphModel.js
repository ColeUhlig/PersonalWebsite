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

// 769: an oblique view (step 4) sees up to 2 * MAX_SPAN_HALF studs of the plane, and the points stay
// three studs apart there (the graph steps' waves are 20 studs and longer).
export const CURVE_POINTS = 769;
export const MAX_COMPONENTS = 8;
// How much wider than the frame the curve is drawn, so the swing never shows its ends.
export const SPAN_MARGIN = 1.6;
// Studs either side of the view's centre the curve reaches at most, where an edge of the frame never
// meets the curve's line (it runs to the horizon inside the frame). Task 14: far enough that, from
// step 4 on a 21:9 screen, the curve runs out to the far edge of the sea's outermost ring (1,024
// studs from its snapped centre), so no waved sheet shows past its end.
export const MAX_SPAN_HALF = 1152;
// Studs under the deepest trough the summed waves can reach where the stage clips the sheet: the
// skirts hang below the clipped edge down to the bounds' depth, and the sheet never reaches this low.
export const FLOOR_MARGIN = 0.25;
// Studs the lines sit in front of the plane (towards the camera), so they draw over the sheet's edge.
export const LINE_LIFT = 0.05;
const STRIDE = WaveSampler.STRIDE;
const SAMPLE = new Float64Array(7);

// The camera's view of the plane, shared by the functions below (scratch: every use finishes before
// it returns). The camera never rolls, so its right is level. For the plane's point at height y and
// z = position[2] + w: right . q = a + rz w, up . q = c + uy y + uz w, forward . q = b + fy y + fz w,
// with q the point less the camera's position.
const VIEW = { fy: 0, fz: 0, rz: 0, uy: 0, uz: 0, a: 0, b: 0, c: 0, tanHalf: 1, aspect: 1, heightPx: 1, z0: 0, centre: 0, along: 0 };

function readView({ position, forward, fovDegrees, aspect, heightPx }) {
	const fx = forward[0];
	const fy = forward[1];
	const fz = forward[2];
	if (!(fx > 0.05)) {
		return false;
	}
	const reach = GRAPH_PLANE_X - position[0];
	const along = reach / fx;
	if (!(along > 0)) {
		return false;
	}
	const level = Math.hypot(fx, fz);
	const rx = -fz / level;
	const rz = fx / level;
	const ux = -rz * fy;
	VIEW.fy = fy;
	VIEW.fz = fz;
	VIEW.rz = rz;
	VIEW.uy = rz * fx - rx * fz;
	VIEW.uz = rx * fy;
	VIEW.a = rx * reach;
	VIEW.b = fx * reach - fy * position[1];
	VIEW.c = ux * reach - VIEW.uy * position[1];
	VIEW.tanHalf = Math.tan((fovDegrees / 2) * (Math.PI / 180));
	VIEW.aspect = aspect;
	VIEW.heightPx = Math.max(heightPx, 1);
	VIEW.z0 = position[2];
	VIEW.centre = position[2] + fz * along;
	VIEW.along = along;
	return true;
}

// w of the curve's line (y = 0) where it meets the screen column ndcX (-1 the left edge, +1 the
// right), in front of the camera; NaN when it never does (it runs to the horizon short of it).
function lineW(ndcX) {
	const e = ndcX * VIEW.tanHalf * VIEW.aspect;
	const denominator = VIEW.rz - e * VIEW.fz;
	if (Math.abs(denominator) < 1e-9) {
		return Number.NaN;
	}
	const w = (e * VIEW.b - VIEW.a) / denominator;
	return VIEW.b + VIEW.fz * w > 0 ? w : Number.NaN;
}

// lineW as a z, within MAX_SPAN_HALF of the view's centre; the cap on that column's side when the
// line never meets it.
function lineZ(ndcX) {
	const w = lineW(ndcX);
	const lo = VIEW.centre - MAX_SPAN_HALF;
	const hi = VIEW.centre + MAX_SPAN_HALF;
	if (Number.isNaN(w)) {
		return (ndcX < 0) === (VIEW.rz > 0) ? lo : hi;
	}
	return Math.min(Math.max(VIEW.z0 + w, lo), hi);
}

// Studs one pixel covers on the line at w (its depth along the view).
function studsPerPixelW(w) {
	return (2 * VIEW.tanHalf * (VIEW.b + VIEW.fz * w)) / VIEW.heightPx;
}

// The height y at which an upright from (w, 0), leaning `lean` (its point at w + lean y), meets the
// screen row ndcY (+1 the top edge); NaN when it never does.
function heightW(w, lean, ndcY) {
	const e = ndcY * VIEW.tanHalf;
	const denominator = VIEW.uy + VIEW.uz * lean - e * (VIEW.fy + VIEW.fz * lean);
	if (Math.abs(denominator) < 1e-9) {
		return Number.NaN;
	}
	const y = (e * (VIEW.b + VIEW.fz * w) - VIEW.c - VIEW.uz * w) / denominator;
	return VIEW.b + VIEW.fy * y + VIEW.fz * (w + lean * y) > 0 ? y : Number.NaN;
}

// The lean (studs of z per stud of height) that keeps an upright at w straight up the frame.
function leanW(w) {
	const depth = VIEW.b + VIEW.fz * w;
	if (!(depth > 0)) {
		return 0;
	}
	const slope = (VIEW.a + VIEW.rz * w) / depth;
	const denominator = VIEW.rz - slope * VIEW.fz;
	if (Math.abs(denominator) < 1e-9) {
		return 0;
	}
	return (slope * VIEW.fy) / denominator;
}

const clampLean = (lean) => Math.min(Math.max(lean, -MAX_LEAN), MAX_LEAN);

/**
 * The z range of the plane x = GRAPH_PLANE_X in view, its depth, and the studs one pixel covers
 * there; null when the camera does not face the plane. zMin and zMax are where the curve's line
 * (y = 0 on the plane) crosses the frame's left and right edges widened SPAN_MARGIN times, so the
 * ends sit well outside the frame face-on and obliquely alike (step 4, the swing); frameMin and
 * frameMax where it crosses the frame's own edges. An edge the line never meets (it runs to the
 * horizon inside the frame) takes the line MAX_SPAN_HALF from the centre.
 * @param {{ position: number[], forward: number[], fovDegrees: number, aspect: number, heightPx: number }} camera forward is a unit vector
 */
export function graphSpan(camera, out = { zMin: 0, zMax: 0, frameMin: 0, frameMax: 0, depth: 0, studsPerPixel: 0 }) {
	if (!readView(camera)) {
		return null;
	}
	out.zMin = lineZ(-SPAN_MARGIN);
	out.zMax = lineZ(SPAN_MARGIN);
	out.frameMin = lineZ(-1);
	out.frameMax = lineZ(1);
	out.depth = VIEW.along;
	out.studsPerPixel = (2 * VIEW.along * VIEW.tanHalf) / VIEW.heightPx;
	return out;
}

/**
 * Task 14: the z where the curve's line (y = 0 on the plane) crosses the screen column ndcX (-1 the
 * left edge, +1 the right), within MAX_SPAN_HALF of the view's centre; NaN when the camera does not
 * face the plane. The stage keeps its words left of the page's pills with it.
 */
export function lineZAt(camera, ndcX) {
	return readView(camera) ? lineZ(ndcX) : Number.NaN;
}

// Pixels the axes stand in from the frame's left edge (room for the height ticks' numbers, drawn to
// the axis' left), its right edge, and its top and bottom.
export const AXIS_LEFT_PX = 44;
export const AXIS_RIGHT_PX = 24;
export const AXIS_EDGE_PX = 12;

/**
 * Where the stage draws the axes, from the camera's view: the distance axis' ends (z on the line
 * y = 0) where the line meets the screen columns AXIS_LEFT_PX and AXIS_RIGHT_PX in from the frame's
 * edges, so they stay on the frame however oblique the view; the studs a pixel covers at each end;
 * the height axis' lean at the left end and how upright that keeps it (`upright`: 1 while the lean it
 * needs is under half MAX_LEAN, easing to 0 at MAX_LEAN, past which it could not stand upright: the
 * stage fades the height axis by it, so it never snaps or slides off the frame); and the heights there
 * of the frame's top and bottom, less AXIS_EDGE_PX. null when the camera does not face the plane or
 * the line does not reach either column.
 */
export function axisLayout(camera, out = { left: 0, right: 0, sppLeft: 0, sppRight: 0, lean: 0, upright: 1, top: 0, bottom: 0 }) {
	if (!readView(camera)) {
		return null;
	}
	const widthPx = VIEW.heightPx * VIEW.aspect;
	const wl = lineW(-1 + (2 * AXIS_LEFT_PX) / widthPx);
	const wr = lineW(1 - (2 * AXIS_RIGHT_PX) / widthPx);
	if (Number.isNaN(wl) || Number.isNaN(wr)) {
		return null;
	}
	const edge = 1 - (2 * AXIS_EDGE_PX) / VIEW.heightPx;
	const needed = leanW(wl);
	const lean = clampLean(needed);
	const top = heightW(wl, lean, edge);
	const bottom = heightW(wl, lean, -edge);
	out.left = VIEW.z0 + wl;
	out.right = VIEW.z0 + wr;
	out.sppLeft = studsPerPixelW(wl);
	out.sppRight = studsPerPixelW(wr);
	out.lean = lean;
	out.upright = Math.min(1, Math.max(0, (MAX_LEAN - Math.abs(needed)) / (MAX_LEAN / 2)));
	out.top = Number.isNaN(top) ? Number.POSITIVE_INFINITY : top;
	out.bottom = Number.isNaN(bottom) ? Number.NEGATIVE_INFINITY : bottom;
	return out;
}

/** The studs one pixel covers on the curve's line at z; 0 when the camera does not face the plane. */
export function studsPerPixelAt(camera, z) {
	return readView(camera) ? studsPerPixelW(z - VIEW.z0) : 0;
}

/**
 * Studs of z per stud of height for a line on the plane through (z, 0) that the camera sees straight
 * up the frame, clamped to MAX_LEAN either way. GRAPH_SHOT looks a little down at the plane, so true
 * uprights converge towards the frame's edges; the axes lean this much to stand upright on screen.
 * 0 when the camera does not face the plane.
 */
export function uprightLean(position, forward, z) {
	LEAN_INPUT.position = position;
	LEAN_INPUT.forward = forward;
	return readView(LEAN_INPUT) ? clampLean(leanW(z - VIEW.z0)) : 0;
}

// uprightLean's input to readView, made once (the field of view and frame do not change a lean).
const LEAN_INPUT = { position: null, forward: null, fovDegrees: 70, aspect: 1, heightPx: 1 };

// The axes and their words show over the top half of the backdrop's fade only: they belong to the
// flat picture, and in the swing's oblique view they would float about the frame.
export function axisOpacityOf(shown) {
	return Math.min(1, Math.max(0, (shown - 0.5) * 2));
}

/**
 * Where the λ bracket starts, for the sine k z - omega t + phase: the first crest of a crest pair
 * that fits in [from, to], preferring the first one a quarter wave in from `from` (clear of the
 * height axis' words); else the first trough of a trough pair (drawn under the curve). One of the two
 * always fits when to - from is at least 1.5 wavelengths, so the bracket never blinks out as the
 * wave slides. out.crest says which; null when neither fits.
 */
export function lambdaPair(k, omega, phase, t, from, to, out = { start: 0, crest: true }) {
	const wavelength = (2 * Math.PI) / k;
	let start = crestAfter(k, omega, phase, t, from + wavelength * 0.25);
	if (start + wavelength > to) start = crestAfter(k, omega, phase, t, from);
	if (start + wavelength <= to) {
		out.start = start;
		out.crest = true;
		return out;
	}
	// Troughs sit half a wave before crests.
	start = crestAfter(k, omega, phase, t, from + wavelength / 2) - wavelength / 2;
	if (start + wavelength <= to) {
		out.start = start;
		out.crest = false;
		return out;
	}
	return null;
}

/** The first crest at or after z, for the sine k z - omega t + phase. */
export function crestAfter(k, omega, phase, t, z) {
	return (Math.PI / 2 + 2 * Math.PI * Math.ceil((k * z - Math.PI / 2 - omega * t + phase) / (2 * Math.PI)) + omega * t - phase) / k;
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

// The smallest round step (1, 2 or 5 times a power of ten) at least `least`.
export function niceAtLeast(least) {
	const power = 10 ** Math.floor(Math.log10(least));
	const scaled = least / power;
	const nice = scaled <= 1 + 1e-9 ? 1 : scaled <= 2 + 1e-9 ? 2 : scaled <= 5 + 1e-9 ? 5 : 10;
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

// The most an upright the stage draws may lean (studs of z per stud of height).
export const MAX_LEAN = 0.25;
