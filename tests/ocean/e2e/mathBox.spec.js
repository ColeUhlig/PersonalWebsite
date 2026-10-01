// The always-on math box on a desktop (piece C2, lane A, Task 1; spec 10.3): hidden over the opening,
// a glass card at the top right from step 1 on, the step's equation typeset with its term colours,
// the terms it adds glowing on entry, the "what changed" sentence, a remembered collapse, and readable
// TeX when KaTeX never arrives (Review Focus 2), and out of the way of the finale's full-width
// blocks (pre-flight R14).
import { test, expect } from '@playwright/test';
import { freshCount } from '../../../content/ocean/js/page/mathBoxModel.js';
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
	// The glow on entry lasts FRESH_SECONDS; a loaded machine can miss that window between polls, so
	// count the class being added instead of looking for it.
	await page.evaluate(() => {
		window.__entered = 0;
		new MutationObserver(() => {
			if (document.getElementById('mathbox').classList.contains('is-entering')) window.__entered += 1;
		}).observe(document.getElementById('mathbox'), { attributes: true, attributeFilter: ['class'] });
	});
	await scrollToId(page, 'moving-sine', 0.1);
	await expect(page.locator('#mathbox .mathbox-sentence')).toHaveText(mathFor('moving-sine').changed);
	await expect.poll(() => page.evaluate(() => window.__entered)).toBeGreaterThan(0);
	// What glows is exactly the term the step adds: "− ωt".
	const fresh = page.locator('#mathbox .katex-html .fresh');
	await expect(fresh).toHaveCount(freshCount(mathFor('moving-sine').tex));
	expect((await fresh.textContent()).replace(/[\s\u200b]/g, '')).toBe('−ωt');
	// Scrolling on inside the same step touches nothing in the box (the story reads every frame).
	await expect(box(page)).not.toHaveClass(/is-entering/, { timeout: 10_000 });
	await page.evaluate(() => {
		window.__mutations = 0;
		new MutationObserver((records) => {
			window.__mutations += records.length;
		}).observe(document.getElementById('mathbox'), { attributes: true, childList: true, subtree: true, characterData: true });
	});
	await scrollToId(page, 'moving-sine', 0.6);
	await expect.poll(() => page.evaluate(() => window.__page.reading().progress)).toBeGreaterThan(0.5);
	await page.waitForTimeout(300);
	expect(await page.evaluate(() => window.__mutations)).toBe(0);
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
		await expect(page.locator('#mathbox .katex-html .fresh'), `${id}'s highlights`).toHaveCount(freshCount(mathFor(id).tex));
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

