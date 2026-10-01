// The story's three charts (piece C, Task 8): the jonswap step's spectrum, the phase arrows (held
// still in the random-sea step, turning in the time step: piece C2, lane E) and the fft step's FFT
// timing, drawn live from the ocean's own numbers.
import { test, expect } from '@playwright/test';
import { arrowEnd } from '../../../content/ocean/js/page/chartGeometry.js';
import { stepOf } from '../../../content/ocean/js/stages/steps.js';
import { oceanRunning, scrollToFigure, scrollToId, scrollToStep, waitFrames, watchErrors } from './helpers/story.js';

// The charts' steps by id (piece C2, Task 0): the spectrum is the jonswap step's; the phase arrows
// are held still in the random-sea step's figure and turn in the time step's; the FFT timing is the
// fft step's. Lane E's frequency charts are the frequency and fourier steps'.
const SPECTRUM = stepOf('jonswap');
const STILL = stepOf('random-sea');
const PHASE = stepOf('time');
const TIMING = stepOf('fft');
const STILL_FIGURE = 'figure.chart[data-chart="phase"][data-motion="still"]';
const TURNING_FIGURE = 'figure.chart[data-chart="phase"][data-motion="turning"]';

function contrast(a, b) {
	const lum = (rgb) => {
		const [r, g, bl] = rgb.map((v) => {
			const c = v / 255;
			return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
		});
		return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
	};
	const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
	return (hi + 0.05) / (lo + 0.05);
}
const rgb = (css) => css.match(/[\d.]+/g).slice(0, 3).map(Number);

function setRange(page, step, id, value) {
	return page.evaluate(([s, i, v]) => {
		const input = document.querySelector(`#step-${s} [data-slider="${i}"] input[type=range]`);
		input.value = String(v);
		input.dispatchEvent(new Event('input', { bubbles: true }));
	}, [step, id, value]);
}

// Records every data-state the timing figure takes from now on.
function recordStates(page) {
	return page.evaluate((step) => {
		const figure = document.querySelector(`#step-${step} figure.chart`);
		window.__chartStates = [];
		new MutationObserver(() => window.__chartStates.push(figure.dataset.state)).observe(figure, { attributes: true, attributeFilter: ['data-state'] });
	}, TIMING);
}
const recordedStates = (page) => page.evaluate(() => [...window.__chartStates]);

test.describe.configure({ timeout: 240_000 });

test('the jonswap step draws the spectrum of the sea on screen, and a stronger wind moves it', async ({ page }) => {
	const errors = watchErrors(page);
	await oceanRunning(page);
	await scrollToId(page, 'jonswap', 0.2);
	const line = page.locator(`#step-${SPECTRUM} figure.chart path.chart-line`);
	await expect(line).toHaveCount(1);
	const before = await line.getAttribute('d');
	expect(before.split('L').length).toBeGreaterThan(100);
	await expect(page.locator(`#step-${SPECTRUM} figure.chart .chart-band`)).toHaveCount(3);
	const peakBefore = await page.locator(`#step-${SPECTRUM} figure.chart .chart-peak-label`).textContent();
	await setRange(page, SPECTRUM, 'wind', 22);
	await expect.poll(() => line.getAttribute('d')).not.toBe(before);
	await expect(page.locator(`#step-${SPECTRUM} figure.chart .chart-peak-label`)).not.toHaveText(peakBefore);
	expect(errors).toEqual([]);
});

// The axis is fixed (its top is the stormiest sea the sliders allow), so the calmest and the
// stormiest seas both keep their peak inside the plot.
test("the jonswap step's axis holds the peak of every sea the sliders allow, labelled as computed live", async ({ page }) => {
	await oceanRunning(page);
	await scrollToId(page, 'jonswap', 0.2);
	const figure = page.locator(`#step-${SPECTRUM} figure.chart`);
	await expect(figure).toContainText('Computed from the sea on screen');
	const peakY = () => figure.evaluate((f) => {
		const plot = f.querySelector('.chart-plot');
		const ys = f.querySelector('path.chart-line').getAttribute('d').slice(1).split(' L').map((p) => Number(p.split(' ')[1]));
		return { top: Number(plot.getAttribute('y')), bottom: Number(plot.getAttribute('y')) + Number(plot.getAttribute('height')), peak: Math.min(...ys) };
	});
	for (const [wind, fetch] of [[3, 5000], [25, 200000]]) {
		await setRange(page, SPECTRUM, 'wind', wind);
		await setRange(page, SPECTRUM, 'fetch', fetch === 5000 ? 0 : 1000);
		await page.waitForTimeout(100);
		const { top, bottom, peak } = await peakY();
		expect(peak, `wind ${wind}, fetch ${fetch}: the peak is inside the plot`).toBeGreaterThan(top);
		expect(peak, `wind ${wind}, fetch ${fetch}: the peak is above the floor`).toBeLessThan(bottom - 5);
	}
	await expect(figure.locator('.chart-peak-label')).toContainText('studs');
});

