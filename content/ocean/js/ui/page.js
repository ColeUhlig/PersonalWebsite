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
import { mountCharts } from './charts.js';
import { mountFootage, mountLiveNumbers, mountMotionButton, mountPlayButton, mountRenderToggle, showLiveStarting, showLiveUnavailable } from './finale.js';
import { mountProofPanelWhenNear } from './proofLazy.js';
import { mountTilt } from './tilt.js';
import { mountMathBox } from './mathBox.js';
import { mountOverlayReadout } from './overlayReadout.js';
import { mountFrequencyCharts } from './frequencyCharts.js';
import { mountInsets } from './insets.js';
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
	// the many-waves step's wave count also shows a live timing of its sum (ui/liveTiming.js).
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
					mountLiveTiming({ control: timed, story: handle.story, ocean: handle.ocean, watchReading: (listener) => story.onChange(listener) });
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
	// Task 8: the charts for steps 16 to 19, once the ocean runs in story mode. A chart that changes
	// height (its first drawing, a new timing) re-measures the story's panels.
	features.push({
		attachOcean(handle) {
			if (handle.story) {
				// window.__charts: a test hook that swaps the timing for a stand-in (charts.spec.js).
				window.__charts = mountCharts(handle.story, { onLayout: () => story.relayout() }).hooks;
			}
		},
	});
	// Task 9: the finale. Play, footage and the proof panel need no ocean; the live numbers, the
	// render toggle and the motion button do. Until the ocean runs, the live block says it is
	// starting; without one it says there is nothing to measure. The proof panel is embedded: the
	// finale's block gives it its heading, introduction and glass.
	finalePart('Play button', () => mountPlayButton(document.getElementById('play')));
	finalePart('footage', () => {
		mountFootage(document.getElementById('footage'), { onShown: () => story.relayout() }).catch((error) => {
			console.error("[ocean] the finale's footage could not be shown", error);
		});
	});
	finalePart('proof panel', () => {
		window.__proof = mountProofPanelWhenNear(document.getElementById('proof'), { panelDeps: { embedded: true } });
	});
	finalePart('live numbers', () => showLiveStarting(document.getElementById('live')));
	features.push({
		attachOcean(handle) {
			mountLiveNumbers(document.getElementById('live'), handle, { paused: () => !clock.playing() });
			mountRenderToggle(document.querySelector('[data-render-mode]'), handle);
			mountMotionButton(document.getElementById('motion'), clock);
		},
		oceanUnavailable() {
			showLiveUnavailable(document.getElementById('live'));
		},
	});
	// Task 9b: on a touch-first phone, tilting it swings the camera a little round the current shot
	// (ui/tilt.js), once the ocean runs in story mode. Where the browser needs a tap for motion access
	// (iOS) a button over the ocean asks. window.__tilt: a test hook (tilt.spec.js).
	features.push({
		attachOcean(handle) {
			if (handle.story) {
				window.__tilt = mountTilt({ button: document.getElementById('tilt'), story: handle.story });
			}
		},
	});
	// C2 (spec 10.3): the math box, which needs no ocean: it follows the scroll story from the start.
	try {
		window.__mathbox = mountMathBox({ root: document.getElementById('mathbox'), watchReading: (listener) => story.onChange(listener), reducedMotion }).hooks;
	} catch (error) {
		console.error('[ocean] the math box could not start', error);
	}
	// C2 (spec 10.7): step 9's readout, steps 14 and 15's charts and the texture insets, once the
	// ocean runs in story mode. Each is its own feature, so one that throws never stops the others.
	features.push({
		attachOcean(handle) {
			if (handle.story) {
				window.__overlayReadout = mountOverlayReadout({ handle, watchReading: (listener) => story.onChange(listener) }).hooks;
			}
		},
	});
	features.push({
		attachOcean(handle) {
			if (handle.story) {
				window.__frequency = mountFrequencyCharts({ story: handle.story, ocean: handle.ocean, onLayout: () => story.relayout() }).hooks;
			}
		},
	});
	features.push({
		attachOcean(handle) {
			if (handle.story) {
				window.__insets = mountInsets({ handle, watchReading: (listener) => story.onChange(listener), onLayout: () => story.relayout() }).hooks;
			}
		},
	});
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

// One of the finale's parts that needs no ocean, started on its own: one that throws is logged and
// the rest still start.
function finalePart(name, start) {
	try {
		start();
	} catch (error) {
		console.error(`[ocean] the finale's ${name} could not start`, error);
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
