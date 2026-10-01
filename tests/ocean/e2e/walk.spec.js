// The whole story, walked (piece C2, Task 15; spec 10): every step from the opening to the footer and
// back, on a laptop and a phone, with no console error, no sideways scroll, the math box on the step
// being read, and the director on that step too.
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
			for (const id of [...STEP_IDS].reverse().filter((_, i) => i % 3 === 0)) {
				await scrollToId(page, id, 0.6);
			}
			await scrollToOpening(page);
			await page.waitForFunction(() => window.__ocean.story.graph().shown === 0, null, { timeout: 30_000 });
			expect(errors).toEqual([]);
		});
	});
}
