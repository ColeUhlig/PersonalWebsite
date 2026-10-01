// The texture insets in the browser (piece C2, lane F; spec 10.7): the 256-stud layer's fields as
// images, the sampling inset's blend matching the engine's sampler with the wrap on screen, the
// painted maps live (Task 11), on the probed tier and on Medium (Review Focus 4, Task 11).
import { test, expect } from '@playwright/test';
import { watchErrors } from './helpers/stage.js';
import { oceanRunning, scrollToId } from './helpers/story.js';

let errors;
test.beforeEach(({ page }) => {
	errors = watchErrors(page);
});
test.afterEach(() => {
	expect(errors).toEqual([]);
});

// How many distinct colours a canvas in the inset holds (a blank one holds one).
const colours = (page, selector) => page.evaluate((s) => {
	const canvas = document.querySelector(s);
	const data = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
	const seen = new Set();
	for (let i = 0; i < data.length; i += 4) seen.add((data[i] << 16) | (data[i + 1] << 8) | data[i + 2]);
	return seen.size;
}, selector);

test("step 22: the 256-stud layer's height, slope and push as live images, with their ranges", async ({ page }) => {
	test.setTimeout(180_000);
	await oceanRunning(page);
	await scrollToId(page, 'fields', 0.2);
	await expect(page.locator('figure[data-inset="fields"] canvas')).toHaveCount(3, { timeout: 30_000 });
	await expect.poll(() => page.evaluate(() => window.__insets.fields()?.height.max ?? 0), { timeout: 30_000 }).toBeGreaterThan(0);
	const fields = await page.evaluate(() => window.__insets.fields());
	for (const name of ['height', 'slopeX', 'dispX']) expect(fields[name].min).toBeLessThan(fields[name].max);
	for (let i = 1; i <= 3; i++) expect(await colours(page, `figure[data-inset="fields"] .inset-field:nth-child(${i}) canvas`)).toBeGreaterThan(50);
	// Labelled with the engine's own sizes: the canvases are the display field's n x n, the line says so.
	const engine = await page.evaluate(() => {
		const canvas = document.querySelector('figure[data-inset="fields"] canvas');
		return { n: canvas.width, rows: canvas.height, line: document.querySelector('figure[data-inset="fields"] .inset-line').textContent };
	});
	expect(engine.n).toBe(fields.n);
	expect(engine.rows).toBe(fields.n);
	expect(engine.line).toContain(`${fields.n} × ${fields.n}`);
	expect(engine.line).toContain(`${fields.size} studs`);
});

test("step 23: the blend matches the engine's own sampler, and the point crosses the tile's edge", async ({ page }) => {
	test.setTimeout(180_000);
	await oceanRunning(page);
	await scrollToId(page, 'sampling', 0.2);
	await expect(page.locator('figure[data-inset="sampling"] canvas')).toHaveCount(1, { timeout: 30_000 });
	const seen = new Set();
	for (let i = 0; i < 40; i++) {
		const s = await page.evaluate(() => window.__insets.sampling());
		if (s) {
			expect(Math.abs(s.value - s.engine)).toBeLessThan(1e-6);
			expect(s.weights.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 9);
			seen.add(s.x > 128 ? 'end' : 'start');
		}
		await page.waitForTimeout(250);
	}
	expect([...seen].sort()).toEqual(['end', 'start']);
	await expect(page.locator('figure[data-inset="sampling"] .inset-line')).toContainText('studs');
});

test('the insets redraw at most four times a second, and not at all off screen', async ({ page }) => {
	test.setTimeout(180_000);
	await oceanRunning(page);
	await scrollToId(page, 'sampling', 0.2);
	await expect.poll(() => page.evaluate(() => window.__insets.sampling()?.draws ?? 0), { timeout: 30_000 }).toBeGreaterThan(0);
	const rate = await page.evaluate(async () => {
		const start = window.__insets.sampling().draws;
		const t0 = performance.now();
		await new Promise((resolve) => setTimeout(resolve, 3000));
		return (window.__insets.sampling().draws - start) / ((performance.now() - t0) / 1000);
	});
	expect(rate).toBeGreaterThan(1);
	expect(rate).toBeLessThanOrEqual(4.5);
	await scrollToId(page, 'sine', 0.3);
	await page.waitForTimeout(500);
	const away = await page.evaluate(() => [window.__insets.sampling().draws, window.__insets.fields()?.draws ?? 0]);
	await page.waitForTimeout(1500);
	expect(await page.evaluate(() => [window.__insets.sampling().draws, window.__insets.fields()?.draws ?? 0])).toEqual(away);
});

test.describe('on a phone', () => {
	test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

	test('the field and sampling insets fit the panel and draw', async ({ page }) => {
		test.setTimeout(180_000);
		await oceanRunning(page);
		for (const [id, count] of [['fields', 3], ['sampling', 1]]) {
			await scrollToId(page, id, 0.2);
			const canvases = page.locator(`figure[data-inset="${id}"] canvas`);
			await expect(canvases).toHaveCount(count, { timeout: 30_000 });
			await expect.poll(() => page.evaluate((name) => window.__insets[name]() != null, id), { timeout: 30_000 }).toBe(true);
			const boxes = await page.evaluate((name) => {
				const body = document.querySelector(`figure[data-inset="${name}"] .inset-body`).getBoundingClientRect();
				return [...document.querySelectorAll(`figure[data-inset="${name}"] canvas`)].map((c) => {
					const r = c.getBoundingClientRect();
					return { width: r.width, left: r.left - body.left, right: body.right - r.right };
				});
			}, id);
			for (const box of boxes) {
				expect(box.width).toBeGreaterThan(80);
				expect(box.left).toBeGreaterThanOrEqual(-0.5);
				expect(box.right).toBeGreaterThanOrEqual(-0.5);
			}
		}
		expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
	});
});
