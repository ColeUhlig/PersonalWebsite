// The story's three charts (piece C; spec 3; steps `jonswap`, `random-sea` and `time`, and `fft`),
// inline SVG in the page's dark chart tokens (style.css), fed by A3's chart data through the story
// stage's read-only accessors. Every number they show is live, either computed from the sea on
// screen or measured in this browser, and each chart says which; the numbers sit in .chart-body, which carries data-copy-skip="live" (the
// figcaptions outside it are copy-checked). Each SVG is drawn one unit per CSS pixel of its chart's
// width (redrawn when that width changes), so its 12 px text is 12 px on a phone as on a laptop.
//   spectrum (`jonswap`): JONSWAP energy against wave frequency on a log axis whose top is the
//     stormiest sea the sliders allow (page/spectrumLayout.js), with each wave layer's band shaded
//     and the peak marked. Redrawn at most about 10 times a second while a slider drags.
//   phase (`random-sea` and `time`): the tallest waves of the 256-stud layer, each an arrow turning at the speed the
//     dispersion gives it (short waves' arrows turn fastest), looping every 120 s; turned every
//     frame through the story's phase-arrow cache, and only while the chart is on screen.
//   transforms (`fft`): the wave-by-wave sum against the FFT, timed in this browser when the chart
//     comes on screen and again for each new grid size, read as page/transformTiming.js rules (a
//     rounded speedup, one re-measure, the operation ratio when the timing was disturbed). A grid
//     whose single naive run would freeze the page on this device (judged from the fastest smaller
//     timing seen) is switched off with a note instead of run, until a faster timing says otherwise.
import { arrowEnd, linePath, niceTicks } from '../page/chartGeometry.js';
import { SPECTRUM, peakLabelSpot, spectrumPlot, spectrumScales } from '../page/spectrumLayout.js';
import { stepOf } from '../stages/steps.js';
import { fasterJudge, formatMs, formatSteps, formatTiny, operationRatio, roundSpeedup, timeTransforms, tooSlowToTime } from '../page/transformTiming.js';

const NS = 'http://www.w3.org/2000/svg';
const MIN_WIDTH = 240;
const FALLBACK_WIDTH = 320;
// About this wide per character at 12 px, for a text the browser cannot measure (not laid out).
const CHAR_WIDTH = 6.6;
const SPECTRUM_REDRAW_MS = 100;
// The first timing pays engine/charts.js's one-off JIT warm-up (about 21 ms on Cole's M4), run
// through transforms(2) on its own task; that call also times its own small batches (each runs
// for at least 2 ms), so the task takes about 40 ms there, and about 100 ms on a CPU four times
// slower. The warm-up is one loop inside the engine, so the page cannot split it further.
const WARM_UP_N = 2;
// The grid timed first to judge whether a bigger one would freeze the page.
const JUDGING_N = 32;
const SLOW_NOTE_ID = `control-${stepOf('fft')}-transformN-slow`;
const SLOW_NOTE = (n) => `${n} × ${n} is too slow to time here without freezing the page.`;

function svg(tag, attributes = {}, text = null) {
	const node = document.createElementNS(NS, tag);
	for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, String(value));
	if (text !== null) node.textContent = text;
	return node;
}

function note(text) {
	const p = document.createElement('p');
	p.className = 'chart-note';
	p.textContent = text;
	return p;
}

// The width, in CSS pixels, the chart's SVG is drawn at.
function widthOf(figure) {
	const width = Math.round(figure.querySelector('.chart-body').clientWidth);
	return width > 0 ? Math.max(width, MIN_WIDTH) : FALLBACK_WIDTH;
}

// Replaces the chart's body with a fresh SVG (and the notes under it); returns the SVG.
function canvasFor(figure, width, height, label, notes = []) {
	const root = svg('svg', { viewBox: `0 0 ${width} ${height}`, role: 'img', 'aria-label': label });
	figure.querySelector('.chart-body').replaceChildren(root, ...notes.map(note));
	return root;
}

// A text's rendered width, or an estimate when it is not laid out.
function textWidth(node) {
	const measured = node.getComputedTextLength?.() ?? 0;
	return measured > 0 ? measured : node.textContent.length * CHAR_WIDTH;
}

// Resolves after the browser has painted a frame, so a state shown before a long task is seen.
function afterPaint() {
	return new Promise((resolve) => {
		requestAnimationFrame(() => setTimeout(resolve, 0));
	});
}

