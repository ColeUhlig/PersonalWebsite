// The live timing beside step 3's wave-count slider (piece C, Task 6): how long the engine's
// Gerstner sampler takes to sum the slider's waves at every point of this tier, measured in the
// visitor's browser just now (page/bankTiming.js). It runs off the frame: once when the panel's
// controls are built and again a moment after the slider stops moving, sliced so no stretch of it
// holds the thread for long, and a newer measurement drops an older one. It is a live number, so
// its element is marked data-copy-skip="live" and is empty in the served page. It compares itself
// with nothing: not with Roblox, not with a frame budget.
import * as WaveBanks from '../engine/waveBanks.js';
import { recipeFor } from '../stages/recipes.js';
import { latticePoints, measureBankSum } from '../page/bankTiming.js';

export const TIMING_STEP = 3;
export const TIMING_SLIDER = 'waveCount';
// Live numbers change at most twice a second (the page's performance rule): a measurement starts only
// once the slider has rested this long.
const SETTLE_MS = 500;

function formatMs(ms) {
	const digits = ms < 1 ? 2 : ms < 10 ? 1 : 0;
	return ms.toFixed(digits);
}

export function timingText(count, points, ms) {
	return `${count} wave${count === 1 ? '' : 's'} over ${points.toLocaleString('en-US')} points: ${formatMs(ms)} ms in your browser just now`;
}

/**
 * @param {{ control: HTMLElement, story: { sliders: (step: number) => object[] }, ocean: { layout: object } }} options
 *   the wave-count control's element, the story stage, and the running ocean (for its layout)
 */
export function mountLiveTiming({ control, story, ocean }) {
	const output = document.createElement('p');
	output.className = 'control-timing';
	output.dataset.copySkip = 'live';
	output.setAttribute('aria-live', 'polite');
	control.append(output);
	const points = latticePoints(ocean.layout);
	const bank = WaveBanks.teachingBank();
	const chop = recipeFor(TIMING_STEP).engine.chop;
	let generation = 0;
	let timer = null;

	async function measure() {
		const mine = ++generation;
		const count = story.sliders(TIMING_STEP).find((s) => s.id === TIMING_SLIDER).value;
		try {
			const result = await measureBankSum({ points, bank: WaveBanks.withCount(bank, count), chop, cancelled: () => mine !== generation });
			if (result && mine === generation) {
				output.textContent = timingText(count, ocean.layout.vertexCount, result.medianMs);
				output.dataset.longestSlice = result.longestSliceMs.toFixed(2);
			}
		} catch (error) {
			console.error('[ocean] the live timing failed', error);
		}
	}

	function schedule() {
		clearTimeout(timer);
		// A drag in progress makes any running measurement stale at once.
		generation += 1;
		timer = setTimeout(measure, SETTLE_MS);
	}

	document.addEventListener('ocean:slider', (event) => {
		if (event.detail.step === TIMING_STEP && event.detail.id === TIMING_SLIDER) {
			schedule();
		}
	});
	schedule();
}
