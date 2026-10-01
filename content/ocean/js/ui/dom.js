// Small DOM helpers the page's figures and controls share (piece C2; Task 15's final review fixes,
// Minor 13, gathered them from ui/charts.js, ui/frequencyCharts.js, ui/insets.js, ui/controls.js and
// ui/mathBox.js, where each had its own copy). In the boot graph (ui/mathBox.js and ui/controls.js
// import it), so it imports nothing.

const SVG_NS = 'http://www.w3.org/2000/svg';
// A chart's SVG is drawn one unit per CSS pixel of its body, never narrower than this (below a 320 px
// phone's chart body, about 222 px, so its 12 px text stays 12 px), and at FALLBACK_WIDTH while the
// body has no width yet (not laid out).
const MIN_CHART_WIDTH = 200;
const FALLBACK_CHART_WIDTH = 320;

// An HTML element with `props` assigned and `children` appended.
export function element(tag, props = {}, children = []) {
	const node = document.createElement(tag);
	Object.assign(node, props);
	node.append(...children);
	return node;
}

// An SVG element with `attributes` set and, when given, its text.
export function svg(tag, attributes = {}, text = null) {
	const node = document.createElementNS(SVG_NS, tag);
	for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, String(value));
	if (text !== null) node.textContent = text;
	return node;
}

// The width, in CSS pixels, a chart figure's SVG is drawn at.
export function chartWidth(figure) {
	const width = Math.round(figure.querySelector('.chart-body').clientWidth);
	return width > 0 ? Math.max(width, MIN_CHART_WIDTH) : FALLBACK_CHART_WIDTH;
}

// Runs `work` and returns what it returns; a throw is logged as `[ocean] ${failure}` and `fallback`
// returned, so one figure's fault never stops the others.
export function safely(failure, work, fallback = null) {
	try {
		return work();
	} catch (error) {
		console.error(`[ocean] ${failure}`, error);
		return fallback;
	}
}

// Calls onShow each time `target` comes on screen and onHide when it leaves; returns a function that
// says whether it is on screen now.
export function watchVisible(target, onShow, onHide = () => {}) {
	let visible = false;
	new IntersectionObserver((entries) => {
		const now = entries.some((entry) => entry.isIntersecting);
		if (now && !visible) onShow();
		if (!now && visible) onHide();
		visible = now;
	}).observe(target);
	return () => visible;
}
