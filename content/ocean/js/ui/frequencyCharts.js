// The frequency-domain charts of steps 14 and 15 (piece C2; lane E owns this file; spec 10.7), inline
// SVG in the page's chart tokens, drawn from page/frequencyMath.js (the engine's own sampler and FFT
// twin, nothing by hand).
//   frequency (step 14): the flat graph's waves over one tile on top (the same bank the canvas draws:
//     the teaching bank laid along one axis, as many waves as step 14's slider says, at the ocean's
//     time when drawn, and a note says it is a snapshot), and underneath the same signal as spikes,
//     one per wave at how many times it repeats across the tile, from the FFT. Redrawn when the
//     slider moves and when the chart comes on screen.
//   fourier (step 15): the three tones summed into a chord (faint) and the chord rebuilt from what is
//     left (bold) when a tone is switched off; underneath the three spikes, a switched-off one dashed.
// The numbers on the axes are computed here, so they sit in .chart-body[data-copy-skip="live"]; the
// figcaptions outside are copy (lane G). Each SVG is drawn one unit per CSS pixel of its width.
import * as WaveBanks from '../engine/waveBanks.js';
import { TONES, amplitudes, chord, forward, lineProfile, peaks } from '../page/frequencyMath.js';
import { stepOf } from '../stages/steps.js';

const NS = 'http://www.w3.org/2000/svg';
const HEIGHT = 300;
const PAD = Object.freeze({ left: 44, right: 12, top: 12, bottom: 34 });
const GAP = 40; // between the two plots
// The spikes axis runs to at least this many repeats (the bank's waves and the chord's tones all sit
// below it), further in steps of AXIS_STEP if a spike ever lies beyond, so no spike is ever dropped.
const MIN_AXIS = 16;
const AXIS_STEP = 4;
const MIN_WIDTH = 200; // below a 320 px phone's chart body (about 222 px), so its 12 px text stays 12 px
const FALLBACK_WIDTH = 320;

function svg(tag, attributes = {}, text = null) {
	const node = document.createElementNS(NS, tag);
	for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, String(value));
	if (text !== null) node.textContent = text;
	return node;
}

function widthOf(figure) {
	const width = Math.round(figure.querySelector('.chart-body').clientWidth);
	return width > 0 ? Math.max(width, MIN_WIDTH) : FALLBACK_WIDTH;
}

// The two plots' boxes for a chart `width` wide.
function boxes(width) {
	const inner = (HEIGHT - PAD.top - PAD.bottom - GAP) / 2;
	const top = { left: PAD.left, right: width - PAD.right, top: PAD.top, bottom: PAD.top + inner };
	const bottom = { left: PAD.left, right: width - PAD.right, top: top.bottom + GAP, bottom: HEIGHT - PAD.bottom };
	return { top, bottom };
}

function frame(root, box, label) {
	root.append(svg('rect', { class: 'chart-plot', x: box.left, y: box.top, width: box.right - box.left, height: box.bottom - box.top }));
	const middle = (box.top + box.bottom) / 2;
	root.append(svg('text', { class: 'chart-text', x: 12, y: middle, transform: `rotate(-90 12 ${middle})`, 'text-anchor': 'middle' }, label));
}

// A polyline of `values` across the box, scaled so +-range fills its height.
function trace(values, box, range) {
	const scaleY = (box.bottom - box.top) / 2 / range;
	const middle = (box.top + box.bottom) / 2;
	let d = '';
	for (let m = 0; m < values.length; m++) {
		const x = box.left + ((box.right - box.left) * m) / (values.length - 1);
		d += `${m === 0 ? 'M' : 'L'}${x.toFixed(1)} ${(middle - values[m] * scaleY).toFixed(1)}`;
	}
	return d;
}

// The spikes axis's last bin: MIN_AXIS, or the furthest spike rounded up to a whole AXIS_STEP.
function axisEnd(bins) {
	return Math.max(MIN_AXIS, Math.ceil(Math.max(0, ...bins) / AXIS_STEP) * AXIS_STEP);
}