// Task 2 (spec 10.3; Review Focus 3): the phone's bar under the ocean and its sheet.
for (const width of [320, 390]) {
	test.describe(`the pinned bar at ${width} px`, () => {
		test.use({ viewport: { width, height: 760 }, hasTouch: true, isMobile: true });

		// Pre-flight R22 (lane A's call, ledger): like the desktop card, the bar stays hidden over the
		// opening, so the page before the first scroll is A2's; it pins under the ocean from step 1.
		test('hidden over the opening; from step 1 under the ocean, never over a panel, never scrolling the page sideways', async ({ page }) => {
			await page.goto('/ocean/');
			await expect(box(page)).toBeHidden();
			await scrollToId(page, 'sine', 0.1);
			await expect(box(page)).toBeVisible();
			expect(await page.evaluate(() => window.__mathbox.shown())).toBe('sine');
			const bar = await box(page).boundingBox();
			expect(Math.abs(bar.y - 380)).toBeLessThanOrEqual(1);
			expect(Math.round(bar.height)).toBe(44);
			expect(bar.width).toBeLessThanOrEqual(width);
			// Fix round 1: opaque, so panel text scrolling under the bar never shows behind the maths.
			const alpha = await box(page).evaluate((el) => {
				const parts = getComputedStyle(el).backgroundColor.match(/[\d.]+/g).map(Number);
				return parts.length > 3 ? parts[3] : 1;
			});
			expect(alpha).toBe(1);
			// The right edge fades only when the line runs past it: sine fits, highlights never does.
			await page.waitForFunction(() => window.__mathbox.state() === 'rendered', null, { timeout: 30_000 });
			await expect(box(page)).not.toHaveClass(/is-overflowing/);
			await page.evaluate(() => window.__mathbox.show('highlights'));
			await expect(box(page)).toHaveClass(/is-overflowing/);
			// The bar shows foam's update, the step's point, before its Jacobian.
			await page.evaluate(() => window.__mathbox.show('foam'));
			const first = await page.locator('#mathbox .katex-html .fresh').first().textContent();
			expect(first.replace(/[\s\u200b]/g, '')).toBe('f');
			await page.evaluate(() => window.__mathbox.show('sine'));
			for (const id of ['sine', 'slopes', 'layers']) {
				await page.evaluate((step) => document.querySelector(`section[data-step-id="${step}"]`).scrollIntoView(), id);
				await page.waitForTimeout(200);
				const panel = await page.locator(`section[data-step-id="${id}"] .panel`).boundingBox();
				expect(panel.y, `${id}'s panel starts below the bar`).toBeGreaterThanOrEqual(bar.y + bar.height - 1);
			}
			expect(await page.evaluate(() => document.scrollingElement.scrollWidth <= window.innerWidth)).toBe(true);
			await scrollToOpening(page);
			await expect(box(page)).toBeHidden();
		});

		test('opens to a sheet by tap and by Enter, closes by Escape and by its button, and gives focus back', async ({ page }) => {
			await page.goto('/ocean/');
			await scrollToId(page, 'diffuse', 0.1);
			const opener = page.locator('#mathbox .mathbox-open');
			await expect(opener).toHaveAttribute('aria-expanded', 'false');
			await expect(page.locator('#mathbox .mathbox-changed')).toHaveAttribute('aria-live', 'off');
			const bar = await box(page).boundingBox();
			await opener.tap();
			await expect(box(page)).toHaveClass(/is-open/);
			await expect(opener).toHaveAttribute('aria-expanded', 'true');
			await expect(page.locator('#mathbox .mathbox-changed')).toHaveAttribute('aria-live', 'polite');
			await expect(page.locator('#mathbox .mathbox-close')).toBeFocused();
			await expect(page.locator('#mathbox .mathbox-sentence')).toBeVisible();
			const sheet = await box(page).boundingBox();
			expect(Math.abs(sheet.y - bar.y), "the sheet's top is the bar's").toBeLessThanOrEqual(1);
			expect(Math.abs(sheet.y + sheet.height - 760)).toBeLessThanOrEqual(1);
			await page.keyboard.press('Escape');
			await expect(box(page)).not.toHaveClass(/is-open/);
			await expect(page.locator('#mathbox .mathbox-open')).toBeFocused();
			await page.keyboard.press('Enter');
			await expect(box(page)).toHaveClass(/is-open/);
			await page.locator('#mathbox .mathbox-close').tap();
			await expect(box(page)).not.toHaveClass(/is-open/);
			await expect(opener).toHaveAttribute('aria-expanded', 'false');
			expect(await page.evaluate(() => document.scrollingElement.scrollWidth <= window.innerWidth)).toBe(true);
		});

		// Fix round 1: the sheet is not modal. Tabbing out of it closes it, so focus never lands on
		// something the sheet covers, and Escape still works wherever focus is while it is open.
		test('tabbing out of the open sheet closes it; focus never sits under the sheet', async ({ page }) => {
			await page.goto('/ocean/');
			await scrollToId(page, 'diffuse', 0.1);
			await page.locator('#mathbox .mathbox-open').tap();
			await expect(box(page)).toHaveClass(/is-open/);
			for (let i = 0; i < 3; i++) {
				await page.keyboard.press('Tab');
				const where = await page.evaluate(() => {
					const root = document.getElementById('mathbox');
					const active = document.activeElement;
					const inside = root.contains(active);
					const rect = active.getBoundingClientRect();
					const x = rect.left + rect.width / 2;
					const y = rect.top + rect.height / 2;
					const onScreen = x >= 0 && y >= 0 && x < window.innerWidth && y < window.innerHeight;
					const top = onScreen ? document.elementFromPoint(x, y) : null;
					return { inside, open: root.classList.contains('is-open'), covered: !inside && top !== null && root.contains(top) };
				});
				expect(where.open === false || where.inside, `tab ${i + 1}: closed, or focus still in the box`).toBe(true);
				expect(where.covered, `tab ${i + 1}: focus is not under the sheet`).toBe(false);
			}
			await page.locator('#mathbox .mathbox-open').tap();
			await expect(box(page)).toHaveClass(/is-open/);
			await page.evaluate(() => document.activeElement.blur());
			await page.keyboard.press('Escape');
			await expect(box(page)).not.toHaveClass(/is-open/);
		});
	});
}

test.describe('reduced motion', () => {
	test.use({ reducedMotion: 'reduce' });

	test('entering a step never pulses the new terms; they keep their quiet tint', async ({ page }) => {
		await page.goto('/ocean/');
		await page.evaluate(() => {
			window.__entered = 0;
			new MutationObserver(() => {
				if (document.getElementById('mathbox').classList.contains('is-entering')) window.__entered += 1;
			}).observe(document.getElementById('mathbox'), { attributes: true, attributeFilter: ['class'] });
		});
		await scrollToId(page, 'sine', 0.1);
		await scrollToId(page, 'moving-sine', 0.1);
		await expect(page.locator('#mathbox .mathbox-sentence')).toHaveText(mathFor('moving-sine').changed);
		expect(await page.evaluate(() => window.__entered)).toBe(0);
	});
});
