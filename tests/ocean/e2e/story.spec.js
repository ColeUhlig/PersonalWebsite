// The scroll story in the browser (piece C): the reading and the marked panel, GSAP and its native
// fallback, a maths line moving the page, a tall panel's sticky top, and the phone's reading line.
import { test, expect } from '@playwright/test';
import { scrollToOpening, scrollToStep, watchErrors } from './helpers/story.js';

test('scrolling reads the step and how far through it, and marks the panel', async ({ page }) => {
	const errors = watchErrors(page);
	await page.goto('/ocean/');
	expect(await page.evaluate(() => window.__page.reading().phase)).toBe('opening');
	await scrollToStep(page, 4, 0.5);
	const reading = await page.evaluate(() => window.__page.reading());
	expect(reading.step).toBe(4);
	expect(reading.progress).toBeGreaterThan(0.45);
	expect(reading.progress).toBeLessThan(0.55);
	await expect(page.locator('#step-4')).toHaveClass(/is-active/);
	await expect(page.locator('#step-3')).not.toHaveClass(/is-active/);
	await expect(page.locator('body')).toHaveAttribute('data-phase', 'step');
	await scrollToOpening(page);
	await expect(page.locator('body')).toHaveAttribute('data-phase', 'opening');
	expect(errors).toEqual([]);
});

test('GSAP ScrollTrigger drives the reading when it loads', async ({ page }) => {
	await page.goto('/ocean/');
	await page.waitForFunction(() => window.__page.scrollEngine() === 'gsap', null, { timeout: 30_000 });
	await scrollToStep(page, 9);
	await scrollToStep(page, 13);
});

test('with GSAP blocked a native listener reads the scroll instead (Review Focus 3)', async ({ page }) => {
	const errors = [];
	page.on('pageerror', (error) => errors.push(error.message));
	await page.route('**/npm/gsap@3.15.0/**', (route) => route.abort());
	await page.goto('/ocean/');
	await page.waitForFunction(() => window.__page.scrollEngine() === 'native', null, { timeout: 30_000 });
	await scrollToStep(page, 6);
	await scrollToStep(page, 2);
	expect(errors).toEqual([]);
});

test('opening a maths line moves everything below it, and the reading follows', async ({ page }) => {
	await page.goto('/ocean/');
	await scrollToStep(page, 2);
	await page.locator('#step-2 details.math summary').click();
	await scrollToStep(page, 3, 0.1);
	await scrollToStep(page, 12, 0.9);
});

test('a panel taller than the view keeps its bottom on screen while its step is read', async ({ page }) => {
	await page.goto('/ocean/');
	await page.waitForFunction(() => window.__page.scrollEngine() !== 'starting', null, { timeout: 30_000 });
	const height = await page.evaluate(() => {
		// The stylesheet may still cap panels and scroll them inside; lift that, as the page will.
		const panel = document.querySelector('#step-4 .panel');
		panel.style.maxHeight = 'none';
		panel.style.overflowY = 'visible';
		const spacer = document.createElement('div');
		spacer.style.height = `${Math.max(0, Math.ceil(1.1 * window.innerHeight - panel.getBoundingClientRect().height) + 1)}px`;
		panel.append(spacer);
		return panel.getBoundingClientRect().height / window.innerHeight;
	});
	expect(height).toBeGreaterThanOrEqual(1.1);
	for (const progress of [0.55, 0.7, 0.9]) {
		await scrollToStep(page, 4, progress);
		await page.waitForFunction(() => {
			const rect = document.querySelector('#step-4 .panel').getBoundingClientRect();
			return rect.bottom <= window.innerHeight && rect.bottom > 0;
		}, null, { timeout: 5_000 }).catch(() => {});
		const bottom = await page.evaluate(() => document.querySelector('#step-4 .panel').getBoundingClientRect().bottom);
		const view = await page.evaluate(() => window.innerHeight);
		expect(bottom, `panel bottom at progress ${progress}`).toBeLessThanOrEqual(view);
		expect(bottom, `panel bottom at progress ${progress}`).toBeGreaterThan(0);
	}
});

test.describe('on a phone in portrait', () => {
	test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

	test('the reading line sits in the lower half, under the ocean', async ({ page }) => {
		await page.goto('/ocean/');
		await scrollToStep(page, 7, 0.4);
		const reading = await page.evaluate(() => window.__page.reading());
		expect(reading.progress).toBeGreaterThan(0.35);
		expect(reading.progress).toBeLessThan(0.45);
	});
});
