// The always-on math box on a desktop (piece C2, lane A, Task 1; spec 10.3): hidden over the opening,
// a glass card at the top right from step 1 on, the step's equation typeset with its term colours,
// the terms it adds glowing on entry, the "what changed" sentence, a remembered collapse, and readable
// TeX when KaTeX never arrives (Review Focus 2), and out of the way of the finale's full-width
// blocks (pre-flight R14).
import { test, expect } from '@playwright/test';
import { mathFor } from '../../../content/ocean/js/page/mathSteps.js';
import { TERM_BY_SLIDER } from '../../../content/ocean/js/page/sliderModel.js';
import { RECIPES } from '../../../content/ocean/js/stages/recipes.js';
import { STEP_IDS } from '../../../content/ocean/js/stages/steps.js';
import { watchErrors } from './helpers/stage.js';
import { scrollToId, scrollToOpening } from './helpers/story.js';

let errors;
// Pre-flight R11: with KaTeX blocked on purpose, Chromium logs the aborted fetches as console errors
// ("Failed to load resource: net::ERR_FAILED"); only that test forgives exactly those.
let blocked = false;
test.beforeEach(({ page }) => {
	errors = watchErrors(page);
	blocked = false;
});
test.afterEach(() => {
	expect(blocked ? errors.filter((text) => !text.startsWith('Failed to load resource')) : errors).toEqual([]);
});

const box = (page) => page.locator('#mathbox');

test('hidden over the opening; at the top right from step 1, beside the panels, with its sentence', async ({ page }) => {
	await page.goto('/ocean/');
	await expect(box(page)).toBeHidden();
	await scrollToId(page, 'sine', 0.1);
	await expect(box(page)).toBeVisible();
	await expect(page.locator('#mathbox .mathbox-sentence')).toHaveText(mathFor('sine').changed);
	await expect(page.locator('#mathbox .katex')).not.toHaveCount(0, { timeout: 30_000 });
	const card = await box(page).boundingBox();
	const panel = await page.locator('#step-1 .panel').boundingBox();
	expect(card.x + card.width).toBeLessThanOrEqual(1366 - 15);
	expect(card.y).toBeGreaterThanOrEqual(40);
	expect(panel.x + panel.width).toBeLessThan(card.x);
	await scrollToId(page, 'moving-sine', 0.1);
	await expect(page.locator('#mathbox .mathbox-sentence')).toHaveText(mathFor('moving-sine').changed);
	await expect(box(page)).toHaveClass(/is-entering/);
	await expect(page.locator('#mathbox .fresh')).not.toHaveCount(0);
	await scrollToOpening(page);
	await expect(box(page)).toBeHidden();
});

test('the collapse hides the equation, says so to a screen reader, and is remembered', async ({ page }) => {
	await page.goto('/ocean/');
	await scrollToId(page, 'sine', 0.1);
	const toggle = page.locator('#mathbox .mathbox-toggle');
	await expect(toggle).toHaveAttribute('aria-expanded', 'true');
	await toggle.click();
	await expect(toggle).toHaveAttribute('aria-expanded', 'false');
	await expect(page.locator('#mathbox-body')).toBeHidden();
	await page.reload();
	await scrollToId(page, 'sine', 0.1);
	await expect(page.locator('#mathbox .mathbox-toggle')).toHaveAttribute('aria-expanded', 'false');
	await page.locator('#mathbox .mathbox-toggle').click();
	await expect(page.locator('#mathbox-body')).toBeVisible();
});

// Review Focus 2.
test('the box reads as TeX source when KaTeX is blocked, and still follows the scroll', async ({ page }) => {
	blocked = true;
	await page.route('**/katex@0.18.10/**', (route) => route.abort());
	await page.goto('/ocean/');
	await scrollToId(page, 'sine', 0.1);
	await page.waitForFunction(() => window.__mathbox.state() === 'failed', null, { timeout: 30_000 });
	await expect(page.locator('#mathbox .mathbox-eq code')).toHaveText(mathFor('sine').tex);
	await scrollToId(page, 'slopes', 0.1);
	await expect(page.locator('#mathbox .mathbox-eq code')).toHaveText(mathFor('slopes').tex);
	await expect(page.locator('#mathbox .mathbox-sentence')).toHaveText(mathFor('slopes').changed);
});

test("every step's equation typesets without a KaTeX error, fits the card, and carries its sliders' colours", async ({ page }) => {
	await page.goto('/ocean/');
	await scrollToId(page, 'sine', 0.1);
	await page.waitForFunction(() => window.__mathbox.state() === 'rendered', null, { timeout: 30_000 });
	for (const id of STEP_IDS) {
		await page.evaluate((step) => window.__mathbox.show(step), id);
		await expect(page.locator('#mathbox .katex-error')).toHaveCount(0);
		await expect(page.locator('#mathbox .katex')).not.toHaveCount(0);
		const fits = await page.evaluate(() => {
			const eq = document.querySelector('#mathbox .mathbox-eq');
			return eq.scrollWidth <= eq.clientWidth + 1;
		});
		expect(fits, `${id} fits the card`).toBe(true);
		const recipe = RECIPES.find((r) => r.id === id);
		for (const slider of recipe.sliders) {
			const term = TERM_BY_SLIDER[slider.id];
			if (term) await expect(page.locator(`#mathbox .${term}`)).not.toHaveCount(0);
		}
	}
});

// Pre-flight R14: the box has nothing new over the finale's blocks, which run the page's full width
// under it, so on a desktop it steps aside while they are read and comes back on the way up.
test("the card steps aside over the finale's blocks and comes back on the way up", async ({ page }) => {
	await page.goto('/ocean/');
	await scrollToId(page, 'finale', 0.02);
	await expect(box(page)).toBeVisible();
	await expect(page.locator('#mathbox .mathbox-sentence')).toHaveText(mathFor('finale').changed);
	await page.locator('#live').evaluate((block) => block.scrollIntoView({ block: 'start' }));
	await expect(box(page)).toBeHidden();
	expect(await page.evaluate(() => window.__mathbox.shown())).toBe('finale');
	await scrollToId(page, 'glow', 0.3);
	await expect(box(page)).toBeVisible();
	await expect(page.locator('#mathbox .mathbox-sentence')).toHaveText(mathFor('glow').changed);
});