test("the time step's arrows are eight real waves, turning while the ocean runs", async ({ page }) => {
	await oceanRunning(page);
	await scrollToId(page, 'time', 0.2);
	const arrows = page.locator(`#step-${PHASE} ${TURNING_FIGURE} line.chart-arrow`);
	await expect(arrows).toHaveCount(8);
	const first = async () => arrows.first().evaluate((l) => `${l.getAttribute('x2')},${l.getAttribute('y2')}`);
	const before = await first();
	await waitFrames(page, 10);
	expect(await first()).not.toBe(before);
});

// The arrows are labelled with their wavelengths in studs (the ocean's unit), and nothing
// gives an arrow a speed of its own: they turn at the speeds the dispersion gives them.
test("the time step's arrows are labelled in studs and computed from the sea on screen", async ({ page }) => {
	await oceanRunning(page);
	await scrollToId(page, 'time', 0.2);
	const figure = page.locator(`#step-${PHASE} ${TURNING_FIGURE}`);
	await expect(figure.locator('line.chart-arrow')).toHaveCount(8);
	const labels = await figure.locator('text.chart-wavelength').allTextContents();
	expect(labels).toHaveLength(8);
	for (const label of labels) expect(label).toMatch(/^\d+ studs$/);
	await expect(figure).toContainText('Computed from the sea on screen');
	const words = await figure.evaluate((f) => `${f.textContent} ${f.querySelector('svg').getAttribute('aria-label')}`);
	expect(words).not.toMatch(/own speed/);
	expect(words).toContain('the dispersion gives them');
});

test("the time step's arrows stop being redrawn while the chart is off screen", async ({ page }) => {
	await oceanRunning(page);
	await scrollToId(page, 'time', 0.2);
	const arrow = page.locator(`#step-${PHASE} ${TURNING_FIGURE} line.chart-arrow`).first();
	await expect(arrow).toHaveCount(1);
	await scrollToId(page, 'glow', 0.5);
	await waitFrames(page, 5);
	const parked = await arrow.getAttribute('x2');
	await waitFrames(page, 20);
	expect(await arrow.getAttribute('x2')).toBe(parked);
});

// Whether this machine may time 64 × 64 now. A loaded machine can be legitimately too slow: its
// fastest n = 32 timing (the one on show) predicts a single naive n = 64 run over 40 ms (16 times
// the n = 32 one), and then 64 must be switched off with its note rather than run.
async function mayTime64(page) {
	const option = page.locator(`#step-${TIMING} [data-slider="transformN"] button[data-option="64"]`);
	if (await option.isEnabled()) return true;
	const naive = await page.evaluate((step) => Number.parseFloat(document.querySelector(`#step-${step} figure.chart svg .chart-bar-naive + text`).textContent), TIMING);
	expect(naive * 16, `64 × 64 switched off after a ${naive} ms n = 32 timing`).toBeGreaterThan(40);
	await expect(page.locator(`#step-${TIMING} [data-slider="transformN"]`)).toContainText('too slow to time here without freezing the page');
	console.log(`[charts.spec] this machine is loaded: n = 32 took ${naive} ms, so 64 × 64 is switched off`);
	return false;
}

