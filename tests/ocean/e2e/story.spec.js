// The scroll story in the browser (piece C): the reading and the marked panel, GSAP and its native
// fallback, a maths line moving the page, a tall panel's sticky top, and the phone's reading line.
import { test, expect } from '@playwright/test';
import { STEP_COUNT, stepOf } from '../../../content/ocean/js/stages/steps.js';
import { scrollToId, scrollToOpening, watchErrors } from './helpers/story.js';

// Steps by id (piece C2, Task 0); the section elements keep id="step-N".
const section = (id) => `#step-${stepOf(id)}`;

test('scrolling reads the step and how far through it, and marks the panel', async ({ page }) => {
	const errors = watchErrors(page);
	await page.goto('/ocean/');
	expect(await page.evaluate(() => window.__page.reading().phase)).toBe('opening');
	await scrollToId(page, 'into-3d', 0.5);
	const reading = await page.evaluate(() => window.__page.reading());
	expect(reading.step).toBe(stepOf('into-3d'));
	expect(reading.progress).toBeGreaterThan(0.45);
	expect(reading.progress).toBeLessThan(0.55);
	await expect(page.locator(section('into-3d'))).toHaveClass(/is-active/);
	await expect(page.locator(section('sum-of-sines'))).not.toHaveClass(/is-active/);
	await expect(page.locator('body')).toHaveAttribute('data-phase', 'step');
	await scrollToOpening(page);
	await expect(page.locator('body')).toHaveAttribute('data-phase', 'opening');
	expect(errors).toEqual([]);
});

test('GSAP ScrollTrigger drives the reading when it loads', async ({ page }) => {
	await page.goto('/ocean/');
	await page.waitForFunction(() => window.__page.scrollEngine() === 'gsap', null, { timeout: 30_000 });
	await scrollToId(page, 'fft');
	await scrollToId(page, 'finale');
});

test('with GSAP blocked a native listener reads the scroll instead (Review Focus 3)', async ({ page }) => {
	const errors = [];
	page.on('pageerror', (error) => errors.push(error.message));
	await page.route('**/npm/gsap@3.15.0/**', (route) => route.abort());
	await page.goto('/ocean/');
	await page.waitForFunction(() => window.__page.scrollEngine() === 'native', null, { timeout: 30_000 });
	await scrollToId(page, 'many-waves');
	await scrollToId(page, 'moving-sine');
	expect(errors).toEqual([]);
});

// A request that never answers (a stalled CDN, a captive portal) must not leave the story waiting
// for it: the native listener follows the scroll from the start.
test('with the GSAP request hanging, the native listener reads the scroll from the start', async ({ page }) => {
	const errors = [];
	page.on('pageerror', (error) => errors.push(error.message));
	await page.route('**/npm/gsap@3.15.0/**', () => {});
	await page.goto('/ocean/', { waitUntil: 'domcontentloaded' });
	await page.waitForFunction(() => window.__page !== undefined, null, { timeout: 30_000 });
	await scrollToId(page, 'many-waves');
	expect(await page.evaluate(() => window.__page.scrollEngine())).toBe('native');
	await scrollToId(page, 'moving-sine', 0.5);
	expect(errors).toEqual([]);
});

test('opening a maths line moves everything below it, and the reading follows', async ({ page }) => {
	await page.goto('/ocean/');
	await scrollToId(page, 'moving-sine');
	// The section is taller than its panel (170vh), so opening the maths would move nothing below
	// it; let the section take its panel's height, so the step below must move and the story must
	// measure it again.
	await page.evaluate((id) => {
		document.querySelector(id).style.minHeight = '0';
	}, section('moving-sine'));
	await page.waitForTimeout(300);
	const topOf = () => page.evaluate((id) => document.querySelector(id).getBoundingClientRect().top + window.scrollY, section('sum-of-sines'));
	const before = await topOf();
	await page.locator(`${section('moving-sine')} details.math summary`).click();
	// Opening a line typesets every line with KaTeX a moment later, which changes their heights again:
	// wait for it and a frame of layout, so the scroll below is taken on the page as it will stay
	// (Task 14: scrolled before the typesetting, the step below moved 12 px after the scroll).
	await page.waitForSelector(`${section('moving-sine')} .tex-rendered`, { timeout: 30_000 });
	await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
	const after = await topOf();
	expect(after - before, 'the step below moved down').toBeGreaterThan(20);
	for (const [id, progress] of [['sum-of-sines', 0.1], ['glow', 0.9]]) {
		await scrollToId(page, id, progress);
		await expect.poll(() => page.evaluate(() => window.__page.reading().progress), { timeout: 5_000 }).toBeCloseTo(progress, 2);
	}
});