// Calls onShow each time `figure` comes on screen and onHide when it leaves; returns whether it is
// on screen now.
function whileVisible(figure, onShow, onHide = () => {}) {
	let visible = false;
	new IntersectionObserver((entries) => {
		const now = entries.some((entry) => entry.isIntersecting);
		if (now && !visible) onShow();
		if (!now && visible) onHide();
		visible = now;
	}).observe(figure);
	return () => visible;
}

// `fn` at most once per `ms`, the last call always landing (a trailing call after the wait).
function throttled(fn, ms) {
	let last = -Infinity;
	let timer = 0;
	return () => {
		const wait = last + ms - performance.now();
		if (wait <= 0) {
			last = performance.now();
			fn();
		} else if (timer === 0) {
			timer = setTimeout(() => {
				timer = 0;
				last = performance.now();
				fn();
			}, wait);
		}
	};
}

function spectrumChart(figure, story, onLayout) {
	let drawn = false;
	// Each layer's band, shaded, with its name centred over it but kept inside the chart (the
	// 16-stud band is narrow at the edge). Where the names would run into each other (a phone-wide
	// chart) they shorten to the tile size.
	function bands(root, curve, x, width) {
		const first = curve.omega[0];
		const last = curve.omega[curve.omega.length - 1];
		const plot = spectrumPlot(width);
		const labels = [];
		curve.bands.forEach((band, i) => {
			const from = Math.max(band.omegaMin, first);
			const to = Math.min(band.omegaMax, last);
			if (!(to > from)) return;
			root.append(svg('rect', { class: 'chart-band', 'data-layer': i + 1, x: x(from), y: plot.top, width: x(to) - x(from), height: plot.bottom - plot.top }));
			const text = svg('text', { class: 'chart-text chart-band-label', y: plot.top - 7, 'text-anchor': 'middle' }, `${band.size}-stud layer`);
			root.append(text);
			labels.push({ text, band, centre: (x(from) + x(to)) / 2 });
		});
		const place = () => labels.map(({ text, centre }) => {
			const half = textWidth(text) / 2;
			const at = Math.min(Math.max(centre, half), width - half);
			text.setAttribute('x', at.toFixed(1));
			return [at - half, at + half];
		});
		const crowded = (boxes) => boxes.some((box, i) => i > 0 && box[0] < boxes[i - 1][1] + 6);
		if (crowded(place())) {
			for (const { text, band } of labels) text.textContent = `${band.size} studs`;
			place();
		}
	}
	function axes(root, curve, x, width) {
		const plot = spectrumPlot(width);
		const middle = (plot.top + plot.bottom) / 2;
		root.append(svg('rect', { class: 'chart-plot', x: plot.left, y: plot.top, width: plot.right - plot.left, height: plot.bottom - plot.top }));
		for (const tick of niceTicks(curve.omega[0], curve.omega[curve.omega.length - 1], 6)) {
			root.append(svg('line', { class: 'chart-grid', x1: x(tick), x2: x(tick), y1: plot.top, y2: plot.bottom }));
			root.append(svg('text', { class: 'chart-text', x: x(tick), y: plot.bottom + 14, 'text-anchor': 'middle' }, String(tick)));
		}
		root.append(svg('text', { class: 'chart-text', x: (plot.left + plot.right) / 2, y: SPECTRUM.height - 6, 'text-anchor': 'middle' }, 'wave frequency ω (rad/s)'));
		root.append(svg('text', { class: 'chart-text', x: 14, y: middle, transform: `rotate(-90 14 ${middle})`, 'text-anchor': 'middle' }, 'energy (log scale)'));
	}
	// The peak line, and its label wherever page/spectrumLayout.js finds it a clear spot.
	function peak(root, curve, scales, chartWidth, label) {
		const plot = spectrumPlot(chartWidth);
		const px = scales.x(curve.peakOmega);
		root.append(svg('line', { class: 'chart-peak', x1: px, x2: px, y1: plot.top, y2: plot.bottom }));
		const text = svg('text', { class: 'chart-text chart-peak-label' }, label);
		root.append(text);
		const width = textWidth(text);
		const spot = peakLabelSpot(curve, scales, plot, width);
		text.setAttribute('x', spot.x0.toFixed(1));
		text.setAttribute('y', spot.base);
		// A patch of the chart's background behind it, so the label reads where it crosses the line.
		const { patch } = SPECTRUM;
		root.insertBefore(svg('rect', { class: 'chart-label-bg', x: (spot.x0 - patch.x).toFixed(1), y: spot.base - SPECTRUM.ascent - patch.y, width: (width + 2 * patch.x).toFixed(1), height: SPECTRUM.ascent + SPECTRUM.descent + 2 * patch.y, rx: 3 }), text);
	}
	function draw() {
		const curve = story.charts.spectrum();
		const width = widthOf(figure);
		const plot = spectrumPlot(width);
		const scales = spectrumScales(curve, story.charts.spectrumCeiling(), plot);
		const label = `peak: waves ${curve.peakWavelength.toFixed(0)} studs long`;
		// The description goes on first, so a drawing that fails part way still says what it shows.
		const root = canvasFor(figure, width, SPECTRUM.height, `JONSWAP spectrum for the wind and fetch of the sea on screen, ${label}, with the three wave layers' frequency bands shaded`, [
			"Computed from the sea on screen's wind and fetch. The engine then scales this up (and trims the short waves) to read at game scale.",
		]);
		bands(root, curve, scales.x, width);
		axes(root, curve, scales.x, width);
		root.append(svg('path', { class: 'chart-line', d: linePath(curve.omega, curve.physical, scales.x, scales.y, plot) }));
		peak(root, curve, scales, width, label);
		// Only the first drawing changes the panel's height; a redraw keeps the same box.
		if (!drawn) {
			drawn = true;
			onLayout();
		}
	}
	return { draw, resize: draw };
}

