// The always-on math box (piece C2; lane A owns this file; spec 10.3). It follows the scroll story,
// not the ocean, so it works without WebGL. On a desktop it is a glass card at the top right, hidden
// over the opening and shown from step 1: the step's equation so far (page/mathSteps.js), typeset by
// KaTeX with the sliders' term colours, the terms the step adds glowing for FRESH_SECONDS when the
// step is entered (a static tint under reduced motion, from mathbox.css), and one sentence on what
// changed. KaTeX loads when the story first reaches a step (ui/math.js loadKatex, a dynamic import, so
// boot stays free of it); until then, and for good if it never arrives, the TeX source shows. A
// Hide/Show button collapses it to its title, remembered per viewer (page/mathBoxModel.js). Over the
// finale's full-width blocks and the footer it has nothing new to say and would cover their text, so
// on a desktop it steps aside while one of them is in the top half of the screen (pre-flight R14).
// On a narrow screen (spec 10.3: under 900 px) it is a slim bar pinned at the top of the lower half,
// under the ocean, with the equation on one line; tapping it (or Enter or Space on it) opens a sheet
// over the lower half with the whole box; Escape or the close button closes it and gives focus back to
// the bar. Like the desktop card, the bar stays hidden over the opening (pre-flight R22, lane A's
// call), so the page before the first scroll is A2's.
import { loadKatex } from './math.js';
import { KATEX_OPTIONS, stackEquations } from '../page/mathTrust.js';
import { FRESH_SECONDS, PROMPT, entryFor, readCollapsed, readableTex, writeCollapsed } from '../page/mathBoxModel.js';
import { mathFor } from '../page/mathSteps.js';
import { NARROW_QUERY } from '../page/scrollMap.js';
import { stepOf } from '../stages/steps.js';

const TITLE = 'The math so far';
const CHANGED_LABEL = 'What changed: ';
// What the card steps aside for (R14), and where: the top half of the screen, where the card sits.
const YIELD_TO = '.step-finale .block, footer.site';
const YIELD_MARGIN = '0px 0px -50% 0px';
// The bar's one line: inline style keeps fractions short enough for its height.
const BAR_OPTIONS = Object.freeze({ ...KATEX_OPTIONS, displayMode: false });

function element(tag, props = {}, children = []) {
	const node = document.createElement(tag);
	Object.assign(node, props);
	node.append(...children);
	return node;
}

function safeStorage() {
	try {
		return window.localStorage;
	} catch {
		return null;
	}
}

// Marks the box `is-yielding` while any of YIELD_TO is in the top half of the screen; mathbox.css
// hides it then on a desktop only. Without IntersectionObserver the card simply stays.
function watchYield(root) {
	const targets = [...document.querySelectorAll(YIELD_TO)];
	if (targets.length === 0 || typeof IntersectionObserver !== 'function') return;
	const inView = new Set();
	const observer = new IntersectionObserver((entries) => {
		for (const { target, isIntersecting } of entries) {
			if (isIntersecting) inView.add(target);
			else inView.delete(target);
		}
		root.classList.toggle('is-yielding', inView.size > 0);
	}, { rootMargin: YIELD_MARGIN });
	for (const target of targets) observer.observe(target);
}

const inert = Object.freeze({ hooks: Object.freeze({ shown: () => null, state: () => 'absent', collapsed: () => false, show() {}, open() {}, close() {}, isOpen: () => false }) });

