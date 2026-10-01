// The story's three charts (piece C, Task 8): step 7's spectrum, step 8's phase arrows and step 9's
// FFT timing, drawn live from the ocean's own numbers.
import { test, expect } from '@playwright/test';
import { oceanRunning, scrollToStep, waitFrames, watchErrors } from './helpers/story.js';

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
	return page.evaluate(() => {
		const figure = document.querySelector('#step-9 figure.chart');
		window.__chartStates = [];
		new MutationObserver(() => window.__chartStates.push(figure.dataset.state)).observe(figure, { attributes: true, attributeFilter: ['data-state'] });
	});
}
const recordedStates = (page) => page.evaluate(() => [...window.__chartStates]);

test.describe.configure({ timeout: 240_000 });

test('step 7 draws the spectrum of the sea on screen, and a stronger wind moves it', async ({ page }) => {
	const errors = watchErrors(page);
	await oceanRunning(page);
	await scrollToStep(page, 7, 0.2);
	const line = page.locator('#step-7 figure.chart path.chart-line');
	await expect(line).toHaveCount(1);
	const before = await line.getAttribute('d');
	expect(before.split('L').length).toBeGreaterThan(100);
	await expect(page.locator('#step-7 figure.chart .chart-band')).toHaveCount(3);
	const peakBefore = await page.locator('#step-7 figure.chart .chart-peak-label').textContent();
	await setRange(page, 7, 'wind', 22);
	await expect.poll(() => line.getAttribute('d')).not.toBe(before);
	await expect(page.locator('#step-7 figure.chart .chart-peak-label')).not.toHaveText(peakBefore);
	expect(errors).toEqual([]);
});

// The axis is fixed (its top is the stormiest sea the sliders allow), so the calmest and the
// stormiest seas both keep their peak inside the plot.
test("step 7's axis holds the peak of every sea the sliders allow, labelled as computed live", async ({ page }) => {
	await oceanRunning(page);
	await scrollToStep(page, 7, 0.2);
	const figure = page.locator('#step-7 figure.chart');
	await expect(figure).toContainText('Computed from the sea on screen');
	const peakY = () => figure.evaluate((f) => {
		const plot = f.querySelector('.chart-plot');
		const ys = f.querySelector('path.chart-line').getAttribute('d').slice(1).split(' L').map((p) => Number(p.split(' ')[1]));
		return { top: Number(plot.getAttribute('y')), bottom: Number(plot.getAttribute('y')) + Number(plot.getAttribute('height')), peak: Math.min(...ys) };
	});
	for (const [wind, fetch] of [[3, 5000], [25, 200000]]) {
		await setRange(page, 7, 'wind', wind);
		await setRange(page, 7, 'fetch', fetch === 5000 ? 0 : 1000);
		await page.waitForTimeout(100);
		const { top, bottom, peak } = await peakY();
		expect(peak, `wind ${wind}, fetch ${fetch}: the peak is inside the plot`).toBeGreaterThan(top);
		expect(peak, `wind ${wind}, fetch ${fetch}: the peak is above the floor`).toBeLessThan(bottom - 5);
	}
	await expect(figure.locator('.chart-peak-label')).toContainText('studs');
});

test("step 8's arrows are eight real waves, turning while the ocean runs", async ({ page }) => {
	await oceanRunning(page);
	await scrollToStep(page, 8, 0.2);
	const arrows = page.locator('#step-8 figure.chart line.chart-arrow');
	await expect(arrows).toHaveCount(8);
	const first = async () => arrows.first().evaluate((l) => `${l.getAttribute('x2')},${l.getAttribute('y2')}`);
	const before = await first();
	await waitFrames(page, 10);
	expect(await first()).not.toBe(before);
});

// The arrows are labelled with their wavelengths in studs (the ocean's unit), and nothing
// gives an arrow a speed of its own: they turn at the speeds the dispersion gives them.
test("step 8's arrows are labelled in studs and computed from the sea on screen", async ({ page }) => {
	await oceanRunning(page);
	await scrollToStep(page, 8, 0.2);
	const figure = page.locator('#step-8 figure.chart');
	await expect(figure.locator('line.chart-arrow')).toHaveCount(8);
	const labels = await figure.locator('text.chart-wavelength').allTextContents();
	expect(labels).toHaveLength(8);
	for (const label of labels) expect(label).toMatch(/^\d+ studs$/);
	await expect(figure).toContainText('Computed from the sea on screen');
	const words = await figure.evaluate((f) => `${f.textContent} ${f.querySelector('svg').getAttribute('aria-label')}`);
	expect(words).not.toMatch(/own speed/);
	expect(words).toContain('the dispersion gives them');
});

