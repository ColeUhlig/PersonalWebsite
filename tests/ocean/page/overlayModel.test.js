// The surface overlays' arrows (piece C2, lane C; spec 10.7 steps 5, 8 and 9): each wave's heading,
// the surface's exact normals on a grid with the tangent and binormal at its centre, and (Task 6) the
// central difference beside the exact slope.
import { test } from 'node:test';
import * as expect from '../expect.js';
import * as WaveSampler from '../../../content/ocean/js/core/waveSampler.js';
import * as WaveBanks from '../../../content/ocean/js/engine/waveBanks.js';
import { DIRECTIONS_WAVES } from '../../../content/ocean/js/stages/recipeKit.js';
import { ARROW_STRIDE, COLOURS, GRID, MAX_ARROWS, MAX_DIRECTIONS, NORMAL_LENGTH, differenceSlope, directionArrows, normalArrows, readoutText, slopeArrows } from '../../../content/ocean/js/page/overlayModel.js';

const arrow = (out, i) => Array.from(out.subarray(i * ARROW_STRIDE, (i + 1) * ARROW_STRIDE));
const unit = (v) => {
	const l = Math.hypot(...v);
	return v.map((x) => x / l);
};

test('one arrow per summed wave, along its heading, from a hub above the surface', () => {
	const out = new Float64Array(MAX_ARROWS * ARROW_STRIDE);
	const fanned = WaveBanks.withCount(WaveBanks.teachingBank(), 6);
	expect.equal(directionArrows(fanned, 3, [10, -5], out), 6, 'six waves, six arrows');
	for (let i = 0; i < 6; i++) {
		const [bx, by, bz, tx, ty, tz, colour] = arrow(out, i);
		const o = i * WaveSampler.STRIDE;
		const [dx, dz] = unit([tx - bx, tz - bz]);
		expect.near(dx, fanned.packed[o + 4], 1e-9, `wave ${i} heading x`);
		expect.near(dz, fanned.packed[o + 5], 1e-9, `wave ${i} heading z`);
		expect.equal(ty, by, `wave ${i} flat`);
		expect.equal(colour, COLOURS.WAVE + i, `wave ${i} colour`);
		const length = Math.hypot(tx - bx, tz - bz);
		expect.truthy(length >= 6 && length <= 24, `wave ${i} length ${length}`);
		expect.equal(`${bx},${bz}`, '10,-5', 'from the focus');
	}
	const line = WaveBanks.withCount(WaveBanks.withFan(WaveBanks.teachingBank(), 0), 6);
	directionArrows(line, 3, [0, 0], out);
	for (let i = 0; i < 6; i++) expect.near(arrow(out, i)[3], 0, 1e-12, `spread 0: wave ${i} along +z`);
	expect.equal(directionArrows(WaveBanks.withCount(WaveBanks.teachingBank(), 32), 3, [0, 0], out), MAX_DIRECTIONS, 'at most eight');
});

test('normals: a grid of exact normals on the surface, and T, B square to n with n along B x T', () => {
	const sine = WaveBanks.nextSine(null, { amplitude: 2, wavelength: 30, speed: 5 }, 0).bank;
	const out = new Float64Array(MAX_ARROWS * ARROW_STRIDE);
	const count = normalArrows(sine, 1.5, [3, 7], out);
	expect.equal(count, GRID * GRID + 2, 'the grid, the tangent and the binormal');
	const k = (2 * Math.PI) / 30;
	const omega = k * 5;
	for (let i = 0; i < GRID * GRID; i++) {
		const [bx, by, bz, tx, ty, tz, colour] = arrow(out, i);
		expect.equal(colour, COLOURS.NORMAL, `arrow ${i} colour`);
		const slope = 2 * k * Math.cos(k * bz - omega * 1.5);
		const want = unit([0, 1, -slope]);
		const got = unit([tx - bx, ty - by, tz - bz]);
		want.forEach((w, j) => expect.near(got[j], w, 1e-9, `arrow ${i} component ${j}`));
		expect.near(Math.hypot(tx - bx, ty - by, tz - bz), NORMAL_LENGTH, 1e-9, `arrow ${i} length`);
		expect.near(Math.abs(bx) % 2, 0, 1e-9, `arrow ${i} on the 2-stud lattice in x`);
		expect.near(Math.abs(bz) % 2, 0, 1e-9, `arrow ${i} on the 2-stud lattice in z`);
	}
	const t = arrow(out, GRID * GRID);
	const b = arrow(out, GRID * GRID + 1);
	expect.equal(t[6], COLOURS.TANGENT, 'tangent colour');
	expect.equal(b[6], COLOURS.BINORMAL, 'binormal colour');
	const centre = arrow(out, (GRID * GRID - 1) / 2);
	const n = unit([centre[3] - centre[0], centre[4] - centre[1], centre[5] - centre[2]]);
	const tv = unit([t[3] - t[0], t[4] - t[1], t[5] - t[2]]);
	const bv = unit([b[3] - b[0], b[4] - b[1], b[5] - b[2]]);
	const dot = (a, c) => a[0] * c[0] + a[1] * c[1] + a[2] * c[2];
	expect.near(dot(n, tv), 0, 1e-9, 'T square to n');
	expect.near(dot(n, bv), 0, 1e-9, 'B square to n');
	const cross = [bv[1] * tv[2] - bv[2] * tv[1], bv[2] * tv[0] - bv[0] * tv[2], bv[0] * tv[1] - bv[1] * tv[0]];
	expect.near(dot(unit(cross), n), 1, 1e-9, 'n is along B x T');
});

