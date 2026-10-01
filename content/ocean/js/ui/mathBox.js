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
// Task 2 adds the phone's pinned bar and sheet.
import { loadKatex } from './math.js';
import { KATEX_OPTIONS, stackEquations } from '../page/mathTrust.js';
import { FRESH_SECONDS, PROMPT, entryFor, readCollapsed, writeCollapsed } from '../page/mathBoxModel.js';
import { mathFor } from '../page/mathSteps.js';
import { stepOf } from '../stages/steps.js';

const TITLE = 'The math so far';
const CHANGED_LABEL = 'What changed: ';
// What the card steps aside for (R14), and where: the top half of the screen, where the card sits.
const YIELD_TO = '.step-finale .block, footer.site';
const YIELD_MARGIN = '0px 0px -50% 0px';

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

const inert = Object.freeze({ hooks: Object.freeze({ shown: () => null, state: () => 'absent', collapsed: () => false, show() {} }) });

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
	root.replaceChildren(head, body);

	let katex = null;
	let loading = null;
	let state = 'waiting';
	let current = null;
	let collapsed = readCollapsed(storage);
	let freshTimer = 0;
	let reportedRender = false;

	// The equation as KaTeX's markup, or as its TeX source when KaTeX is not here (or throws).
	function render(entry) {
		if (katex) {
			try {
				const target = element('div', { className: 'tex-rendered' });
				katex.render(stackEquations(entry.tex), target, KATEX_OPTIONS);
				eq.replaceChildren(target);
				return;
			} catch (error) {
				if (!reportedRender) {
					reportedRender = true;
					console.error('[ocean] the math box could not typeset an equation; showing its TeX', error);
				}
			}
		}
		code.textContent = entry.tex;
		eq.replaceChildren(code);
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

	function show(entry) {
		const same = current !== null && entry !== null && current.id === entry.id;
		current = entry;
		root.hidden = entry === null;
		if (entry === null) {
			sentence.textContent = PROMPT;
			return;
		}
		if (same) return;
		render(entry);
		sentence.textContent = entry.changed;
		glow();
		ensureKatex();
	}

	function setCollapsed(next, remember = true) {
		collapsed = next;
		body.hidden = next;
		toggle.textContent = next ? 'Show' : 'Hide';
		toggle.setAttribute('aria-expanded', String(!next));
		root.classList.toggle('is-collapsed', next);
		if (remember) writeCollapsed(storage, next);
	}

	toggle.addEventListener('click', () => setCollapsed(!collapsed));
	setCollapsed(collapsed, false);
	watchYield(root);
	watchReading((reading) => show(entryFor(reading)));

	return Object.freeze({
		hooks: Object.freeze({
			shown: () => current?.id ?? null,
			state: () => state,
			collapsed: () => collapsed,
			// Test hook: shows step `id`'s entry as if it were being read.
			show: (id) => show(Object.freeze({ step: stepOf(id), id, ...mathFor(id) })),
		}),
	});
}