test('the fft step times both ways in the visitor browser, again for a new grid size', async ({ page }) => {
	await oceanRunning(page);
	await scrollToId(page, 'fft', 0.2);
	const figure = page.locator(`#step-${TIMING} figure.chart`);
	await expect(figure).toHaveAttribute('data-state', 'done', { timeout: 60_000 });
	await expect(figure).toContainText(/Measured in your browser just now|disturbed by other work on this device/);
	await expect(figure).toContainText('32 × 32');
	const widths = await figure.evaluate((f) => [f.querySelector('.chart-bar-naive').getAttribute('width'), f.querySelector('.chart-bar-fft').getAttribute('width')].map(Number));
	expect(widths[0]).toBeGreaterThan(widths[1]);
	const next = (await mayTime64(page)) ? 64 : 16;
	await page.locator(`#step-${TIMING} [data-slider="transformN"] button[data-option="${next}"]`).click();
	await expect(figure).toContainText(`${next} × ${next}`, { timeout: 60_000 });
	await expect(figure).toHaveAttribute('data-state', 'done', { timeout: 60_000 });
});

// The A3 T6 ruling: a rounded speedup ("about N×") no larger than the operation ratio allows, or,
// when the timing was disturbed twice, the operation ratio instead.
test('the fft step prints a rounded, believable speedup or says the timing was disturbed', async ({ page }) => {
	await oceanRunning(page);
	await scrollToId(page, 'fft', 0.2);
	const figure = page.locator(`#step-${TIMING} figure.chart`);
	await expect(figure).toHaveAttribute('data-state', 'done', { timeout: 60_000 });
	const sizes = (await mayTime64(page)) ? [8, 64] : [8, 16];
	for (const n of sizes) {
		await recordStates(page);
		await page.locator(`#step-${TIMING} [data-slider="transformN"] button[data-option="${n}"]`).click();
		await expect(figure).toContainText(`${n} × ${n}`, { timeout: 60_000 });
		await expect(figure).toHaveAttribute('data-state', 'done', { timeout: 60_000 });
		expect(await recordedStates(page)).toContain('measuring');
		const text = await figure.textContent();
		const ratio = (n * n) / Math.log2(n);
		const measured = /the FFT was about ([\d,]+)× faster/.exec(text);
		if (measured) {
			const speedup = Number(measured[1].replaceAll(',', ''));
			expect(speedup, text).toBeLessThanOrEqual(ratio * 1.2 * 1.05);
			expect(speedup, text).toBeGreaterThanOrEqual((ratio / 4) * 0.95);
			expect(text).toContain('Measured in your browser just now');
		} else {
			expect(text).toContain('disturbed by other work on this device');
			expect(text).toMatch(new RegExp(`about ${Math.round(ratio) >= 10 ? '[\\d,]+' : '\\d'}× fewer steps`));
		}
	}
});

// ocean:slider fires only when a value really changed, and the chart re-times only for a new grid
// size: pressing the option already chosen times nothing.
test('the fft step does not re-time for the grid size it already shows', async ({ page }) => {
	await oceanRunning(page);
	await scrollToId(page, 'fft', 0.2);
	const figure = page.locator(`#step-${TIMING} figure.chart`);
	await expect(figure).toHaveAttribute('data-state', 'done', { timeout: 60_000 });
	await recordStates(page);
	await page.locator(`#step-${TIMING} [data-slider="transformN"] button[data-option="32"]`).click();
	await waitFrames(page, 10);
	expect(await recordedStates(page)).toEqual([]);
});

// Fix round 1: with the peak near 3 rad/s the old placement found no room for the peak's label on
// either side of the peak line, and the chart threw (nine reachable settings; wind 7 m/s at 5,000 m
// is one; tests/ocean/page/spectrumLayout.test.js checks every setting at two chart widths). Here
// the page draws it at a laptop's and a phone's chart width, with no error.
for (const viewport of [{ width: 1366, height: 767 }, { width: 390, height: 844 }]) test(`the jonswap step labels the peak at wind 7 m/s and 5,000 m without an error (${viewport.width} px)`, async ({ page }) => {
	const errors = watchErrors(page);
	await page.setViewportSize(viewport);
	await oceanRunning(page);
	await scrollToId(page, 'jonswap', 0.2);
	await setRange(page, SPECTRUM, 'wind', 7);
	await setRange(page, SPECTRUM, 'fetch', 0);
	const figure = page.locator(`#step-${SPECTRUM} figure.chart`);
	await expect(figure.locator('.chart-peak-label')).toContainText('studs long');
	await expect.poll(() => figure.locator('svg').getAttribute('aria-label')).toContain('peak');
	await expect(page.locator(`#step-${SPECTRUM} [data-slider="fetch"] output`)).toContainText('5,000');
	expect(await textOutsideViewBox(page, SPECTRUM)).toEqual([]);
	expect(errors).toEqual([]);
});

