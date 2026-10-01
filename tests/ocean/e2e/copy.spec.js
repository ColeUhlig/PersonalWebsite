// The ocean page's copy check in the browser (piece C, Task 3): every number in the page's text sits
// inside a sourced phrase from tests/ocean/page/copySources.js.
import { readFileSync } from 'node:fs';
import { test, expect } from '@playwright/test';
import { PHRASES } from '../page/copySources.js';
import { SKIP_REASONS, normalise, uncoveredNumbers } from '../page/copyCheck.js';
import { proofPanelText } from '../page/proofPanelText.js';
import { NOTICES } from '../../../content/ocean/js/page/notices.js';
import { MATH_STEPS } from '../../../content/ocean/js/page/mathSteps.js';
import { STEP_COUNT } from '../../../content/ocean/js/stages/steps.js';

const INDEX_HTML = readFileSync(new URL('../../../content/ocean/index.html', import.meta.url));

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

// The words a visitor meets outside the text: aria-label, title and alt on everything outside the
// skipped regions, plus the document's title and description.
function attributeText(page) {
	return page.evaluate(() => {
		const parts = [document.title, document.querySelector('meta[name="description"]')?.content ?? ''];
		for (const el of document.querySelectorAll('[aria-label], [title], [alt]')) {
			if (el.closest('[data-copy-skip]')) continue;
			for (const name of ['aria-label', 'title', 'alt']) parts.push(el.getAttribute(name) ?? '');
		}
		return parts.join(' ');
	});
}

async function checkPage(page) {
	const text = normalise(await pageText(page));
	expect(text.length).toBeGreaterThan(5000);
	const missing = uncoveredNumbers(text, PHRASES);
	expect(missing, `numbers with no source: ${JSON.stringify(missing, null, 1)}`).toEqual([]);
	const attributes = normalise(await attributeText(page));
	expect(attributes).toContain('Building an Ocean in Roblox');
	expect(uncoveredNumbers(attributes, PHRASES), `numbers with no source in attributes: ${attributes}`).toEqual([]);
	const reasons = await page.evaluate(() => [...document.querySelectorAll('[data-copy-skip]')].map((el) => el.dataset.copySkip));
	for (const reason of reasons) expect(SKIP_REASONS).toContain(reason);
	expect(await page.locator('.tex:not([data-copy-skip="math"])').count()).toBe(0);
	// The reverse: the math label hides nothing but math, so it can't smuggle a number past the check.
	expect(await page.locator('[data-copy-skip="math"]:not(.tex)').count()).toBe(0);
}

test('every number in the page text sits inside a sourced phrase', async ({ page }) => {
	await page.goto('/ocean/');
	await expect(page.locator(`#step-${STEP_COUNT}-title`)).toHaveText('The whole thing');
	await checkPage(page);
});

// A live region is filled by code at run time; anything already inside it in the served HTML would
// be static copy hiding from the check.
test('every live region is empty in the served HTML', async ({ page }) => {
	const response = await page.request.get('/ocean/');
	expect(response.status()).toBe(200);
	const html = await response.text();
	await page.goto('about:blank');
	const regions = await page.evaluate((source) => {
		const doc = new DOMParser().parseFromString(source, 'text/html');
		return [...doc.querySelectorAll('[data-copy-skip="live"]')].map((el) => ({ at: el.outerHTML.slice(0, 80), inner: el.innerHTML.trim() }));
	}, html);
	expect(regions.length).toBeGreaterThan(15);
	for (const region of regions) expect(region.inner, `live region ${region.at} holds static content`).toBe('');
});

// A phrase nothing uses any more is a source for a claim the page no longer makes: drop it. The math
// box's "what changed" lines (page/mathSteps.js, C2) count as copy the page uses.
test('every sourced phrase is still used by the page, the notices, the proof panel or the math box', async ({ page }) => {
	await page.goto('/ocean/');
	await expect(page.locator(`#step-${STEP_COUNT}-title`)).toHaveText('The whole thing');
	const panel = proofPanelText();
	const changed = Object.values(MATH_STEPS).map((entry) => entry.changed);
	const text = [await pageText(page), ...Object.values(NOTICES), ...changed, panel.text, panel.attributes].map(normalise).join(' | ');
	const unused = PHRASES.filter((phrase) => !text.includes(phrase));
	expect(unused, 'phrases no copy uses').toEqual([]);
});

test('the copy check still holds once the ocean runs and the page has built its controls', async ({ page }) => {
	await page.goto('/ocean/');
	await page.waitForFunction(() => document.body.dataset.ocean === 'running' && (window.__ocean?.status().frame ?? 0) > 5, null, { timeout: 90_000 });
	await checkPage(page);
});

// Azure Static Web Apps serves index.html at /ocean with no trailing slash (the 2026-09-30 live
// incident), where a relative "style.css" resolves to /style.css and 404s. Serve the page there the
// same way and check every asset still loads, the stylesheet applies and the ocean starts.
test('the page works at /ocean without the trailing slash', async ({ page }) => {
	const failures = [];
	page.on('response', (response) => {
		if (response.status() >= 400) failures.push(`${response.status()} ${response.url()}`);
	});
	page.on('requestfailed', (request) => failures.push(`failed ${request.url()}`));
	await page.route('**/ocean', (route) => route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: INDEX_HTML }));
	await page.goto('/ocean');
	expect(new URL(page.url()).pathname).toBe('/ocean');
	await expect(page.locator(`#step-${STEP_COUNT}-title`)).toHaveText('The whole thing');
	expect(await page.locator('.panel').first().evaluate((el) => getComputedStyle(el).position)).toBe('sticky');
	await page.waitForFunction(() => document.body.dataset.ocean === 'running' && (window.__ocean?.status().frame ?? 0) > 5, null, { timeout: 90_000 });
	expect(failures).toEqual([]);
});