// ScrollTrigger follows the whole page, as the native listener does, so the reading keeps moving
// past the story's own end (the footer below it).
test('with GSAP the reading at the end of the page is the same as the native one', async ({ page }) => {
	await page.goto('/ocean/');
	await page.waitForFunction(() => window.__page.scrollEngine() === 'gsap', null, { timeout: 30_000 });
	const expected = () => page.evaluate((last) => {
		const section = document.getElementById(`step-${last}`);
		const rect = section.getBoundingClientRect();
		return Math.min(Math.max((window.innerHeight * 0.5 - rect.top) / rect.height, 0), 1);
	}, STEP_COUNT);
	// Where the story's bottom meets the view's bottom, then the very end of the page.
	await page.evaluate(() => {
		const story = document.getElementById('story').getBoundingClientRect();
		window.scrollTo(0, story.bottom + window.scrollY - window.innerHeight);
	});
	await expect.poll(async () => (await page.evaluate(() => window.__page.reading().progress)) - (await expected()), { timeout: 5_000 }).toBeCloseTo(0, 3);
	await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
	await page.waitForTimeout(300);
	expect(await page.evaluate(() => window.__page.reading().step)).toBe(STEP_COUNT);
	await expect.poll(async () => (await page.evaluate(() => window.__page.reading().progress)) - (await expected()), { timeout: 5_000 }).toBeCloseTo(0, 3);
});

test('a panel taller than the view keeps its bottom on screen while its step is read', async ({ page }) => {
	await page.goto('/ocean/');
	await page.waitForFunction(() => window.__page.scrollEngine() !== 'starting', null, { timeout: 30_000 });
	const height = await page.evaluate((id) => {
		// The stylesheet may still cap panels and scroll them inside; lift that, as the page will.
		const panel = document.querySelector(`${id} .panel`);
		panel.style.maxHeight = 'none';
		panel.style.overflowY = 'visible';
		const spacer = document.createElement('div');
		spacer.style.height = `${Math.max(0, Math.ceil(1.1 * window.innerHeight - panel.getBoundingClientRect().height) + 1)}px`;
		panel.append(spacer);
		return panel.getBoundingClientRect().height / window.innerHeight;
	}, section('into-3d'));
	expect(height).toBeGreaterThanOrEqual(1.1);
	for (const progress of [0.55, 0.7, 0.9]) {
		await scrollToId(page, 'into-3d', progress);
		await page.waitForFunction((id) => {
			const rect = document.querySelector(`${id} .panel`).getBoundingClientRect();
			return rect.bottom <= window.innerHeight && rect.bottom > 0;
		}, section('into-3d'), { timeout: 5_000 }).catch(() => {});
		const bottom = await page.evaluate((id) => document.querySelector(`${id} .panel`).getBoundingClientRect().bottom, section('into-3d'));
		const view = await page.evaluate(() => window.innerHeight);
		expect(bottom, `panel bottom at progress ${progress}`).toBeLessThanOrEqual(view);
		expect(bottom, `panel bottom at progress ${progress}`).toBeGreaterThan(0);
	}
});

test.describe('on a phone in portrait', () => {
	test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

	test('the reading line sits in the lower half, under the ocean', async ({ page }) => {
		await page.goto('/ocean/');
		await scrollToId(page, 'unlit', 0.4);
		const reading = await page.evaluate(() => window.__page.reading());
		expect(reading.progress).toBeGreaterThan(0.35);
		expect(reading.progress).toBeLessThan(0.45);
	});
});