// Every text in a chart's SVG sits inside its viewBox.
function textOutsideViewBox(page, step) {
	return page.evaluate((n) => {
		const svg = document.querySelector(`#step-${n} figure.chart svg`);
		const box = svg.viewBox.baseVal;
		return [...svg.querySelectorAll('text:not([transform])')]
			.map((t) => ({ text: t.textContent, b: t.getBBox() }))
			.filter(({ b }) => b.x < box.x - 0.5 || b.y < box.y - 0.5 || b.x + b.width > box.x + box.width + 0.5 || b.y + b.height > box.y + box.height + 0.5)
			.map(({ text, b }) => `${text} at ${b.x.toFixed(1)}..${(b.x + b.width).toFixed(1)} of ${box.width}`);
	}, step);
}

// A stand-in for engine/charts.js measureTransforms (through the charts' test hook): `naive` and
// `fft` milliseconds per grid size, from a table the test can change (setStubTimes).
function stubTransforms(page, times) {
	return page.evaluate((table) => {
		window.__chartCalls = [];
		window.__stubTimes = table;
		window.__charts.useTransforms((n) => {
			window.__chartCalls.push(n);
			const cells = n * n;
			const { naive, fft } = window.__stubTimes[n];
			return { n, waves: cells, naiveMs: naive, fftMs: fft, speedup: naive / fft, operations: { naive: cells * cells, fft: cells * Math.log2(n) }, maxDifference: 3e-14, batches: { naive: 3, fft: 5 } };
		});
	}, times);
}

for (const viewport of [{ width: 1366, height: 767 }, { width: 390, height: 844 }]) {
	test(`a timing disturbed twice shows step counts that fit the chart (${viewport.width} px)`, async ({ page }) => {
		await page.setViewportSize(viewport);
		await oceanRunning(page);
		// Speedups far past the operation ratio, every time.
		await stubTransforms(page, { 2: { naive: 1, fft: 1 }, 32: { naive: 50, fft: 0.001 } });
		await scrollToId(page, 'fft', 0.2);
		const figure = page.locator(`#step-${TIMING} figure.chart`);
		await expect(figure).toHaveAttribute('data-state', 'done', { timeout: 60_000 });
		await expect(figure).toContainText('disturbed by other work on this device');
		await expect(figure).toContainText('1.0 M steps');
		expect(await page.evaluate(() => window.__chartCalls.filter((n) => n === 32).length)).toBe(2);
		expect(await textOutsideViewBox(page, TIMING)).toEqual([]);
		// A disturbed timing judges nothing: 64 × 64 stays on offer, with no "too slow" note.
		await expect(page.locator(`#step-${TIMING} [data-slider="transformN"] button[data-option="64"]`)).toBeEnabled();
		await expect(page.locator(`#step-${TIMING} [data-slider="transformN"]`)).not.toContainText('too slow');
	});
}

// Fix round 1: on a slow device the n = 64 naive sum (one run, 16 times n = 32's) blocks the page
// for over 100 ms, so the 64 option is switched off, with a note, instead of run.
test('the fft step switches off 64 × 64 where the n = 32 timing says it would freeze the page', async ({ page }) => {
	await oceanRunning(page);
	await stubTransforms(page, { 2: { naive: 0.01, fft: 0.001 }, 16: { naive: 0.46, fft: 0.0125 }, 32: { naive: 7.4, fft: 0.05 }, 64: { naive: 118, fft: 0.2 } });
	await scrollToId(page, 'fft', 0.2);
	const figure = page.locator(`#step-${TIMING} figure.chart`);
	await expect(figure).toHaveAttribute('data-state', 'done', { timeout: 60_000 });
	const option = page.locator(`#step-${TIMING} [data-slider="transformN"] button[data-option="64"]`);
	await expect(option).toBeDisabled();
	await expect(page.locator(`#step-${TIMING} [data-slider="transformN"]`)).toContainText('too slow to time here without freezing the page');
	// A refresh of the controls (another option chosen) keeps it off.
	await page.locator(`#step-${TIMING} [data-slider="transformN"] button[data-option="16"]`).click({ force: true });
	await expect(option).toBeDisabled();
	expect(await page.evaluate(() => window.__chartCalls)).not.toContain(64);
});

