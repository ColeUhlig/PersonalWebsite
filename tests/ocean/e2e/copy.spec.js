// The ocean page's copy check in the browser (piece C, Task 3): every number in the page's text sits
// inside a sourced phrase from tests/ocean/page/copySources.js.
import { test, expect } from '@playwright/test';
import { PHRASES } from '../page/copySources.js';
import { SKIP_REASONS, normalise, uncoveredNumbers } from '../page/copyCheck.js';

// The page's text as a visitor could read it (hidden paragraphs included, since they show on some
// devices), minus maths, live numbers, scripts and styles.
function pageText(page) {
	return page.evaluate(() => {
		const parts = [];
		const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
			acceptNode(node) {
				const skipped = node.parentElement.closest('[data-copy-skip], script, style, noscript, .katex');
				return skipped ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT;
			},
		});
		for (let node = walker.nextNode(); node; node = walker.nextNode()) parts.push(node.textContent);
		return parts.join(' ');
	});
}

async function checkPage(page) {
	const text = normalise(await pageText(page));
	expect(text.length).toBeGreaterThan(5000);
	const missing = uncoveredNumbers(text, PHRASES);
	expect(missing, `numbers with no source: ${JSON.stringify(missing, null, 1)}`).toEqual([]);
	const reasons = await page.evaluate(() => [...document.querySelectorAll('[data-copy-skip]')].map((el) => el.dataset.copySkip));
	for (const reason of reasons) expect(SKIP_REASONS).toContain(reason);
	expect(await page.locator('.tex:not([data-copy-skip="math"])').count()).toBe(0);
}

test('every number in the page text sits inside a sourced phrase', async ({ page }) => {
	await page.goto('/ocean/');
	await expect(page.locator('#step-13-title')).toHaveText('The whole thing');
	await checkPage(page);
});

test('the copy check still holds once the ocean runs and the page has built its controls', async ({ page }) => {
	await page.goto('/ocean/');
	await page.waitForFunction(() => document.body.dataset.ocean === 'running' && (window.__ocean?.status().frame ?? 0) > 5, null, { timeout: 90_000 });
	await checkPage(page);
});
