// The ocean page's entry module (piece C). Everything it imports statically is local and free of
// three, GSAP and KaTeX (tests/ocean/page/bootGraph.test.js checks), so the text, the story and the
// notice work even when a CDN script never arrives. It reads the config and the dev route, starts
// the page's features, checks WebGL, and only then loads the live ocean with a dynamic import.
import { readConfig } from './engine/config.js';
import { createPlayClock } from './engine/playClock.js';
import { parseStageRoute } from './stages/route.js';
import { recipeFor } from './stages/recipes.js';
import { clampKnobsToSliders } from './page/knobs.js';
import { NOTICES } from './page/notices.js';
import { webglSupported } from './webgl.js';
import { showNotice } from './ui/notice.js';
import { startPage } from './ui/page.js';

// The story opens on the deck camera, the view matched against Studio, unless the URL names one.
// The dev route (?step=N) keeps readConfig's own default.
function searchFor(search, route) {
	const query = new URLSearchParams(search);
	if (!route && !query.has('cam')) {
		query.set('cam', 'deck');
	}
	return query;
}

const route = parseStageRoute(location.search);
const read = readConfig(searchFor(location.search, route));
// In the story, knobs a slider owns stay inside that slider's range (page/knobs.js).
const clamped = route ? { config: read, warnings: [] } : clampKnobsToSliders(read, recipeFor);
const config = clamped.config;
for (const warning of [...read.warnings, ...clamped.warnings, ...(route?.warnings ?? [])]) {
	console.warn(`[ocean] ${warning}`);
}
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const clock = createPlayClock(() => performance.now() / 1000, { playing: !reducedMotion });
const page = startPage({ route, reducedMotion, clock });

async function startLiveOcean() {
	let startOcean;
	try {
		({ startOcean } = await import('./main.js'));
	} catch (error) {
		// three (or another module of the ocean) did not arrive: the story carries on without it.
		console.warn('[ocean] the live ocean could not load', error);
		showNotice(NOTICES.load);
		page.oceanUnavailable('load');
		return;
	}
	let handle;
	try {
		handle = startOcean({
			config,
			route,
			now: clock.now,
			paused: () => !clock.playing(),
			reducedMotion,
			onPersistentError: () => showNotice(NOTICES.frames),
		});
	} catch (error) {
		// The probe can pass and the renderer's own context still fail (a lost GPU process, a
		// blocklist that applies to the second context): say so instead of leaving a blank page.
		console.error('[ocean] could not start', error);
		showNotice(NOTICES.webgl);
		page.oceanUnavailable('start');
		return;
	}
	// Outside the try: a page feature's fault is not the ocean failing to start (the page tells
	// each feature on its own and logs any that throw).
	page.attachOcean(handle);
}

if (webglSupported()) {
	startLiveOcean();
} else {
	showNotice(NOTICES.webgl);
	page.oceanUnavailable('webgl');
}