test('the fft step checks a device with n = 32 before timing 64 × 64 chosen first', async ({ page }) => {
	await oceanRunning(page);
	await stubTransforms(page, { 2: { naive: 0.01, fft: 0.001 }, 32: { naive: 7.4, fft: 0.05 }, 64: { naive: 118, fft: 0.2 } });
	await page.locator(`#step-${TIMING} [data-slider="transformN"] button[data-option="64"]`).click({ force: true });
	await scrollToId(page, 'fft', 0.2);
	const figure = page.locator(`#step-${TIMING} figure.chart`);
	await expect(figure).toHaveAttribute('data-state', 'done', { timeout: 60_000 });
	await expect(figure).toContainText('32 × 32');
	const back = page.locator(`#step-${TIMING} [data-slider="transformN"] button[data-option="32"]`);
	await expect(back).toHaveAttribute('aria-checked', 'true');
	// The pressed option was switched off under the visitor's focus; focus moves with the choice.
	await expect(back).toBeFocused();
	expect(await page.evaluate(() => window.__chartCalls)).not.toContain(64);
});

// Final review (parked item): a reader just scrolling past step 19, focus on nothing, keeps focus on
// nothing when the chart moves the choice back from a grid too slow to time.
test('moving the choice back takes no focus from a reader who was not on the control', async ({ page }) => {
	await oceanRunning(page);
	await stubTransforms(page, { 2: { naive: 0.01, fft: 0.001 }, 32: { naive: 7.4, fft: 0.05 }, 64: { naive: 118, fft: 0.2 } });
	await page.locator(`#step-${TIMING} [data-slider="transformN"] button[data-option="64"]`).click({ force: true });
	await page.evaluate(() => document.activeElement.blur());
	expect(await page.evaluate(() => document.activeElement === document.body)).toBe(true);
	await scrollToId(page, 'fft', 0.2);
	const figure = page.locator(`#step-${TIMING} figure.chart`);
	await expect(figure).toHaveAttribute('data-state', 'done', { timeout: 60_000 });
	await expect(page.locator(`#step-${TIMING} [data-slider="transformN"] button[data-option="32"]`)).toHaveAttribute('aria-checked', 'true');
	expect(await page.evaluate(() => document.activeElement === document.body)).toBe(true);
});

// Fix round 2: load only slows a timing, so the fastest believable one judges. A first n = 32
// reading spiked by load (3.0 ms, predicting 48 ms at 64) switches 64 off; a faster later reading
// (here at 16) switches it back on.
test('a load-spiked first timing switches 64 × 64 off only until a faster timing', async ({ page }) => {
	await oceanRunning(page);
	await stubTransforms(page, { 2: { naive: 0.01, fft: 0.001 }, 16: { naive: 0.11, fft: 0.003 }, 32: { naive: 3.0, fft: 0.02 }, 64: { naive: 28, fft: 0.066 } });
	await scrollToId(page, 'fft', 0.2);
	const figure = page.locator(`#step-${TIMING} figure.chart`);
	await expect(figure).toHaveAttribute('data-state', 'done', { timeout: 60_000 });
	const option = page.locator(`#step-${TIMING} [data-slider="transformN"] button[data-option="64"]`);
	await expect(option).toBeDisabled();
	// Before switching 64 off it took a second reading: one spike alone never decides.
	expect(await page.evaluate(() => window.__chartCalls.filter((n) => n === 32).length)).toBe(2);
	await page.evaluate(() => {
		window.__stubTimes[32] = { naive: 1.8, fft: 0.015 };
	});
	await page.locator(`#step-${TIMING} [data-slider="transformN"] button[data-option="16"]`).click();
	await expect(figure).toContainText('16 × 16 grid', { timeout: 60_000 });
	await expect(option).toBeEnabled();
	await expect(page.locator(`#step-${TIMING} [data-slider="transformN"]`)).not.toContainText('too slow');
	await option.click();
	await expect(figure).toContainText('64 × 64 grid: the FFT was about 420× faster', { timeout: 60_000 });
});

