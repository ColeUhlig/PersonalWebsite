// The whole story, walked (piece C2, Task 15; spec 10): every step from the opening to the footer and
// back, on a laptop and a phone, with no console error, no sideways scroll, the math box on the step
// being read, and the director on that step too. Piece C's Task 10 adds the foot (the references and the
// footer reached with no sideways scroll and no failed frame) and the dev route beside the story: on
// each screen ?step=<id>&progress=P still drives the ocean from the URL, with no story attached.
import { test, expect } from '@playwright/test';
import { STEP_IDS, STEP_COUNT, stepOf } from '../../../content/ocean/js/stages/steps.js';
import { watchErrors } from './helpers/stage.js';
import { oceanRunning, restAtFoot, scrollToId, scrollToOpening } from './helpers/story.js';

for (const screen of [{ name: 'a laptop', viewport: { width: 1366, height: 767 } }, { name: 'a phone', viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }]) {
	test.describe(screen.name, () => {
		test.use({ viewport: screen.viewport, isMobile: screen.isMobile ?? false, hasTouch: screen.hasTouch ?? false });

		test('down every step and back up, cleanly', async ({ page }) => {
			test.setTimeout(900_000);
			const errors = watchErrors(page);
			await oceanRunning(page);
			for (const id of STEP_IDS) {
				await scrollToId(page, id, 0.3);
				await page.waitForFunction((n) => window.__ocean.story.state().step === n, stepOf(id), { timeout: 30_000 });
				expect(await page.evaluate(() => window.__mathbox.shown())).toBe(id);
				expect(await page.evaluate(() => document.scrollingElement.scrollWidth <= window.innerWidth)).toBe(true);
			}
			await page.keyboard.press('End');
			await page.waitForFunction((n) => window.__page.reading().step === n, STEP_COUNT, { timeout: 30_000 });
			// End scrolls smoothly; a scroll made while it runs only shifts its target, and on a phone it
			// carried the page from step 19 back down to step 23. Let it land first.
			await restAtFoot(page);
			await expect(page.locator('#references')).toBeVisible();
			await expect(page.locator('footer.site')).toBeInViewport();
			expect(await page.evaluate(() => document.scrollingElement.scrollWidth <= window.innerWidth)).toBe(true);
			for (const id of [...STEP_IDS].reverse().filter((_, i) => i % 3 === 0)) {
				await scrollToId(page, id, 0.6);
			}
			await scrollToOpening(page);
			await page.waitForFunction(() => window.__ocean.story.graph().shown === 0, null, { timeout: 30_000 });
			expect(await page.evaluate(() => window.__ocean.frameFailures())).toBe(0);
			expect(errors).toEqual([]);
		});

		test('the dev route still drives the ocean from the URL, with no story attached', async ({ page }) => {
			test.setTimeout(240_000);
			const errors = watchErrors(page);
			await oceanRunning(page, '/ocean/?step=jonswap&progress=0.2', 10);
			expect(await page.evaluate(() => window.__ocean.story)).toBeNull();
			const state = await page.evaluate(() => window.__ocean.stage.state());
			expect([state.step, state.progress]).toEqual([stepOf('jonswap'), 0.2]);
			expect(await page.evaluate(() => window.__ocean.stage.recipe().id)).toBe('jonswap');
			// The panels' controls belong to the story: the dev route mounts none.
			await expect(page.locator('.control')).toHaveCount(0);
			expect(await page.evaluate(() => document.scrollingElement.scrollWidth <= window.innerWidth)).toBe(true);
			expect(await page.evaluate(() => window.__ocean.frameFailures())).toBe(0);
			expect(errors).toEqual([]);
		});
	});
}
