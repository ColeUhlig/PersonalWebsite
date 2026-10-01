// Steps 14 and 15's charts in the browser (piece C2, lane E; spec 10.7): the flat graph's waves as
// spikes from the engine's FFT, following the wave slider; the chord, a tone switched off and rebuilt.
import { test, expect } from '@playwright/test';
import * as WaveBanks from '../../../content/ocean/js/engine/waveBanks.js';
import { bankSpikes } from '../../../content/ocean/js/page/frequencyMath.js';
import { watchErrors } from './helpers/stage.js';
import { oceanRunning, scrollToId } from './helpers/story.js';

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
	expect(await page.locator('figure[data-chart="fourier"] .chart-rebuilt').getAttribute('d')).not.toBe(before);
});

test.describe('on a phone', () => {
	test.use({ viewport: { width: 390, height: 844 } });

	test('both charts fit their panel, every label inside its drawing', async ({ page }) => {
		test.setTimeout(180_000);
		await oceanRunning(page);
		for (const id of ['frequency', 'fourier']) {
			await scrollToId(page, id, 0.2);
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