test('a spike that the second reading does not repeat never switches 64 × 64 off', async ({ page }) => {
	await oceanRunning(page);
	// n = 32's times come from the getter below: a spike first, then a faster reading.
	await stubTransforms(page, { 2: { naive: 0.01, fft: 0.001 }, 64: { naive: 28, fft: 0.066 } });
	await page.evaluate(() => {
		const stub = window.__stubTimes;
		let calls = 0;
		Object.defineProperty(stub, 32, { get: () => (calls++ === 0 ? { naive: 3.0, fft: 0.02 } : { naive: 1.8, fft: 0.015 }) });
	});
	await scrollToId(page, 'fft', 0.2);
	const figure = page.locator(`#step-${TIMING} figure.chart`);
	await expect(figure).toHaveAttribute('data-state', 'done', { timeout: 60_000 });
	await expect(page.locator(`#step-${TIMING} [data-slider="transformN"] button[data-option="64"]`)).toBeEnabled();
	await expect(figure).toContainText('1.80 ms');
});

// Fix round 2: a judging timing disturbed twice says nothing about speed, so 64 × 64 is timed the
// normal way rather than switched off.
test('a disturbed judging timing leaves 64 × 64 to the normal timing', async ({ page }) => {
	await oceanRunning(page);
	await stubTransforms(page, { 2: { naive: 0.01, fft: 0.001 }, 32: { naive: 50, fft: 0.001 }, 64: { naive: 28, fft: 0.066 } });
	await page.locator(`#step-${TIMING} [data-slider="transformN"] button[data-option="64"]`).click({ force: true });
	await scrollToId(page, 'fft', 0.2);
	const figure = page.locator(`#step-${TIMING} figure.chart`);
	await expect(figure).toContainText('64 × 64 grid: the FFT was about 420× faster', { timeout: 60_000 });
	await expect(figure).toHaveAttribute('data-state', 'done');
	await expect(page.locator(`#step-${TIMING} [data-slider="transformN"] button[data-option="64"]`)).toBeEnabled();
	await expect(page.locator(`#step-${TIMING} [data-slider="transformN"]`)).not.toContainText('too slow');
});

test('a fast device still times 64 × 64', async ({ page }) => {
	await oceanRunning(page);
	await stubTransforms(page, { 2: { naive: 0.01, fft: 0.001 }, 32: { naive: 1.85, fft: 0.015 }, 64: { naive: 28, fft: 0.066 } });
	await scrollToId(page, 'fft', 0.2);
	const figure = page.locator(`#step-${TIMING} figure.chart`);
	await expect(figure).toHaveAttribute('data-state', 'done', { timeout: 60_000 });
	const option = page.locator(`#step-${TIMING} [data-slider="transformN"] button[data-option="64"]`);
	await expect(option).toBeEnabled();
	await option.click();
	await expect(figure).toContainText('64 × 64 grid: the FFT was about 420× faster', { timeout: 60_000 });
});

// Fix round 1: on a 390 px phone the charts' SVG text renders at 12 px or more; C2 (lane E): at
// 320 px too, for every chart including the frequency and fourier steps' and the still arrows.
for (const width of [390, 320]) test(`the charts read at 12 px on a ${width} px phone`, async ({ page }) => {
	await page.setViewportSize({ width, height: 844 });
	await oceanRunning(page);
	for (const id of ['frequency', 'fourier', 'jonswap', 'random-sea', 'time', 'fft']) {
		const step = stepOf(id);
		// The figure on screen: a chart draws only then, and on a phone it sits below the step's words.
		await scrollToFigure(page, id, 'figure.chart');
		await page.waitForFunction((n) => document.querySelector(`#step-${n} figure.chart svg text`), step, { timeout: 30_000 });
		const sizes = await page.evaluate((n) => {
			const svg = document.querySelector(`#step-${n} figure.chart svg`);
			const scale = svg.getBoundingClientRect().width / svg.viewBox.baseVal.width;
			return [...svg.querySelectorAll('text')].map((t) => parseFloat(getComputedStyle(t).fontSize) * scale);
		}, step);
		expect(sizes.length).toBeGreaterThan(0);
		expect(Math.min(...sizes), `step ${step}`).toBeGreaterThanOrEqual(11.9);
		expect(await textOutsideViewBox(page, step)).toEqual([]);
	}
	expect(await page.evaluate(() => document.scrollingElement.scrollWidth <= window.innerWidth)).toBe(true);
});