// Task 5 review, fix round 1: at spread 0 every heading is +z, so arrows from one hub would lie on
// top of each other and the tallest wave's could vanish under another of equal length.
test('at spread 0 no two heading arrows coincide: each sits on its own rung of the hub', () => {
	const out = new Float64Array(MAX_ARROWS * ARROW_STRIDE);
	const line = WaveBanks.withCount(WaveBanks.withFan(WaveBanks.teachingBank(), 0), DIRECTIONS_WAVES);
	const count = directionArrows(line, 3, [0, -10], out);
	expect.equal(count, DIRECTIONS_WAVES, 'every wave drawn');
	for (let i = 0; i < count; i++) {
		for (let j = i + 1; j < count; j++) {
			const a = arrow(out, i);
			const b = arrow(out, j);
			expect.truthy(Math.abs(a[1] - b[1]) >= 0.5, `arrows ${i} and ${j} at heights ${a[1]} and ${b[1]}`);
		}
	}
});

test('a heading arrow is as long as its wave, the longest drawn wave 24 studs, none clamped equal', () => {
	const out = new Float64Array(MAX_ARROWS * ARROW_STRIDE);
	const bank = WaveBanks.withCount(WaveBanks.teachingBank(), DIRECTIONS_WAVES);
	const count = directionArrows(bank, 3, [0, 0], out);
	const wavelengths = Array.from({ length: count }, (_, i) => (2 * Math.PI) / bank.packed[i * WaveSampler.STRIDE]);
	const longest = Math.max(...wavelengths);
	for (let i = 0; i < count; i++) {
		const [bx, , bz, tx, , tz] = arrow(out, i);
		expect.near(Math.hypot(tx - bx, tz - bz), Math.max((24 * wavelengths[i]) / longest, 6), 1e-9, `wave ${i} length`);
	}
	const lengths = Array.from({ length: count }, (_, i) => {
		const [bx, , bz, tx, , tz] = arrow(out, i);
		return Math.hypot(tx - bx, tz - bz);
	});
	expect.equal(new Set(lengths.map((l) => l.toFixed(6))).size, count, `distinct lengths ${lengths.join(', ')}`);
});

test("the directions step's frozen wave count (R17) gets one arrow per wave", () => {
	const out = new Float64Array(MAX_ARROWS * ARROW_STRIDE);
	expect.truthy(DIRECTIONS_WAVES <= MAX_DIRECTIONS, `${DIRECTIONS_WAVES} waves fit under ${MAX_DIRECTIONS} arrows`);
	const bank = WaveBanks.withCount(WaveBanks.teachingBank(), DIRECTIONS_WAVES);
	expect.equal(directionArrows(bank, 0, [0, -10], out), DIRECTIONS_WAVES, 'every summed wave');
});

