// The live bank timing's unit tests (piece C, Task 6): the tier's real points, the median of a few
// runs, the slices that keep any one stretch of work short, and a measurement that stops when it is
// superseded.
import { test } from 'node:test';
import * as expect from '../expect.js';
import * as RingLayout from '../../../content/ocean/js/core/ringLayout.js';
import * as Tier from '../../../content/ocean/js/core/tier.js';
import { CHECK_EVERY, latticePoints, measureBankSum, median, RUNS, SLICE_MS } from '../../../content/ocean/js/page/bankTiming.js';
import * as WaveBanks from '../../../content/ocean/js/engine/waveBanks.js';

test("the points are every vertex of the tier's layout, at its patch's place", () => {
	const { rings, patchCells, textureTile } = Tier.presets.High;
	const layout = RingLayout.build({ rings, patchCells, textureTile });
	const points = latticePoints(layout);
	expect.equal(points.length, 2 * layout.vertexCount, 'x and z for every vertex');
	expect.equal(layout.vertexCount, 18144, 'the High tier');
	const first = layout.patches[0];
	expect.equal(points[0], first.centreX + first.localX[0], 'x');
	expect.equal(points[1], first.centreZ + first.localZ[0], 'z');
});

test('the median of an odd and an even count', () => {
	expect.equal(median([5, 1, 3]), 3, 'odd');
	expect.equal(median([4, 1, 3, 2]), 2.5, 'even');
});

// A clock that moves only when the sampler runs: each point summed costs `perPoint` ms.
function fakeClock(perPoint) {
	let ms = 0;
	return {
		now: () => ms,
		sample: () => {
			ms += perPoint;
		},
	};
}

test('it sums every point once a run, in slices no longer than asked, and reports the median run', async () => {
	const points = new Float64Array(2 * 1000);
	const clock = fakeClock(0.05); // 50 ms a run of 1000 points
	let summed = 0;
	let pauses = 0;
	const result = await measureBankSum({
		points,
		bank: WaveBanks.withCount(WaveBanks.teachingBank(), 8),
		now: clock.now,
		pause: async () => {
			pauses += 1;
		},
		sampleAt: () => {
			summed += 1;
			clock.sample();
		},
	});
	expect.equal(summed, 1000 * RUNS, 'every point, every run');
	expect.equal(result.runs.length, RUNS, 'runs');
	expect.near(result.medianMs, 50, 1e-6, 'the median run');
	expect.truthy(result.longestSliceMs <= SLICE_MS + CHECK_EVERY * 0.05 + 1e-9, `slices stay short: ${result.longestSliceMs}`);
	expect.truthy(pauses >= RUNS * 4, `it yields between slices: ${pauses}`);
});

test('a measurement superseded part way gives null and stops summing', async () => {
	const clock = fakeClock(0.05);
	let summed = 0;
	let stop = false;
	const result = await measureBankSum({
		points: new Float64Array(2 * 1000),
		bank: WaveBanks.withCount(WaveBanks.teachingBank(), 8),
		now: clock.now,
		pause: async () => {
			stop = summed > 300;
		},
		cancelled: () => stop,
		sampleAt: () => {
			summed += 1;
			clock.sample();
		},
	});
	expect.equal(result, null, 'no result');
	expect.truthy(summed < 1000, `stopped early: ${summed}`);
});

test("by default it runs the engine's own Gerstner sampler over the points", async () => {
	const bank = WaveBanks.withCount(WaveBanks.teachingBank(), 4);
	const result = await measureBankSum({ points: Float64Array.of(0, 0, 10, 20), bank, pause: async () => {} });
	expect.equal(result.runs.length, RUNS, 'runs');
	expect.truthy(result.medianMs >= 0 && Number.isFinite(result.medianMs), `a time: ${result.medianMs}`);
});
