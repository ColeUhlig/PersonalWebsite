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

// 3.4e-14 -> "3 × 10⁻¹⁴" (no-break spaces, so it never wraps): the size of a rounding difference,
// to one figure.
export function formatTiny(value) {
	if (value === 0) {
		return '0';
	}
	const [mantissa, exponent] = value.toExponential(0).split('e');
	const power = String(Number(exponent)).replace(/[-\d]/g, (c) => SUPERSCRIPT[c]);
	return `${mantissa}\u00a0×\u00a010${power}`;
}
