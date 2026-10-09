// How the FFT timing chart reads a measurement (piece C, Task 8; browser-free). A speedup timed in
// a visitor's browser is at the mercy of whatever else the device is doing: under load spikes A3
// read 64x to 1,729x at n = 64 against an operation ratio of 683 (engine/charts.js
// measureTransforms). So a reading is believed only between a quarter of the operation ratio and
// 1.2 times it (an FFT can lose to cache misses and copying, but cannot beat the steps it saves by
// much); one outside is measured once more after a pause, and if that is out too the chart says
// the timing was disturbed and shows the operation ratio instead. The speedup is rounded: "about
// 200x", never a figure the clock cannot back.
export const PLAUSIBLE = Object.freeze({ below: 4, above: 1.2 });

const SUPERSCRIPT = Object.freeze({ '-': '⁻', 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹' });

// n^4 complex multiply-adds for the naive sum over n^2 log2 n for the FFT.
export function operationRatio(result) {
	return result.operations.naive / result.operations.fft;
}

export function isPlausible(result) {
	const ratio = operationRatio(result);
	return result.speedup >= ratio / PLAUSIBLE.below && result.speedup <= ratio * PLAUSIBLE.above;
}

// Two significant figures: 204.8 -> 200, 683 -> 680, 21.3 -> 21.
export function roundSpeedup(speedup) {
	if (speedup < 10) {
		return Math.round(speedup);
	}
	const unit = 10 ** (Math.floor(Math.log10(speedup)) - 1);
	return Math.round(speedup / unit) * unit;
}

/**
 * Times both transforms at grid size n with `measure` (the story's charts.transforms), measuring
 * once more after `pause()` when the first reading is not believable. Resolves to
 * { result, attempts, disturbed: false } for a believable reading, { result: null, disturbed: true,
 * ratio, operations, attempts } when both were out, or null when `stillWanted()` turned false
 * during the pause (a newer grid size has been asked for).
 */
export async function timeTransforms(measure, n, pause, { stillWanted = () => true } = {}) {
	const first = measure(n);
	if (isPlausible(first)) {
		return Object.freeze({ result: first, attempts: 1, disturbed: false });
	}
	await pause();
	if (!stillWanted()) {
		return null;
	}
	const second = measure(n);
	if (isPlausible(second)) {
		return Object.freeze({ result: second, attempts: 2, disturbed: false });
	}
	return Object.freeze({ result: null, attempts: 2, disturbed: true, ratio: operationRatio(second), operations: second.operations });
}

export function formatMs(ms) {
	if (ms >= 10) return `${ms.toFixed(1)} ms`;
	if (ms >= 1) return `${ms.toFixed(2)} ms`;
	return `${ms.toPrecision(2)} ms`;
}

// 3.4e-14 -> "4 × 10⁻¹⁴" (no-break spaces, so it never wraps): the size of a difference to one
// figure, rounded up, so "agree to within" never understates it.
export function formatTiny(value) {
	if (value === 0) {
		return '0';
	}
	let exponent = Math.floor(Math.log10(value));
	let mantissa = Math.ceil(value / 10 ** exponent - 1e-9);
	if (mantissa >= 10) {
		mantissa = 1;
		exponent += 1;
	}
	const power = String(exponent).replace(/[-\d]/g, (c) => SUPERSCRIPT[c]);
	return `${mantissa}\u00a0×\u00a010${power}`;
}

// 16777216 -> "16.8 M steps", short enough to sit beside a bar; smaller counts in full.
export function formatSteps(count) {
	return count >= 1e6 ? `${(count / 1e6).toFixed(1)} M steps` : `${count.toLocaleString('en-US')} steps`;
}

// The longest single naive run the chart will start. engine/charts.js times a naive run this slow
// once and in one go (SINGLE_NAIVE_MS), so it blocks the page for all of it plus the FFT's batches
// (about 10 ms): at 40 ms the task stays near the 50 ms a frame can be held. On Cole's M4 the
// n = 64 run is 28 to 31 ms; at a 4x CPU slowdown it was 128 to 142 ms.
export const MAX_NAIVE_BLOCK_MS = 40;
// Below this grid a timing is too short to scale up by (64 / n)^4 with any trust.
const MIN_JUDGING_N = 16;

// The naive sum is n^4 multiply-adds, so a run at `n` costs (n / timed.n)^4 times the timed one.
export function predictNaiveMs(timed, n) {
	return timed.naiveMs * (n / timed.n) ** 4;
}

// The judge for bigger grids: the fastest believable timing seen (at 16 or more), compared per step
// of the naive sum, since load only ever slows a reading down. `timed` may be null.
export function fasterJudge(judge, timed) {
	if (!timed || timed.n < MIN_JUDGING_N) {
		return judge;
	}
	const perStep = (t) => t.naiveMs / t.n ** 4;
	return judge === null || perStep(timed) < perStep(judge) ? timed : judge;
}

// Whether a grid of `n` would freeze the page, judged from an earlier timing (a measureTransforms
// result): true or false, or null when there is nothing to judge from yet.
export function tooSlowToTime(n, timed) {
	if (!timed || timed.n < MIN_JUDGING_N) {
		return null;
	}
	return n > timed.n && predictNaiveMs(timed, n) > MAX_NAIVE_BLOCK_MS;
}