// A spike for every bin above the floor, filled; `removed` ones (a switched-off tone) dashed.
// `label` names the axis: what the repeats are counted across.
function spikes(root, box, heights, label, removed = []) {
	const found = peaks(heights);
	const end = axisEnd([...found, ...removed.map((r) => r.bin)]);
	const tallest = Math.max(...found.map((bin) => heights[bin]), ...removed.map((r) => r.height), 1e-9);
	const x = (bin) => box.left + ((box.right - box.left) * bin) / (end + 1);
	const y = (height) => box.bottom - ((box.bottom - box.top) * height) / (tallest * 1.1);
	for (let tick = 0; tick <= 4; tick++) {
		const bin = (end * tick) / 4;
		root.append(svg('line', { class: 'chart-grid', x1: x(bin), x2: x(bin), y1: box.top, y2: box.bottom }));
		root.append(svg('text', { class: 'chart-text', x: x(bin), y: box.bottom + 14, 'text-anchor': 'middle' }, String(bin)));
	}
	for (const bin of found) {
		root.append(svg('line', { class: 'chart-spike', x1: x(bin), x2: x(bin), y1: box.bottom, y2: y(heights[bin]) }));
	}
	for (const r of removed) {
		root.append(svg('line', { class: 'chart-spike-removed', x1: x(r.bin), x2: x(r.bin), y1: box.bottom, y2: y(r.height) }));
	}
	root.append(svg('text', { class: 'chart-text', x: (box.left + box.right) / 2, y: HEIGHT - 6, 'text-anchor': 'middle' }, label));
}

// The chart's body replaced by a fresh SVG and, under it, `notes` as .chart-note paragraphs.
function canvasFor(figure, width, label, notes = []) {
	const root = svg('svg', { viewBox: `0 0 ${width} ${HEIGHT}`, role: 'img', 'aria-label': label });
	const paragraphs = notes.map((text) => {
		const p = document.createElement('p');
		p.className = 'chart-note';
		p.textContent = text;
		return p;
	});
	figure.querySelector('.chart-body').replaceChildren(root, ...paragraphs);
	return root;
}

// Step 14's top line is drawn when the chart draws (on screen, a slider, a new width), not every
// frame: the chart says so. The spikes are true at any moment (each wave keeps its height and bin).
const SNAPSHOT_NOTE = 'The line is a snapshot of the sea when the chart drew; the spikes are the same at any moment.';

const FREQUENCY_LABEL = 'The waves of the flat graph over one tile, a snapshot of the sea when the chart drew, and the same waves as spikes, one for each wave at how many times it repeats across the tile';
const FOURIER_LABEL = 'Three tones summed into a chord, and the chord rebuilt from the tones still switched on, with each tone as a spike underneath';

function frequencyChart(figure, story, ocean, onLayout) {
	const step = stepOf('frequency');
	let state = { count: 0, peaks: [] };
	let drawnOnce = false;
	function draw() {
		const count = story.sliders(step).find((s) => s.id === 'waveCount').value;
		const waves = WaveBanks.withCount(WaveBanks.withFan(WaveBanks.teachingBank(), 0), count);
		const profile = lineProfile(waves, ocean.teachT);
		const heights = amplitudes(forward(profile));
		const width = widthOf(figure);
		const { top, bottom } = boxes(width);
		const root = canvasFor(figure, width, FREQUENCY_LABEL, [SNAPSHOT_NOTE]);
		frame(root, top, 'height (studs)');
		frame(root, bottom, 'size (studs)');
		const range = Math.max(...profile.map(Math.abs), 1e-9) * 1.15;
		root.append(svg('path', { class: 'chart-line', d: trace(profile, top, range) }));
		root.append(svg('text', { class: 'chart-text', x: (top.left + top.right) / 2, y: top.bottom + 14, 'text-anchor': 'middle' }, 'along one tile'));
		spikes(root, bottom, heights, 'times it repeats across the tile');
		state = { count, peaks: peaks(heights) };
		if (!drawnOnce) {
			drawnOnce = true;
			onLayout();
		}
	}
	// Task 15: the chart's box at mount, empty, with its note: the height it will draw at, so its
	// first drawing (on screen) moves nothing under the reader.
	function reserve() {
		canvasFor(figure, widthOf(figure), FREQUENCY_LABEL, [SNAPSHOT_NOTE]);
	}
	return { draw, reserve, state: () => state };
}

