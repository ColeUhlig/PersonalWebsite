// The page around the live ocean (piece C): the scroll story, the panels' controls, the maths, the
// charts and the finale are features composed here. Each feature starts when the page does (none of
// them needs the ocean to show its text) and may take the ocean's handle once it runs
// (attachOcean) or learn that it will not (oceanUnavailable: 'webgl', 'load' or 'start').
// body[data-ocean] is 'loading', 'running' or 'unavailable', for the stylesheet and the tests.
// Feature imports (each later task adds its import directly above the next line).
import { startStory } from './story.js';
// Feature imports end.

export function startPage({ route, reducedMotion, clock }) {
	const features = [];
	const context = Object.freeze({ route, reducedMotion, clock });
	// Features (each later task adds its lines directly above the next line, so they run in task order).
	// Task 4: the scroll story. In story mode the ocean's stage follows every reading.
	const story = startStory({ reducedMotion });
	window.__page = Object.freeze({ reading: () => story.reading(), scrollEngine: () => story.engine() });
	features.push({
		attachOcean(handle) {
			if (handle.story) {
				story.onChange((reading) => handle.story.setScroll(reading));
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
