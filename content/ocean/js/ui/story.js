// The scroll story (piece C; spec 2 and 4.1 "story.js: GSAP ScrollTrigger -> active step and
// progress within it"). A passive native scroll listener follows the page from the start; when GSAP
// arrives, a ScrollTrigger over the whole page takes over (the native listener is removed), calling
// update() as the page scrolls and relayout() when it refreshes. So GSAP that never arrives, or a
// request for it that never answers, leaves the story on the native listener rather than dead. A
// ResizeObserver on the story re-measures when the page's own content changes height (a maths line
// opened, the footage appearing), or a window resize does where there is no ResizeObserver.
// update() reads the scroll through page/scrollMap.js and tells its listeners. Positions come from
// the step sections' real boxes, measured again on every relayout, so nothing here assumes a panel
// or section height; progress is through the section, not the panel. Each sticky panel's top comes
// from its own height, so one taller than the view sticks with its bottom in view.
import { NARROW_QUERY, readScroll, readingLine, stickyTop } from '../page/scrollMap.js';

const OPENING = Object.freeze({ phase: 'opening', step: 1, progress: 0 });

export async function loadScrollTrigger() {
	const [{ gsap }, { ScrollTrigger }] = await Promise.all([import('gsap'), import('gsap/ScrollTrigger')]);
	gsap.registerPlugin(ScrollTrigger);
	return { gsap, ScrollTrigger };
}

