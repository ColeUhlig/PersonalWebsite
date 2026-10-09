// The figures keep their height when they first draw (piece C2, Task 15's polish round; the walk's
// finding 6). Every chart and inset draws only when it comes on screen; they used to arrive at full
// height then (steps 14, 15 and 18 from 0 px to about 300), so a jump onto a step (End, a
// find-in-page, a link) could land a step off once they drew. Now each figure's body holds the
// height it draws at, from the start, on a laptop and a phone.
import { test, expect } from '@playwright/test';
import { stepOf } from '../../../content/ocean/js/stages/steps.js';
import { watchErrors } from './helpers/stage.js';
import { oceanRunning } from './helpers/story.js';

const FIGURES = 'figure.chart .chart-body, figure.inset .inset-body';
const JUMPS = ['frequency', 'fourier', 'random-sea', 'time', 'fft', 'choppiness', 'fields', 'sampling', 'mesh', 'painted', 'foam'];

const heights = (page) => page.evaluate((sel) => [...document.querySelectorAll(sel)].map((body) => ({
	step: body.closest('section').dataset.stepId,
	height: Math.round(body.getBoundingClientRect().height),
})), FIGURES);

// Whether every figure has drawn: a chart's SVG has marks in it, an inset's numbers are written.
const allDrawn = (page) => page.evaluate(() => {
	const charts = [...document.querySelectorAll('figure.chart .chart-body')].every((body) => body.querySelector('svg path, svg line, svg rect'));
	const insets = [...document.querySelectorAll('figure.inset .inset-range, figure.inset[data-inset="sampling"] .inset-line')].every((el) => el.textContent.trim().length > 0 && !el.classList.contains('is-reserved'));
	return charts && insets;
});

for (const screen of [{ name: 'a laptop', viewport: { width: 1366, height: 767 } }, { name: 'a phone', viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }, { name: 'a small phone', viewport: { width: 320, height: 700 }, isMobile: true, hasTouch: true }]) {
	test.describe(`on ${screen.name}`, () => {
		test.use({ viewport: screen.viewport, isMobile: screen.isMobile ?? false, hasTouch: screen.hasTouch ?? false });

		test('no figure changes height when it first draws', async ({ page }) => {
			test.setTimeout(240_000);
			const errors = watchErrors(page);
			await oceanRunning(page, '/ocean/', 30);
			const before = await heights(page);
			expect(before.length).toBeGreaterThan(8);
			for (const id of [...new Set(before.map((b) => b.step))]) {
				await page.evaluate((step) => {
					for (const figure of document.querySelectorAll(`section[data-step-id="${step}"] figure`)) figure.scrollIntoView({ block: 'center' });
				}, id);
				await page.waitForTimeout(400);
			}
			await expect.poll(() => allDrawn(page), { timeout: 60_000 }).toBe(true);
			const after = await heights(page);
			const moved = after.map((a, i) => ({ ...a, before: before[i].height })).filter((a) => Math.abs(a.height - a.before) > 1);
			expect(moved).toEqual([]);
			expect(errors).toEqual([]);
		});

		test('a jump straight onto a step reads that step once its figures have drawn', async ({ page }) => {
			test.setTimeout(240_000);
			const errors = watchErrors(page);
			for (const id of JUMPS) {
				await oceanRunning(page, '/ocean/', 10);
				// Late in the step, where a figure growing above the reading line would push it on.
				await page.evaluate((n) => {
					const section = document.getElementById(`step-${n}`);
					const rect = section.getBoundingClientRect();
					const narrow = window.matchMedia('(max-width: 899.98px)').matches;
					window.scrollTo(0, rect.top + window.scrollY + 0.85 * rect.height - window.innerHeight * (narrow ? 0.75 : 0.5));
				}, stepOf(id));
				await page.waitForTimeout(1500);
				expect(await page.evaluate(() => window.__page.reading().step), id).toBe(stepOf(id));
			}
			expect(errors).toEqual([]);
		});
	});
}
