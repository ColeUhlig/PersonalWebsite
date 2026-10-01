// "The math" lines in the browser (piece C Task 7, rewritten for C2 in Task 0, pre-flight R5). In C2
// the always-on math box (lane A, ui/mathBox.js) loads KaTeX once the story reaches step 1 and adds
// a .tex of its own, so these tests hold before and after it lands: KaTeX is not fetched at the
// opening, and the panels' formulas are counted inside .panel (one per step but the finale).
import { test, expect } from '@playwright/test';
import { STEP_COUNT, stepOf } from '../../../content/ocean/js/stages/steps.js';
import { oceanRunning, scrollToId } from './helpers/story.js';

const at = (id) => `#step-${stepOf(id)}`;
// One panel formula per step, the finale has none.
const PANEL_FORMULAS = STEP_COUNT - 1;
const panelKatex = (page) => page.locator('.panel .tex .katex');

function countKatex(page) {
	const seen = { requests: 0 };
	page.on('request', (request) => {
		if (request.url().includes('katex@0.18.10')) seen.requests++;
	});
	return seen;
}

test('nothing of KaTeX loads at the opening; once a maths line is opened every panel formula is typeset', async ({ page }) => {
	const errors = [];
	page.on('pageerror', (error) => errors.push(error.message));
	const seen = countKatex(page);
	await page.goto('/ocean/');
	await page.waitForTimeout(500);
	expect(seen.requests).toBe(0);
	// From step 1 the math box may fetch KaTeX (spec 10.3); opening a line certainly does.
	await scrollToId(page, 'sine', 0.2);
	await page.locator(`${at('sine')} details.math summary`).click();
	await expect(page.locator(`${at('sine')} .tex .katex`)).toBeVisible({ timeout: 30_000 });
	await expect(panelKatex(page)).toHaveCount(PANEL_FORMULAS);
	await expect(page.locator('.tex .katex-error')).toHaveCount(0);
	await expect(page.locator(`${at('sine')} .tex`)).toHaveAttribute('data-tex', /\\sin/);
	expect(seen.requests).toBeGreaterThan(0);
	expect(errors).toEqual([]);
});

test("a term's colour in the maths matches its slider's swatch", async ({ page }) => {
	await oceanRunning(page);
	await page.locator(`${at('sine')} details.math summary`).click();
	await expect(page.locator(`${at('sine')} .tex .t-amp`).first()).toBeVisible({ timeout: 30_000 });
	// The speed term is the moving-sine step's: the still sine's maths has no ω (lanes A and G).
	// Every line is typeset at once, so the closed one's spans carry their colour too.
	await expect(page.locator(`${at('moving-sine')} .tex .t-speed`).first()).toBeAttached({ timeout: 30_000 });
	const colours = await page.evaluate(([step, moving]) => ({
		term: getComputedStyle(document.querySelector(`${step} .tex .t-amp`)).color,
		swatch: getComputedStyle(document.querySelector(`${step} [data-slider="amplitude"] .swatch`)).color,
		speed: getComputedStyle(document.querySelector(`${moving} .tex .t-speed`)).color,
	}), [at('sine'), at('moving-sine')]);
	expect(colours.term).toBe(colours.swatch);
	expect(colours.speed).not.toBe(colours.term);
});

test('with KaTeX blocked the TeX source stays readable (Review Focus 3)', async ({ page }) => {
	const errors = [];
	page.on('pageerror', (error) => errors.push(error.message));
	await page.route('**/npm/katex@0.18.10/**', (route) => route.abort());
	await page.goto('/ocean/');
	await page.locator(`${at('jonswap')} details.math summary`).click();
	await page.waitForTimeout(1000);
	await expect(page.locator(`${at('jonswap')} .tex code`)).toBeVisible();
	await expect(page.locator(`${at('jonswap')} .tex code`)).toContainText('\\omega_p');
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
	const katex = page.waitForResponse((response) => response.url().endsWith('/katex.mjs'), { timeout: 30_000 });
	await page.locator(`${at('sine')} details.math summary`).click();
	await katex;
	await page.waitForTimeout(1000);
	await expect(page.locator(`${at('sine')} .tex code`)).toBeVisible();
	await expect(page.locator(`${at('sine')} .tex code`)).toContainText('\\sin');
	await expect(page.locator('.tex .katex')).toHaveCount(0);
	expect(errors).toEqual([]);
});

test('once typeset, the math label still sits only on .tex, so it hides nothing else from the copy check', async ({ page }) => {
	await page.goto('/ocean/');
	await page.locator(`${at('sine')} details.math summary`).click();
	await expect(panelKatex(page)).toHaveCount(PANEL_FORMULAS, { timeout: 30_000 });
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
		await expect(page.locator('.panel .tex .katex')).toHaveCount(PANEL_FORMULAS, { timeout: 30_000 });
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
