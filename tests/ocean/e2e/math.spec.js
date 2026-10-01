import { test, expect } from '@playwright/test';
import { oceanRunning } from './helpers/story.js';

function countKatex(page) {
	const seen = { requests: 0 };
	page.on('request', (request) => {
		if (request.url().includes('katex@0.18.10')) seen.requests++;
	});
	return seen;
}

test('nothing of KaTeX loads until a maths line is opened; then all twelve are typeset', async ({ page }) => {
	const errors = [];
	page.on('pageerror', (error) => errors.push(error.message));
	const seen = countKatex(page);
	await page.goto('/ocean/');
	await page.locator('#step-9').scrollIntoViewIfNeeded();
	await page.waitForTimeout(500);
	expect(seen.requests).toBe(0);
	await page.locator('#step-2 details.math summary').click();
	await expect(page.locator('#step-2 .tex .katex')).toBeVisible({ timeout: 30_000 });
	await expect(page.locator('.tex .katex')).toHaveCount(12);
	await expect(page.locator('.tex .katex-error')).toHaveCount(0);
	await expect(page.locator('#step-2 .tex')).toHaveAttribute('data-tex', /\\sin/);
	expect(seen.requests).toBeGreaterThan(0);
	expect(errors).toEqual([]);
});

test("a term's colour in the maths matches its slider's swatch", async ({ page }) => {
	await oceanRunning(page);
	await page.locator('#step-2 details.math summary').click();
	await expect(page.locator('#step-2 .tex .t-amp').first()).toBeVisible({ timeout: 30_000 });
	const colours = await page.evaluate(() => ({
		term: getComputedStyle(document.querySelector('#step-2 .tex .t-amp')).color,
		swatch: getComputedStyle(document.querySelector('#step-2 [data-slider="amplitude"] .swatch')).color,
		speed: getComputedStyle(document.querySelector('#step-2 .tex .t-speed')).color,
	}));
	expect(colours.term).toBe(colours.swatch);
	expect(colours.speed).not.toBe(colours.term);
});

test('with KaTeX blocked the TeX source stays readable (Review Focus 3)', async ({ page }) => {
	const errors = [];
	page.on('pageerror', (error) => errors.push(error.message));
	await page.route('**/npm/katex@0.18.10/**', (route) => route.abort());
	await page.goto('/ocean/');
	await page.locator('#step-7 details.math summary').click();
	await page.waitForTimeout(1000);
	await expect(page.locator('#step-7 .tex code')).toBeVisible();
	await expect(page.locator('#step-7 .tex code')).toContainText('\\omega_p');
	await expect(page.locator('.tex .katex')).toHaveCount(0);
	expect(errors).toEqual([]);
});

test('a KaTeX request that hangs leaves the TeX readable: no half-styled formulas, nothing thrown', async ({ page }) => {
	const errors = [];
	page.on('pageerror', (error) => errors.push(error.message));
	// The module arrives but the stylesheet never does: typesetting without it would show every
	// formula twice (the MathML copy is hidden only by KaTeX's CSS).
	await page.route('**/npm/katex@0.18.10/dist/katex.min.css', () => {});
	await page.goto('/ocean/');
	await page.locator('#step-2 details.math summary').click();
	await page.waitForResponse((response) => response.url().endsWith('/katex.mjs'), { timeout: 30_000 });
	await page.waitForTimeout(1000);
	await expect(page.locator('#step-2 .tex code')).toBeVisible();
	await expect(page.locator('#step-2 .tex code')).toContainText('\\sin');
	await expect(page.locator('.tex .katex')).toHaveCount(0);
	expect(errors).toEqual([]);
});

test('once typeset, the math label still sits only on .tex, so it hides nothing else from the copy check', async ({ page }) => {
	await page.goto('/ocean/');
	await page.locator('#step-2 details.math summary').click();
	await expect(page.locator('.tex .katex')).toHaveCount(12, { timeout: 30_000 });
	expect(await page.locator('[data-copy-skip="math"]:not(.tex)').count()).toBe(0);
	expect(await page.locator('.tex:not([data-copy-skip="math"])').count()).toBe(0);
	expect(await page.locator('.tex [data-copy-skip]').count()).toBe(0);
});

for (const screen of [
	{ name: 'a short laptop', viewport: { width: 1366, height: 767 } },
	{ name: 'a phone', viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true },
]) {
	test(`on ${screen.name} every typeset formula fits its panel, wrapping instead of scrolling sideways`, async ({ browser }) => {
		const { name, ...options } = screen;
		const context = await browser.newContext(options);
		const page = await context.newPage();
		await page.goto('/ocean/');
		await page.evaluate(() => document.querySelectorAll('details.math').forEach((details) => { details.open = true; }));
		await expect(page.locator('.tex .katex')).toHaveCount(12, { timeout: 30_000 });
		const misfits = await page.evaluate(() => [...document.querySelectorAll('.tex-rendered')].flatMap((box) => {
			const outer = box.getBoundingClientRect();
			const scrolls = [box, box.parentElement].filter((el) => getComputedStyle(el).overflowX !== 'visible');
			const pieces = [...box.querySelectorAll('.katex-html > *')].map((piece) => piece.getBoundingClientRect());
			const left = Math.min(...pieces.map((rect) => rect.left));
			const right = Math.max(...pieces.map((rect) => rect.right));
			const fits = left >= outer.left - 0.5 && right <= outer.right + 0.5 && box.scrollWidth <= box.clientWidth;
			return fits && scrolls.length === 0 ? [] : [{ step: box.closest('.step').id, left, right, outer: [outer.left, outer.right], scrolls: scrolls.length }];
		}));
		expect(misfits).toEqual([]);
		await context.close();
	});
}
