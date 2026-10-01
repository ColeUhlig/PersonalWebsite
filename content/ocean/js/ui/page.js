// The page around the live ocean (piece C): the scroll story, the panels' controls, the maths, the
// charts and the finale are features composed here. Each feature starts when the page does (none of
// them needs the ocean to show its text) and may take the ocean's handle once it runs
// (attachOcean) or learn that it will not (oceanUnavailable: 'webgl', 'load' or 'start').
// body[data-ocean] is 'loading', 'running' or 'unavailable', for the stylesheet and the tests.
// Feature imports (each later task adds its import directly above the next line).
import { inertStory, startStory } from './story.js';
import { mountControls } from './controls.js';
import { mountLiveTiming, TIMING_SLIDER, TIMING_STEP } from './liveTiming.js';
import { startMath } from './math.js';
// Feature imports end.

export function startPage({ route, reducedMotion, clock }) {
	const features = [];
	const context = Object.freeze({ route, reducedMotion, clock });
	// Features (each later task adds its lines directly above the next line, so they run in task order).
	// Task 4: the scroll story. In story mode the ocean's stage follows every reading.
	// A story that cannot start (no ResizeObserver, a DOM it did not expect) is logged and replaced by
	// an inert one that stays at the opening, so the ocean and the other features still start.
	const story = startSafely(() => startStory({ reducedMotion }));
	window.__page = Object.freeze({ reading: () => story.reading(), scrollEngine: () => story.engine() });
	features.push({
		attachOcean(handle) {
			if (handle.story) {
				story.onChange((reading) => handle.story.setScroll(reading));
			}
		},
	});
	// Task 6: the panels' controls, once the ocean runs in story mode. Each sets its own panel's step;
	// step 3's wave count also shows a live timing of its sum (ui/liveTiming.js).
	features.push({
		attachOcean(handle) {
			if (!handle.story) {
				return;
			}
			for (const root of document.querySelectorAll('.controls[data-controls]')) {
				const step = Number(root.dataset.controls);
				mountControls({
					root,
					step,
					story: handle.story,
					onChange: (detail) => document.dispatchEvent(new CustomEvent('ocean:slider', { detail })),
				});
				const timed = step === TIMING_STEP ? root.querySelector(`[data-slider="${TIMING_SLIDER}"]`) : null;
				if (timed) {
					mountLiveTiming({ control: timed, story: handle.story, ocean: handle.ocean });
				}
			}
			story.relayout();
		},
	});
	// Task 7: "The math" lines, typeset the first time one is opened.
	try {
		startMath({ onRendered: () => story.relayout() });
	} catch (error) {
		console.error('[ocean] the math lines could not start', error);
	}
	// Features end.
	document.body.dataset.ocean = 'loading';
	return Object.freeze({
		context,
		attachOcean(handle) {
			document.body.dataset.ocean = 'running';
			tellFeatures(features, 'attachOcean', handle);
		},
		oceanUnavailable(reason) {
			document.body.dataset.ocean = 'unavailable';
			document.body.dataset.oceanReason = reason;
			tellFeatures(features, 'oceanUnavailable', reason);
		},
	});
}

function startSafely(start) {
	try {
		return start();
	} catch (error) {
		console.error('[ocean] the scroll story could not start', error);
		return inertStory();
	}
}

// Each feature is told on its own: one that throws is logged and the rest are still told, so a
// feature's fault never reads as the ocean failing.
function tellFeatures(features, method, value) {
	for (const feature of features) {
		try {
			feature[method]?.(value);
		} catch (error) {
			console.error(`[ocean] a page feature failed in ${method}`, error);
		}
	}
}
