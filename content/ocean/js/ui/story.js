// The scroll story (piece C; spec 2 and 4.1 "story.js: GSAP ScrollTrigger -> active step and
// progress within it"). A ScrollTrigger over the whole story calls update() as the page scrolls and
// relayout() when it refreshes; a ResizeObserver on the story re-measures when the page's own
// content changes height (a maths line opened, the footage appearing). update() reads the scroll
// through page/scrollMap.js and tells its listeners. If GSAP never arrives (offline, blocked), a
// passive native scroll listener does the same, so the story works without it. Positions come from
// the step sections' real boxes, measured again on every relayout, so nothing here assumes a panel
// or section height; progress is through the section, not the panel. Each sticky panel's top comes
// from its own height, so one taller than the view sticks with its bottom in view.
import { NARROW_QUERY, readScroll, readingLine, stickyTop } from '../page/scrollMap.js';

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
	let reading = Object.freeze({ phase: 'opening', step: 1, progress: 0 });
	let engine = 'starting';
	let scrollTrigger = null;

	function measure() {
		measured = sections.map((section) => {
			const rect = section.getBoundingClientRect();
			return { step: Number(section.dataset.step), top: rect.top + window.scrollY, height: rect.height };
		});
	}

	// A sticky panel taller than the view would stick with its bottom off screen; give each one a
	// top from its real height instead (inline, so style.css keeps the 10vh default). Panels the
	// stylesheet leaves static (narrow screens, the finale) lose any top set earlier.
	function pinPanels() {
		for (const panel of panels) {
			if (window.getComputedStyle(panel).position === 'sticky') {
				panel.style.top = stickyTop(panel.getBoundingClientRect().height);
			} else {
				panel.style.removeProperty('top');
			}
		}
	}

	function mark() {
		for (const section of sections) {
			section.classList.toggle('is-active', reading.phase === 'step' && Number(section.dataset.step) === reading.step);
		}
		document.body.dataset.phase = reading.phase;
	}

	function update() {
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

	function followNatively() {
		let queued = false;
		window.addEventListener('scroll', () => {
			if (queued) return;
			queued = true;
			window.requestAnimationFrame(() => {
				queued = false;
				update();
			});
		}, { passive: true });
		window.addEventListener('resize', relayout);
		engine = 'native';
	}

	pinPanels();
	measure();
	mark();
	update();
	// The story changing height moves every section below the change; a panel changing height
	// (inside a section that does not grow) changes only its sticky top.
	const observer = new ResizeObserver((entries) => {
		relayout();
		if (entries.some((entry) => entry.target === story)) {
			scrollTrigger?.refresh();
		}
	});
	observer.observe(story);
	for (const panel of panels) {
		observer.observe(panel);
	}

	function followWithGsap({ gsap, ScrollTrigger }) {
		ScrollTrigger.create({ trigger: story, start: 'top top', end: 'bottom bottom', onUpdate: update, onRefresh: relayout });
		const cue = document.querySelector('#opening .cue');
		if (cue && !reducedMotion) {
			gsap.to(cue, { autoAlpha: 0, ease: 'none', scrollTrigger: { trigger: '#opening', start: 'top top', end: 'bottom 60%', scrub: true } });
		}
		scrollTrigger = ScrollTrigger;
		engine = 'gsap';
	}

	// Loading and starting GSAP are the only things that fall back to the native listener; the
	// relayout after either runs outside that choice (its listeners are guarded by tell()).
	load()
		.then(followWithGsap)
		.catch((error) => {
			console.warn('[ocean] GSAP ScrollTrigger did not load; following the scroll without it', error);
			followNatively();
		})
		.then(relayout)
		.catch((error) => console.error('[ocean] the scroll story could not measure the page', error));

	return Object.freeze({
		reading: () => reading,
		engine: () => engine,
		onChange(listener) {
			listeners.add(listener);
			tell(listener);
			return () => listeners.delete(listener);
		},
		relayout,
	});
}