for (const scheme of ['dark', 'light']) {
	test(`the charts read when the system prefers ${scheme} (the page is always dark)`, async ({ page }) => {
		await page.emulateMedia({ colorScheme: scheme });
		await oceanRunning(page);
		await scrollToId(page, 'jonswap', 0.2);
		await expect(page.locator(`#step-${SPECTRUM} figure.chart path.chart-line`)).toHaveCount(1);
		const colours = await page.evaluate((step) => ({
			bg: getComputedStyle(document.querySelector(`#step-${step} figure.chart`)).backgroundColor,
			line: getComputedStyle(document.querySelector(`#step-${step} figure.chart .chart-line`)).stroke,
			text: getComputedStyle(document.querySelector(`#step-${step} figure.chart .chart-text`)).fill,
		}), SPECTRUM);
		expect(contrast(rgb(colours.line), rgb(colours.bg))).toBeGreaterThanOrEqual(3);
		expect(contrast(rgb(colours.text), rgb(colours.bg))).toBeGreaterThanOrEqual(4.5);
	});
}

test("step 17's arrows are held still at their starting angles; step 18's turn", async ({ page }) => {
	test.setTimeout(180_000);
	await oceanRunning(page);
	// Step 18's arrows (and its sea's arrow cache) are built on its first show, not at the story's
	// start; since Task 15 its empty box is there from the start, holding the height it draws at.
	await expect(page.locator(`${TURNING_FIGURE} .chart-body svg`)).toHaveCount(1);
	await expect(page.locator(`${TURNING_FIGURE} .chart-body line.chart-arrow`)).toHaveCount(0);
	const ends = (motion) => page.evaluate((m) => [...document.querySelectorAll(`figure[data-chart="phase"][data-motion="${m}"] line.chart-arrow`)].map((l) => `${l.getAttribute('x2')},${l.getAttribute('y2')}`), motion);
	await scrollToId(page, 'random-sea', 0.2);
	await expect.poll(async () => (await ends('still')).length, { timeout: 30_000 }).toBe(8);
	const held = await ends('still');
	await waitFrames(page, 45);
	expect(await ends('still')).toEqual(held);
	// Held at their starting angles: each arrow is arrowEnd of its wave at t = 0, in its own ring.
	const drawn = await page.evaluate(([figure, step]) => ({
		waves: window.__ocean.story.phaseArrows(0, step).map(({ re, im, amplitude }) => ({ re, im, amplitude })),
		lines: [...document.querySelectorAll(`${figure} line.chart-arrow`)].map((l) => ['x1', 'y1', 'x2', 'y2'].map((a) => Number(l.getAttribute(a)))),
		radii: [...document.querySelectorAll(`${figure} circle.chart-ring`)].map((c) => Number(c.getAttribute('r'))),
	}), [STILL_FIGURE, STILL]);
	const tallest = Math.max(...drawn.waves.map((w) => w.amplitude));
	drawn.waves.forEach((wave, i) => {
		const end = arrowEnd(wave.re, wave.im, tallest, drawn.radii[i] - 3);
		const [x1, y1, x2, y2] = drawn.lines[i];
		expect(Math.abs(x2 - (x1 + end.x)), `arrow ${i} x`).toBeLessThan(0.01);
		expect(Math.abs(y2 - (y1 + end.y)), `arrow ${i} y`).toBeLessThan(0.01);
	});
	await scrollToId(page, 'time', 0.2);
	await expect.poll(async () => (await ends('turning')).length, { timeout: 30_000 }).toBe(8);
	const first = await ends('turning');
	await waitFrames(page, 45);
	expect(await ends('turning')).not.toEqual(first);
	// Two arrow figures on one page: no id inside the charts is used twice.
	const ids = await page.evaluate(() => [...document.querySelectorAll('figure.chart [id]')].map((n) => n.id));
	expect(ids.length).toBeGreaterThan(0);
	expect(new Set(ids).size).toBe(ids.length);
});