test("step 8's arrows stop being redrawn while the chart is off screen", async ({ page }) => {
	await oceanRunning(page);
	await scrollToStep(page, 8, 0.2);
	const arrow = page.locator('#step-8 figure.chart line.chart-arrow').first();
	await expect(arrow).toHaveCount(1);
	await scrollToStep(page, 12, 0.5);
	await waitFrames(page, 5);
	const parked = await arrow.getAttribute('x2');
	await waitFrames(page, 20);
	expect(await arrow.getAttribute('x2')).toBe(parked);
});

test('step 9 times both ways in the visitor browser, again for a new grid size', async ({ page }) => {
	await oceanRunning(page);
	await scrollToStep(page, 9, 0.2);
	const figure = page.locator('#step-9 figure.chart');
	await expect(figure).toHaveAttribute('data-state', 'done', { timeout: 60_000 });
	await expect(figure).toContainText(/Measured in your browser just now|disturbed by other work on this device/);
	await expect(figure).toContainText('32 × 32');
	const widths = await figure.evaluate((f) => [f.querySelector('.chart-bar-naive').getAttribute('width'), f.querySelector('.chart-bar-fft').getAttribute('width')].map(Number));
	expect(widths[0]).toBeGreaterThan(widths[1]);
	await page.locator('#step-9 [data-slider="transformN"] button[data-option="64"]').click();
	await expect(figure).toContainText('64 × 64', { timeout: 60_000 });
	await expect(figure).toHaveAttribute('data-state', 'done', { timeout: 60_000 });
});