function phaseChart(figure, story, onLayout) {
	let arrows = [];
	let frame = 0;
	let reported = false;
	function build(waves) {
		const width = widthOf(figure);
		const column = width / 4;
		const radius = Math.min(32, column / 2 - 6);
		const row = radius * 2 + 32;
		const tallest = Math.max(...waves.map((a) => a.amplitude));
		const root = canvasFor(figure, width, row * 2 + 4, `The ${waves.length} tallest waves of the 256-stud layer as arrows, turning at the speeds the dispersion gives them and looping every 120 seconds; the shortest waves' arrows turn fastest`, [
			`Computed from the sea on screen. Each arrow is one wave: its angle is the wave's phase now, and its length is half that wave's crest height above the mean level, scaled so the longest arrow (${tallest.toFixed(2)} studs) fills its ring. Labels are wavelengths in studs; short waves' arrows turn fastest.`,
		]);
		const defs = svg('defs');
		const marker = svg('marker', { id: 'chart-arrowhead', viewBox: '0 0 6 6', refX: 5, refY: 3, markerWidth: 4, markerHeight: 4, orient: 'auto' });
		marker.append(svg('path', { class: 'chart-arrowhead', d: 'M0 0 L6 3 L0 6 Z' }));
		defs.append(marker);
		root.append(defs);
		arrows = waves.map((wave, i) => {
			const cx = column * (i % 4 + 0.5);
			const cy = 6 + radius + Math.floor(i / 4) * row;
			root.append(svg('circle', { class: 'chart-ring', cx, cy, r: radius }));
			root.append(svg('circle', { class: 'chart-hub', cx, cy, r: 1.5 }));
			const line = svg('line', { class: 'chart-arrow', x1: cx, y1: cy, x2: cx, y2: cy, 'marker-end': 'url(#chart-arrowhead)' });
			root.append(line);
			root.append(svg('text', { class: 'chart-text chart-wavelength', x: cx, y: cy + radius + 16, 'text-anchor': 'middle' }, `${wave.wavelength.toFixed(0)} studs`));
			return { line, cx, cy, radius, x2: '', y2: '' };
		});
		onLayout();
	}
	// One frame: the arrows at the ocean's time now. Only a coordinate that moved is written, so a
	// paused sea costs no DOM work.
	function turn() {
		const waves = story.charts.phaseArrows();
		if (arrows.length !== waves.length) build(waves);
		const tallest = Math.max(...waves.map((a) => a.amplitude));
		waves.forEach((wave, i) => {
			const arrow = arrows[i];
			const end = arrowEnd(wave.re, wave.im, tallest, arrow.radius - 3);
			const x2 = (arrow.cx + end.x).toFixed(2);
			const y2 = (arrow.cy + end.y).toFixed(2);
			if (x2 !== arrow.x2) arrow.line.setAttribute('x2', (arrow.x2 = x2));
			if (y2 !== arrow.y2) arrow.line.setAttribute('y2', (arrow.y2 = y2));
		});
	}
	// A frame that throws stops the turning until the chart next comes on screen; the error is
	// logged once a page, not again on every return.
	function loop() {
		try {
			turn();
		} catch (error) {
			if (!reported) {
				reported = true;
				console.error('[ocean] the phase arrows stopped', error);
			}
			return;
		}
		frame = requestAnimationFrame(loop);
	}
	const visible = whileVisible(figure, () => {
		cancelAnimationFrame(frame);
		frame = requestAnimationFrame(loop);
	}, () => cancelAnimationFrame(frame));
	// Drawn once at the start, so the panel has its arrows (still) before the chart comes on screen.
	turn();
	// A new seed or a new width: the arrows are rebuilt on the next turn.
	function draw() {
		arrows = [];
		if (!visible()) turn();
	}
	return { draw, resize: draw };
}

