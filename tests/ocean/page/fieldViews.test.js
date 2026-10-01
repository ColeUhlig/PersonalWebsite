// The texture insets' arithmetic (piece C2, lane F; spec 10.7 steps 22, 23 and 25): a field as an
// image, the bilinear blend the engine's sampler does (wrap included), the zoom window round a point,
// the point's walk across the tile's edge, and a texture shrunk for the painted-map inset.
import { test } from 'node:test';
import * as expect from '../expect.js';
import * as Cascade from '../../../content/ocean/js/core/cascade.js';
import * as FieldStore from '../../../content/ocean/js/core/fieldStore.js';
import { FIELD_VIEWS, ZOOM, bilinear, downsample, fieldToRgba, magnitude, walkPoint, zoomLayout, zoomWindow } from '../../../content/ocean/js/page/fieldViews.js';

// A 64 x 64, 256-stud field with a different, deterministic value in every cell.
function field() {
	const fields = FieldStore.newFields(64, 256);
	for (let i = 0; i < 64 * 64; i++) {
		fields.height[i] = Math.sin(i * 0.37) * 2 + Math.cos(i * 0.011);
		fields.dispX[i] = Math.sin(i * 0.05);
		fields.slopeX[i] = Math.cos(i * 0.21) * 0.3;
	}
	return fields;
}

test('a field as an image: zero is the pale middle, the extremes blue and amber, a flat field no NaN', () => {
	const values = Float32Array.from([-2, 0, 1, 2]);
	const out = new Uint8ClampedArray(16);
	expect.equal(JSON.stringify(fieldToRgba(values, out)), JSON.stringify({ min: -2, max: 2 }), 'range');
	expect.equal(Array.from(out.subarray(4, 8)).join(','), '232,238,242,255', 'zero');
	expect.truthy(out[2] > out[0], 'negative is blue');
	expect.truthy(out[12] > out[14], 'positive is amber');
	const flat = new Uint8ClampedArray(16);
	fieldToRgba(new Float32Array(4), flat);
	expect.equal(Array.from(flat).join(','), '232,238,242,255,'.repeat(4).slice(0, -1), 'a flat field is the pale zero everywhere');
	expect.equal(FIELD_VIEWS.map((v) => v.name).join(','), 'height,slopeX,dispX', 'the three fields');
});

test("the blend is the engine's sampler, value for value, across the tile's edges and below zero", () => {
	const fields = field();
	const out = new Float64Array(3);
	for (const [x, z] of [[10.3, 77.9], [255.99, 3.1], [0, 0], [-3.2, -250.5], [127.5, 255.999], [512.25, 64.75]]) {
		const blend = bilinear(fields, x, z);
		expect.near(blend.value, Cascade.sampleHeight(fields, x, z, out)[0], 1e-12, `at ${x}, ${z}`);
		expect.near(blend.weights.reduce((a, b) => a + b, 0), 1, 1e-12, `weights sum at ${x}, ${z}`);
	}
	const edge = bilinear(fields, 255.99, 3.1);
	expect.equal(edge.column, 63, 'the last column');
	expect.equal(edge.column1, 0, 'wraps to the first');
});

test('the zoom window wraps its indices, and the walk crosses the tile edge back and forth', () => {
	const fields = field();
	const out = new Float64Array(ZOOM * ZOOM);
	const window = zoomWindow(fields, 255, 128, out);
	expect.equal(window.wraps, true, 'the window round the edge wraps');
	expect.equal(window.first[0], 61, 'starts two columns before the point');
	expect.equal(out[0 * ZOOM + 3], fields.height[window.first[1] * 64 + 0], 'its fourth column is column 0');
	const sides = new Set();
	for (let t = 0; t < 8; t += 0.1) sides.add(walkPoint(t, 256)[0] > 128 ? 'end' : 'start');
	expect.equal([...sides].sort().join(','), 'end,start', 'both sides of the edge within eight seconds');
	expect.truthy([0, 1, 2, 3].every((t) => { const [x, z] = walkPoint(t, 256); return x >= 0 && x < 256 && z >= 0 && z < 256; }), 'inside the tile');
});

test('downsample averages blocks, keeping a flat colour flat', () => {
	const src = new Uint8Array(4 * 4 * 4);
	for (let i = 0; i < 16; i++) src.set(i % 2 === 0 ? [0, 100, 200, 255] : [100, 100, 0, 255], i * 4);
	const out = new Uint8ClampedArray(2 * 2 * 4);
	downsample(src, 4, out, 2);
	expect.equal(Array.from(out.subarray(0, 4)).join(','), '50,100,100,255', 'the 2 x 2 average');
	const flat = new Uint8Array(8 * 8 * 4).fill(77);
	const small = new Uint8ClampedArray(4 * 4 * 4);
	downsample(flat, 8, small, 4);
	expect.truthy(Array.from(small).every((v) => v === 77), 'flat stays flat');
});

test("the zoom can share the whole field's colour scale, so a texel keeps its shade as the window moves", () => {
	const fields = field();
	const whole = new Uint8ClampedArray(64 * 64 * 4);
	fieldToRgba(fields.height, whole);
	const scale = magnitude(fields.height);
	expect.equal(scale, Math.max(...Array.from(fields.height, Math.abs)), 'the largest magnitude');
	const heights = new Float64Array(ZOOM * ZOOM);
	const zoomed = new Uint8ClampedArray(ZOOM * ZOOM * 4);
	for (const x of [255, 2, 130.5]) {
		const { first } = zoomWindow(fields, x, 77, heights);
		fieldToRgba(heights, zoomed, scale);
		for (const [i, j] of [[0, 0], [3, 2], [5, 5]]) {
			const texel = ((first[1] + j) % 64) * 64 + ((first[0] + i) % 64);
			expect.equal(Array.from(zoomed.subarray((j * ZOOM + i) * 4, (j * ZOOM + i) * 4 + 4)).join(','), Array.from(whole.subarray(texel * 4, texel * 4 + 4)).join(','), `x ${x}, texel ${i}, ${j}`);
		}
	}
});

test("the point crosses the dashed tile edge exactly when x wraps from the tile's end to 0", () => {
	const fields = field();
	const heights = new Float64Array(ZOOM * ZOOM);
	for (let x = 250; x <= 262; x += 0.125) {
		const layout = zoomLayout(fields, x, 94.72, heights);
		const wrapped = (x % 256) < 128;
		expect.truthy(layout.edge !== null, `an edge on screen at x ${x}`);
		if (x === 256) expect.equal(layout.point[0], layout.edge, 'on the line at the seam itself');
		else expect.equal(layout.point[0] > layout.edge, wrapped, `x ${x}: point ${layout.point[0]}, edge ${layout.edge}`);
	}
	// Samples are drawn at cell centres: sample k of the window at k + 0.5, the seam on sample 0.
	const at = zoomLayout(fields, 255, 94.72, heights);
	expect.equal(at.edge, 3.5, 'the seam on column 0, the window\'s fourth sample');
	expect.near(at.point[0], 2.75 + 0.5, 1e-12, 'u 63.75 is three quarters past column 63');
});