// The A3 T6 ruling: a rounded speedup ("about N×") no larger than the operation ratio allows, or,
// when the timing was disturbed twice, the operation ratio instead.
test('step 9 prints a rounded, believable speedup or says the timing was disturbed', async ({ page }) => {
	await oceanRunning(page);
	await scrollToStep(page, 9, 0.2);
	const figure = page.locator('#step-9 figure.chart');
	for (const n of [8, 64]) {
		await recordStates(page);
		await page.locator(`#step-9 [data-slider="transformN"] button[data-option="${n}"]`).click();
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
test('step 9 does not re-time for the grid size it already shows', async ({ page }) => {
	await oceanRunning(page);
	await scrollToStep(page, 9, 0.2);
	const figure = page.locator('#step-9 figure.chart');
	await expect(figure).toHaveAttribute('data-state', 'done', { timeout: 60_000 });
	await recordStates(page);
	await page.locator('#step-9 [data-slider="transformN"] button[data-option="32"]').click();
	await waitFrames(page, 10);
	expect(await recordedStates(page)).toEqual([]);
});

// Fix round 1: with the peak near 3 rad/s neither side of the peak line had room for its label,
// and the chart threw (nine reachable settings; wind 7 m/s at 5,000 m is one).
test('step 7 labels the peak at wind 7 m/s and 5,000 m without an error', async ({ page }) => {
	const errors = watchErrors(page);
	await oceanRunning(page);
	await scrollToStep(page, 7, 0.2);
	await setRange(page, 7, 'wind', 7);
	await setRange(page, 7, 'fetch', 0);
	const figure = page.locator('#step-7 figure.chart');
	await expect(figure.locator('.chart-peak-label')).toContainText('studs long');
	await expect.poll(() => figure.locator('svg').getAttribute('aria-label')).toContain('peak');
	await expect(page.locator('#step-7 [data-slider="fetch"] output')).toContainText('5,000');
	expect(await textOutsideViewBox(page, 7)).toEqual([]);
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
// `fft` milliseconds per grid size.
function stubTransforms(page, times) {
	return page.evaluate((table) => {
		window.__chartCalls = [];
		window.__charts.useTransforms((n) => {
			window.__chartCalls.push(n);
			const cells = n * n;
			const { naive, fft } = table[n];
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
		await scrollToStep(page, 9, 0.2);
		const figure = page.locator('#step-9 figure.chart');
		await expect(figure).toHaveAttribute('data-state', 'done', { timeout: 60_000 });
		await expect(figure).toContainText('disturbed by other work on this device');
		await expect(figure).toContainText('1.0 M steps');
		expect(await page.evaluate(() => window.__chartCalls.filter((n) => n === 32).length)).toBe(2);
		expect(await textOutsideViewBox(page, 9)).toEqual([]);
	});
}

// Fix round 1: on a slow device the n = 64 naive sum (one run, 16 times n = 32's) blocks the page
// for over 100 ms, so the 64 option is switched off, with a note, instead of run.
test('step 9 switches off 64 × 64 where the n = 32 timing says it would freeze the page', async ({ page }) => {
	await oceanRunning(page);
	await stubTransforms(page, { 2: { naive: 0.01, fft: 0.001 }, 32: { naive: 7.4, fft: 0.05 }, 64: { naive: 118, fft: 0.2 } });
	await scrollToStep(page, 9, 0.2);
	const figure = page.locator('#step-9 figure.chart');
	await expect(figure).toHaveAttribute('data-state', 'done', { timeout: 60_000 });
	const option = page.locator('#step-9 [data-slider="transformN"] button[data-option="64"]');
	await expect(option).toBeDisabled();
	await expect(page.locator('#step-9 [data-slider="transformN"]')).toContainText('too slow to time here without freezing the page');
	// A refresh of the controls (another option chosen) keeps it off.
	await page.locator('#step-9 [data-slider="transformN"] button[data-option="16"]').click({ force: true });
	await expect(option).toBeDisabled();
	expect(await page.evaluate(() => window.__chartCalls)).not.toContain(64);
});

test('step 9 checks a device with n = 32 before timing 64 × 64 chosen first', async ({ page }) => {
	await oceanRunning(page);
	await stubTransforms(page, { 2: { naive: 0.01, fft: 0.001 }, 32: { naive: 7.4, fft: 0.05 }, 64: { naive: 118, fft: 0.2 } });
	await page.locator('#step-9 [data-slider="transformN"] button[data-option="64"]').click({ force: true });
	await scrollToStep(page, 9, 0.2);
	const figure = page.locator('#step-9 figure.chart');
	await expect(figure).toHaveAttribute('data-state', 'done', { timeout: 60_000 });
	await expect(figure).toContainText('32 × 32');
	await expect(page.locator('#step-9 [data-slider="transformN"] button[data-option="32"]')).toHaveAttribute('aria-checked', 'true');
	expect(await page.evaluate(() => window.__chartCalls)).not.toContain(64);
});

test('a fast device still times 64 × 64', async ({ page }) => {
	await oceanRunning(page);
	await stubTransforms(page, { 2: { naive: 0.01, fft: 0.001 }, 32: { naive: 1.85, fft: 0.015 }, 64: { naive: 28, fft: 0.066 } });
	await scrollToStep(page, 9, 0.2);
	const figure = page.locator('#step-9 figure.chart');
	await expect(figure).toHaveAttribute('data-state', 'done', { timeout: 60_000 });
	const option = page.locator('#step-9 [data-slider="transformN"] button[data-option="64"]');
	await expect(option).toBeEnabled();
	await option.click();
	await expect(figure).toContainText('64 × 64 grid: the FFT was about 420× faster', { timeout: 60_000 });
});

// Fix round 1: on a 390 px phone the charts' SVG text renders at 12 px or more.
test('the charts read at 12 px on a phone', async ({ page }) => {
	await page.setViewportSize({ width: 390, height: 844 });
	await oceanRunning(page);
	for (const step of [7, 8, 9]) {
		await scrollToStep(page, step, 0.2);
		const sizes = await page.evaluate((n) => {
			const svg = document.querySelector(`#step-${n} figure.chart svg`);
			const scale = svg.getBoundingClientRect().width / svg.viewBox.baseVal.width;
			return [...svg.querySelectorAll('text')].map((t) => parseFloat(getComputedStyle(t).fontSize) * scale);
		}, step);
		expect(sizes.length).toBeGreaterThan(0);
		expect(Math.min(...sizes), `step ${step}`).toBeGreaterThanOrEqual(11.9);
		expect(await textOutsideViewBox(page, step)).toEqual([]);
	}
});

for (const scheme of ['dark', 'light']) {
	test(`the charts read when the system prefers ${scheme} (the page is always dark)`, async ({ page }) => {
		await page.emulateMedia({ colorScheme: scheme });
		await oceanRunning(page);
		await scrollToStep(page, 7, 0.2);
		await expect(page.locator('#step-7 figure.chart path.chart-line')).toHaveCount(1);
		const colours = await page.evaluate(() => ({
			bg: getComputedStyle(document.querySelector('#step-7 figure.chart')).backgroundColor,
			line: getComputedStyle(document.querySelector('#step-7 figure.chart .chart-line')).stroke,
			text: getComputedStyle(document.querySelector('#step-7 figure.chart .chart-text')).fill,
		}));
		expect(contrast(rgb(colours.line), rgb(colours.bg))).toBeGreaterThanOrEqual(3);
		expect(contrast(rgb(colours.text), rgb(colours.bg))).toBeGreaterThanOrEqual(4.5);
	});
}