// The grid-size option for `n` on the FFT step's panel, and the panel's control row.
const optionButton = (n) => document.querySelector(`#step-${stepOf('fft')} [data-slider="transformN"] button[data-option="${n}"]`);
const gridControl = () => document.querySelector(`#step-${stepOf('fft')} [data-slider="transformN"]`);

function transformChart(figure, story, onLayout) {
	const HEIGHT = 68;
	const BAR = Object.freeze({ left: 92, height: 20, gap: 30 });
	// The grid size last timed or being timed (null: time again when next on screen), which timing
	// is the latest (an older one still running is dropped when it finishes), what is on show (to
	// redraw at a new width), and the timing a bigger grid is judged from.
	let wanted = null;
	let run = 0;
	let warmedUp = false;
	let shown = () => showWaiting();
	let judge = null;
	let measureFn = (n) => story.charts.transforms(n);
	const gridSize = () => story.sliders(stepOf('fft')).find((s) => s.id === 'transformN').value;
	const options = () => story.sliders(stepOf('fft')).find((s) => s.id === 'transformN').options;

	// Two bars on the naive one's scale; a value sits inside its bar's end where it fits, else just
	// past it.
	function bars(root, width, rows, max) {
		const full = width - BAR.left - 2;
		rows.forEach(([label, value, text, cls], i) => {
			const y = 6 + i * BAR.gap;
			const length = Math.max(1, max > 0 ? (value / max) * full : 0);
			root.append(svg('text', { class: 'chart-text', x: 0, y: y + 14 }, label));
			root.append(svg('rect', { class: cls, x: BAR.left, y, width: length.toFixed(2), height: BAR.height }));
			const valueText = svg('text', { class: 'chart-text', x: BAR.left + length + 4, y: y + 14 }, text);
			root.append(valueText);
			const inside = textWidth(valueText) + 10 <= length;
			if (inside) {
				valueText.setAttribute('x', (BAR.left + length - 5).toFixed(2));
				valueText.setAttribute('text-anchor', 'end');
				valueText.classList.add('chart-bar-value');
			}
		});
	}

	function showWaiting() {
		const width = widthOf(figure);
		const root = canvasFor(figure, width, HEIGHT, 'Both ways are timed in your browser when this chart comes on screen', ['Both ways are timed in your browser when this chart comes on screen.']);
		bars(root, width, [['Wave by wave', 0, '', 'chart-bar-naive'], ['FFT', 0, '', 'chart-bar-fft']], 1);
	}

	function showMeasuring(n) {
		const width = widthOf(figure);
		const root = canvasFor(figure, width, HEIGHT, `Timing a ${n} by ${n} grid both ways in your browser`, [`Timing a ${n} × ${n} grid both ways in your browser…`]);
		bars(root, width, [['Wave by wave', 0, '…', 'chart-bar-naive'], ['FFT', 0, '…', 'chart-bar-fft']], 1);
		onLayout();
	}

	function showDisturbed(n, verdict) {
		const width = widthOf(figure);
		const ops = verdict.operations;
		const fewer = roundSpeedup(verdict.ratio).toLocaleString('en-US');
		const root = canvasFor(figure, width, HEIGHT, `${n} by ${n} grid: the timing was disturbed, so the bars count steps: ${formatSteps(ops.naive)} wave by wave, ${formatSteps(ops.fft)} for the FFT`, [
			`${n} × ${n} grid: the timing was disturbed by other work on this device, twice, so the bars count steps instead: the FFT needs about ${fewer}× fewer steps.`,
			'Counted from the grid size, not timed.',
		]);
		bars(root, width, [['Wave by wave', ops.naive, formatSteps(ops.naive), 'chart-bar-naive'], ['FFT', ops.fft, formatSteps(ops.fft), 'chart-bar-fft']], ops.naive);
	}

	function showMeasured(n, result) {
		const width = widthOf(figure);
		const faster = roundSpeedup(result.speedup).toLocaleString('en-US');
		const fewer = roundSpeedup(operationRatio(result)).toLocaleString('en-US');
		const root = canvasFor(figure, width, HEIGHT, `${n} by ${n} grid: wave by wave ${formatMs(result.naiveMs)}, FFT ${formatMs(result.fftMs)}, about ${faster} times faster`, [
			`${n} × ${n} grid: the FFT was about ${faster}× faster (it does about ${fewer}× fewer steps), and the two answers agree to within ${formatTiny(result.maxDifference)}.`,
			'Measured in your browser just now.',
		]);
		bars(root, width, [['Wave by wave', result.naiveMs, formatMs(result.naiveMs), 'chart-bar-naive'], ['FFT', result.fftMs, formatMs(result.fftMs), 'chart-bar-fft']], result.naiveMs);
	}

	function show(n, verdict) {
		shown = () => (verdict.disturbed ? showDisturbed(n, verdict) : showMeasured(n, verdict.result));
		shown();
		onLayout();
	}

	const isBlocked = (option) => optionButton(option)?.dataset.blocked !== undefined;

	// Switches each option this device cannot time without freezing the page off, with a note the
	// option points to, and back on once a faster timing says it can. Only a believable timing
	// judges (page/transformTiming.js fasterJudge): a disturbed one says nothing about speed.
	function applyBlocks() {
		const slider = story.sliders(stepOf('fft')).find((s) => s.id === 'transformN');
		let first = null;
		for (const option of slider.options) {
			const button = optionButton(option);
			if (!button) continue;
			if (tooSlowToTime(option, judge) === true) {
				first ??= option;
				button.dataset.blocked = '';
				button.disabled = true;
				button.setAttribute('aria-describedby', SLOW_NOTE_ID);
			} else if (button.dataset.blocked !== undefined) {
				delete button.dataset.blocked;
				button.disabled = !slider.available;
				button.removeAttribute('aria-describedby');
			}
		}
		const existing = document.getElementById(SLOW_NOTE_ID);
		if (first === null) {
			existing?.remove();
		} else if (existing) {
			existing.textContent = SLOW_NOTE(first);
		} else {
			const span = document.createElement('span');
			span.className = 'control-note';
			span.id = SLOW_NOTE_ID;
			span.textContent = SLOW_NOTE(first);
			gridControl()?.append(span);
		}
	}

	// Times `n` (re-measuring once when the reading is not believable). Load only ever slows a
	// reading, so the fastest believable timing seen judges bigger grids; before a reading switches
	// a grid off, a second reading of the same grid has its say, so one spike never decides, and the
	// faster of the two is the one shown.
	async function timed(n, current) {
		let verdict = await timeTransforms(measureFn, n, afterPaint, { stillWanted: current });
		if (!verdict) return null;
		judge = fasterJudge(judge, verdict.result);
		const wouldBlock = () => options().some((option) => tooSlowToTime(option, judge) === true && !isBlocked(option));
		if (verdict.result && wouldBlock()) {
			await afterPaint();
			if (!current()) return null;
			const again = await timeTransforms(measureFn, n, afterPaint, { stillWanted: current });
			if (!again) return null;
			judge = fasterJudge(judge, again.result);
			if (again.result && again.result.naiveMs < verdict.result.naiveMs) verdict = again;
		}
		applyBlocks();
		return verdict;
	}

	// Moves the choice back to the judging grid (its option is never switched off), taking focus
	// with it when the visitor's focus was on the option just switched off (which drops it).
	function chooseJudgingGrid(from) {
		const back = optionButton(JUDGING_N);
		const active = document.activeElement;
		const focusHere = active === null || active === document.body || active === optionButton(from) || gridControl()?.contains(active);
		back?.click();
		if (focusHere) back?.focus({ preventScroll: true });
	}

	// Shows "measuring" and lets it paint, then runs each long task (the one-off warm-up, each timing)
	// in its own turn of the event loop, with a painted frame between them. A grid bigger than any
	// timed so far is judged first from a 32 × 32 timing; one too slow is not run: the chart shows
	// the 32 × 32 timing and the choice goes back to it. A judging timing disturbed twice judges
	// nothing, and the grid asked for is timed the normal way.
	async function measure() {
		const mine = ++run;
		const current = () => mine === run;
		const asked = gridSize();
		let n = asked;
		wanted = n;
		figure.dataset.state = 'measuring';
		showMeasuring(n);
		await afterPaint();
		if (!current()) return;
		if (!warmedUp) {
			warmedUp = true;
			measureFn(WARM_UP_N);
			await afterPaint();
			if (!current()) return;
		}
		let verdict = null;
		if (n > JUDGING_N && tooSlowToTime(n, judge) === null) {
			verdict = await timed(JUDGING_N, current);
			if (!verdict || !current()) return;
		}
		if (isBlocked(n)) {
			n = JUDGING_N;
			wanted = n;
			verdict ??= await timed(n, current);
			if (!verdict || !current()) return;
			chooseJudgingGrid(asked);
		} else {
			verdict = await timed(n, current);
			if (!verdict || !current()) return;
		}
		show(n, verdict);
		figure.dataset.state = 'done';
	}

	function failed(error) {
		console.error('[ocean] the FFT timing chart failed', error);
		figure.dataset.state = 'waiting';
		wanted = null;
		shown = () => showWaiting();
		shown();
	}

	const start = () => measure().catch(failed);
	figure.dataset.state = 'waiting';
	showWaiting();
	const visible = whileVisible(figure, () => {
		if (wanted !== gridSize()) start();
	});
	return {
		// Times again for a grid size other than the one shown (or always, when forced); off screen,
		// the timing waits until the chart is next on screen.
		draw({ force = false } = {}) {
			if (!force && wanted === gridSize()) return;
			if (visible()) {
				start();
			} else {
				wanted = null;
			}
		},
		resize: () => shown(),
		// Test hook: times with `fn` (measureTransforms' shape) instead, or the story's again for null.
		useTransforms(fn) {
			measureFn = fn ?? ((n) => story.charts.transforms(n));
		},
	};
}

