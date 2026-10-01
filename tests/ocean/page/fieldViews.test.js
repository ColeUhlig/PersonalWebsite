// The texture insets' arithmetic (piece C2, lane F; spec 10.7 steps 22, 23 and 25): a field as an
// image, the bilinear blend the engine's sampler does (wrap included), the zoom window round a point,
// the point's walk across the tile's edge, and a texture shrunk for the painted-map inset.
import { test } from 'node:test';
import * as expect from '../expect.js';
import * as Cascade from '../../../content/ocean/js/core/cascade.js';
import * as FieldStore from '../../../content/ocean/js/core/fieldStore.js';
import { FIELD_VIEWS, ZOOM, bilinear, downsample, fieldToRgba, walkPoint, zoomWindow } from '../../../content/ocean/js/page/fieldViews.js';

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
	expect.truthy(Array.from(flat).every(Number.isFinite), 'a flat field is finite');
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