export function startStory({ reducedMotion = false, load = loadScrollTrigger } = {}) {
	const story = document.getElementById('story');
	const sections = [...document.querySelectorAll('section.step[data-step]')];
	const panels = sections.map((section) => section.querySelector('.panel')).filter(Boolean);
	const narrow = window.matchMedia(NARROW_QUERY);
	const listeners = new Set();
	const failed = new WeakSet();
	let measured = [];
	let reading = OPENING;
	let engine = 'native';
	let scrollTrigger = null;
	let queuedLayout = null;
	let queuedScroll = false;
	// True from ScrollTrigger's 'refreshInit' to its 'refresh' (see update()).
	let refreshing = false;

	function measure() {
		measured = sections.map((section) => {
			const rect = section.getBoundingClientRect();
			return { step: Number(section.dataset.step), top: rect.top + window.scrollY, height: rect.height };
		});
	}

	// A sticky panel taller than the view would stick with its bottom off screen; give each one a
	// top from its real height instead (inline, so style.css keeps the 10vh default). Panels the
	// stylesheet leaves static (narrow screens, the finale) lose any top set earlier. Every panel is
	// read before any is written, so the layout is worked out once.
	function pinPanels() {
		const tops = panels.map((panel) => (window.getComputedStyle(panel).position === 'sticky' ? stickyTop(panel.getBoundingClientRect().height) : null));
		panels.forEach((panel, i) => {
			if (tops[i] === null) {
				panel.style.removeProperty('top');
			} else {
				panel.style.top = tops[i];
			}
		});
	}

	function mark() {
		for (const section of sections) {
			section.classList.toggle('is-active', reading.phase === 'step' && Number(section.dataset.step) === reading.step);
		}
		document.body.dataset.phase = reading.phase;
	}

	function update() {
		// ScrollTrigger scrolls the page to the top while it refreshes, to measure: a reading taken
		// then is not where the visitor is (it would read as the opening and cut the camera), so it
		// waits for the refresh to finish (followWithGsap reads again on 'refresh').
		if (refreshing) {
			return;
		}
		const next = readScroll(measured, window.scrollY + readingLine(window.innerHeight, narrow.matches));
		const same = next.phase === reading.phase && next.step === reading.step;
		if (same && Math.abs(next.progress - reading.progress) < 1e-4) {
			return;
		}
		reading = Object.freeze(next);
		if (!same) {
			mark();
		}
		for (const listener of listeners) {
			tell(listener);
		}
	}

	// A listener that throws is logged once and skipped for that reading: it must not stop the
	// other listeners, and it must not escape into ScrollTrigger's tick or the scroll handler.
	function tell(listener) {
		try {
			listener(reading);
		} catch (error) {
			if (!failed.has(listener)) {
				failed.add(listener);
				console.error('[ocean] a scroll story listener failed', error);
			}
		}
	}

	function relayout() {
		pinPanels();
		measure();
		update();
	}

	// Every re-measure a frame asks for (the observer, a resize) is done once, in the next frame. With
	// ScrollTrigger running, a change to the story's height refreshes it, and its onRefresh does the
	// relayout; anything else (a panel alone changing height) only needs the relayout.
	function scheduleLayout({ refresh = false } = {}) {
		if (queuedLayout !== null) {
			queuedLayout.refresh ||= refresh;
			return;
		}
		queuedLayout = { refresh };
		window.requestAnimationFrame(() => {
			const wanted = queuedLayout;
			queuedLayout = null;
			try {
				if (wanted.refresh && scrollTrigger) {
					scrollTrigger.refresh();
				} else {
					relayout();
				}
			} catch (error) {
				console.error('[ocean] the scroll story could not measure the page', error);
			}
		});
	}

	function onScroll() {
		if (queuedScroll) return;
		queuedScroll = true;
		window.requestAnimationFrame(() => {
			queuedScroll = false;
			update();
		});
	}
	const onResize = () => scheduleLayout({ refresh: true });

	pinPanels();
	measure();
	mark();
	update();
	// The native listener follows the page at once; GSAP takes over only once it has started.
	window.addEventListener('scroll', onScroll, { passive: true });
	window.addEventListener('resize', onResize);
	// The story changing height moves every section below the change; a panel changing height
	// (inside a section that does not grow) changes only its sticky top. Without a ResizeObserver a
	// window resize is the only re-measure, so its listener stays.
	const observed = typeof ResizeObserver === 'function';
	if (observed) {
		const observer = new ResizeObserver((entries) => {
			scheduleLayout({ refresh: entries.some((entry) => entry.target === story) });
		});
		observer.observe(story);
		for (const panel of panels) {
			observer.observe(panel);
		}
	}

	function endRefresh() {
		if (refreshing) {
			refreshing = false;
			update();
		}
	}

	function followWithGsap({ gsap, ScrollTrigger }) {
		// The whole page, 0 to the last scroll position, as the native listener reads it, so the
		// reading keeps moving past the story's end (the footer).
		ScrollTrigger.create({ trigger: document.documentElement, start: 0, end: 'max', onUpdate: update, onRefresh: relayout });
		// A refresh is synchronous, so the flag is down again before the next frame unless the
		// refresh threw before its 'refresh' event; then the next frame lowers it, so the story can
		// never stop reading.
		ScrollTrigger.addEventListener('refreshInit', () => {
			refreshing = true;
			window.requestAnimationFrame(endRefresh);
		});
		ScrollTrigger.addEventListener('refresh', endRefresh);
		scrollTrigger = ScrollTrigger;
		engine = 'gsap';
		window.removeEventListener('scroll', onScroll);
		if (observed) {
			// ScrollTrigger refreshes itself on a resize, and its onRefresh re-measures.
			window.removeEventListener('resize', onResize);
		}
		const cue = document.querySelector('#opening .cue');
		if (cue && !reducedMotion) {
			gsap.to(cue, { autoAlpha: 0, ease: 'none', scrollTrigger: { trigger: '#opening', start: 'top top', end: 'bottom 60%', scrub: true } });
		}
	}

	// Loading GSAP, or starting it, failing leaves the native listener following the page. A throw
	// after the hand-over (the cue's fade) is only logged: ScrollTrigger is already reading.
	load()
		.then(followWithGsap)
		.catch((error) => {
			if (engine === 'gsap') {
				console.error('[ocean] GSAP started but the opening cue could not follow it', error);
			} else {
				console.warn('[ocean] GSAP ScrollTrigger did not load; following the scroll without it', error);
			}
		})
		.then(() => scheduleLayout())
		.catch((error) => console.error('[ocean] the scroll story could not measure the page', error));

	return Object.freeze({
		reading: () => reading,
		engine: () => engine,
		onChange(listener) {
			listeners.add(listener);
			tell(listener);
			return () => listeners.delete(listener);
		},
		// A feature that changed the page's height asks for this; it is done in the next frame.
		relayout: () => scheduleLayout({ refresh: true }),
	});
}

// What the page uses when startStory itself throws (page.js): a story that stays at the opening,
// so the features built on it (the ocean's stage, the panels) carry on without a scroll story.
export function inertStory() {
	return Object.freeze({
		reading: () => OPENING,
		engine: () => 'failed',
		onChange(listener) {
			try {
				listener(OPENING);
			} catch (error) {
				console.error('[ocean] a scroll story listener failed', error);
			}
			return () => {};
		},
		relayout() {},
	});
}