// Runs one chart's work, logging a throw so one chart's fault never stops the others.
function safely(name, work, fallback = null) {
	try {
		return work();
	} catch (error) {
		console.error(`[ocean] the ${name} chart failed`, error);
		return fallback;
	}
}

// Redraws a chart when its width changes (one SVG unit per CSS pixel); changes in a frame land once.
function watchWidth(figures, charts) {
	if (typeof ResizeObserver === 'undefined') return;
	const widths = new Map();
	const observer = new ResizeObserver((entries) => {
		for (const entry of entries) {
			const name = entry.target.closest('figure').dataset.chart;
			const width = Math.round(entry.contentRect.width);
			const before = widths.get(name);
			widths.set(name, width);
			if (before !== undefined && before !== width && charts[name]) safely(name, () => charts[name].resize());
		}
	});
	for (const figure of Object.values(figures)) observer.observe(figure.querySelector('.chart-body'));
}

export function mountCharts(story, { onLayout = () => {} } = {}) {
	const figures = Object.fromEntries([...document.querySelectorAll('figure.chart[data-chart]')].map((f) => [f.dataset.chart, f]));
	const MAKERS = { spectrum: spectrumChart, phase: phaseChart, transforms: transformChart };
	const charts = Object.fromEntries(Object.entries(MAKERS).map(([name, make]) => [name, figures[name] ? safely(name, () => make(figures[name], story, onLayout)) : null]));
	const BY_STEP = { [stepOf('jonswap')]: 'spectrum', [stepOf('random-sea')]: 'phase', [stepOf('time')]: 'phase', [stepOf('fft')]: 'transforms' };
	const drawSpectrum = throttled(() => safely('spectrum', () => charts.spectrum.draw()), SPECTRUM_REDRAW_MS);
	let queued = new Set();
	// ocean:slider fires only for a value that really changed. The spectrum redraws at most about
	// 10 times a second while a slider drags; the other charts draw once per frame of changes.
	document.addEventListener('ocean:slider', (event) => {
		const name = BY_STEP[event.detail.step];
		if (!name || !charts[name]) return;
		if (name === 'spectrum') {
			drawSpectrum();
			return;
		}
		if (queued.size === 0) {
			requestAnimationFrame(() => {
				const names = queued;
				queued = new Set();
				for (const n of names) safely(n, () => charts[n].draw());
			});
		}
		queued.add(name);
	});
	if (charts.spectrum) safely('spectrum', () => charts.spectrum.draw());
	watchWidth(figures, charts);
	return Object.freeze({
		redraw() {
			for (const [name, chart] of Object.entries(charts)) if (chart) safely(name, () => chart.draw({ force: true }));
		},
		hooks: Object.freeze({
			useTransforms: (fn) => charts.transforms?.useTransforms(fn),
		}),
	});
}
