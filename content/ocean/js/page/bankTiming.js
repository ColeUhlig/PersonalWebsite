// The live timing beside step 3's wave-count slider (piece C, Task 6; browser-free): how long the
// engine's own Gerstner sampler (core/waveSampler.js, the per-vertex sum the teaching steps' surface
// write runs) takes to sum a teaching bank at every point of the tier's real layout, measured in
// the visitor's browser. It reports the median of RUNS runs and never holds the thread for long:
// each run is cut into slices of about SLICE_MS, it yields between them (`pause`), and a run's time
// is the sum of its slices, so the yields are not counted. A newer measurement supersedes an older
// one (`cancelled`), which then stops and gives null.
import * as WaveSampler from '../core/waveSampler.js';

export const RUNS = 5;
export const SLICE_MS = 8;
// Points summed between looks at the clock: few enough that a slice overruns SLICE_MS by little.
export const CHECK_EVERY = 64;

const yieldToBrowser = () => new Promise((resolve) => setTimeout(resolve, 0));

// Every vertex of the layout (core/ringLayout.js) as x, z pairs: the patch's place in its ring
// plus the vertex's offset, as the surface write reads them with the windows at the origin.
export function latticePoints(layout) {
	const points = new Float64Array(2 * layout.vertexCount);
	let o = 0;
	for (const patch of layout.patches) {
		for (let i = 0; i < patch.localX.length; i++) {
			points[o++] = patch.centreX + patch.localX[i];
			points[o++] = patch.centreZ + patch.localZ[i];
		}
	}
	return points;
}

export function median(values) {
	const sorted = [...values].sort((a, b) => a - b);
	const middle = sorted.length >> 1;
	return sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

/**
 * @param {object} options
 * @param {Float64Array} options.points x, z pairs (latticePoints)
 * @param {{ packed: Float64Array, count: number, weights: Float64Array }} options.bank the waves summed
 * @param {number} [options.chop] the lateral term (the cost does not depend on it)
 * @param {number} [options.t] the time summed at
 * @param {() => number} [options.now] ms
 * @param {() => Promise<void>} [options.pause] yields to the browser between slices
 * @param {() => boolean} [options.cancelled] true once a newer measurement has started
 * @param {(x: number, z: number) => void} [options.sampleAt] the work per point (tests replace it)
 * @returns {Promise<{ medianMs: number, runs: number[], longestSliceMs: number } | null>}
 */
export async function measureBankSum({
	points,
	bank,
	chop = 0,
	t = 0,
	now = () => performance.now(),
	pause = yieldToBrowser,
	cancelled = () => false,
	sampleAt,
}) {
	const out = new Float64Array(7);
	const sample = sampleAt ?? ((x, z) => WaveSampler.sample(bank.packed, bank.count, t, x, z, chop, bank.weights, 0, out));
	const total = points.length >> 1;
	const runs = [];
	let longestSliceMs = 0;
	for (let run = 0; run < RUNS; run++) {
		let runMs = 0;
		let next = 0;
		while (next < total) {
			await pause();
			if (cancelled()) {
				return null;
			}
			const start = now();
			let elapsed = 0;
			while (next < total && elapsed < SLICE_MS) {
				const end = Math.min(next + CHECK_EVERY, total);
				for (; next < end; next++) {
					sample(points[2 * next], points[2 * next + 1]);
				}
				elapsed = now() - start;
			}
			runMs += elapsed;
			longestSliceMs = Math.max(longestSliceMs, elapsed);
		}
		runs.push(runMs);
	}
	return Object.freeze({ medianMs: median(runs), runs: Object.freeze(runs), longestSliceMs });
}
