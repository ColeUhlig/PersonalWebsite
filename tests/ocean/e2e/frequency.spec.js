// Steps 14 and 15's charts in the browser (piece C2, lane E; spec 10.7): the flat graph's waves as
// spikes from the engine's FFT, following the wave slider; the chord, a tone switched off and rebuilt.
// And chapter four's step 20 (Task 9): choppiness, seen from the side, visibly moves the sea.
import { test, expect } from '@playwright/test';
import * as WaveBanks from '../../../content/ocean/js/engine/waveBanks.js';
import { bankSpikes } from '../../../content/ocean/js/page/frequencyMath.js';
import { grid, load, meanDiff, stage, waitFrames, watchErrors } from './helpers/stage.js';
import { oceanRunning, scrollToFigure, scrollToId } from './helpers/story.js';

let errors;
test.beforeEach(({ page }) => {
	errors = watchErrors(page);
});
test.afterEach(() => {
	expect(errors).toEqual([]);
});

const expectedPeaks = (count) => [...new Set(bankSpikes(WaveBanks.withCount(WaveBanks.withFan(WaveBanks.teachingBank(), 0), count)).map((s) => s.n))].sort((a, b) => a - b);

test('step 14: one spike per wave of the graph, where the bank puts it, following the slider', async ({ page }) => {
	test.setTimeout(180_000);
	await oceanRunning(page);
	await scrollToId(page, 'frequency', 0.2);
	const figure = page.locator('figure[data-chart="frequency"] .chart-body svg');
	await expect(figure).toHaveCount(1, { timeout: 30_000 });
	await expect.poll(() => page.evaluate(() => window.__frequency.frequency().peaks)).toEqual(expectedPeaks(4));
	await page.locator('section[data-step-id="frequency"] [data-slider="waveCount"] input').fill('2');
	await expect.poll(() => page.evaluate(() => window.__frequency.frequency().peaks)).toEqual(expectedPeaks(2));
	expect(await page.locator('figure[data-chart="frequency"] .chart-spike').count()).toBe(2);
	// At the slider's top every wave is a spike, none dropped off the axis, each inside the plot.
	await page.locator('section[data-step-id="frequency"] [data-slider="waveCount"] input').fill('8');
	await expect.poll(() => page.evaluate(() => window.__frequency.frequency().peaks)).toEqual(expectedPeaks(8));
	const placed = await page.evaluate(() => {
		const svg = document.querySelector('figure[data-chart="frequency"] svg');
		const plot = [...svg.querySelectorAll('.chart-plot')].at(-1).getBBox();
		return [...svg.querySelectorAll('.chart-spike')].map((line) => {
			const x = Number(line.getAttribute('x1'));
			const top = Number(line.getAttribute('y2'));
			return x > plot.x && x < plot.x + plot.width && top >= plot.y && top < plot.y + plot.height;
		});
	});
	expect(placed).toEqual(expectedPeaks(8).map(() => true));
	// The line on top is the sea as it stood when the chart drew, and the chart says so.
	await expect(page.locator('figure[data-chart="frequency"] .chart-body')).toContainText('a snapshot of the sea when the chart drew');
	// Heights are in studs, the engine's unit, on both plots.
	expect(await page.locator('figure[data-chart="frequency"] svg text[transform]').allTextContents()).toEqual(['height (studs)', 'size (studs)']);
});

test('step 15: three tones; switch one off and the chord is rebuilt without it', async ({ page }) => {
	test.setTimeout(180_000);
	await oceanRunning(page);
	await scrollToId(page, 'fourier', 0.2);
	await expect(page.locator('figure[data-chart="fourier"] .chart-body svg')).toHaveCount(1, { timeout: 30_000 });
	expect(await page.evaluate(() => window.__frequency.fourier().notes)).toEqual([true, true, true]);
	const before = await page.locator('figure[data-chart="fourier"] .chart-rebuilt').getAttribute('d');
	await page.locator('section[data-step-id="fourier"] [data-slider="note2"] input').click();
	await expect.poll(() => page.evaluate(() => window.__frequency.fourier().notes)).toEqual([true, false, true]);
	await expect(page.locator('figure[data-chart="fourier"] .chart-spike-removed')).toHaveCount(1);
	await expect(page.locator('figure[data-chart="fourier"] .chart-spike')).toHaveCount(2);
	expect(await page.locator('figure[data-chart="fourier"] .chart-rebuilt').getAttribute('d')).not.toBe(before);
});

test.describe('on a phone', () => {
	test.use({ viewport: { width: 390, height: 844 } });

	test('both charts fit their panel, every label inside its drawing', async ({ page }) => {
		test.setTimeout(180_000);
		await oceanRunning(page);
		for (const id of ['frequency', 'fourier']) {
			// The figure on screen: a chart draws only then, and on a phone it sits below the step's words.
			await scrollToFigure(page, id, 'figure.chart');
			const name = id === 'frequency' ? 'frequency' : 'fourier';
			await expect(page.locator(`figure[data-chart="${name}"] svg`)).toHaveCount(1, { timeout: 30_000 });
			const outside = await page.evaluate((chart) => {
				const svg = document.querySelector(`figure[data-chart="${chart}"] svg`);
				const box = svg.viewBox.baseVal;
				// The rotated axis names are measured before their rotation by getBBox: skip them.
				return [...svg.querySelectorAll('text:not([transform])')].filter((t) => {
					const b = t.getBBox();
					return b.x < box.x - 0.5 || b.y < box.y - 0.5 || b.x + b.width > box.width + 0.5 || b.y + b.height > box.height + 0.5;
				}).map((t) => t.textContent);
			}, name);
			expect(outside).toEqual([]);
		}
		expect(await page.evaluate(() => document.scrollingElement.scrollWidth <= window.innerWidth)).toBe(true);
	});
});

const VISIBLE = 3; // mean luminance change for a slider whose whole lesson is the change it makes

test("step 20: choppiness pushes the FFT sea sideways, visibly, from the side", async ({ page }) => {
	test.setTimeout(240_000);
	await load(page, 'step=choppiness&freeze=12&s.chop=0', 60);
	expect((await stage(page, 'surface')).maxLateral).toBe(0);
	const flat = await grid(page);
	const slider = (await stage(page, 'sliders')).find((s) => s.id === 'chop');
	await stage(page, 'setSlider', 'chop', slider.default);
	await waitFrames(page, 30);
	expect((await stage(page, 'surface')).maxLateral).toBeGreaterThan(0.1);
	const middle = await grid(page);
	expect(meanDiff(flat, middle)).toBeGreaterThan(VISIBLE);
	await stage(page, 'setSlider', 'chop', slider.max);
	await waitFrames(page, 30);
	expect(meanDiff(middle, await grid(page))).toBeGreaterThan(VISIBLE);
});
