// The story's three charts (piece C; spec 3, steps 7 to 9), inline SVG in the page's dark chart
// tokens (style.css), fed by A3's chart data through the story stage's read-only accessors. Every
// number they show is live, either computed from the sea on screen or measured in this browser, and
// each chart says which; the numbers sit in .chart-body, which carries data-copy-skip="live" (the
// figcaptions outside it are copy-checked).
//   spectrum (step 7): JONSWAP energy against wave frequency on a log axis whose top is the
//     stormiest sea the sliders allow, with each wave layer's band shaded and the peak marked.
//   phase (step 8): the tallest waves of the 256-stud layer, each an arrow turning at the speed the
//     dispersion gives it (short waves' arrows turn fastest), looping every 120 s; turned every
//     frame through the story's phase-arrow cache, and only while the chart is on screen.
//   transforms (step 9): the wave-by-wave sum against the FFT, timed in this browser when the chart
//     comes on screen and again for each new grid size, read as page/transformTiming.js rules (a
//     rounded speedup, one re-measure, the operation ratio when the timing was disturbed).
import { arrowEnd, firstClearBox, linearScale, linePath, logScale, niceTicks } from '../page/chartGeometry.js';
import { formatMs, formatTiny, operationRatio, roundSpeedup, timeTransforms } from '../page/transformTiming.js';

const NS = 'http://www.w3.org/2000/svg';
const W = 320;
const H = 186;
const PLOT = Object.freeze({ left: 30, right: 312, top: 22, bottom: 150 });
// Five decades below the stormiest sea's peak (plus headroom) hold the calmest sea's peak too
// (3 m/s at 5,000 m sits 4.3 decades down).
const DECADES = 5;
const HEADROOM = 1.5;
// The transforms chart's first timing pays engine/charts.js's one-off JIT warm-up (about 21 ms).
// It is run on its own, through the smallest grid, so no single task blocks a frame for the
// warm-up and a measurement together.
const WARM_UP_N = 2;
const BAR = Object.freeze({ left: 92, width: 160, height: 18 });
// The SVG text is 11 px (style.css .chart-text); about this wide per character, for placing labels.
const LABEL_CHAR_WIDTH = 5.9;
const BAND_CHAR_WIDTH = 5.4; // .chart-band-label is 10 px

function svg(tag, attributes = {}, text = null) {
	const node = document.createElementNS(NS, tag);
	for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, String(value));
	if (text !== null) node.textContent = text;
	return node;
}

function note(text, className = 'chart-note') {
	const p = document.createElement('p');
	p.className = className;
	p.textContent = text;
	return p;
}