test('on the summed teaching bank each normal is square to the height field the surface is written from', () => {
	const bank = WaveBanks.withCount(WaveBanks.teachingBank(), 16);
	const out = new Float64Array(MAX_ARROWS * ARROW_STRIDE);
	const scratch = new Float64Array(7);
	const height = (x, z) => WaveSampler.sample(bank.packed, bank.count, 4.25, x, z, 0, bank.weights, 0, scratch)[1];
	const h = 1e-4;
	normalArrows(bank, 4.25, [-9, 13], out);
	for (let i = 0; i < GRID * GRID; i++) {
		const [bx, by, bz, tx, ty, tz] = arrow(out, i);
		const n = unit([tx - bx, ty - by, tz - bz]);
		const dx = (height(bx + h, bz) - height(bx - h, bz)) / (2 * h);
		const dz = (height(bx, bz + h) - height(bx, bz - h)) / (2 * h);
		const want = unit([-dx, 1, -dz]);
		want.forEach((w, j) => expect.near(n[j], w, 1e-6, `arrow ${i} component ${j}`));
	}
});

test('the central difference on one sine is exactly A k cos(theta) sin(kh)/(kh), and closes on the exact slope as h shrinks', () => {
	const sine = WaveBanks.nextSine(null, { amplitude: 2, wavelength: 30, speed: 5 }, 0).bank;
	const k = (2 * Math.PI) / 30;
	const out = new Float64Array(2);
	for (const h of [0.5, 4, 12]) {
		differenceSlope(sine, 1.5, 3, 7, h, out);
		const exact = 2 * k * Math.cos(k * 7 - k * 5 * 1.5);
		expect.near(out[1], (exact * Math.sin(k * h)) / (k * h), 1e-9, `dz at h ${h}`);
		expect.near(out[0], 0, 1e-12, `dx at h ${h}`);
	}
	const result = { count: 0, meanAngle: 0 };
	const arrows = new Float64Array(MAX_ARROWS * ARROW_STRIDE);
	const angles = [0.01, 0.5, 4, 16].map((h) => slopeArrows(sine, 1.5, [3, 7], h, arrows, result).meanAngle);
	expect.truthy(angles[0] < 1e-3, `h 0.01: ${angles[0]} degrees`);
	expect.truthy(angles[0] < angles[1] && angles[1] < angles[2] && angles[2] < angles[3], `the gap grows with h: ${angles.join(', ')}`);
	expect.equal(result.count, 2 * GRID * GRID, 'an exact and a difference arrow per point');
	expect.equal(arrows[6], COLOURS.NORMAL, 'exact first');
	expect.equal(arrows[ARROW_STRIDE + 6], COLOURS.DIFFERENCE, 'then the difference');
});

// Review Focus 5 (the model's half; the browser's is in overlays.spec.js).
test('the overlays hold at the sliders ends: spread 0 and 1, spacing 0.5 and 16, over the whole bank', () => {
	const out = new Float64Array(MAX_ARROWS * ARROW_STRIDE);
	const result = { count: 0, meanAngle: 0 };
	for (const fan of [0, 1]) {
		const waves = WaveBanks.withCount(WaveBanks.withFan(WaveBanks.teachingBank(), fan), 32);
		const n = directionArrows(waves, 100, [-37, 81], out);
		expect.truthy(Array.from(out.subarray(0, n * ARROW_STRIDE)).every(Number.isFinite), `directions finite at spread ${fan}`);
		for (const h of [0.5, 16]) {
			slopeArrows(waves, 100, [-37, 81], h, out, result);
			expect.truthy(Array.from(out.subarray(0, result.count * ARROW_STRIDE)).every(Number.isFinite), `slopes finite at spread ${fan}, h ${h}`);
			expect.truthy(Number.isFinite(result.meanAngle) && result.meanAngle >= 0 && result.meanAngle < 90, `mean angle ${result.meanAngle}`);
		}
	}
});

test('the readout says the gap and the spacing, live numbers only', () => {
	expect.equal(readoutText({ meanAngle: 3.217, spacing: 4 }), 'On this sea just now, the two arrows differ by 3.2° on average, sampling 4 studs either side.');
	expect.equal(readoutText({ meanAngle: 0.0412, spacing: 0.5 }), 'On this sea just now, the two arrows differ by 0.041° on average, sampling 0.5 studs either side.');
	expect.equal(readoutText({ meanAngle: null, spacing: 4 }), '');
});