function fourierChart(figure, story, onLayout) {
	const step = stepOf('fourier');
	let state = { notes: [true, true, true] };
	let drawnOnce = false;
	function draw() {
		const values = story.sliders(step);
		const notes = ['note1', 'note2', 'note3'].map((id) => values.find((s) => s.id === id).value);
		const result = chord(notes);
		const width = widthOf(figure);
		const { top, bottom } = boxes(width);
		const root = canvasFor(figure, width, FOURIER_LABEL);
		frame(root, top, 'sound');
		frame(root, bottom, 'size');
		const range = Math.max(...result.chord.map(Math.abs), 1e-9) * 1.15;
		root.append(svg('path', { class: 'chart-line-faint', d: trace(result.chord, top, range) }));
		root.append(svg('path', { class: 'chart-line chart-rebuilt', d: trace(result.rebuilt, top, range) }));
		const removed = TONES.map((tone, i) => (notes[i] ? null : { bin: tone.cycles, height: result.before[tone.cycles] })).filter(Boolean);
		spikes(root, bottom, result.after, 'times it repeats, end to end', removed);
		state = { notes };
		if (!drawnOnce) {
			drawnOnce = true;
			onLayout();
		}
	}
	// Task 15: the chart's box at mount, empty (see frequencyChart's reserve).
	function reserve() {
		canvasFor(figure, widthOf(figure), FOURIER_LABEL);
	}
	return { draw, reserve, state: () => state };
}

// Runs a chart's drawing, logging a throw so one chart's fault never stops the other.
function safely(name, work) {
	try {
		work();
	} catch (error) {
		console.error(`[ocean] the ${name} chart failed`, error);
	}
}

export function mountFrequencyCharts({ story, ocean, onLayout = () => {} }) {
	const charts = {};
	const frequencyFigure = document.querySelector('figure.chart[data-chart="frequency"]');
	const fourierFigure = document.querySelector('figure.chart[data-chart="fourier"]');
	if (frequencyFigure) charts.frequency = { figure: frequencyFigure, chart: frequencyChart(frequencyFigure, story, ocean, onLayout), step: stepOf('frequency') };
	if (fourierFigure) charts.fourier = { figure: fourierFigure, chart: fourierChart(fourierFigure, story, onLayout), step: stepOf('fourier') };
	for (const { chart } of Object.values(charts)) safely('reserve', () => chart.reserve());
	const drawn = new Set();
	const draw = (name) => safely(name, () => {
		charts[name].chart.draw();
		drawn.add(name);
	});
	for (const [name, { figure }] of Object.entries(charts)) {
		new IntersectionObserver((entries) => {
			if (entries.some((entry) => entry.isIntersecting)) draw(name);
		}).observe(figure);
		if (typeof ResizeObserver === 'function') {
			let width = 0;
			new ResizeObserver(([entry]) => {
				const next = Math.round(entry.contentRect.width);
				if (width !== 0 && next !== width) draw(name);
				width = next;
			}).observe(figure.querySelector('.chart-body'));
		}
	}
	// A slider on step 14 or 15 that really changed redraws its chart, once per frame of changes.
	let queued = new Set();
	document.addEventListener('ocean:slider', (event) => {
		const entry = Object.entries(charts).find(([, c]) => c.step === event.detail.step);
		if (!entry) return;
		if (queued.size === 0) {
			requestAnimationFrame(() => {
				const names = queued;
				queued = new Set();
				for (const name of names) draw(name);
			});
		}
		queued.add(entry[0]);
	});
	return Object.freeze({
		hooks: Object.freeze({
			drawn: () => [...drawn],
			frequency: () => charts.frequency?.chart.state() ?? null,
			fourier: () => charts.fourier?.chart.state() ?? null,
		}),
	});
}