// Replaces the chart's body with a fresh SVG (and the notes under it); returns the SVG.
function canvasFor(figure, height, label, notes = []) {
	const root = svg('svg', { viewBox: `0 0 ${W} ${height}`, role: 'img', 'aria-label': label });
	figure.querySelector('.chart-body').replaceChildren(root, ...notes.map((text) => note(text)));
	return root;
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

function spectrumChart(figure, story, onLayout) {
	let drawn = false;
	function bands(root, curve, x) {
		const first = curve.omega[0];
		const last = curve.omega[curve.omega.length - 1];
		curve.bands.forEach((band, i) => {
			const from = Math.max(band.omegaMin, first);
			const to = Math.min(band.omegaMax, last);
			if (!(to > from)) return;
			root.append(svg('rect', { class: 'chart-band', 'data-layer': i + 1, x: x(from), y: PLOT.top, width: x(to) - x(from), height: PLOT.bottom - PLOT.top }));
			// Centred over its band, but kept inside the chart (the 16-stud band is narrow at the edge).
			const label = `${band.size}-stud layer`;
			const half = (label.length * BAND_CHAR_WIDTH) / 2;
			const centre = Math.min(Math.max((x(from) + x(to)) / 2, half), W - half);
			root.append(svg('text', { class: 'chart-text chart-band-label', x: centre, y: PLOT.top - 6, 'text-anchor': 'middle' }, label));
		});
	}
	function axes(root, curve, x) {
		const middle = (PLOT.top + PLOT.bottom) / 2;
		root.append(svg('rect', { class: 'chart-plot', x: PLOT.left, y: PLOT.top, width: PLOT.right - PLOT.left, height: PLOT.bottom - PLOT.top }));
		for (const tick of niceTicks(curve.omega[0], curve.omega[curve.omega.length - 1], 6)) {
			root.append(svg('line', { class: 'chart-grid', x1: x(tick), x2: x(tick), y1: PLOT.top, y2: PLOT.bottom }));
			root.append(svg('text', { class: 'chart-text', x: x(tick), y: PLOT.bottom + 12, 'text-anchor': 'middle' }, String(tick)));
		}
		root.append(svg('text', { class: 'chart-text', x: (PLOT.left + PLOT.right) / 2, y: H - 6, 'text-anchor': 'middle' }, 'wave frequency ω (rad/s)'));
		root.append(svg('text', { class: 'chart-text', x: 12, y: middle, transform: `rotate(-90 12 ${middle})`, 'text-anchor': 'middle' }, 'energy (log scale)'));
	}
	// The peak's label goes beside its line, right of it where it fits, low in the plot or high,
	// wherever the curve does not run through it.
	function peak(root, curve, x, y) {
		const px = x(curve.peakOmega);
		const label = `peak: waves ${curve.peakWavelength.toFixed(0)} studs long`;
		root.append(svg('line', { class: 'chart-peak', x1: px, x2: px, y1: PLOT.top, y2: PLOT.bottom }));
		const width = label.length * LABEL_CHAR_WIDTH;
		const spots = [];
		for (const right of [true, false]) {
			const x0 = right ? px + 4 : px - 4 - width;
			if (x0 < PLOT.left || x0 + width > PLOT.right) continue;
			for (const base of [PLOT.bottom - 6, PLOT.top + 15]) spots.push({ right, base, x0, x1: x0 + width, y0: base - 11, y1: base + 3 });
		}
		const points = curve.omega.map((w, i) => [x(w), Math.min(Math.max(y(curve.physical[i]), PLOT.top), PLOT.bottom)]);
		const spot = spots[Math.max(firstClearBox(points, spots), 0)];
		root.append(svg('text', { class: 'chart-text chart-peak-label', x: spot.right ? px + 4 : px - 4, y: spot.base, 'text-anchor': spot.right ? 'start' : 'end' }, label));
		return label;
	}
	function draw() {
		const curve = story.charts.spectrum();
		const top = story.charts.spectrumCeiling() * HEADROOM;
		const x = linearScale([curve.omega[0], curve.omega[curve.omega.length - 1]], [PLOT.left, PLOT.right]);
		const y = logScale([top / 10 ** DECADES, top], [PLOT.bottom, PLOT.top]);
		const root = canvasFor(figure, H, '', ['Computed from the sea on screen: JONSWAP at its wind and fetch, before the engine scales it up to read at game scale.']);
		bands(root, curve, x);
		axes(root, curve, x);
		root.append(svg('path', { class: 'chart-line', d: linePath(curve.omega, curve.physical, x, y, PLOT) }));
		const label = peak(root, curve, x, y);
		root.setAttribute('aria-label', `JONSWAP spectrum of the sea on screen, ${label}, with the three wave layers' frequency bands shaded`);
		// Only the first drawing changes the panel's height; a redraw keeps the same box.
		if (!drawn) {
			drawn = true;
			onLayout();
		}
	}
	return { draw };
}

function phaseChart(figure, story, onLayout) {
	const RADIUS = 30;
	const HEIGHT = 184;
	let arrows = [];
	let frame = 0;
	function build(waves) {
		const tallest = Math.max(...waves.map((a) => a.amplitude));
		const root = canvasFor(figure, HEIGHT, `The ${waves.length} tallest waves of the 256-stud layer as arrows, turning at the speeds the dispersion gives them and looping every 120 seconds; the shortest waves' arrows turn fastest`, [
			`Computed from the sea on screen. Each arrow is one wave: its angle is the wave's phase now, and its length is half that wave's crest height above the mean level, scaled so the longest arrow (${tallest.toFixed(2)} studs) fills its ring. Labels are wavelengths in studs; short waves' arrows turn fastest.`,
		]);
		const defs = svg('defs');
		const marker = svg('marker', { id: 'chart-arrowhead', viewBox: '0 0 6 6', refX: 5, refY: 3, markerWidth: 4, markerHeight: 4, orient: 'auto' });
		marker.append(svg('path', { class: 'chart-arrowhead', d: 'M0 0 L6 3 L0 6 Z' }));
		defs.append(marker);
		root.append(defs);
		arrows = waves.map((wave, i) => {
			const cx = 40 + (i % 4) * 80;
			const cy = 40 + Math.floor(i / 4) * 86;
			root.append(svg('circle', { class: 'chart-ring', cx, cy, r: RADIUS }));
			root.append(svg('circle', { class: 'chart-hub', cx, cy, r: 1.5 }));
			const line = svg('line', { class: 'chart-arrow', x1: cx, y1: cy, x2: cx, y2: cy, 'marker-end': 'url(#chart-arrowhead)' });
			root.append(line);
			root.append(svg('text', { class: 'chart-text chart-wavelength', x: cx, y: cy + RADIUS + 13, 'text-anchor': 'middle' }, `${wave.wavelength.toFixed(0)} studs`));
			return { line, cx, cy, x2: '', y2: '' };
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
			const end = arrowEnd(wave.re, wave.im, tallest, RADIUS - 3);
			const arrow = arrows[i];
			const x2 = (arrow.cx + end.x).toFixed(2);
			const y2 = (arrow.cy + end.y).toFixed(2);
			if (x2 !== arrow.x2) arrow.line.setAttribute('x2', (arrow.x2 = x2));
			if (y2 !== arrow.y2) arrow.line.setAttribute('y2', (arrow.y2 = y2));
		});
	}
	// A frame that throws stops the turning (logged once) rather than throwing every frame.
	function loop() {
		try {
			turn();
		} catch (error) {
			console.error('[ocean] the phase arrows stopped', error);
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
	return {
		// A new seed: the arrows are rebuilt on the next turn.
		draw() {
			arrows = [];
			if (visible()) turn();
		},
	};
}

function transformChart(figure, story, onLayout) {
	const HEIGHT = 64;
	// The grid size last timed or being timed (null: time again when next on screen), and which
	// timing is the latest, so an older one still running is dropped when it finishes.
	let wanted = null;
	let run = 0;
	let warmedUp = false;
	const gridSize = () => story.sliders(9).find((s) => s.id === 'transformN').value;

	function bars(root, rows, max) {
		const x = linearScale([0, max], [0, BAR.width]);
		rows.forEach(([label, value, text, cls], i) => {
			const y = 6 + i * 30;
			const width = Math.max(1, x(value));
			root.append(svg('text', { class: 'chart-text', x: 0, y: y + 13 }, label));
			root.append(svg('rect', { class: cls, x: BAR.left, y, width: width.toFixed(2), height: BAR.height }));
			root.append(svg('text', { class: 'chart-text', x: BAR.left + width + 4, y: y + 13 }, text));
		});
	}

	function showWaiting() {
		const root = canvasFor(figure, HEIGHT, 'Both ways are timed in your browser when this chart comes on screen', ['Both ways are timed in your browser when this chart comes on screen.']);
		bars(root, [['Wave by wave', 0, '', 'chart-bar-naive'], ['FFT', 0, '', 'chart-bar-fft']], 1);
	}

	function showMeasuring(n) {
		const root = canvasFor(figure, HEIGHT, `Timing a ${n} by ${n} grid both ways in your browser`, [`Timing a ${n} × ${n} grid both ways in your browser…`]);
		bars(root, [['Wave by wave', 0, '…', 'chart-bar-naive'], ['FFT', 0, '…', 'chart-bar-fft']], 1);
		onLayout();
	}

	function showVerdict(n, verdict) {
		if (verdict.disturbed) {
			const ops = verdict.operations;
			const fewer = roundSpeedup(verdict.ratio).toLocaleString('en-US');
			const root = canvasFor(figure, HEIGHT, `${n} by ${n} grid: the timing was disturbed, so the bars count steps: ${ops.naive.toLocaleString('en-US')} wave by wave, ${ops.fft.toLocaleString('en-US')} for the FFT`, [
				`${n} × ${n} grid: the timing was disturbed by other work on this device, twice, so the bars count steps instead: the FFT needs about ${fewer}× fewer steps.`,
				'Counted from the grid size, not timed.',
			]);
			bars(root, [['Wave by wave', ops.naive, `${ops.naive.toLocaleString('en-US')} steps`, 'chart-bar-naive'], ['FFT', ops.fft, `${ops.fft.toLocaleString('en-US')} steps`, 'chart-bar-fft']], ops.naive);
		} else {
			const result = verdict.result;
			const faster = roundSpeedup(result.speedup).toLocaleString('en-US');
			const fewer = roundSpeedup(operationRatio(result)).toLocaleString('en-US');
			const root = canvasFor(figure, HEIGHT, `${n} by ${n} grid: wave by wave ${formatMs(result.naiveMs)}, FFT ${formatMs(result.fftMs)}, about ${faster} times faster`, [
				`${n} × ${n} grid: the FFT was about ${faster}× faster (it does about ${fewer}× fewer steps), and the two answers agree to within ${formatTiny(result.maxDifference)}.`,
				'Measured in your browser just now.',
			]);
			bars(root, [['Wave by wave', result.naiveMs, formatMs(result.naiveMs), 'chart-bar-naive'], ['FFT', result.fftMs, formatMs(result.fftMs), 'chart-bar-fft']], result.naiveMs);
		}
		onLayout();
	}

	// Shows "measuring" and lets it paint, then runs each long task (the one-off warm-up, each timing)
	// in its own turn of the event loop, with a painted frame between them.
	async function measure() {
		const mine = ++run;
		const current = () => mine === run;
		const n = gridSize();
		wanted = n;
		figure.dataset.state = 'measuring';
		showMeasuring(n);
		await afterPaint();
		if (!current()) return;
		if (!warmedUp) {
			warmedUp = true;
			story.charts.transforms(WARM_UP_N);
			await afterPaint();
			if (!current()) return;
		}
		const verdict = await timeTransforms(story.charts.transforms, n, afterPaint, { stillWanted: current });
		if (verdict === null || !current()) return;
		showVerdict(n, verdict);
		figure.dataset.state = 'done';
	}

	function failed(error) {
		console.error('[ocean] the FFT timing chart failed', error);
		figure.dataset.state = 'waiting';
		wanted = null;
		showWaiting();
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

export function mountCharts(story, { onLayout = () => {} } = {}) {
	const figures = Object.fromEntries([...document.querySelectorAll('figure.chart[data-chart]')].map((f) => [f.dataset.chart, f]));
	const MAKERS = { spectrum: spectrumChart, phase: phaseChart, transforms: transformChart };
	const charts = Object.fromEntries(Object.entries(MAKERS).map(([name, make]) => [name, figures[name] ? safely(name, () => make(figures[name], story, onLayout)) : null]));
	const BY_STEP = { 7: 'spectrum', 8: 'phase', 9: 'transforms' };
	let queued = new Set();
	// ocean:slider fires only for a value that really changed; changes in one frame draw once.
	document.addEventListener('ocean:slider', (event) => {
		const name = BY_STEP[event.detail.step];
		if (!name || !charts[name]) return;
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
	return Object.freeze({
		redraw() {
			for (const [name, chart] of Object.entries(charts)) if (chart) safely(name, () => chart.draw({ force: true }));
		},
	});
}
