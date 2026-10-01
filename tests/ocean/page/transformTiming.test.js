// The FFT timing chart's reading of a measurement (piece C, Task 8; the A3 T6 ruling): a rounded
// speedup, one re-measure when it lands outside [operation ratio / 4, operation ratio x 1.2], and the
// operation ratio instead when both readings are out.
import { test } from 'node:test';
import * as expect from '../expect.js';
import { formatMs, formatSteps, formatTiny, isPlausible, MAX_NAIVE_BLOCK_MS, operationRatio, PLAUSIBLE, predictNaiveMs, roundSpeedup, timeTransforms, tooSlowToTime } from '../../../content/ocean/js/page/transformTiming.js';

// A measureTransforms result at grid size n with the given speedup.
function reading(n, speedup) {
	const cells = n * n;
	return Object.freeze({ n, naiveMs: speedup * 0.01, fftMs: 0.01, speedup, operations: { naive: cells * cells, fft: cells * Math.log2(n) }, maxDifference: 1e-14, batches: { naive: 3, fft: 3 } });
}

test('the operation ratio is n^4 over n^2 log2 n', () => {
	expect.near(operationRatio(reading(32, 1)), 204.8, 1e-9, 'n = 32');
	expect.near(operationRatio(reading(64, 1)), 4096 / 6, 1e-9, 'n = 64');
	expect.near(operationRatio(reading(8, 1)), 64 / 3, 1e-9, 'n = 8');
});

test('a speedup is believable from a quarter of the operation ratio to 1.2 times it', () => {
	expect.equal(PLAUSIBLE.below, 4, 'below');
	expect.equal(PLAUSIBLE.above, 1.2, 'above');
	const ratio = 204.8;
	expect.truthy(isPlausible(reading(32, ratio / 4)), 'the bottom edge');
	expect.truthy(isPlausible(reading(32, ratio * 1.2)), 'the top edge');
	expect.truthy(isPlausible(reading(32, 150)), 'inside');
	expect.truthy(!isPlausible(reading(32, ratio / 4 - 0.01)), 'too slow an FFT');
	expect.truthy(!isPlausible(reading(32, ratio * 1.2 + 0.01)), 'faster than the operations allow');
	expect.truthy(!isPlausible(reading(32, Number.NaN)), 'not a number');
	expect.truthy(!isPlausible(reading(32, Number.POSITIVE_INFINITY)), 'an FFT that took no time');
});

test('the speedup is rounded to two significant figures', () => {
	expect.equal(roundSpeedup(3.4), 3, 'small');
	expect.equal(roundSpeedup(9.6), 10, 'rounds up into two figures');
	expect.equal(roundSpeedup(21.33), 21, 'n = 8');
	expect.equal(roundSpeedup(64), 64, 'n = 16');
	expect.equal(roundSpeedup(204.8), 200, 'n = 32');
	expect.equal(roundSpeedup(683), 680, 'n = 64');
	expect.equal(roundSpeedup(1729), 1700, 'thousands');
});

test('a believable first reading is kept and measured once', async () => {
	const calls = [];
	let pauses = 0;
	const verdict = await timeTransforms((n) => {
		calls.push(n);
		return reading(n, 180);
	}, 32, async () => {
		pauses += 1;
	});
	expect.equal(calls.join(','), '32', 'one measurement');
	expect.equal(pauses, 0, 'no pause');
	expect.equal(verdict.disturbed, false, 'not disturbed');
	expect.equal(verdict.result.speedup, 180, 'the reading');
	expect.equal(verdict.attempts, 1, 'attempts');
});

test('an unbelievable first reading is measured once more, after a pause', async () => {
	const order = [];
	const readings = [reading(64, 1729), reading(64, 600)];
	const verdict = await timeTransforms((n) => {
		order.push(`measure ${n}`);
		return readings.shift();
	}, 64, async () => {
		order.push('pause');
	});
	expect.equal(order.join(', '), 'measure 64, pause, measure 64', 'order');
	expect.equal(verdict.disturbed, false, 'the second reading holds');
	expect.equal(verdict.result.speedup, 600, 'the second reading');
	expect.equal(verdict.attempts, 2, 'attempts');
});

test('two unbelievable readings give the operation ratio instead', async () => {
	const readings = [reading(64, 64), reading(64, 1729)];
	const verdict = await timeTransforms(() => readings.shift(), 64, async () => {});
	expect.equal(verdict.disturbed, true, 'disturbed');
	expect.equal(verdict.result, null, 'no timing is offered as fact');
	expect.near(verdict.ratio, 4096 / 6, 1e-9, 'the operation ratio');
	expect.equal(verdict.operations.naive, 64 ** 4, 'the naive operations');
	expect.equal(verdict.attempts, 2, 'attempts');
});

test('a measurement nobody wants any more stops after the pause', async () => {
	let calls = 0;
	const verdict = await timeTransforms(() => {
		calls += 1;
		return reading(16, 1);
	}, 16, async () => {}, { stillWanted: () => false });
	expect.equal(calls, 1, 'no second measurement');
	expect.equal(verdict, null, 'nothing to show');
});

test('times and tiny differences read as plain numbers', () => {
	expect.equal(formatMs(28.04), '28.0 ms', 'tens');
	expect.equal(formatMs(1.234), '1.23 ms', 'ones');
	expect.equal(formatMs(0.0614), '0.061 ms', 'fractions');
	expect.equal(formatMs(0.00213), '0.0021 ms', 'small fractions');
	// Rounded up, so "agree to within" never understates the difference.
	expect.equal(formatTiny(3.4e-14), '4\u00a0×\u00a010⁻¹⁴', 'a rounding difference, rounded up, kept on one line');
	expect.equal(formatTiny(1.2e-15), '2\u00a0×\u00a010⁻¹⁵', 'smaller');
	expect.equal(formatTiny(3e-14), '3\u00a0×\u00a010⁻¹⁴', 'exactly three');
	expect.equal(formatTiny(9.5e-14), '1\u00a0×\u00a010⁻¹³', 'up into the next power');
	expect.equal(formatTiny(0), '0', 'exactly the same');
});

test('step counts read short enough to sit beside a bar', () => {
	expect.equal(formatSteps(16777216), '16.8 M steps', 'millions');
	expect.equal(formatSteps(24576), '24,576 steps', 'thousands');
	expect.equal(formatSteps(192), '192 steps', 'hundreds');
});

// A device too slow for n = 64 is found from a smaller timing: the naive sum is n^4, so 64 costs
// 16 times 32's. Its single run would block the page for longer than MAX_NAIVE_BLOCK_MS.
test("a grid size is too slow to time when the naive sum's predicted run would freeze the page", () => {
	expect.equal(MAX_NAIVE_BLOCK_MS, 40, 'the limit');
	const timed = (n, naiveMs) => ({ n, naiveMs });
	expect.near(predictNaiveMs(timed(32, 1.85), 64), 29.6, 1e-9, 'an M4: 1.85 ms at 32');
	expect.equal(tooSlowToTime(64, timed(32, 1.85)), false, 'an M4 times 64');
	expect.equal(tooSlowToTime(64, timed(32, 7.4)), true, 'a CPU four times slower does not');
	expect.equal(tooSlowToTime(64, timed(16, 0.5)), true, 'judged from 16 as well (0.5 x 256 = 128 ms)');
	expect.equal(tooSlowToTime(32, timed(32, 7.4)), false, 'the size already timed is never too slow');
	expect.equal(tooSlowToTime(64, timed(8, 0.05)), null, 'too small a grid to judge from');
	expect.equal(tooSlowToTime(64, null), null, 'nothing timed yet');
});