// R13: each figure draws its own step's sea. A new sea in step 17 re-deals step 17's still arrows
// (a different eight tallest waves, at new starting angles) and leaves step 18's, whose sea keeps
// its own seed, as they were.
test("a new sea in step 17 changes step 17's arrows and not step 18's", async ({ page }) => {
	test.setTimeout(180_000);
	await oceanRunning(page);
	const read = (figure) => page.evaluate((f) => {
		const root = document.querySelector(f);
		return {
			labels: [...root.querySelectorAll('text.chart-wavelength')].map((t) => t.textContent),
			ends: [...root.querySelectorAll('line.chart-arrow')].map((l) => `${l.getAttribute('x2')},${l.getAttribute('y2')}`),
		};
	}, figure);
	await scrollToId(page, 'time', 0.2);
	await expect.poll(async () => (await read(TURNING_FIGURE)).labels.length, { timeout: 30_000 }).toBe(8);
	const turning = await read(TURNING_FIGURE);
	await scrollToId(page, 'random-sea', 0.2);
	await expect.poll(async () => (await read(STILL_FIGURE)).ends.length, { timeout: 30_000 }).toBe(8);
	const still = await read(STILL_FIGURE);
	await page.locator(`#step-${STILL} [data-slider="seed"] button.control-press`).click();
	await expect.poll(async () => (await read(STILL_FIGURE)).ends, { timeout: 30_000 }).not.toEqual(still.ends);
	expect((await read(STILL_FIGURE)).labels, 'a new sea deals different tallest waves').not.toEqual(still.labels);
	await scrollToId(page, 'time', 0.2);
	await waitFrames(page, 10);
	expect((await read(TURNING_FIGURE)).labels).toEqual(turning.labels);
});

// A still figure that throws when it comes on screen takes the same logged path as the turning loop
// ("the phase arrows stopped"), never an uncaught error. The fault: its body refuses new children,
// and a redraw (here, step 17's slider event) has cleared its arrows, so the show must rebuild them.
test("a still arrow figure that throws on show is logged, not thrown", async ({ page }) => {
	test.setTimeout(180_000);
	const uncaught = [];
	const logged = [];
	page.on('pageerror', (error) => uncaught.push(error.message));
	page.on('console', (message) => message.type() === 'error' && logged.push(message.text()));
	await oceanRunning(page);
	await page.evaluate((step) => {
		const original = Element.prototype.replaceChildren;
		Element.prototype.replaceChildren = function (...nodes) {
			if (this.closest('figure[data-motion="still"]')) throw new Error('test: the still figure refuses');
			return original.apply(this, nodes);
		};
		document.dispatchEvent(new CustomEvent('ocean:slider', { detail: { step, id: 'seed', value: 2 } }));
	}, STILL);
	await waitFrames(page, 5);
	await scrollToId(page, 'random-sea', 0.2);
	await waitFrames(page, 10);
	expect(uncaught).toEqual([]);
	expect(logged.some((text) => text.includes('the phase arrows stopped'))).toBe(true);
});

// On a 320 px phone four rings share a row: a wavelength label, even the widest one the 256-stud
// layer can have (256), fits its own column, so neighbours never run into each other.
test('the arrows\' wavelength labels fit their columns on a 320 px phone', async ({ page }) => {
	test.setTimeout(180_000);
	await page.setViewportSize({ width: 320, height: 700 });
	await oceanRunning(page);
	await scrollToId(page, 'random-sea', 0.2);
	await expect(page.locator(`${STILL_FIGURE} text.chart-wavelength`)).toHaveCount(8, { timeout: 30_000 });
	const fit = await page.evaluate((figure) => {
		const svg = document.querySelector(`${figure} svg`);
		const column = svg.viewBox.baseVal.width / 4;
		const labels = [...svg.querySelectorAll('text.chart-wavelength')];
		const widest = labels[0].cloneNode(true);
		widest.textContent = labels[0].textContent.replace(/^\d+/, '256');
		svg.append(widest);
		const widths = [...labels, widest].map((t) => t.getComputedTextLength());
		widest.remove();
		return { column, widths };
	}, STILL_FIGURE);
	for (const width of fit.widths) expect(width).toBeLessThanOrEqual(fit.column - 4);
});