export function mountMathBox({ root, watchReading, reducedMotion = false, load = loadKatex, storage = safeStorage() }) {
	if (!root) return inert;
	const title = element('p', { className: 'mathbox-title', textContent: TITLE });
	const toggle = element('button', { type: 'button', className: 'mathbox-toggle' });
	toggle.setAttribute('aria-controls', 'mathbox-body');
	const head = element('div', { className: 'mathbox-head' }, [title, toggle]);
	const code = element('code');
	const eq = element('div', { className: 'tex mathbox-eq' }, [code]);
	eq.dataset.copySkip = 'math';
	const sentence = element('span', { className: 'mathbox-sentence' });
	const changed = element('p', { className: 'mathbox-changed' }, [element('span', { className: 'mathbox-label', textContent: CHANGED_LABEL }), sentence]);
	changed.setAttribute('aria-live', 'polite');
	const body = element('div', { id: 'mathbox-body', className: 'mathbox-body' }, [eq, changed]);
	const open = element('button', { type: 'button', className: 'mathbox-open' });
	open.setAttribute('aria-label', 'Open the math');
	open.setAttribute('aria-expanded', 'false');
	open.setAttribute('aria-controls', 'mathbox-body');
	const close = element('button', { type: 'button', className: 'mathbox-close', textContent: 'Close' });
	head.append(close);
	root.replaceChildren(head, body, open);
	const narrow = window.matchMedia(NARROW_QUERY);
	let isOpen = false;

	let katex = null;
	let loading = null;
	let state = 'waiting';
	let current = null;
	let collapsed = readCollapsed(storage);
	let freshTimer = 0;
	let reportedRender = false;

	// The equation as KaTeX's markup, or as its TeX source when KaTeX is not here (or throws). The
	// phone's bar holds one line, so there it is the entry's bar line (page/mathSteps.js), set inline
	// and unstacked; the card and the open sheet stack the full equations one per line.
	function typeset(entry, bar) {
		if (katex) {
			try {
				const target = element('div', { className: 'tex-rendered' });
				katex.render(bar ? entry.bar : stackEquations(entry.tex), target, bar ? BAR_OPTIONS : KATEX_OPTIONS);
				eq.replaceChildren(target);
				return;
			} catch (error) {
				if (!reportedRender) {
					reportedRender = true;
					console.error('[ocean] the math box could not typeset an equation; showing its TeX', error);
				}
			}
		}
		// For display only: the colour wrappers would only get in a reader's way in raw TeX.
		code.textContent = readableTex(bar ? entry.bar : entry.tex);
		eq.replaceChildren(code);
	}

	// Runs only when the entry, KaTeX, the sheet or the breakpoint changes, never per frame. On the bar
	// it measures once whether the line runs past the edge, and only then fades the edge (mathbox.css).
	function render(entry) {
		const bar = narrow.matches && !isOpen;
		typeset(entry, bar);
		root.classList.toggle('is-overflowing', bar && eq.scrollWidth > eq.clientWidth + 1);
	}

	// The bar stays quiet (it would announce every step scrolled past); the card and the open sheet
	// announce what changed.
	function setLive() {
		changed.setAttribute('aria-live', narrow.matches && !isOpen ? 'off' : 'polite');
	}

	function glow() {
		if (reducedMotion) return;
		root.classList.remove('is-entering');
		// Restart the animation for a step entered while the last glow is still running.
		void root.offsetWidth;
		root.classList.add('is-entering');
		clearTimeout(freshTimer);
		freshTimer = setTimeout(() => root.classList.remove('is-entering'), FRESH_SECONDS * 1000);
	}

	function ensureKatex() {
		if (loading) return loading;
		state = 'loading';
		loading = load()
			.then((module) => {
				katex = module;
				state = 'rendered';
				if (current) render(current);
			})
			.catch((error) => {
				state = 'failed';
				console.warn('[ocean] KaTeX did not load; the math box stays as TeX source', error);
			});
		return loading;
	}

	// The story calls this on every scroll frame: nothing touches the DOM unless the step (or whether
	// there is one at all) changed. The slot starts hidden, so the opening's first null needs nothing.
	function show(entry) {
		if ((current?.id ?? null) === (entry?.id ?? null)) {
			current = entry;
			return;
		}
		current = entry;
		root.hidden = entry === null;
		if (entry === null) {
			// Back over the opening the sheet has nothing to hold.
			if (isOpen) setOpen(false);
			sentence.textContent = PROMPT;
			return;
		}
		render(entry);
		sentence.textContent = entry.changed;
		glow();
		ensureKatex();
	}

	function setCollapsed(next, remember = true) {
		collapsed = next;
		// The phone's bar has no collapse: its sheet opens and closes instead.
		body.hidden = next && !narrow.matches;
		toggle.textContent = next ? 'Show' : 'Hide';
		toggle.setAttribute('aria-expanded', String(!next));
		root.classList.toggle('is-collapsed', next);
		if (remember) writeCollapsed(storage, next);
	}

	function setOpen(next) {
		const was = isOpen;
		isOpen = next && narrow.matches;
		root.classList.toggle('is-open', isOpen);
		// The sheet stacks the equations the bar runs on one line.
		if (was !== isOpen && current) render(current);
		open.setAttribute('aria-expanded', String(isOpen));
		setLive();
		if (isOpen && !was) {
			body.hidden = false;
			document.addEventListener('keydown', onEscape);
			close.focus();
		} else if (!isOpen) {
			body.hidden = collapsed && !narrow.matches;
			document.removeEventListener('keydown', onEscape);
		}
	}

	// While the sheet is open, Escape closes it wherever focus is, and gives focus back to the bar.
	function onEscape(event) {
		if (event.key !== 'Escape' || !isOpen) return;
		event.preventDefault();
		setOpen(false);
		open.focus();
	}

	open.addEventListener('click', () => {
		setOpen(true);
	});
	close.addEventListener('click', () => {
		setOpen(false);
		open.focus();
	});
	// The sheet is not modal: focus leaving it for something else on the page (Tab past Close) closes
	// it, so focus never lands on what the sheet covers. Focus going nowhere (a tap on empty page)
	// leaves it open.
	root.addEventListener('focusout', (event) => {
		if (isOpen && event.relatedTarget && !root.contains(event.relatedTarget)) setOpen(false);
	});
	// Crossing the breakpoint (a rotated phone, a resized window) closes the sheet, applies the
	// desktop collapse again and redraws the entry for the new layout, without a fresh glow.
	narrow.addEventListener('change', () => {
		setOpen(false);
		setCollapsed(collapsed, false);
		setLive();
		if (current) render(current);
	});
	toggle.addEventListener('click', () => setCollapsed(!collapsed));
	setCollapsed(collapsed, false);
	setLive();
	watchYield(root);
	watchReading((reading) => show(entryFor(reading)));

	return Object.freeze({
		hooks: Object.freeze({
			shown: () => current?.id ?? null,
			state: () => state,
			collapsed: () => collapsed,
			// Test hook: shows step `id`'s entry as if it were being read.
			show: (id) => show(Object.freeze({ step: stepOf(id), id, ...mathFor(id) })),
			open: () => setOpen(true),
			close: () => setOpen(false),
			isOpen: () => isOpen,
		}),
	});
}
